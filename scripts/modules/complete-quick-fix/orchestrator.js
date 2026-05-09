/**
 * Quick-Fix Completion Orchestrator
 * Part of quick-fix modularization
 *
 * Main orchestration logic for completing quick-fixes.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { restartLeoStack } from '../../../lib/server-manager.js';
import { runSelfVerification } from '../../../lib/quickfix-self-verifier.js';
import {
  captureConsoleErrorsAfterFix,
  generateEvidenceSummary
} from '../../../lib/utils/quickfix-evidence-capture.js';
import fs from 'fs';

import { REPO_PATHS, EHG_ROOT } from './constants.js';
import { runTests, runTypeScriptCheck, displayTestResults } from './test-runner.js';
import { autoDetectGitInfo, analyzeGitDiff, commitAndPushChanges, mergeToMain } from './git-operations.js';
import {
  validateLOC,
  validateTests,
  validateTypeScript,
  validateUAT,
  validatePR,
  verifyTestCoverage,
  validateSelfVerification,
  validateCompliance
} from './verification.js';
import { runComplianceWithRefinement } from './compliance-loop.js';
import { prompt, displayCompletionSummary } from './cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

/**
 * Main orchestration function for completing quick-fixes
 * @param {string} qfId - Quick-fix ID
 * @param {object} options - Completion options
 * @returns {Promise<object>} Completed quick-fix record
 */
export async function completeQuickFix(qfId, options = {}) {
  console.log(`\n✅ Completing Quick-Fix: ${qfId}\n`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch quick-fix record
  const { data: qf, error } = await supabase
    .from('quick_fixes')
    .select('*')
    .eq('id', qfId)
    .single();

  if (error || !qf) {
    console.log(`❌ Quick-fix not found: ${qfId}`);
    process.exit(1);
  }

  // Determine test directory from target_application
  const targetApplication = qf.target_application || 'EHG';
  const testDir = REPO_PATHS[targetApplication] || EHG_ROOT;

  console.log(`📋 Quick-Fix: ${qf.title}`);
  console.log(`   Type: ${qf.type}`);
  console.log(`   Target App: ${targetApplication}`);
  console.log(`   Test Dir: ${testDir}`);
  console.log(`   Status: ${qf.status}\n`);

  // Already completed?
  if (qf.status === 'completed') {
    console.log(`✅ Already completed at ${new Date(qf.completed_at).toLocaleString()}`);
    return qf;
  }

  // Escalated?
  if (qf.status === 'escalated') {
    console.log('⚠️  This issue was escalated to a full SD');
    console.log(`   Reason: ${qf.escalation_reason}`);
    return qf;
  }

  // Auto-detect git info. autoDetectGitInfo NOW throws on PR-metadata failure
  // and on refuse-to-auto-detect-outside-QF-worktree (SD-LEO-FIX-COMPLETE-QUICK-FIX-001).
  // Surface the operator-readable message without the Node stack trace.
  let gitInfo;
  try {
    gitInfo = autoDetectGitInfo(testDir, options);
  } catch (e) {
    console.error(`\n❌ ${e.message}\n`);
    process.exit(1);
  }
  let { commitSha, branchName, actualLoc, actualSourceLoc, actualTestLoc, sourceDeletionLoc } = gitInfo;

  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
  //   - Operator can override source/test split via --actual-source-loc / --actual-test-loc
  //   - Backward-compat: --actual-loc still accepted (treated as source; test=0)
  if (options.actualSourceLoc !== undefined) actualSourceLoc = options.actualSourceLoc;
  if (options.actualTestLoc !== undefined) actualTestLoc = options.actualTestLoc;
  if (actualSourceLoc === undefined && actualTestLoc === undefined && actualLoc !== undefined) {
    actualSourceLoc = actualLoc;
    actualTestLoc = 0;
  }

  // Manual input if not provided
  if (actualLoc === undefined && actualSourceLoc === undefined) {
    const locStr = await prompt('Actual lines of code changed: ');
    actualLoc = parseInt(locStr);
    actualSourceLoc = actualLoc;
    actualTestLoc = 0;
  }

  // Compute totals for legacy single-column write + cap policy
  if (actualSourceLoc === undefined) actualSourceLoc = 0;
  if (actualTestLoc === undefined) actualTestLoc = 0;
  if (actualLoc === undefined) actualLoc = actualSourceLoc + actualTestLoc;

  // LOC validation — source-only cap; --force-complete bypasses
  const locValid = await validateLOC(actualSourceLoc, actualTestLoc, qfId, supabase, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason
  });
  if (!locValid) {
    process.exit(1);
  }

  // Test verification - PROGRAMMATIC (not self-reported)
  console.log('\n🧪 PROGRAMMATIC TEST VERIFICATION\n');
  console.log('   Running tests to verify fix quality (not self-reported)...\n');

  let unitTestResult = null;
  let e2eTestResult = null;
  let testsPass;

  // --skip-tests alone means "trust CI / cached results". Default testsPass=true unless
  // the caller explicitly says otherwise via --tests-pass no. This matches the sibling
  // pattern at test-runner.js:108-113 (--skip-typecheck works standalone).
  if (options.skipTestRun) {
    testsPass = options.testsPass !== undefined ? options.testsPass : true;
    console.log(`   ⚠️  Skipping test run (--skip-tests); testsPass=${testsPass}\n`);
  } else {
    // Run unit tests in target application directory
    console.log('━━━ Unit Tests ━━━\n');
    unitTestResult = runTests('unit', { testDir });

    console.log('\n━━━ E2E Smoke Tests ━━━\n');
    e2eTestResult = runTests('e2e', { testDir });

    displayTestResults(unitTestResult, e2eTestResult);

    // Determine overall pass/fail
    testsPass = unitTestResult.passed && e2eTestResult.passed;
    console.log();
  }

  // Validate tests (QF-20260509-552: forward {forceComplete,reason} flags)
  if (!validateTests(unitTestResult, e2eTestResult, testsPass, { forceComplete: options.forceComplete, reason: options.reason })) {
    process.exit(1);
  }

  // TypeScript verification - PROGRAMMATIC
  const tscResult = runTypeScriptCheck(testDir, options.skipTypeCheck);
  if (!validateTypeScript(tscResult)) {
    process.exit(1);
  }

  // UAT verification
  let uatVerified;
  if (options.uatVerified === undefined) {
    const uatInput = await prompt('UAT verified (manually tested fix works)? (yes/no): ');
    uatVerified = uatInput.toLowerCase().startsWith('y');
  } else {
    uatVerified = options.uatVerified;
  }

  if (!validateUAT(uatVerified)) {
    process.exit(1);
  }

  // PR verification
  let prUrl;
  if (!options.prUrl) {
    const prInput = await prompt('\nGitHub PR URL (required): ');
    prUrl = prInput.trim();
  } else {
    prUrl = options.prUrl;
  }

  if (!validatePR(prUrl, qfId, qf.title)) {
    process.exit(1);
  }

  // Optional: Verification notes
  let verificationNotes = options.verificationNotes;
  if (!verificationNotes) {
    verificationNotes = await prompt('\nVerification notes (optional): ');
  }

  // Git Diff Auto-Analysis
  const { filesChanged, diffAnalysis } = analyzeGitDiff(testDir, qf.description);

  // Test Coverage Verification
  const testCoverage = verifyTestCoverage(filesChanged);

  // LEO Stack Restart
  console.log('🔄 LEO Stack Restart\n');
  const restartResult = await restartLeoStack({ verbose: true });
  if (!restartResult.success) {
    console.log(`   ⚠️  LEO stack restart failed: ${restartResult.message}`);
    console.log('   You may need to restart manually: bash scripts/leo-stack.sh restart\n');
  }

  // Automatic PR Creation (if enabled and no PR provided)
  let finalPrUrl = prUrl;
  if (options.autoPr && !prUrl) {
    finalPrUrl = await createAutoPR(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes);
  }

  // Self-Verification (Combat Overconfidence)
  const verificationContext = {
    actualLoc,
    filesChanged,
    testsPass,
    uatVerified,
    testsVerifiedRecently: true,
    diffAnalysis,
    testCoverage
  };

  const verificationResults = await runSelfVerification(qfId, verificationContext);
  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2: --force-complete bypasses self-verification prompts
  const selfVerificationValid = await validateSelfVerification(verificationResults, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason
  });
  if (!selfVerificationValid) {
    process.exit(1);
  }

  // Evidence Capture - Console Errors After Fix
  const evidenceData = await captureEvidenceData(qfId, qf);

  // Compliance Rubric with Auto-Refinement
  // QF-20260509-070: include source/test split so rubric uses source-only LOC.
  // QF-20260509-407: forward sourceDeletionLoc so the rubric can subtract pure
  // dead-code deletion from tier classification (loc_constraint + proper_classification).
  const complianceContext = {
    errorsBeforeFix: evidenceData.errorsBeforeFix,
    errorsAfterFix: evidenceData.errorsAfterFix,
    actualLoc,
    actualSourceLoc,
    actualTestLoc,
    sourceDeletionLoc,
    filesChanged,
    testsPass
  };

  // QF-20260509-COMPLIANCE-LOOP (closes 0974d18b): forward {forceComplete,reason}
  // so the refinement-prompt at compliance-loop.js:77 auto-skips under
  // --force-complete instead of wedging on stdin (9th-witness writer/consumer
  // asymmetry; sibling miss in QF-20260509-552).
  const { complianceResults } = await runComplianceWithRefinement(qfId, qf, complianceContext, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason
  });
  // QF-20260508-407: forward {forceComplete, reason} so validateCompliance can
  // short-circuit the WARN-verdict prompt under --non-interactive (sibling parity
  // with validateLOC and validateSelfVerification).
  const complianceValid = await validateCompliance(complianceResults, prompt, {
    forceComplete: options.forceComplete,
    reason: options.reason
  });
  if (!complianceValid) {
    process.exit(1);
  }

  // Commit & Push (QF-20260509-552: forward {forceComplete,reason} flags)
  commitSha = await commitAndPushChanges(testDir, qf, { commitSha, branchName }, actualLoc, filesChanged, finalPrUrl, testsPass, prompt, { forceComplete: options.forceComplete, reason: options.reason });

  // Update record
  console.log('🔄 Updating quick-fix record...\n');

  // SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
  //   - Write actual_source_loc + actual_test_loc (split fields; FR-1)
  //   - Write force_completed flag (FR-6 ALTERed CHECK accepts this without test/UAT)
  //   - --force-complete writes structured JSON audit trail to verification_notes (FR-2 / TR-3)
  let finalVerificationNotes = verificationNotes || null;
  if (options.forceComplete) {
    finalVerificationNotes = JSON.stringify({
      force_completed: true,
      reason: options.reason,
      operator: process.env.CLAUDE_SESSION_ID || 'unknown',
      timestamp: new Date().toISOString(),
      operator_supplied_notes: verificationNotes || null
    });
  }

  const { error: updateError } = await supabase
    .from('quick_fixes')
    .update({
      status: 'completed',
      actual_loc: actualLoc,
      actual_source_loc: actualSourceLoc,
      actual_test_loc: actualTestLoc,
      force_completed: Boolean(options.forceComplete),
      commit_sha: commitSha,
      branch_name: branchName,
      pr_url: finalPrUrl,
      tests_passing: testsPass,
      uat_verified: uatVerified,
      verified_by: options.forceComplete ? 'FORCE_COMPLETE' : 'UAT_AGENT',
      verification_notes: finalVerificationNotes,
      files_changed: filesChanged.length > 0 ? filesChanged : null,
      completed_at: new Date().toISOString()
    })
    .eq('id', qfId);

  if (updateError) {
    console.log('❌ Failed to update quick-fix:', updateError.message);
    process.exit(1);
  }

  // Release QF claim after successful completion
  try {
    const { default: sessionManager } = await import('../../../lib/session-manager.mjs');
    const session = await sessionManager.getOrCreateSession();
    if (session?.session_id) {
      await supabase.rpc('release_sd', {
        p_session_id: session.session_id,
        p_reason: 'qf_completed'
      });
    }
  } catch {
    // Non-fatal — claim release is best-effort
  }

  displayCompletionSummary(qf, actualLoc, commitSha, branchName, finalPrUrl, filesChanged);

  // Merge to Main (QF-20260509-552: forward {forceComplete,reason} flags)
  await mergeToMain(testDir, qf, finalPrUrl, prompt, { forceComplete: options.forceComplete, reason: options.reason });

  console.log('📍 Quick-Fix Complete!\n');

  return qf;
}

/**
 * Sanitize string for safe shell argument usage
 * SD-SEC-DATA-VALIDATION-001: Escape shell metacharacters
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeForShell(str) {
  if (!str || typeof str !== 'string') return '';
  // Replace shell metacharacters with escaped versions
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$')
    .replace(/!/g, '\\!')
    .replace(/\n/g, ' ');
}

/**
 * Validate quick-fix ID format
 * SD-SEC-DATA-VALIDATION-001: Input validation
 * @param {string} qfId - Quick-fix ID
 * @returns {string} Validated ID
 * @throws {Error} If invalid
 */
function validateQfId(qfId) {
  if (!qfId || typeof qfId !== 'string') {
    throw new Error('Quick-fix ID is required');
  }
  const sanitized = qfId.trim();
  // QF IDs: QF-YYYYMMDD-NNN or alphanumeric with dashes
  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized) || sanitized.length > 50) {
    throw new Error(`Invalid quick-fix ID: ${qfId}`);
  }
  return sanitized;
}

/**
 * Create automatic PR if configured
 */
async function createAutoPR(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes) {
  console.log('📝 Automatic PR Creation\n');

  try {
    const { execSync } = await import('child_process');

    // SD-SEC-DATA-VALIDATION-001: Validate qfId
    const validatedQfId = validateQfId(qfId);

    // Check if gh CLI is installed
    execSync('which gh', { stdio: 'pipe' });

    // Generate PR title and body - sanitize for shell usage
    const prTitle = sanitizeForShell(`fix(${validatedQfId}): ${qf.title || 'Quick fix'}`);
    const prBody = sanitizeForShell(generatePRBody(validatedQfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes));

    console.log(`   Creating PR: fix(${validatedQfId}): ${qf.title}\n`);

    // SD-SEC-DATA-VALIDATION-001: Use sanitized inputs
    const prOutput = execSync(`gh pr create --title "${prTitle}" --body "${prBody}"`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });

    // Extract PR URL from output
    const urlMatch = prOutput.match(/https:\/\/github\.com\/[^\s]+/);
    if (urlMatch) {
      console.log(`   ✅ PR Created: ${urlMatch[0]}\n`);
      return urlMatch[0];
    }
  } catch (err) {
    console.log(`   ⚠️  Auto-PR creation failed: ${err.message}`);
    console.log('   Please create PR manually: gh pr create\n');
  }

  return null;
}

/**
 * Generate PR body content
 */
function generatePRBody(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, verificationNotes) {
  return `## Quick-Fix: ${qfId}

**Type:** ${qf.type}
**Severity:** ${qf.severity}

### Issue Description
${qf.description}

${qf.steps_to_reproduce ? `### Steps to Reproduce
${qf.steps_to_reproduce}
` : ''}
${qf.expected_behavior ? `### Expected Behavior
${qf.expected_behavior}
` : ''}
${qf.actual_behavior ? `### Actual Behavior
${qf.actual_behavior}
` : ''}
### Changes
- **Files Changed:** ${filesChanged.length}
${filesChanged.map(f => `  - ${f}`).join('\n')}
- **LOC:** ${actualLoc} lines
- **Tests:** ${testsPass ? '✅ Passing' : '❌ Failed'}
- **UAT:** ${uatVerified ? '✅ Verified' : '❌ Not verified'}

### Verification
${verificationNotes || 'No additional notes'}

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
Quick-Fix Workflow - LEO Protocol`;
}

/**
 * Capture evidence data for compliance check
 */
async function captureEvidenceData(qfId, qf) {
  console.log('\n📸 Evidence Capture - Console Errors\n');

  const evidenceSummary = generateEvidenceSummary(qfId);
  let errorsBeforeFix = [];
  let errorsAfterFix = [];

  if (evidenceSummary.hasBaseline) {
    console.log('   ✅ Found baseline evidence from quick-fix creation');
    try {
      const baselinePath = `${evidenceSummary.evidenceDir}/console-baseline.json`;
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
      errorsBeforeFix = baseline.errors || [];
    } catch (err) {
      console.log(`   ⚠️  Could not load baseline: ${err.message}`);
    }
  }

  // Capture current console state (after fix)
  const afterCaptureResult = await captureConsoleErrorsAfterFix(qfId, 'http://localhost:5173', {
    currentErrors: errorsAfterFix,
    consoleError: qf.actual_behavior
  });

  if (afterCaptureResult.comparison) {
    console.log('\n   📊 Console Error Comparison:');
    console.log(`      Original Error Resolved: ${afterCaptureResult.comparison.originalErrorResolved ? '✅ YES' : '❌ NO'}`);
  }

  return {
    errorsBeforeFix,
    errorsAfterFix: afterCaptureResult.errors || []
  };
}
