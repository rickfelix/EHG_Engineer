#!/usr/bin/env node

/**
 * Phase State Machine Enforcement PostToolUse Hook
 *
 * PostToolUse hook that validates phase transitions using type-specific requirements.
 * Tracks phase state and injects warnings for invalid transitions.
 *
 * Hook Type: PostToolUse (matcher: Bash)
 *
 * Created: 2026-01-22
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-L
 * Part of: AUTO-PROCEED Intelligence Enhancements
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Import type-aware validation
import {
  getValidationRequirements,
  getUATRequirement
} from '../../lib/utils/sd-type-validation.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Valid phase transitions in the LEO Protocol state machine.
 * Format: { from_phase: [valid_to_phases] }
 */
const VALID_TRANSITIONS = {
  LEAD: ['PLAN', 'LEAD_APPROVAL'],
  LEAD_APPROVAL: ['PLAN'],
  PLAN: ['PLAN_VERIFY', 'EXEC', 'LEAD'],
  PLAN_VERIFY: ['EXEC', 'PLAN'],
  EXEC: ['PLAN', 'EXEC_VERIFY', 'PLAN_TO_LEAD'],
  EXEC_VERIFY: ['PLAN_TO_LEAD', 'EXEC', 'LEAD_FINAL'],
  PLAN_TO_LEAD: ['LEAD_FINAL', 'EXEC'],
  LEAD_FINAL: ['COMPLETED'],
  COMPLETED: [] // Terminal state
};

/**
 * Handoff types required for each phase transition.
 * Format: { 'FROM->TO': required_handoff_type }
 * Reserved for future use in extended validation
 */
const _TRANSITION_HANDOFFS = {
  'LEAD->PLAN': 'LEAD-TO-PLAN',
  'LEAD_APPROVAL->PLAN': 'LEAD-TO-PLAN',
  'PLAN->EXEC': 'PLAN-TO-EXEC',
  'PLAN_VERIFY->EXEC': 'PLAN-TO-EXEC',
  'EXEC->PLAN': 'EXEC-TO-PLAN',
  'EXEC->PLAN_TO_LEAD': 'EXEC-TO-PLAN',
  'EXEC_VERIFY->PLAN_TO_LEAD': 'PLAN-TO-LEAD',
  'PLAN_TO_LEAD->LEAD_FINAL': 'PLAN-TO-LEAD',
  'EXEC_VERIFY->LEAD_FINAL': 'PLAN-TO-LEAD',
  'LEAD_FINAL->COMPLETED': 'LEAD-FINAL-APPROVAL'
};

/**
 * Commands that trigger phase transitions.
 */
const PHASE_TRANSITION_PATTERNS = [
  /handoff\.js.*execute\s+(LEAD-TO-PLAN|PLAN-TO-EXEC|EXEC-TO-PLAN|PLAN-TO-LEAD|LEAD-FINAL-APPROVAL)/i,
  /sd:.*phase\s+(LEAD|PLAN|EXEC|COMPLETED)/i,
  /leo.*phase/i
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get Supabase client
 */
function getSupabase() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  } catch {
    return null;
  }
}

/**
 * Detect current SD from git branch
 */
function detectCurrentSD() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
    if (sdMatch) {
      return sdMatch[0].toUpperCase();
    }
  } catch {
    // Git command failed
  }

  return null;
}

/**
 * Check if command triggers a phase transition
 */
function detectPhaseTransition(command) {
  if (!command) return null;

  for (const pattern of PHASE_TRANSITION_PATTERNS) {
    const match = command.match(pattern);
    if (match) {
      return {
        detected: true,
        handoffType: match[1] || null,
        command: command
      };
    }
  }

  return null;
}

/**
 * Get the target phase for a handoff type
 */
function getTargetPhaseForHandoff(handoffType) {
  const transitions = {
    'LEAD-TO-PLAN': 'PLAN',
    'PLAN-TO-EXEC': 'EXEC',
    'EXEC-TO-PLAN': 'PLAN',
    'PLAN-TO-LEAD': 'LEAD_FINAL',
    'LEAD-FINAL-APPROVAL': 'COMPLETED'
  };
  return transitions[handoffType] || null;
}

/**
 * Check if a phase transition is valid based on the state machine
 */
function isValidTransition(fromPhase, toPhase) {
  const normalizedFrom = fromPhase.toUpperCase().replace(/_/g, '_');
  const normalizedTo = toPhase.toUpperCase().replace(/_/g, '_');

  const validTargets = VALID_TRANSITIONS[normalizedFrom] || [];
  return validTargets.includes(normalizedTo);
}

/**
 * Check if an SD can transition to a phase based on type-specific requirements
 */
async function canTransitionPhase(supabase, sd, targetPhase, handoffType) {
  const requirements = getValidationRequirements(sd);
  const uatRequirement = getUATRequirement(sd.sd_type);
  const violations = [];

  // Get accepted handoffs (reserved for extended validation)
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted');

  // Track accepted handoffs for potential future use
  const _acceptedHandoffs = (handoffs || []).map(h => h.handoff_type);
  void _acceptedHandoffs; // Acknowledged

  // Check state machine validity
  if (!isValidTransition(sd.current_phase, targetPhase)) {
    violations.push({
      type: 'INVALID_TRANSITION',
      message: `Cannot transition from ${sd.current_phase} to ${targetPhase}`,
      valid_targets: VALID_TRANSITIONS[sd.current_phase] || []
    });
  }

  // Check type-specific requirements for certain transitions
  if (targetPhase === 'EXEC' || targetPhase === 'PLAN_TO_EXEC') {
    // Transitioning to EXEC requires PRD for code-producing SDs
    if (!requirements.skipCodeValidation) {
      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('id')
        .eq('sd_id', sd.id)
        .single();

      if (!prd) {
        violations.push({
          type: 'PRD_REQUIRED',
          message: `SD type '${sd.sd_type}' requires PRD before entering EXEC phase`,
          remediation: `node scripts/add-prd-to-database.js ${sd.sd_key}`
        });
      }
    }
  }

  if (targetPhase === 'COMPLETED' || handoffType === 'LEAD-FINAL-APPROVAL') {
    // Completion requires UAT for types that need it
    if (uatRequirement === 'REQUIRED' || requirements.requiresUATExecution) {
      const { data: uatRecords } = await supabase
        .from('uat_test_runs')
        .select('id, status, overall_result')
        .eq('sd_id', sd.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const hasPassingUAT = uatRecords?.some(r =>
        r.status === 'completed' && ['pass', 'partial_pass'].includes(r.overall_result)
      );

      if (!hasPassingUAT) {
        violations.push({
          type: 'UAT_REQUIRED',
          message: `SD type '${sd.sd_type}' requires UAT before completion`,
          remediation: 'Run /uat to execute user acceptance testing'
        });
      }
    }

    // Check E2E tests for code-producing types
    if (requirements.requiresE2ETests) {
      const { data: testRecords } = await supabase
        .from('sub_agent_execution_results')
        .select('verdict')
        .eq('sd_id', sd.id)
        .eq('sub_agent_code', 'TESTING')
        .order('created_at', { ascending: false })
        .limit(1);

      const hasPassingTests = testRecords?.some(r =>
        ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
      );

      if (!hasPassingTests) {
        violations.push({
          type: 'E2E_TESTS_REQUIRED',
          message: `SD type '${sd.sd_type}' requires E2E tests before completion`,
          remediation: 'Run TESTING sub-agent to execute E2E tests'
        });
      }
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
    requirements_summary: {
      sd_type: sd.sd_type,
      skipCodeValidation: requirements.skipCodeValidation,
      uatRequirement,
      requiresE2ETests: requirements.requiresE2ETests
    }
  };
}

// ============================================================================
// MAIN HOOK EXECUTION
// ============================================================================

async function main() {
  // Get tool input from environment
  const toolInput = process.env.CLAUDE_TOOL_INPUT || '';
  const toolName = process.env.CLAUDE_TOOL_NAME || '';
  // Note: PostToolUse hooks receive tool result but we only need the command

  // Only check for Bash tool
  if (toolName !== 'Bash') {
    process.exit(0);
  }

  // Parse command from tool input
  let command = '';
  try {
    const input = JSON.parse(toolInput);
    command = input.command || '';
  } catch {
    command = toolInput;
  }

  // Check if this is a phase transition command
  const transition = detectPhaseTransition(command);
  if (!transition) {
    process.exit(0);
  }

  // Detect current SD
  const sdKey = detectCurrentSD();
  if (!sdKey) {
    process.exit(0);
  }

  const supabase = getSupabase();
  if (!supabase) {
    console.log('[phase-state-enforcement] Warning: No database connection');
    process.exit(0);
  }

  // Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, sd_type, title, current_phase, status')
    .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey}`)
    .single();

  if (sdError || !sd) {
    process.exit(0);
  }

  // Determine target phase
  const targetPhase = getTargetPhaseForHandoff(transition.handoffType);
  if (!targetPhase) {
    process.exit(0);
  }

  // Validate transition
  const validation = await canTransitionPhase(supabase, sd, targetPhase, transition.handoffType);

  if (!validation.allowed) {
    console.log('\n');
    console.log('PHASE TRANSITION VALIDATION');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`   SD: ${sd.sd_key}`);
    console.log(`   SD Type: ${sd.sd_type}`);
    console.log(`   Current Phase: ${sd.current_phase}`);
    console.log(`   Target Phase: ${targetPhase}`);
    console.log(`   Handoff: ${transition.handoffType}`);
    console.log('');
    console.log('   ❌ TRANSITION BLOCKED:');
    validation.violations.forEach(v => {
      console.log(`      - ${v.type}: ${v.message}`);
      if (v.remediation) {
        console.log(`        Action: ${v.remediation}`);
      }
    });
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

    // Note: This is a PostToolUse hook, so we can only warn (can't block)
    // The handoff enforcement PreToolUse hook handles blocking
    console.log('   ⚠️  Phase transition may fail validation.');
    console.log('   Resolve issues before proceeding with handoff.');
  } else {
    console.log(`✅ Phase transition ${sd.current_phase} -> ${targetPhase} validated for ${sd.sd_key}`);
  }

  process.exit(0);
}

// Execute
main().catch(err => {
  console.error(`[phase-state-enforcement] Error: ${err.message}`);
  process.exit(0);
});
