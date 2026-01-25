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
 * Install Unicode sanitization on console output.
 * This prevents invalid surrogates from corrupting Claude Code's API calls.
 */
function installOutputSanitizer() {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  const sanitizeArgs = (args) => args.map(arg => {
    if (typeof arg === 'string') return sanitizeUnicode(arg);
    if (typeof arg === 'object' && arg !== null) {
      try {
        // Sanitize JSON stringified objects
        return JSON.parse(sanitizeUnicode(JSON.stringify(arg)));
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
  }

  // Execute handoff
  const result = await system.executeHandoff(handoffType, sdId, {
    prdId,
    bypassValidation,
    bypassReason
  });

  // Display results
  await displayExecutionResult(result, handoffType, sdId);

  return { success: result.success };
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
      result = await handleExecuteCommand(args[1], args[2], args);
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

    case 'help':
    default:
      displayHelp();
      break;
  }

  process.exit(result.success ? 0 : 1);
}
