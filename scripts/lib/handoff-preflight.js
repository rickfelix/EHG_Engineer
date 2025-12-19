#!/usr/bin/env node

/**
 * handoff-preflight.js
 *
 * Shared utility for validating SD handoff state before agents begin work.
 *
 * PURPOSE:
 * Provides a lightweight check that agents/sub-agents can call to verify
 * the SD is in a valid handoff state before proceeding with work.
 *
 * This addresses the gap where handoff executor gates only fire when
 * someone explicitly runs `node scripts/handoff.js execute`, but developers
 * might start working without running the handoff command.
 *
 * USAGE:
 *   import { validateSDHandoffState, getRequiredHandoffsForPhase } from './handoff-preflight.js';
 *
 *   const result = await validateSDHandoffState(sdId, 'EXEC');
 *   if (!result.ready) {
 *     console.log(`Missing handoffs: ${result.missing.join(', ')}`);
 *     console.log(`Run: ${result.command}`);
 *   }
 *
 * LAYERS OF DEFENSE:
 *   Tier 1: Executor gates (when handoff command runs)
 *   Tier 1.5: Agent preflight (when agent starts work) <-- THIS UTILITY
 *   Tier 2: SD completion verification (when marking complete)
 *
 * @see .git/archived-markdown/retrospectives/SD-BACKEND-002A-ROOT-CAUSE.md
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Handoff sequence definitions
 * Maps each phase to what handoffs should exist before entering that phase
 */
const HANDOFF_REQUIREMENTS = {
  // LEAD phase - no prerequisites (starting point)
  LEAD: {
    required: [],
    optional: [],
    description: 'Initial phase - no handoff prerequisites'
  },

  // PLAN phase - requires LEAD-TO-PLAN accepted
  PLAN: {
    required: ['LEAD-TO-PLAN'],
    optional: [],
    description: 'Requires LEAD approval before planning'
  },

  // EXEC phase - requires LEAD-TO-PLAN and PLAN-TO-EXEC accepted
  EXEC: {
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'],
    optional: [],
    description: 'Requires planning completion before execution'
  },

  // PLAN_VERIFY phase (after EXEC) - requires full EXEC completion
  PLAN_VERIFY: {
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    optional: [],
    description: 'Requires execution completion for verification'
  },

  // LEAD_FINAL phase - requires full chain for final approval
  LEAD_FINAL: {
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
    optional: [],
    description: 'Requires full handoff chain for final approval'
  },

  // COMPLETED - requires entire chain including final approval
  COMPLETED: {
    required: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
    optional: ['LEAD-FINAL-APPROVAL'],
    description: 'Full handoff chain required for completion'
  }
};

/**
 * SD types that have modified handoff requirements
 */
const MODIFIED_WORKFLOW_SD_TYPES = {
  // Infrastructure SDs may skip EXEC-TO-PLAN
  infrastructure: {
    skipHandoffs: ['EXEC-TO-PLAN'],
    reason: 'Infrastructure SDs often have no implementation artifacts to hand off'
  },
  // Documentation SDs may skip EXEC phase entirely
  documentation: {
    skipHandoffs: ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    reason: 'Documentation SDs may go directly from PLAN to completion'
  },
  // Parent orchestrator SDs delegate to children
  parent_orchestrator: {
    skipHandoffs: ['PLAN-TO-EXEC', 'EXEC-TO-PLAN'],
    reason: 'Parent SDs orchestrate children, no direct implementation'
  }
};

/**
 * Validate SD handoff state for a given phase
 *
 * @param {string} sdId - SD identifier (UUID or legacy_id)
 * @param {string} targetPhase - Phase the agent wants to work in (LEAD, PLAN, EXEC, etc.)
 * @param {object} options - Additional options
 * @returns {Promise<object>} Validation result
 */
async function validateSDHandoffState(sdId, targetPhase, options = {}) {
  const result = {
    ready: false,
    sdId,
    targetPhase,
    timestamp: new Date().toISOString(),
    handoffs: {
      required: [],
      present: [],
      missing: [],
      accepted: []
    },
    command: null,
    warnings: [],
    details: {}
  };

  try {
    // Get SD details
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, status, current_phase, sd_type, metadata')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
      .single();

    if (sdError || !sd) {
      result.warnings.push(`SD not found: ${sdId}`);
      return result;
    }

    result.details.sd = {
      id: sd.id,
      legacy_id: sd.legacy_id,
      title: sd.title,
      status: sd.status,
      current_phase: sd.current_phase,
      sd_type: sd.sd_type
    };

    // Check for modified workflow SD types
    const isParentOrchestrator = sd.metadata?.is_parent === true;
    const sdType = sd.sd_type?.toLowerCase() || 'feature';

    let skipHandoffs = [];
    if (isParentOrchestrator) {
      skipHandoffs = MODIFIED_WORKFLOW_SD_TYPES.parent_orchestrator?.skipHandoffs || [];
      result.warnings.push('Parent orchestrator SD - modified workflow applies');
    } else if (MODIFIED_WORKFLOW_SD_TYPES[sdType]) {
      skipHandoffs = MODIFIED_WORKFLOW_SD_TYPES[sdType].skipHandoffs || [];
      result.warnings.push(`${sdType} SD type - modified workflow applies`);
    }

    // Get required handoffs for target phase
    const phaseReqs = HANDOFF_REQUIREMENTS[targetPhase.toUpperCase()];
    if (!phaseReqs) {
      result.warnings.push(`Unknown phase: ${targetPhase}, assuming no requirements`);
      result.ready = true;
      return result;
    }

    // Filter out skipped handoffs for modified workflows
    const requiredHandoffs = phaseReqs.required.filter(h => !skipHandoffs.includes(h));
    result.handoffs.required = requiredHandoffs;

    if (requiredHandoffs.length === 0) {
      result.ready = true;
      result.details.reason = phaseReqs.description;
      return result;
    }

    // Query existing handoffs for this SD
    const { data: handoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status, created_at, validation_score')
      .eq('sd_id', sd.id)
      .order('created_at', { ascending: false });

    if (handoffError) {
      result.warnings.push(`Error querying handoffs: ${handoffError.message}`);
      return result;
    }

    // Check which required handoffs are present and accepted
    const handoffMap = new Map();
    for (const h of (handoffs || [])) {
      // Keep only the most recent of each type
      if (!handoffMap.has(h.handoff_type)) {
        handoffMap.set(h.handoff_type, h);
      }
    }

    for (const required of requiredHandoffs) {
      const handoff = handoffMap.get(required);
      if (handoff) {
        result.handoffs.present.push(required);
        if (handoff.status === 'accepted') {
          result.handoffs.accepted.push(required);
        }
      } else {
        result.handoffs.missing.push(required);
      }
    }

    // Determine readiness
    const allAccepted = requiredHandoffs.every(r => result.handoffs.accepted.includes(r));
    result.ready = allAccepted;

    // Generate remediation command if not ready
    if (!result.ready) {
      const firstMissing = result.handoffs.missing[0] ||
        requiredHandoffs.find(r => !result.handoffs.accepted.includes(r));

      if (firstMissing) {
        result.command = `node scripts/handoff.js execute ${firstMissing} --sd-id ${sd.legacy_id || sd.id}`;
      }
    }

    return result;

  } catch (error) {
    result.warnings.push(`Preflight error: ${error.message}`);
    return result;
  }
}

/**
 * Get the required handoffs for a specific phase
 *
 * @param {string} phase - Target phase
 * @returns {object} Required and optional handoffs
 */
function getRequiredHandoffsForPhase(phase) {
  return HANDOFF_REQUIREMENTS[phase.toUpperCase()] || { required: [], optional: [] };
}

/**
 * Verify complete handoff chain for SD completion
 *
 * @param {string} sdId - SD identifier
 * @returns {Promise<object>} Verification result
 */
async function verifyCompleteHandoffChain(sdId) {
  const result = {
    complete: false,
    sdId,
    timestamp: new Date().toISOString(),
    chain: {
      expected: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
      present: [],
      missing: [],
      accepted: []
    },
    canComplete: false,
    blockers: [],
    warnings: []
  };

  try {
    // Get SD details
    const { data: sd, error: sdError } = await supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, status, sd_type, metadata')
      .or(`id.eq.${sdId},legacy_id.eq.${sdId}`)
      .single();

    if (sdError || !sd) {
      result.blockers.push(`SD not found: ${sdId}`);
      return result;
    }

    // Check for modified workflow
    const isParentOrchestrator = sd.metadata?.is_parent === true;
    const sdType = sd.sd_type?.toLowerCase() || 'feature';

    let expectedChain = [...result.chain.expected];

    if (isParentOrchestrator) {
      expectedChain = expectedChain.filter(h =>
        !MODIFIED_WORKFLOW_SD_TYPES.parent_orchestrator.skipHandoffs.includes(h)
      );
      result.warnings.push('Parent orchestrator - modified chain requirements');
    } else if (MODIFIED_WORKFLOW_SD_TYPES[sdType]) {
      expectedChain = expectedChain.filter(h =>
        !MODIFIED_WORKFLOW_SD_TYPES[sdType].skipHandoffs.includes(h)
      );
      result.warnings.push(`${sdType} SD - modified chain requirements`);
    }

    result.chain.expected = expectedChain;

    // Query all handoffs
    const { data: handoffs, error: handoffError } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status, created_at')
      .eq('sd_id', sd.id);

    if (handoffError) {
      result.blockers.push(`Error querying handoffs: ${handoffError.message}`);
      return result;
    }

    // Build status map (most recent of each type)
    const handoffMap = new Map();
    for (const h of (handoffs || [])) {
      const existing = handoffMap.get(h.handoff_type);
      if (!existing || new Date(h.created_at) > new Date(existing.created_at)) {
        handoffMap.set(h.handoff_type, h);
      }
    }

    // Check each expected handoff
    for (const expected of expectedChain) {
      const handoff = handoffMap.get(expected);
      if (handoff) {
        result.chain.present.push(expected);
        if (handoff.status === 'accepted') {
          result.chain.accepted.push(expected);
        }
      } else {
        result.chain.missing.push(expected);
        result.blockers.push(`Missing handoff: ${expected}`);
      }
    }

    // Determine completeness
    result.complete = expectedChain.every(h => result.chain.accepted.includes(h));
    result.canComplete = result.complete && result.blockers.length === 0;

    if (!result.canComplete && result.chain.missing.length > 0) {
      result.blockers.push(
        `Run: node scripts/handoff.js execute ${result.chain.missing[0]} --sd-id ${sd.legacy_id || sd.id}`
      );
    }

    return result;

  } catch (error) {
    result.blockers.push(`Verification error: ${error.message}`);
    return result;
  }
}

/**
 * Quick preflight check - returns simple pass/fail for agents
 *
 * @param {string} sdId - SD identifier
 * @param {string} phase - Current phase
 * @returns {Promise<boolean>} True if ready to proceed
 */
async function quickPreflightCheck(sdId, phase) {
  const result = await validateSDHandoffState(sdId, phase);
  return result.ready;
}

/**
 * Format preflight result for console output
 *
 * @param {object} result - Result from validateSDHandoffState
 * @returns {string} Formatted output
 */
function formatPreflightResult(result) {
  const lines = [];

  lines.push('');
  lines.push('═'.repeat(60));
  lines.push('📋 HANDOFF PREFLIGHT CHECK');
  lines.push('═'.repeat(60));
  lines.push(`   SD: ${result.details?.sd?.legacy_id || result.sdId}`);
  lines.push(`   Title: ${result.details?.sd?.title || 'Unknown'}`);
  lines.push(`   Target Phase: ${result.targetPhase}`);
  lines.push(`   Current Phase: ${result.details?.sd?.current_phase || 'Unknown'}`);
  lines.push('');

  if (result.ready) {
    lines.push('   ✅ READY - All required handoffs present and accepted');
  } else {
    lines.push('   ❌ NOT READY - Missing or unaccepted handoffs');
    lines.push('');
    lines.push('   Required handoffs:');
    for (const h of result.handoffs.required) {
      const status = result.handoffs.accepted.includes(h) ? '✅' :
                     result.handoffs.present.includes(h) ? '⏳' : '❌';
      lines.push(`      ${status} ${h}`);
    }

    if (result.command) {
      lines.push('');
      lines.push('   🔧 REMEDIATION:');
      lines.push(`      ${result.command}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('   ⚠️  Warnings:');
    for (const w of result.warnings) {
      lines.push(`      • ${w}`);
    }
  }

  lines.push('═'.repeat(60));
  lines.push('');

  return lines.join('\n');
}

// CLI execution (guard against undefined in module context)
if (process.argv[1] && process.argv[1].includes('handoff-preflight')) {
  const args = process.argv.slice(2);
  const sdIdIndex = args.indexOf('--sd-id');
  const phaseIndex = args.indexOf('--phase');
  const verifyChain = args.includes('--verify-chain');

  if (verifyChain && sdIdIndex !== -1) {
    const sdId = args[sdIdIndex + 1];
    verifyCompleteHandoffChain(sdId).then(result => {
      console.log('\n' + '═'.repeat(60));
      console.log('📋 HANDOFF CHAIN VERIFICATION');
      console.log('═'.repeat(60));
      console.log(`   SD: ${result.sdId}`);
      console.log(`   Complete: ${result.complete ? '✅ YES' : '❌ NO'}`);
      console.log(`   Can Complete SD: ${result.canComplete ? '✅ YES' : '❌ NO'}`);
      console.log('');
      console.log('   Chain Status:');
      for (const h of result.chain.expected) {
        const status = result.chain.accepted.includes(h) ? '✅' :
                       result.chain.present.includes(h) ? '⏳' : '❌';
        console.log(`      ${status} ${h}`);
      }
      if (result.blockers.length > 0) {
        console.log('');
        console.log('   Blockers:');
        for (const b of result.blockers) {
          console.log(`      • ${b}`);
        }
      }
      console.log('═'.repeat(60) + '\n');
      process.exit(result.canComplete ? 0 : 1);
    });
  } else if (sdIdIndex !== -1 && phaseIndex !== -1) {
    const sdId = args[sdIdIndex + 1];
    const phase = args[phaseIndex + 1];

    validateSDHandoffState(sdId, phase).then(result => {
      console.log(formatPreflightResult(result));
      process.exit(result.ready ? 0 : 1);
    });
  } else {
    console.log('Usage:');
    console.log('  node scripts/lib/handoff-preflight.js --sd-id <SD-ID> --phase <PHASE>');
    console.log('  node scripts/lib/handoff-preflight.js --sd-id <SD-ID> --verify-chain');
    console.log('');
    console.log('Phases: LEAD, PLAN, EXEC, PLAN_VERIFY, LEAD_FINAL, COMPLETED');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/lib/handoff-preflight.js --sd-id SD-LEO-001 --phase EXEC');
    console.log('  node scripts/lib/handoff-preflight.js --sd-id SD-LEO-001 --verify-chain');
    process.exit(1);
  }
}

export {
  validateSDHandoffState,
  getRequiredHandoffsForPhase,
  verifyCompleteHandoffChain,
  quickPreflightCheck,
  formatPreflightResult,
  HANDOFF_REQUIREMENTS,
  MODIFIED_WORKFLOW_SD_TYPES
};
