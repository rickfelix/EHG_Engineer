/**
 * Handoff CLI Main Entry Point
 *
 * Main CLI orchestration for the handoff system.
 * Extracted from scripts/handoff.js for modularization.
 *
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

import { createHandoffSystem } from '../index.js';
import dotenv from 'dotenv';

// AUTO-PROCEED continuation imports
import { getNextReadyChild, getOrchestratorContext } from '../child-sd-selector.js';
import { resolveAutoProceed } from '../auto-proceed-resolver.js';

// SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007: Handoff sequence enforcement
import { getWorkflowForType } from './workflow-definitions.js';

// Status line integration (SD-LEO-ENH-AUTO-PROCEED-001-13)
import LEOStatusLine from '../../../../scripts/leo-status-line.js';

import {
  getSDWorkflow,
  displayWorkflowRecommendation,
  verifySDCompletion,
  getPendingApprovalSDs,
  displayPendingSDs,
  displayCompletionVerification,
  checkMultiRepoStatus,
  displayMultiRepoStatus
} from './index.js';
import { checkBypassRateLimits, displayExecutionResult } from './execution-helpers.js';
import { detectBlockers, DETECTION_TIMEOUT_MS } from '../blocker-resolution.js';
import { analyzeClaimRelationship, autoReleaseStaleDeadClaim } from '../../sd-next/claim-analysis.js';

// LEO 5.0 commands
import {
  handleWallsCommand,
  handleRetryGateCommand,
  handleKickbackCommand,
  handleInvalidateCommand,
  handleResumeCommand,
  handleFailuresCommand,
  handleSubagentsCommand,
  displayLeo5Help
} from './leo5-commands.js';

dotenv.config();

/**
 * Sanitize string by removing invalid Unicode surrogates.
 * Prevents JSON serialization errors when output is captured by Claude Code.
 *
 * Invalid surrogates occur when:
 * - High surrogate (0xD800-0xDBFF) not followed by low surrogate (0xDC00-0xDFFF)
 * - Lone low surrogate without preceding high surrogate
 *
 * @param {any} value - Value to sanitize
 * @returns {any} Sanitized value with invalid surrogates replaced by U+FFFD
 */
function sanitizeUnicode(value) {
  if (typeof value !== 'string') return value;

  let result = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    // High surrogate
    if (code >= 0xD800 && code <= 0xDBFF) {
      const nextCode = value.charCodeAt(i + 1);
      // Valid pair - keep both
      if (nextCode >= 0xDC00 && nextCode <= 0xDFFF) {
        result += value[i] + value[i + 1];
        i++; // Skip next char (already added)
      } else {
        // Invalid - replace with replacement character
        result += '\uFFFD';
      }
    }
    // Lone low surrogate
    else if (code >= 0xDC00 && code <= 0xDFFF) {
      result += '\uFFFD';
    }
    // Normal character
    else {
      result += value[i];
    }
  }
  return result;
}

/**
 * Recursively sanitize all string values within an object/array.
 * Handles nested structures where surrogates hide inside object properties.
 *
 * @param {any} value - Value to deep-sanitize
 * @returns {any} Sanitized value with all string surrogates replaced
 */
function deepSanitizeUnicode(value) {
  if (typeof value === 'string') return sanitizeUnicode(value);
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSanitizeUnicode);

  const result = {};
  for (const key of Object.keys(value)) {
    result[sanitizeUnicode(key)] = deepSanitizeUnicode(value[key]);
  }
  return result;
}

/**
 * Install Unicode sanitization on console output.
 * This prevents invalid surrogates from corrupting Claude Code's API calls.
 *
 * Note: Objects are deep-sanitized recursively rather than via JSON round-trip,
 * because ES2019 JSON.stringify escapes lone surrogates as \ud800 (ASCII chars)
 * which sanitizeUnicode doesn't detect, and JSON.parse converts them back.
 */
function installOutputSanitizer() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const sanitizeArgs = (args) => args.map(arg => {
    if (typeof arg === 'string') return sanitizeUnicode(arg);
    if (typeof arg === 'object' && arg !== null) {
      try {
        return deepSanitizeUnicode(arg);
      } catch {
        return arg;
      }
    }
    return arg;
  });

  console.log = (...args) => originalLog(...sanitizeArgs(args));
  console.error = (...args) => originalError(...sanitizeArgs(args));
  console.warn = (...args) => originalWarn(...sanitizeArgs(args));
}

/**
 * Display usage help
 */
export function displayHelp() {
  console.log('');
  console.log('LEO Protocol Handoff System');
  console.log('='.repeat(50));
  console.log('');
  console.log('COMMANDS:');
  console.log('  workflow SD-ID         - Show recommended workflow for SD type');
  console.log('  verify SD-ID           - Verify SD is truly complete (PAT-WF-NEXT-001)');
  console.log('  pending                - Show SDs stuck in pending_approval');
  console.log('  precheck TYPE SD-ID    - Find ALL issues before execute (batch validation)');
  console.log('  execute TYPE SD-ID     - Execute handoff');
  console.log('  list [SD-ID]           - List handoff executions');
  console.log('  stats                  - Show system statistics');
  console.log('  help                   - Show this help');
  console.log('');
  console.log('HANDOFF TYPES:');
  console.log('  LEAD-TO-PLAN        Strategic approval → PRD creation');
  console.log('  PLAN-TO-EXEC        PRD complete → Implementation start');
  console.log('  EXEC-TO-PLAN        Implementation done → Verification');
  console.log('  PLAN-TO-LEAD        Verified → Final approval');
  console.log('  LEAD-FINAL-APPROVAL Mark SD as completed (post PLAN-TO-LEAD)');
  console.log('');
  console.log('SD TYPE WORKFLOWS:');
  console.log('  feature         Full workflow (all gates + E2E tests)');
  console.log('  infrastructure  Modified (EXEC-TO-PLAN optional, no E2E)');
  console.log('  documentation   Quick (EXEC-TO-PLAN optional, no code validation)');
  console.log('  database        Modified (DATABASE sub-agent required)');
  console.log('  security        Full (SECURITY sub-agent required)');
  console.log('');
  console.log('AUTO-PROCEED FLAGS:');
  console.log('  --auto-proceed      Enable AUTO-PROCEED mode for this handoff');
  console.log('  --no-auto-proceed   Disable AUTO-PROCEED mode for this handoff');
  console.log('  (Precedence: CLI > ENV > Session > Database > Default)');
  console.log('');
  console.log('EXAMPLES:');
  console.log('  node scripts/handoff.js workflow SD-LEO-GEMINI-001');
  console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-FEATURE-001');
  console.log('  node scripts/handoff.js execute PLAN-TO-EXEC SD-FEATURE-001 --auto-proceed');
  console.log('  node scripts/handoff.js list SD-FEATURE-001');
  console.log('  node scripts/handoff.js stats');

  // Display LEO 5.0 commands
  displayLeo5Help();
}

/**
 * Handle workflow command
 */
export async function handleWorkflowCommand(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/handoff.js workflow SD-ID');
    console.log('');
    console.log('Shows the recommended workflow for an SD based on its type.');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js workflow SD-LEO-GEMINI-001');
    return { success: false };
  }

  const workflowInfo = await getSDWorkflow(sdId);
  if (workflowInfo.error) {
    console.error(`❌ ${workflowInfo.error}`);
    return { success: false };
  }

  displayWorkflowRecommendation(workflowInfo);
  return { success: true };
}

/**
 * Handle verify command
 */
export async function handleVerifyCommand(sdId) {
  if (!sdId) {
    console.log('Usage: node scripts/handoff.js verify SD-ID');
    console.log('');
    console.log('Verifies that an SD is truly complete by checking:');
    console.log('  1. SD status is "completed"');
    console.log('  2. All required handoffs exist');
    console.log('  3. LEAD-FINAL-APPROVAL was executed');
    console.log('');
    console.log('Use this BEFORE claiming an SD is done!');
    return { success: false };
  }

  const verifyResult = await verifySDCompletion(sdId);
  displayCompletionVerification(verifyResult);
  return { success: verifyResult.isComplete };
}

/**
 * Handle pending command
 */
export async function handlePendingCommand() {
  const pendingSDs = await getPendingApprovalSDs();
  displayPendingSDs(pendingSDs);
  return { success: true };
}

/**
 * Handle precheck command
 */
/**
 * CLI introspection: JSON output for gate status queries.
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-05-D
 *
 * @param {string} sdId - SD key
 * @param {Object} [options] - { json: boolean }
 * @returns {Promise<Object>} Gate status for all handoff types
 */
export async function introspectGateStatus(sdId, { json = true } = {}) {
  const system = createHandoffSystem();
  const handoffTypes = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];
  const results = {};

  for (const type of handoffTypes) {
    try {
      const result = await system.precheckHandoff(type, sdId);
      results[type] = {
        passed: result.success,
        gateCount: result.gates?.length || 0,
        failedGates: result.failedGates || [],
        issues: result.issues || [],
      };
    } catch {
      results[type] = { passed: false, error: 'not_applicable' };
    }
  }

  if (json) {
    console.log(JSON.stringify({ sd_id: sdId, gates: results }, null, 2));
  }
  return results;
}

export async function handlePrecheckCommand(precheckType, precheckSdId) {
  const system = createHandoffSystem();

  if (!precheckType || !precheckSdId) {
    console.log('Usage: node scripts/handoff.js precheck HANDOFF_TYPE SD-ID');
    console.log('');
    console.log('Runs ALL gate validations to find ALL issues at once.');
    console.log('Use this BEFORE "execute" to fix everything in one iteration.');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/handoff.js precheck PLAN-TO-EXEC SD-EXAMPLE-001');
    return { success: false };
  }

  // Step 0: Multi-repo status check
  console.log('');
  console.log('STEP 0: MULTI-REPO STATUS CHECK');
  console.log('─'.repeat(50));
  const workflowInfoForPrecheck = await getSDWorkflow(precheckSdId);
  const multiRepoResult = checkMultiRepoStatus(workflowInfoForPrecheck.sd);
  displayMultiRepoStatus(multiRepoResult, 'phase transition');

  // Step 1: Quick git state check first
  console.log('');
  console.log('STEP 1: GIT STATE CHECK');
  console.log('─'.repeat(50));
  try {
    const { checkGitState } = await import('../../check-git-state.js');
    const gitResult = await checkGitState();
    if (!gitResult.passed) {
      console.log('');
      console.log('⛔ Git issues found - resolve before proceeding');
      console.log('   Run: node scripts/check-git-state.js for details');
      console.log('');
    }
  } catch (e) {
    console.log(`   ⚠️  Could not run git check: ${e.message}`);
  }

  // Step 2: Run all handoff gates
  console.log('');
  console.log('STEP 2: HANDOFF GATE VALIDATION');
  console.log('─'.repeat(50));
  const precheckResult = await system.precheckHandoff(precheckType, precheckSdId);

  console.log('');
  if (precheckResult.success) {
    console.log('✅ PRECHECK PASSED - All gates would pass');
    console.log('='.repeat(50));
    console.log('   You can now safely run:');
    console.log(`   node scripts/handoff.js execute ${precheckType.toUpperCase()} ${precheckSdId}`);
  } else {
    console.log('❌ PRECHECK FAILED - Issues must be resolved first');
    console.log('='.repeat(50));
    console.log(`   Found ${precheckResult.issues.length} issue(s) across ${precheckResult.failedGates.length} gate(s)`);
    console.log('');
    console.log('   ALL ISSUES:');
    precheckResult.issues.forEach((issue, idx) => {
      console.log(`   ${idx + 1}. [${issue.gate}] ${issue.issue}`);
    });
    console.log('');
    console.log('   Fix all issues above, then run precheck again.');
  }
  console.log('');

  return { success: precheckResult.success };
}

/**
 * Map handoff type to LEO Protocol phase
 * Used for status line display (SD-LEO-ENH-AUTO-PROCEED-001-13)
 */
function mapHandoffToPhase(handoffType) {
  const type = (handoffType || '').toUpperCase();
  if (type.includes('LEAD')) return 'LEAD';
  if (type.includes('PLAN')) return 'PLAN';
  if (type.includes('EXEC')) return 'EXEC';
  return 'EXEC'; // Default
}

/**
 * Handle execute command
 */
export async function handleExecuteCommand(handoffType, sdId, args) {
  const system = createHandoffSystem();

  // Parse bypass flags
  const bypassValidationIdx = args.findIndex(a => a === '--bypass-validation');
  const bypassReasonIdx = args.findIndex(a => a === '--bypass-reason');
  const bypassValidation = bypassValidationIdx !== -1;
  let bypassReason = null;

  if (bypassReasonIdx !== -1 && args[bypassReasonIdx + 1]) {
    bypassReason = args[bypassReasonIdx + 1];
  }

  // Find prdId (third non-flag argument)
  const nonFlagArgs = args.filter((a, i) =>
    !a.startsWith('--') &&
    (i <= 2 || (i === bypassReasonIdx + 1 ? false : true))
  );
  const prdId = nonFlagArgs[3];

  if (!handoffType || !sdId) {
    console.log('Usage: node scripts/handoff.js execute HANDOFF_TYPE SD-ID [PRD-ID] [--bypass-validation --bypass-reason "reason"]');
    console.log('');
    console.log('Handoff Types (case-insensitive):');
    console.log('  LEAD-TO-PLAN        - Strategic to Planning handoff');
    console.log('  PLAN-TO-EXEC        - Planning to Execution handoff');
    console.log('  EXEC-TO-PLAN        - Execution to Verification handoff');
    console.log('  PLAN-TO-LEAD        - Verification to Final Approval handoff');
    console.log('  LEAD-FINAL-APPROVAL - Mark SD as completed (final step)');
    console.log('');
    console.log('TIP: Run "node scripts/handoff.js workflow SD-ID" to see recommended workflow');
    return { success: false };
  }

  // Validate handoff type is not a task ID (common AI confusion)
  const normalizedHandoffType = handoffType.toUpperCase();
  const validHandoffTypes = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];

  // Check if it looks like a task ID (contains phase-task patterns)
  const taskPatterns = [
    /^(VERIFY|EXEC|PLAN|LEAD|FINAL)-(FIDELITY|VALIDATION|REGRESSION|SYNTHESIS|RETRO|IMPL|READY|STORIES|PR|APPROVE|DOCUMENT|LEARN|WALL)/i,
    /^SD-[A-Z]+-/i,  // Starts with SD prefix
    /-GATE-/i,       // Contains gate marker
    /-WALL$/i        // Ends with wall marker
  ];

  const looksLikeTask = taskPatterns.some(pattern => pattern.test(normalizedHandoffType));

  if (looksLikeTask && !validHandoffTypes.includes(normalizedHandoffType)) {
    console.error('');
    console.error('❌ ERROR: Invalid handoff type - this appears to be a TASK ID');
    console.error(`   You entered: "${handoffType}"`);
    console.error('');
    console.error('   Tasks (like VERIFY-FIDELITY, EXEC-IMPL) are work items.');
    console.error('   They should be created with the TaskCreate tool, NOT handoff.js');
    console.error('');
    console.error('   Valid HANDOFF types for handoff.js:');
    console.error('      • LEAD-TO-PLAN        - Strategic to Planning');
    console.error('      • PLAN-TO-EXEC        - Planning to Execution');
    console.error('      • EXEC-TO-PLAN        - Execution to Verification');
    console.error('      • PLAN-TO-LEAD        - Verification to Final Approval');
    console.error('      • LEAD-FINAL-APPROVAL - Mark SD as completed');
    console.error('');
    console.error('   💡 TIP: Run "node scripts/handoff.js workflow ' + sdId + '" to see next steps');
    console.error('');
    return { success: false };
  }

  // Validate bypass flags
  if (bypassValidation && !bypassReason) {
    console.error('');
    console.error('❌ BYPASS ERROR: --bypass-validation requires --bypass-reason');
    console.error('');
    console.error('Usage: --bypass-validation --bypass-reason "Your justification (min 20 chars)"');
    console.error('');
    return { success: false };
  }

  if (bypassReason && bypassReason.length < 20) {
    console.error('');
    console.error('❌ BYPASS ERROR: --bypass-reason must be at least 20 characters');
    console.error(`   Provided: ${bypassReason.length} characters`);
    console.error('');
    return { success: false };
  }

  // Rate limiting and audit logging for bypass
  if (bypassValidation) {
    const bypassCheck = await checkBypassRateLimits(sdId, handoffType, bypassReason);
    if (!bypassCheck.success) {
      return { success: false };
    }
  }

  // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-007: Guardrail 5 - Handoff Sequence Enforcement
  // Verify that prerequisite handoffs have been completed before allowing execution
  if (!bypassValidation) {
    const workflowCheck = await getSDWorkflow(sdId);
    if (!workflowCheck.error && workflowCheck.sd) {
      const sdType = workflowCheck.sd.sd_type || 'feature';
      const workflow = getWorkflowForType(sdType);
      const requiredHandoffs = workflow.required;
      const requestedHandoff = normalizedHandoffType;
      const handoffIndex = requiredHandoffs.indexOf(requestedHandoff);

      if (handoffIndex > 0) {
        // Check that all prior required handoffs have been accepted
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseForCheck = createClient(
          process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { data: completedHandoffs } = await supabaseForCheck
          .from('sd_phase_handoffs')
          .select('handoff_type, status')
          .eq('sd_id', workflowCheck.sd.id)
          .eq('status', 'accepted');

        const completedTypes = new Set((completedHandoffs || []).map(h => h.handoff_type));
        const missingPrereqs = [];

        for (let i = 0; i < handoffIndex; i++) {
          const prereq = requiredHandoffs[i];
          if (!completedTypes.has(prereq)) {
            missingPrereqs.push(prereq);
          }
        }

        if (missingPrereqs.length > 0) {
          console.error('');
          console.error('❌ HANDOFF SEQUENCE VIOLATION (Guardrail V06)');
          console.error('═'.repeat(50));
          console.error(`   Requested: ${requestedHandoff}`);
          console.error(`   SD Type:   ${sdType} (${workflow.name})`);
          console.error('');
          console.error('   Missing prerequisite handoff(s):');
          for (const missing of missingPrereqs) {
            console.error(`     ✗ ${missing} — not yet accepted`);
          }
          console.error('');
          console.error(`   Required sequence for ${sdType}:`);
          for (let i = 0; i < requiredHandoffs.length; i++) {
            const h = requiredHandoffs[i];
            const done = completedTypes.has(h);
            const marker = done ? '✓' : (h === requestedHandoff ? '→' : '✗');
            console.error(`     ${marker} ${i + 1}. ${h}`);
          }
          console.error('');
          console.error('   Complete the missing handoff(s) first:');
          console.error(`   node scripts/handoff.js execute ${missingPrereqs[0]} ${sdId}`);
          console.error('═'.repeat(50));
          return { success: false };
        }
      }
    }
  }

  // Show workflow recommendation before executing
  const workflowInfo = await getSDWorkflow(sdId);
  if (!workflowInfo.error) {
    displayWorkflowRecommendation(workflowInfo, handoffType);

    // Warn if executing optional handoff
    const normalizedType = handoffType.toUpperCase();
    if (workflowInfo.workflow.optional.includes(normalizedType)) {
      console.log('⚠️  NOTE: This handoff is OPTIONAL for this SD type.');
      console.log('   You may skip it and proceed directly to the next required handoff.');
      console.log('');
    }

    // Phase 2 Enhancement: Check multi-repo status before execution
    const multiRepoCheck = checkMultiRepoStatus(workflowInfo.sd);
    if (!multiRepoCheck.passed) {
      displayMultiRepoStatus(multiRepoCheck, handoffType);
    }

    // SD-LEO-ENH-AUTO-PROCEED-001-13: Update status line with AUTO-PROCEED info
    try {
      const autoProceedInfo = await resolveAutoProceed({ supabase: system.supabase, verbose: false });
      const phase = mapHandoffToPhase(handoffType);
      const progress = workflowInfo.sd?.progress ?? 0;

      const statusLine = new LEOStatusLine();
      statusLine.updateForAutoProceed({
        isActive: autoProceedInfo.autoProceed,
        sdKey: workflowInfo.sd?.sd_key || sdId,
        phase,
        progress
      });
    } catch (statusErr) {
      // Non-fatal - status line update should not block handoff
      if (process.env.DEBUG) {
        console.log(`   ℹ️  Status line update skipped: ${statusErr.message}`);
      }
    }
  }

  // Pre-gate blocker detection (SD-MAN-INFRA-VISION-HEAL-PLATFORM-001-02)
  if (!bypassValidation) {
    try {
      const blockerResult = await Promise.race([
        runPreGateBlockerDetection(system.supabase, sdId, workflowInfo?.sd),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), DETECTION_TIMEOUT_MS + 1000))
      ]);

      if (blockerResult?.hasBlockingIssues) {
        console.error('');
        console.error('❌ PRE-GATE BLOCKER DETECTED');
        console.error('═'.repeat(50));
        for (const issue of blockerResult.issues) {
          console.error(`   • ${issue}`);
        }
        console.error('');
        console.error('   Resolve blockers before proceeding.');
        console.error('═'.repeat(50));
        return { success: false };
      }

      if (blockerResult?.warnings?.length > 0) {
        console.log('');
        console.log('⚠️  PRE-GATE BLOCKER WARNINGS:');
        for (const warn of blockerResult.warnings) {
          console.log(`   • ${warn}`);
        }
        console.log('');
      }
    } catch (err) {
      // Non-blocking: detection failure should not prevent handoff
      if (process.env.DEBUG) {
        console.log(`   ℹ️  Blocker detection skipped: ${err.message}`);
      }
    }
  }

  // Execute handoff
  const result = await system.executeHandoff(handoffType, sdId, {
    prdId,
    bypassValidation,
    bypassReason
  });

  // Display results
  await displayExecutionResult(result, handoffType, sdId);

  return { success: result.success, sdId, handoffType, result };
}

/**
 * Handle execute command with AUTO-PROCEED child SD continuation
 *
 * When AUTO-PROCEED is enabled and a child SD completes LEAD-FINAL-APPROVAL,
 * this function automatically picks the next ready child and continues.
 *
 * Part of AUTO-PROCEED continuation implementation (D26, D01)
 */
export async function handleExecuteWithContinuation(handoffType, sdId, args) {
  const system = createHandoffSystem();

  // Resolve AUTO-PROCEED mode
  const autoProceedResult = await resolveAutoProceed({
    supabase: system.supabase,
    verbose: false
  });
  const autoProceedEnabled = autoProceedResult.autoProceed;

  // Execute the initial handoff
  let currentResult = await handleExecuteCommand(handoffType, sdId, args);
  let currentSdId = sdId;
  let currentHandoffType = handoffType;
  let iterationCount = 0;
  const maxIterations = 50; // Safety limit

  // D32: SD Workflow Sequence
  // FIX: 2026-02-06 - ALL handoffs are now terminal. Work happens between handoffs
  // (PRD creation, implementation, verification, etc.) and must NOT be auto-chained.
  //
  // Previous bug: LEAD-TO-PLAN auto-chained to PLAN-TO-EXEC, skipping PRD creation.
  // EXEC-TO-PLAN auto-chained to PLAN-TO-LEAD, skipping verification work.
  //
  // AUTO-PROCEED scope: child-to-child continuation within an orchestrator.
  // Chaining scope: orchestrator-to-orchestrator transitions.
  // Neither auto-chains handoffs within a single SD.
  //
  // SD-type-aware workflow definitions live in workflow-definitions.js.
  // Use getWorkflowForType(sdType) to check required/optional handoffs per type.

  // Continue loop only if AUTO-PROCEED is enabled
  // Child-to-child continuation: after LEAD-FINAL-APPROVAL, find next ready child in orchestrator
  while (autoProceedEnabled && currentResult.success && iterationCount < maxIterations) {
    iterationCount++;

    // All handoffs are terminal — phase work must happen between handoffs.
    // The only auto-continuation is child-to-child after LEAD-FINAL-APPROVAL.
    const normalizedType = currentHandoffType.toUpperCase();

    if (normalizedType !== 'LEAD-FINAL-APPROVAL') {
      // Phase work map: what needs to happen before the next handoff
      const phaseWorkMap = {
        'LEAD-TO-PLAN': 'Create PRD, then run PLAN-TO-EXEC',
        'PLAN-TO-EXEC': 'Implement features, then run EXEC-TO-PLAN',
        'EXEC-TO-PLAN': 'Verify implementation, then run PLAN-TO-LEAD',
        'PLAN-TO-LEAD': 'Final review, then run LEAD-FINAL-APPROVAL',
      };
      const nextWork = phaseWorkMap[normalizedType] || 'Continue with next phase work';
      console.log(`\n✅ AUTO-PROCEED: Handoff ${currentHandoffType} complete`);
      console.log(`   Next: ${nextWork}`);
      break;
    }

    // LEAD-FINAL-APPROVAL - SD is done, find next child

    // Get the completed SD to check if it's a child
    const { data: completedSD, error: sdError } = await system.supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, parent_sd_id, status, sd_type')
      .eq('id', currentSdId)
      .single();

    if (sdError || !completedSD) {
      console.log(`   ⚠️  Could not fetch completed SD: ${sdError?.message || 'Not found'}`);
      break;
    }

    // SD-LEO-ENH-AUTO-PROCEED-001-05: Handle orchestrator chaining for top-level SDs
    if (!completedSD.parent_sd_id) {
      // Check if this was an orchestrator that completed with chaining enabled
      const chainingInfo = currentResult.result?.orchestratorChaining;
      if (chainingInfo?.chainContinue && chainingInfo?.nextOrchestrator) {
        console.log('\n🔗 ORCHESTRATOR CHAINING: Auto-continuing to next orchestrator');
        console.log(`   Next: ${chainingInfo.nextOrchestratorSdKey || chainingInfo.nextOrchestrator}`);
        console.log('   ➡️  Starting LEAD-TO-PLAN...');
        console.log('');

        // Update for next iteration - start the next orchestrator
        currentSdId = chainingInfo.nextOrchestrator;
        currentHandoffType = 'LEAD-TO-PLAN';
        currentResult = await handleExecuteCommand('LEAD-TO-PLAN', chainingInfo.nextOrchestrator, args);
        continue; // Continue the loop for the new orchestrator's children
      }

      console.log('   ℹ️  Top-level SD completed - no continuation needed');
      break;
    }

    // Get orchestrator context for progress display
    const context = await getOrchestratorContext(system.supabase, completedSD.parent_sd_id);
    if (context.parent) {
      console.log(`\n🔗 ORCHESTRATOR PROGRESS: ${context.parent.sd_key || context.parent.id}`);
      console.log(`   ${context.stats.completed}/${context.stats.total} children completed`);
    }

    // === PARALLEL TEAM CHECK (SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001) ===
    const parallelEnabled = process.env.ORCH_PARALLEL_CHILDREN_ENABLED === 'true';
    if (parallelEnabled) {
      try {
        const { planParallelExecution } = await import('../parallel-team-spawner.js');
        const plan = await planParallelExecution(
          system.supabase,
          completedSD.parent_sd_id,
          currentSdId
        );

        if (plan.mode === 'parallel') {
          console.log(`\n🔀 PARALLEL EXECUTION: ${plan.readyCount} independent children detected`);
          console.log(`   Team: ${plan.teamName}`);
          plan.toStart.forEach(child => {
            console.log(`   • ${child.sdKey} (${child.sdType}) → ${child.worktreePath}`);
          });
          console.log(`   Coordinator state: ${plan.coordinatorStatePath}`);

          // Return parallel plan to Claude Code for team execution
          return {
            success: true,
            parallelExecution: {
              teamName: plan.teamName,
              toStart: plan.toStart,
              coordinatorStatePath: plan.coordinatorStatePath,
              totalChildren: plan.totalChildren,
              readyCount: plan.readyCount
            }
          };
        }
        // mode === 'sequential': fall through to existing logic
        if (plan.reason) {
          console.log(`   ℹ️  Parallel check: ${plan.reason} - using sequential path`);
        }
      } catch (parallelErr) {
        console.warn(`   ⚠️  Parallel check failed: ${parallelErr.message} - using sequential path`);
      }
    }
    // === END PARALLEL TEAM CHECK ===

    // Get next ready child (sequential fallback)
    const { sd: nextChild, allComplete, reason } = await getNextReadyChild(
      system.supabase,
      completedSD.parent_sd_id,
      currentSdId
    );

    // If all children complete, orchestrator-completion-hook already fired
    if (allComplete) {
      console.log('\n✅ All children complete - orchestrator completion hook triggered');
      break;
    }

    // If no next child (blocked or other reason)
    if (!nextChild) {
      console.log(`\n⏸️  AUTO-PROCEED paused: ${reason}`);
      break;
    }

    // Found next child - continue with LEAD-TO-PLAN
    console.log('\n🔄 AUTO-PROCEED: Continuing to next child SD');
    console.log(`   Next: ${nextChild.sd_key || nextChild.id}`);
    console.log(`   Title: ${nextChild.title}`);
    console.log(`   Type: ${nextChild.sd_type || 'unknown'}`);
    console.log('   ➡️  Starting LEAD-TO-PLAN...');
    console.log('');

    // Update for next iteration
    currentSdId = nextChild.id;
    currentHandoffType = 'LEAD-TO-PLAN';

    // Execute LEAD-TO-PLAN for next child
    currentResult = await handleExecuteCommand('LEAD-TO-PLAN', nextChild.id, args);

    // Loop continues: LEAD-TO-PLAN for the new child will execute, then break
    // (all handoffs are terminal). Next iteration finds the next child when
    // this child eventually reaches LEAD-FINAL-APPROVAL.
  }

  if (iterationCount >= maxIterations) {
    console.log(`\n⚠️  AUTO-PROCEED: Safety limit reached (${maxIterations} iterations)`);
  }

  return currentResult;
}

/**
 * Handle list command
 */
export async function handleListCommand(sdFilter) {
  const system = createHandoffSystem();
  const executions = await system.listHandoffExecutions({
    sdId: sdFilter,
    limit: 20
  });

  console.log('');
  console.log('📋 Recent Handoff Executions');
  console.log('='.repeat(80));

  if (executions.length === 0) {
    console.log('   No handoff executions found');
  } else {
    console.log('   Type            | SD ID                  | Status   | Score | Date');
    console.log('   ' + '-'.repeat(75));
    executions.forEach(exec => {
      const type = (exec.handoff_type || 'UNKNOWN').padEnd(15);
      const sdId = (exec.sd_id || 'N/A').padEnd(22);
      const status = (exec.status || 'N/A').padEnd(8);
      const score = ((exec.validation_score || 0) + '%').padEnd(5);
      const date = exec.initiated_at ? new Date(exec.initiated_at).toLocaleDateString() : 'N/A';
      console.log(`   ${type} | ${sdId} | ${status} | ${score} | ${date}`);
    });
  }

  console.log('');
  return { success: true };
}

/**
 * Handle stats command
 */
export async function handleStatsCommand() {
  const system = createHandoffSystem();
  const stats = await system.getHandoffStats();

  console.log('');
  console.log('📊 Handoff System Statistics');
  console.log('='.repeat(50));

  if (!stats || stats.total === 0) {
    console.log('   No handoff data available');
  } else {
    console.log(`   Total Executions: ${stats.total}`);
    console.log(`   Successful: ${stats.successful} (${Math.round((stats.successful / stats.total) * 100)}%)`);
    console.log(`   Failed: ${stats.failed} (${Math.round((stats.failed / stats.total) * 100)}%)`);
    console.log(`   Average Score: ${Math.round(stats.averageScore)}%`);
    console.log('');
    console.log('   By Type:');
    Object.entries(stats.byType).forEach(([type, typeStats]) => {
      const rate = typeStats.total > 0 ? Math.round((typeStats.successful / typeStats.total) * 100) : 0;
      console.log(`     ${type}: ${typeStats.successful}/${typeStats.total} (${rate}%, avg ${Math.round(typeStats.averageScore || 0)}%)`);
    });
  }

  console.log('');
  return { success: true };
}

/**
 * Pre-gate blocker detection: checks for stale claims, incomplete dependencies,
 * and other blockers before gate validation runs.
 * Returns { hasBlockingIssues, issues[], warnings[] }
 */
async function runPreGateBlockerDetection(supabase, sdId, sd) {
  const result = { hasBlockingIssues: false, issues: [], warnings: [] };

  // 1. Detect blockers from blocker-resolution.js
  if (sd) {
    const blockers = await detectBlockers(sd, supabase);
    if (blockers && blockers.length > 0) {
      for (const blocker of blockers) {
        if (blocker.severity === 'blocking') {
          result.hasBlockingIssues = true;
          result.issues.push(`Blocker: ${blocker.description || blocker.type}`);
        } else {
          result.warnings.push(`${blocker.type}: ${blocker.description || 'detected'}`);
        }
      }
    }
  }

  // 2. Check for stale claims on dependency SDs
  if (sd?.dependencies && Array.isArray(sd.dependencies) && sd.dependencies.length > 0) {
    const { data: depSDs } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, claiming_session_id')
      .in('id', sd.dependencies);

    for (const dep of (depSDs || [])) {
      if (dep.status !== 'completed' && dep.status !== 'cancelled') {
        result.hasBlockingIssues = true;
        result.issues.push(`Dependency not complete: ${dep.sd_key} (${dep.status})`);
      }

      // Check for stale claims on deps and auto-release if dead
      if (dep.claiming_session_id) {
        const { data: claimSession } = await supabase
          .from('v_active_sessions')
          .select('session_id, heartbeat_age_seconds, pid, hostname, terminal_id')
          .eq('session_id', dep.claiming_session_id)
          .single();

        if (claimSession) {
          const analysis = analyzeClaimRelationship({
            claimingSessionId: dep.claiming_session_id,
            claimingSession: claimSession,
            currentSession: { terminal_id: process.env.CLAUDE_TERMINAL_ID || null }
          });

          if (analysis.canAutoRelease) {
            const released = await autoReleaseStaleDeadClaim(supabase, dep.claiming_session_id);
            if (released) {
              result.warnings.push(`Auto-released stale claim on ${dep.sd_key} (PID ${analysis.pid} dead)`);
            }
          }
        }
      }
    }
  }

  return result;
}

/**
 * Main CLI entry point
 */
export async function main() {
  // Install Unicode sanitizer to prevent invalid surrogates from corrupting Claude Code's context
  installOutputSanitizer();

  const args = process.argv.slice(2);
  const command = args[0];

  let result = { success: true };

  switch (command) {
    case 'workflow':
      result = await handleWorkflowCommand(args[1]);
      break;

    case 'verify':
      result = await handleVerifyCommand(args[1]);
      break;

    case 'pending':
      result = await handlePendingCommand();
      break;

    case 'precheck':
      result = await handlePrecheckCommand(args[1], args[2]);
      break;

    case 'execute':
      // Use continuation wrapper for AUTO-PROCEED child SD continuation
      result = await handleExecuteWithContinuation(args[1], args[2], args);
      break;

    case 'list':
      result = await handleListCommand(args[1]);
      break;

    case 'stats':
      result = await handleStatsCommand();
      break;

    // LEO 5.0 Commands
    case 'walls':
      result = await handleWallsCommand(args[1]);
      break;

    case 'retry-gate':
      result = await handleRetryGateCommand(args[1], args[2]);
      break;

    case 'kickback':
      result = await handleKickbackCommand(args[1], args);
      break;

    case 'invalidate':
      result = await handleInvalidateCommand(args[1], args[2], args);
      break;

    case 'resume':
      result = await handleResumeCommand(args[1], args);
      break;

    case 'failures':
      result = await handleFailuresCommand(args[1]);
      break;

    case 'subagents':
      result = await handleSubagentsCommand(args[1], args[2]);
      break;

    case 'introspect':
      // CLI introspection: JSON gate status query (SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-05-D)
      result = await introspectGateStatus(args[1], { json: !args.includes('--text') });
      break;

    case 'help':
    default:
      displayHelp();
      break;
  }

  // RCA Auto-Trigger: Capture failures for continuous improvement (SD-LEO-ENH-ENHANCE-RCA-SUB-001)
  if (!result.success && command === 'execute') {
    try {
      const { triggerRCAOnFailure, buildHandoffContext } = await import('../../../../lib/rca/index.js');
      const handoffType = args[1];
      const sdId = args[2];
      await triggerRCAOnFailure(buildHandoffContext({
        command: `handoff.js ${command}`,
        args: args.join(' '),
        exitCode: 1,
        sdId,
        handoffType,
        stderr: result.message || result.reasonCode || 'Unknown failure'
      }));
    } catch {
      // RCA trigger should never prevent exit
    }
  }

  process.exit(result.success ? 0 : 1);
}
