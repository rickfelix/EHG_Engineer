#!/usr/bin/env node
/**
 * Stop Hook: Sub-Agent Enforcement with Auto-Remediation
 *
 * LEO Protocol v4.3.3+
 * SD-LEO-INFRA-STOP-HOOK-SUB-001
 *
 * Behavior:
 * 1. Detects current SD from git branch
 * 2. Determines required + recommended sub-agents based on SD type/category
 * 3. Validates sub-agents ran in correct phase windows
 * 4. AUTO-RUNS missing sub-agents (remediation)
 * 5. Blocks session end until all validations pass
 * 6. Bypass requires explanation + retrospective entry
 *
 * Exit codes:
 *   0 - All validations passed (or not on SD branch)
 *   2 - Blocking: Missing sub-agents (triggers Claude to continue)
 */

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-H: Type-aware completion validation
import {
  getValidationRequirements,
  getUATRequirement
} from '../../lib/utils/sd-type-validation.js';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

const REQUIREMENTS = {
  byType: {
    feature: {
      required: ['TESTING', 'DESIGN', 'STORIES'],
      recommended: ['UAT', 'API']
    },
    implementation: {
      required: ['TESTING', 'API'],
      recommended: ['DATABASE']
    },
    infrastructure: {
      required: ['GITHUB', 'DOCMON'],
      recommended: ['VALIDATION']
    },
    database: {
      required: ['DATABASE', 'SECURITY'],
      recommended: ['REGRESSION']
    },
    security: {
      required: ['SECURITY', 'DATABASE'],
      recommended: ['TESTING', 'RCA']
    },
    documentation: {
      required: ['DOCMON'],
      recommended: ['VALIDATION']
    },
    bugfix: {
      required: ['RCA', 'REGRESSION', 'TESTING'],
      recommended: ['UAT']
    },
    refactor: {
      required: ['REGRESSION', 'VALIDATION'],
      recommended: ['TESTING']
    },
    performance: {
      required: ['PERFORMANCE', 'TESTING'],
      recommended: ['REGRESSION']
    },
    orchestrator: {
      required: [],
      recommended: ['RETRO']
    }
  },
  byCategory: {
    'Quality Assurance': ['TESTING', 'UAT', 'VALIDATION'],
    'quality': ['TESTING', 'UAT', 'VALIDATION'],
    'testing': ['TESTING', 'UAT'],
    'audit': ['VALIDATION', 'RCA'],
    'security': ['SECURITY', 'RISK'],
    'bug_fix': ['RCA', 'REGRESSION'],
    'ux_improvement': ['DESIGN', 'UAT'],
    'UX Improvement': ['DESIGN', 'UAT'],
    'product_feature': ['DESIGN', 'STORIES', 'API'],
    'database': ['DATABASE'],
    'database_schema': ['DATABASE', 'SECURITY']
  },
  universal: ['RETRO']
};

const TIMING_RULES = {
  DESIGN: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  STORIES: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  API: { after: 'LEAD-TO-PLAN', before: 'PLAN-TO-EXEC', phase: 'PLAN' },
  DATABASE: { after: 'LEAD-TO-PLAN', before: 'EXEC-TO-PLAN', phase: 'PLAN/EXEC' },
  TESTING: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  REGRESSION: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  PERFORMANCE: { after: 'PLAN-TO-EXEC', before: 'EXEC-TO-PLAN', phase: 'EXEC' },
  SECURITY: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  UAT: { after: 'EXEC-TO-PLAN', before: 'LEAD-FINAL-APPROVAL', phase: 'VERIFICATION' },
  VALIDATION: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RCA: { after: null, before: null, phase: 'EARLY' },
  RETRO: { after: 'PLAN-TO-LEAD', before: null, phase: 'COMPLETION' },
  GITHUB: { after: 'PLAN-TO-EXEC', before: 'LEAD-FINAL-APPROVAL', phase: 'EXEC' },
  DOCMON: { after: null, before: 'LEAD-FINAL-APPROVAL', phase: 'ANY' },
  RISK: { after: null, before: 'PLAN-TO-EXEC', phase: 'EARLY' }
};

const REMEDIATION_ORDER = [
  'RCA', 'DESIGN', 'STORIES', 'DATABASE', 'API', 'SECURITY',
  'TESTING', 'REGRESSION', 'PERFORMANCE', 'UAT', 'VALIDATION',
  'GITHUB', 'DOCMON', 'RETRO'
];

// ============================================================================
// TIMEZONE NORMALIZATION (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-M)
// ============================================================================

/**
 * Normalize a timestamp to UTC Date object.
 *
 * Fixes: Timestamps without timezone suffix (from Supabase) were being
 * interpreted as local time, causing timing validation mismatches.
 *
 * @param {string|Date} timestamp - The timestamp to normalize
 * @returns {Date} A Date object in UTC
 */
function normalizeToUTC(timestamp) {
  if (!timestamp) return null;

  // Already a Date object
  if (timestamp instanceof Date) {
    return timestamp;
  }

  const str = String(timestamp);

  // Check if timestamp already has timezone info
  // Patterns: ends with Z, +HH:MM, -HH:MM
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(str);

  if (hasTimezone) {
    // Already has timezone, parse directly
    return new Date(str);
  }

  // No timezone suffix - assume UTC by appending Z
  // This is the fix: Supabase timestamps without Z were being
  // interpreted as local time, causing validation mismatches
  return new Date(str + 'Z');
}

// ============================================================================
// POST-COMPLETION VALIDATION (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-F)
// ============================================================================

/**
 * Validate that post-completion commands were executed for a completed SD.
 *
 * Requirements:
 * - /ship (BLOCK if missing) - Required for all completed SDs
 * - /learn (WARN if missing) - Recommended for code SDs
 * - /document (WARN if missing) - Recommended for feature SDs
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 */
async function validatePostCompletion(supabase, sd, sdKey) {
  // Get post-completion records (stored in command_invocations or similar)
  // For now, we check for ship by looking for a PR linked to the SD
  const { data: prRecords } = await supabase
    .from('sd_scope_deliverables')
    .select('deliverable_name, completion_status, metadata')
    .eq('sd_id', sd.id)
    .ilike('deliverable_name', '%PR%');

  // Also check for retrospectives (indicates /learn was run)
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, status')
    .eq('sd_id', sd.id);

  // Check for documentation updates (indicates /document was run)
  const { data: docmonResults } = await supabase
    .from('sub_agent_execution_results')
    .select('verdict')
    .eq('sd_id', sd.id)
    .eq('sub_agent_code', 'DOCMON')
    .order('created_at', { ascending: false })
    .limit(1);

  const missingRequired = [];
  const missingRecommended = [];

  // Check /ship - Required for all completed SDs
  // Ship is considered done if there's a PR or the SD has a completion_date
  const hasShip = (prRecords && prRecords.length > 0) || sd.completion_date;
  if (!hasShip) {
    // Check if there were any commits on the branch
    // Only block if there's actual code to ship
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      if (diffOutput) {
        missingRequired.push('SHIP');
      }
    } catch {
      // If diff fails, assume ship is needed
      missingRequired.push('SHIP');
    }
  }

  // Check /learn - Recommended for code-producing SDs
  const codeProducingTypes = ['feature', 'bugfix', 'security', 'enhancement', 'performance'];
  const isCodeProducing = codeProducingTypes.includes(sd.sd_type);

  if (isCodeProducing) {
    const hasLearn = retros && retros.length > 0;
    if (!hasLearn) {
      missingRecommended.push('LEARN');
    }

    // Check /document - Recommended for feature SDs
    if (sd.sd_type === 'feature' || sd.sd_type === 'enhancement') {
      const hasDocument = docmonResults && docmonResults.length > 0 &&
        ['PASS', 'CONDITIONAL_PASS'].includes(docmonResults[0].verdict);
      if (!hasDocument) {
        missingRecommended.push('DOCUMENT');
      }
    }
  }

  // Output results
  if (missingRequired.length > 0) {
    console.error(`\n⚠️  Post-Completion Validation for ${sdKey}`);
    console.error(`   ❌ BLOCKING: Missing required post-completion commands: ${missingRequired.join(', ')}`);
    console.error('\n   LEO Protocol requires /ship before completing an SD with code changes.');
    console.error('   Action: Run /ship to commit, create PR, and merge the changes.');

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} completed without running required post-completion commands`,
      details: {
        sd_key: sdKey,
        sd_type: sd.sd_type,
        status: 'completed',
        missing_required: missingRequired,
        missing_recommended: missingRecommended
      },
      remediation: {
        action: 'Run /ship command to commit and merge changes',
        command: 'Use /ship in Claude Code'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Warn about missing recommended
  if (missingRecommended.length > 0) {
    console.error(`\n💡 Post-Completion Advisory for ${sdKey}`);
    console.error(`   Missing recommended: ${missingRecommended.join(', ')}`);
    if (missingRecommended.includes('LEARN')) {
      console.error('   Consider running /learn to capture insights from this SD');
    }
    if (missingRecommended.includes('DOCUMENT')) {
      console.error('   Consider running /document to update documentation');
    }
    console.error('   (Not blocking - these improve continuous improvement)');
  } else {
    console.error(`✅ Post-Completion Validation: ${sdKey} passed`);
  }
}

// ============================================================================
// TYPE-AWARE COMPLETION VALIDATION (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-H)
// ============================================================================

/**
 * Validate that an SD is properly completed based on its type-specific requirements.
 *
 * Uses getValidationRequirements() and getUATRequirement() to determine:
 * - Whether UAT was executed (for types that require it)
 * - Whether human verification was performed (for types that require it)
 * - Whether E2E tests exist (for code-producing types)
 *
 * Blocks session end if SD has commits on main but is not properly completed
 * per its type-specific requirements.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 */
async function validateCompletionForType(supabase, sd, sdKey) {
  const requirements = getValidationRequirements(sd);
  const uatRequirement = getUATRequirement(sd.sd_type);

  const violations = [];
  const warnings = [];

  // 1. Check UAT execution for types that require it
  if (uatRequirement === 'REQUIRED' || requirements.requiresUATExecution) {
    // Check for UAT execution records
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
        type: 'UAT_MISSING',
        message: `SD type '${sd.sd_type}' requires UAT execution before completion`,
        requirement: uatRequirement,
        remediation: 'Run /uat to execute user acceptance testing'
      });
    }
  }

  // 2. Check human-verifiable outcome for types that require it
  if (requirements.requiresHumanVerifiableOutcome) {
    // Check for human verification records
    const { data: verificationRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'UAT')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasHumanVerification = verificationRecords?.some(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

    if (!hasHumanVerification) {
      // This is a warning, not a blocking violation
      // UAT execution already covers the blocking requirement
      warnings.push({
        type: 'HUMAN_VERIFICATION_MISSING',
        message: `SD type '${sd.sd_type}' recommends ${requirements.humanVerificationType} verification`,
        reason: requirements.humanVerificationReason
      });
    }
  }

  // 3. Check E2E tests for code-producing types
  if (requirements.requiresE2ETests) {
    // Check for E2E test runs
    const { data: e2eRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'TESTING')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasPassingE2E = e2eRecords?.some(r =>
      ['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)
    );

    if (!hasPassingE2E) {
      violations.push({
        type: 'E2E_TESTS_MISSING',
        message: `SD type '${sd.sd_type}' requires E2E tests before completion`,
        remediation: 'Run TESTING sub-agent to execute E2E tests'
      });
    }
  }

  // 4. Check LLM UX validation for types that require it
  if (requirements.requiresLLMUXValidation) {
    const { data: uxRecords } = await supabase
      .from('sub_agent_execution_results')
      .select('verdict, metadata')
      .eq('sd_id', sd.id)
      .eq('sub_agent_code', 'DESIGN')
      .order('created_at', { ascending: false })
      .limit(1);

    const hasPassingUX = uxRecords?.some(r => {
      if (!['PASS', 'CONDITIONAL_PASS'].includes(r.verdict)) return false;
      // Check for minimum score if metadata available
      const score = r.metadata?.ux_score || r.metadata?.score || 100;
      return score >= requirements.llmUxMinScore;
    });

    if (!hasPassingUX) {
      warnings.push({
        type: 'LLM_UX_VALIDATION_MISSING',
        message: `SD type '${sd.sd_type}' recommends LLM UX validation (min score: ${requirements.llmUxMinScore})`,
        lenses: requirements.llmUxRequiredLenses
      });
    }
  }

  // Output violations (BLOCK)
  if (violations.length > 0) {
    console.error(`\n⚠️  Type-Aware Completion Validation for ${sdKey}`);
    console.error(`   SD Type: ${sd.sd_type}`);
    console.error(`   UAT Requirement: ${uatRequirement}`);
    console.error('   ❌ BLOCKING VIOLATIONS:');
    violations.forEach(v => {
      console.error(`      - ${v.type}: ${v.message}`);
      if (v.remediation) console.error(`        Action: ${v.remediation}`);
    });

    if (warnings.length > 0) {
      console.error('   ⚠️  Additional warnings:');
      warnings.forEach(w => console.error(`      - ${w.type}: ${w.message}`));
    }

    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sd.sd_type}) has type-specific completion violations`,
      details: {
        sd_key: sdKey,
        sd_type: sd.sd_type,
        uat_requirement: uatRequirement,
        violations: violations,
        warnings: warnings,
        requirements_summary: {
          requiresUAT: requirements.requiresUATExecution,
          requiresE2E: requirements.requiresE2ETests,
          requiresHumanVerification: requirements.requiresHumanVerifiableOutcome,
          requiresLLMUX: requirements.requiresLLMUXValidation
        }
      },
      remediation: {
        priority_actions: violations.map(v => v.remediation).filter(Boolean)
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // Output warnings (non-blocking)
  if (warnings.length > 0) {
    console.error(`\n💡 Type-Aware Completion Advisory for ${sdKey}`);
    console.error(`   SD Type: ${sd.sd_type}`);
    warnings.forEach(w => console.error(`   - ${w.type}: ${w.message}`));
    console.error('   (Not blocking - these improve quality assurance)');
  } else {
    console.error(`✅ Type-Aware Completion: ${sdKey} (${sd.sd_type}) passed all type-specific checks`);
  }
}

// ============================================================================
// TYPE-AWARE BIAS DETECTION (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-J)
// ============================================================================

/**
 * Detect common AI workflow biases based on SD type and current state.
 *
 * Detects three types of biases:
 * 1. COMPLETION_BIAS: Code shipped to main but SD not marked complete in database
 * 2. EFFICIENCY_BIAS: Jumped to EXEC phase without proper handoffs
 * 3. AUTONOMY_BIAS: Code exists without PRD for code-requiring SD types
 *
 * Uses type-specific requirements to determine if a bias is applicable.
 * For example, infrastructure SDs don't require PRD so AUTONOMY_BIAS doesn't apply.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} sd - The Strategic Directive
 * @param {string} sdKey - The SD key
 * @param {Object} requirements - Validation requirements from getValidationRequirements()
 */
async function detectBiasesForType(supabase, sd, sdKey, requirements) {
  const biases = [];
  const sdType = sd.sd_type || 'feature';

  // 1. COMPLETION_BIAS: Code on main but SD not complete
  // Check if commits from this SD's branch have been merged to main
  try {
    // Check if there are merged PRs for this SD
    const { data: prRecords } = await supabase
      .from('sd_scope_deliverables')
      .select('deliverable_name, completion_status, metadata')
      .eq('sd_id', sd.id)
      .ilike('deliverable_name', '%PR%');

    const hasMergedPR = prRecords?.some(pr =>
      pr.completion_status === 'completed' ||
      pr.metadata?.merged === true
    );

    // SD has code on main but isn't marked complete
    if (hasMergedPR && sd.status !== 'completed' && sd.current_phase !== 'COMPLETED') {
      biases.push({
        type: 'COMPLETION_BIAS',
        severity: 'high',
        message: 'Code merged to main but SD not marked complete in database',
        details: {
          sd_status: sd.status,
          current_phase: sd.current_phase,
          has_merged_pr: true
        },
        root_cause: 'Claude may confuse "code shipped" with "SD complete"',
        remediation: 'Execute LEAD-FINAL-APPROVAL handoff or mark SD complete',
        command: `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sdKey}`
      });
    }
  } catch {
    // Ignore errors in PR check
  }

  // 2. EFFICIENCY_BIAS: In EXEC phase without proper handoffs
  // Check if jumped to implementation without LEAD-TO-PLAN and PLAN-TO-EXEC
  if (sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION') {
    const { data: handoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sd.id)
      .eq('status', 'accepted');

    const acceptedHandoffs = (handoffs || []).map(h => h.handoff_type);
    const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
    const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');

    if (!hasLeadToPlan || !hasPlanToExec) {
      const missingHandoffs = [];
      if (!hasLeadToPlan) missingHandoffs.push('LEAD-TO-PLAN');
      if (!hasPlanToExec) missingHandoffs.push('PLAN-TO-EXEC');

      biases.push({
        type: 'EFFICIENCY_BIAS',
        severity: 'medium',
        message: `In EXEC phase without required handoffs: ${missingHandoffs.join(', ')}`,
        details: {
          current_phase: sd.current_phase,
          accepted_handoffs: acceptedHandoffs,
          missing_handoffs: missingHandoffs
        },
        root_cause: 'Claude may skip planning to start coding faster',
        remediation: 'Execute missing handoffs before continuing',
        command: `node scripts/handoff.js execute ${missingHandoffs[0]} ${sdKey}`
      });
    }
  }

  // 3. AUTONOMY_BIAS: Code exists without PRD for code-requiring SD types
  // Only check for SD types that require PRD (feature, bugfix, security, etc.)
  if (!requirements.skipCodeValidation) {
    // Check if there's a PRD
    const { data: prd } = await supabase
      .from('product_requirements_v2')
      .select('id')
      .eq('sd_id', sd.id)
      .single();

    const hasPRD = prd !== null;

    // Check if there are code changes on the branch
    let hasCodeChanges = false;
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      // Filter for actual code files (not test files, not markdown, not config)
      const codeFiles = diffOutput.split('\n').filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      hasCodeChanges = codeFiles.length > 0;
    } catch {
      // Ignore diff errors
    }

    if (hasCodeChanges && !hasPRD) {
      biases.push({
        type: 'AUTONOMY_BIAS',
        severity: 'high',
        message: `Code changes exist without PRD for ${sdType} SD (requires PRD)`,
        details: {
          sd_type: sdType,
          has_prd: false,
          has_code_changes: true,
          requires_prd: !requirements.skipCodeValidation
        },
        root_cause: 'Claude may start coding without defining requirements first',
        remediation: 'Create PRD before continuing with implementation',
        command: `node scripts/add-prd-to-database.js ${sdKey}`
      });
    }
  }

  // Output detected biases
  if (biases.length > 0) {
    console.error(`\n🧠 AI Bias Detection for ${sdKey} (${sdType})`);
    console.error(`   Current Phase: ${sd.current_phase}`);
    console.error(`   Status: ${sd.status}`);
    console.error('');

    biases.forEach((bias, idx) => {
      const severityIcon = bias.severity === 'high' ? '🔴' : bias.severity === 'medium' ? '🟡' : '🟢';
      console.error(`   ${idx + 1}. ${severityIcon} ${bias.type}`);
      console.error(`      Message: ${bias.message}`);
      console.error(`      Root Cause: ${bias.root_cause}`);
      console.error(`      Action: ${bias.remediation}`);
      if (bias.command) {
        console.error(`      Command: ${bias.command}`);
      }
      console.error('');
    });

    // High severity biases should block
    const highSeverityBiases = biases.filter(b => b.severity === 'high');
    if (highSeverityBiases.length > 0) {
      const output = {
        decision: 'block',
        reason: `Detected ${highSeverityBiases.length} high-severity AI biases for ${sdKey}`,
        details: {
          sd_key: sdKey,
          sd_type: sdType,
          current_phase: sd.current_phase,
          biases: biases
        },
        remediation: {
          priority_actions: highSeverityBiases.map(b => b.remediation),
          commands: highSeverityBiases.map(b => b.command).filter(Boolean)
        }
      };

      console.log(JSON.stringify(output));
      process.exit(2);
    }

    // Medium severity biases warn but don't block
    console.error('   (Medium severity biases are warnings - not blocking)');
  }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1. Check for bypass
  const bypassResult = await checkBypass(supabase);
  if (bypassResult.allowed) {
    process.exit(0);
  }
  if (bypassResult.blocked) {
    console.log(JSON.stringify(bypassResult.response));
    process.exit(2);
  }

  // 2. Get current branch to extract SD ID
  let branch;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    process.exit(0); // Not in git repo
  }

  // 3. Extract SD ID from branch
  // Pattern matches: SD-XXX-...-NNN format (e.g., SD-LEO-INFRA-STOP-HOOK-SUB-001)
  const sdMatch = branch.match(/SD-[A-Z]+-(?:[A-Z]+-)*[0-9]+/i);
  if (sdMatch === null) {
    process.exit(0); // No SD in branch
  }
  const sdKey = sdMatch[0];

  // 4. Get SD details
  const { data: sd, error: sdError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, legacy_id, title, sd_type, category, current_phase, status')
    .or(`sd_key.eq.${sdKey},legacy_id.eq.${sdKey},id.eq.${sdKey}`)
    .single();

  if (sdError || sd === null) {
    process.exit(0); // SD not found
  }

  // 5. Check post-completion if completed (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-F)
  if (sd.status === 'completed' || sd.current_phase === 'COMPLETED') {
    await validatePostCompletion(supabase, sd, sdKey);
    process.exit(0);
  }

  // 5a. Type-aware completion validation (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-H)
  // Check if SD has commits and is near completion (EXEC phase or later)
  const nearCompletionPhases = ['EXEC', 'PLAN_VERIFY', 'LEAD_FINAL', 'PLAN', 'PLAN-TO-LEAD'];
  if (nearCompletionPhases.includes(sd.current_phase)) {
    // Only validate if there are actual commits
    try {
      const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
      if (diffOutput) {
        // Has commits - validate type-specific completion requirements
        await validateCompletionForType(supabase, sd, sdKey);
      }
    } catch {
      // If diff fails, skip type-aware validation
    }
  }

  // 5b. Skip if no work has been committed on the branch (nothing to validate)
  try {
    const diffOutput = execSync('git diff main...HEAD --name-only', { encoding: 'utf-8' }).trim();
    if (!diffOutput) {
      console.error(`⏭️ Skipping validation for ${sdKey}: No commits on branch (nothing to validate)`);
      process.exit(0);
    }
  } catch {
    // If diff fails (e.g., main doesn't exist), continue with normal validation
  }

  // 5c. Type-aware bias detection (SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-J)
  // Detect common AI workflow biases based on SD type and state
  const validationRequirements = getValidationRequirements(sd);
  await detectBiasesForType(supabase, sd, sdKey, validationRequirements);

  // 6. Determine required + recommended sub-agents
  const sdType = sd.sd_type || 'feature';
  const category = sd.category || '';

  const typeReqs = REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };
  const categoryReqs = REQUIREMENTS.byCategory[category] || [];

  const required = new Set([...typeReqs.required, ...categoryReqs]);
  const recommended = new Set(typeReqs.recommended);

  // Add universal if near completion
  if (['PLAN', 'LEAD', 'PLAN_VERIFY', 'LEAD_FINAL'].includes(sd.current_phase)) {
    REQUIREMENTS.universal.forEach(s => required.add(s));
  }

  // Note: recommended sub-agents are tracked separately - they warn but don't block
  // Only required sub-agents will cause exit 2 (block)

  // 7. Get handoff timestamps
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select('handoff_type, status, created_at')
    .eq('sd_id', sd.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  const handoffTimes = {};
  if (handoffs) {
    handoffs.forEach(h => {
      handoffTimes[h.handoff_type] = normalizeToUTC(h.created_at);
    });
  }

  // 8. Get sub-agent executions
  const { data: executions } = await supabase
    .from('sub_agent_execution_results')
    .select('sub_agent_code, verdict, created_at')
    .eq('sd_id', sd.id);

  // 9. Validate each sub-agent (required blocks, recommended warns)
  const missingRequired = [];
  const missingRecommended = [];
  const wrongTiming = [];
  const cached = [];

  // Check required sub-agents (these block if missing)
  for (const agent of required) {
    const agentExecs = (executions || []).filter(e => e.sub_agent_code === agent);
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    // Check cache
    const recentPass = passingExecs.find(e =>
      (Date.now() - normalizeToUTC(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
      continue; // Cached, skip
    }

    if (passingExecs.length === 0) {
      missingRequired.push(agent);
      continue;
    }

    // Check timing
    const rule = TIMING_RULES[agent];
    if (rule) {
      const afterTime = rule.after ? handoffTimes[rule.after] : null;
      const beforeTime = rule.before ? handoffTimes[rule.before] : null;

      const validExec = passingExecs.some(e => {
        const execTime = normalizeToUTC(e.created_at);
        const afterOk = afterTime === null || afterTime === undefined || execTime >= afterTime;
        const beforeOk = beforeTime === null || beforeTime === undefined || execTime <= beforeTime;
        return afterOk && beforeOk;
      });

      if (validExec === false) {
        wrongTiming.push({
          agent,
          rule: `Must run in ${rule.phase} phase (after ${rule.after || 'any'}, before ${rule.before || 'any'})`,
          lastRun: passingExecs[0]?.created_at
        });
      }
    }
  }

  // 9b. Check recommended sub-agents (these warn but don't block)
  for (const agent of recommended) {
    if (required.has(agent)) continue; // Already checked in required

    const agentExecs = (executions || []).filter(e => e.sub_agent_code === agent);
    const passingExecs = agentExecs.filter(e =>
      ['PASS', 'CONDITIONAL_PASS'].includes(e.verdict)
    );

    const recentPass = passingExecs.find(e =>
      (Date.now() - normalizeToUTC(e.created_at).getTime()) < CACHE_DURATION_MS
    );

    if (recentPass) {
      cached.push(agent);
    } else if (passingExecs.length === 0) {
      missingRecommended.push(agent);
    }
  }

  // 10. Handle missing sub-agents
  // Required missing = BLOCK (exit 2)
  // Recommended missing = WARN only (exit 0 with message)

  if (missingRequired.length > 0 || wrongTiming.length > 0) {
    console.error(`\n🔍 Sub-Agent Enforcement for ${sdKey} (${sdType})`);
    console.error(`   Phase: ${sd.current_phase}`);
    console.error(`   Cached: ${cached.length} sub-agents`);

    if (missingRequired.length > 0) {
      console.error(`   ❌ Missing REQUIRED: ${missingRequired.join(', ')}`);
    }
    if (missingRecommended.length > 0) {
      console.error(`   ⚠️  Missing recommended: ${missingRecommended.join(', ')} (non-blocking)`);
    }
    if (wrongTiming.length > 0) {
      console.error(`   Wrong timing: ${wrongTiming.map(w => w.agent).join(', ')}`);
    }

    // Sort missing required by remediation order
    const toRemediate = [...missingRequired, ...wrongTiming.map(w => w.agent)];
    const sorted = toRemediate.sort((a, b) =>
      REMEDIATION_ORDER.indexOf(a) - REMEDIATION_ORDER.indexOf(b)
    );

    // Return blocking response with remediation instructions
    const output = {
      decision: 'block',
      reason: `SD ${sdKey} (${sdType}) requires sub-agent validation`,
      details: {
        sd_key: sdKey,
        sd_type: sdType,
        category: category,
        current_phase: sd.current_phase,
        missing_required: missingRequired,
        missing_recommended: missingRecommended,
        wrong_timing: wrongTiming,
        cached: cached.length
      },
      remediation: {
        auto_run: true,
        agents_to_run: sorted,
        command: `node scripts/orchestrate-phase-subagents.js ${sdKey} --agents ${sorted.join(',')}`
      },
      bypass_instructions: {
        step1: 'Create .stop-hook-bypass.json with explanation (min 50 chars)',
        step2: 'Run: node scripts/generate-retrospective.js --bypass-entry',
        step3: 'Set retrospective_committed: true in bypass file'
      }
    };

    console.log(JSON.stringify(output));
    process.exit(2);
  }

  // 10b. Warn about missing recommended (but don't block)
  if (missingRecommended.length > 0) {
    console.error(`\n⚠️  Sub-Agent Advisory for ${sdKey} (${sdType})`);
    console.error(`   Missing recommended: ${missingRecommended.join(', ')}`);
    console.error(`   💡 Consider running: node scripts/orchestrate-phase-subagents.js ${sdKey} --agents ${missingRecommended.join(',')}`);
    console.error('   (Not blocking - these are optional but improve quality)');
  }

  // 11. All required validations passed
  const totalChecked = required.size + recommended.size;
  console.error(`✅ Sub-Agent Enforcement: ${sdKey} passed (${cached.length} cached, ${totalChecked - cached.length} validated)`);
  process.exit(0);
}

// ============================================================================
// BYPASS HANDLING
// ============================================================================

async function checkBypass(supabase) {
  const bypassFile = path.join(
    process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    '.stop-hook-bypass.json'
  );

  if (fs.existsSync(bypassFile) === false) {
    return { allowed: false, blocked: false };
  }

  try {
    const bypass = JSON.parse(fs.readFileSync(bypassFile, 'utf-8'));

    // Validate explanation
    if (bypass.explanation === undefined || bypass.explanation.length < 50) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass explanation must be at least 50 characters',
          current_length: bypass.explanation?.length || 0
        }
      };
    }

    // Validate retrospective committed
    if (bypass.retrospective_committed !== true) {
      return {
        allowed: false,
        blocked: true,
        response: {
          decision: 'block',
          reason: 'Bypass requires retrospective entry',
          action: 'Run: node scripts/generate-retrospective.js --bypass-entry'
        }
      };
    }

    // Log bypass to audit
    try {
      await supabase.from('audit_log').insert({
        event_type: 'STOP_HOOK_BYPASS',
        severity: 'warning',
        details: {
          sd_key: bypass.sd_key,
          explanation: bypass.explanation,
          skipped_agents: bypass.skipped_agents,
          retrospective_id: bypass.retrospective_id
        }
      });
    } catch (e) {
      console.error('Failed to log bypass to audit:', e.message);
    }

    // Clean up bypass file
    fs.unlinkSync(bypassFile);

    console.error(`⚠️ Bypass allowed for ${bypass.sd_key}: ${bypass.explanation.slice(0, 80)}...`);
    return { allowed: true, blocked: false };

  } catch (e) {
    return {
      allowed: false,
      blocked: true,
      response: {
        decision: 'block',
        reason: `Invalid bypass file: ${e.message}`
      }
    };
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch(err => {
  console.error('Stop hook error:', err.message);
  process.exit(0); // Don't block on internal errors
});
