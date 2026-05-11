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
import { autoDetectGitInfo, analyzeGitDiff, commitAndPushChanges, mergeToMain, resolveQFWorktreeFromCwd } from './git-operations.js';
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
import { resolveFeedback, parseAndExpandFeedbackFooters } from '../../../lib/governance/resolve-feedback.js';
import { checkResolverFreshness, logResolverFreshnessBanner } from '../../../lib/governance/check-resolver-freshness.js';
import { execSync } from 'child_process';

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
  // Service-role required: resolveLinkedFeedbackRows performs cross-row SELECT/UPDATE
  // on feedback rows whose table policy blocks anon-tier access. Empirically validated
  // in PR #3697 — anon-tier client returns zero matches for rows service-role sees.
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase credentials in .env file');
    console.log('   Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // QF-20260511-258: Stale-branch guard for the post-merge feedback auto-resolver.
  // If origin/main has commits touching resolver paths that the worker's HEAD
  // doesn't yet have, refuse to proceed unless --allow-stale-branch is set.
  // Closes the QF-205 recurrence class (worker forked before resolver fixes merged).
  const freshness = checkResolverFreshness(process.cwd());
  if (freshness.stale) {
    const bypass = { allowed: !!options.allowStaleBranch, reason: options.allowStaleBranchReason };
    logResolverFreshnessBanner(freshness, bypass);
    if (!bypass.allowed) {
      process.exit(1);
    }
  }

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
  let testDir = REPO_PATHS[targetApplication] || EHG_ROOT;

  const cwdWorktree = resolveQFWorktreeFromCwd(qfId);
  if (cwdWorktree && cwdWorktree !== testDir) {
    console.log(`📂 Auto-detected QF worktree CWD; overriding Test Dir from ${testDir} → ${cwdWorktree}`);
    testDir = cwdWorktree;
  }

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

  // QF-20260509-779 (closes bd600229; completes QF-20260509-407 Bug C):
  // analyzeGitDiff runs BEFORE the PR-acquisition block so createAutoPR has
  // filesChanged available, and so the autoPr branch can fire BEFORE the
  // PR-URL prompt. Without this hoist, the prompt at line 195 ran first and
  // rejected under --non-interactive (correct fail-fast) but left the autoPr
  // branch unreachable. 13th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
  const { filesChanged, diffAnalysis } = analyzeGitDiff(testDir, qf.description);

  // Test Coverage Verification (uses filesChanged from above)
  const testCoverage = verifyTestCoverage(filesChanged);

  // PR verification
  let prUrl = options.prUrl;

  // QF-20260509-779: if --auto-pr is set and no --pr-url provided, create the
  // PR FIRST so the subsequent prompt doesn't fire under --non-interactive.
  if (!prUrl && options.autoPr) {
    console.log('🤖 --auto-pr: creating PR via gh before PR-URL prompt');
    const created = await createAutoPR(qfId, qf, filesChanged, actualLoc, testsPass, uatVerified, options.verificationNotes);
    if (created) prUrl = created;
  }

  if (!prUrl) {
    const prInput = await prompt('\nGitHub PR URL (required): ');
    prUrl = prInput.trim();
  }

  if (!validatePR(prUrl, qfId, qf.title)) {
    process.exit(1);
  }

  // Optional: Verification notes (after PR so autoPr-created PR body uses
  // options.verificationNotes if provided; the prompt below only runs without
  // --non-interactive when no notes were supplied).
  let verificationNotes = options.verificationNotes;
  if (!verificationNotes) {
    verificationNotes = await prompt('\nVerification notes (optional): ');
  }

  // LEO Stack Restart
  console.log('🔄 LEO Stack Restart\n');
  const restartResult = await restartLeoStack({ verbose: true });
  if (!restartResult.success) {
    console.log(`   ⚠️  LEO stack restart failed: ${restartResult.message}`);
    console.log('   You may need to restart manually: bash scripts/leo-stack.sh restart\n');
  }

  // QF-20260509-779: --auto-pr is now handled in the PR-acquisition block above.
  // The prior duplicate block here would have been unreachable post-hoist.
  let finalPrUrl = prUrl;

  // Self-Verification (Combat Overconfidence)
  // QF-20260511-056: forward source/test split so verifyLOCConstraint can apply
  // the cap to source-only LOC (matches compliance-rubric context below).
  const verificationContext = {
    actualLoc,
    actualSourceLoc,
    actualTestLoc,
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

  // SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1: post-merge feedback auto-resolve.
  // Parse "Closes (feedback|harness backlog) <uuid>" footers from PR body and
  // commit messages. Idempotent + fail-soft — DB errors warn but never fail QF
  // completion. Env opt-out: RESOLVE_FEEDBACK_ON_QF_COMPLETE=0.
  if (process.env.RESOLVE_FEEDBACK_ON_QF_COMPLETE !== '0') {
    try {
      await resolveLinkedFeedbackRows(supabase, qf, qfId, finalPrUrl, commitSha, testDir);
    } catch (err) {
      console.log(`   ⚠️  Feedback auto-resolve skipped: ${err?.message || err}\n`);
    }
  }

  console.log('📍 Quick-Fix Complete!\n');

  return qf;
}

/**
 * SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001 FR-1: post-merge auto-resolve.
 *
 * Collects text from (a) PR body via `gh pr view --json body,commits` and
 * (b) the local commit message via `git log -1 --format=%B <sha>`, runs
 * parseAndExpandFeedbackFooters (which also expands 8-char short IDs via DB
 * lookup, QF-20260511-556), and calls resolveFeedback per UUID. All steps are
 * defensive — any failure logs a warning and continues without blocking QF
 * completion (post-merge is informational, not gating).
 *
 * @param {Object} supabase
 * @param {Object} qf  Quick-fix DB row
 * @param {string} qfId
 * @param {string} prUrl
 * @param {string} commitSha
 * @param {string} testDir
 */
async function resolveLinkedFeedbackRows(supabase, qf, qfId, prUrl, commitSha, testDir) {
  const corpus = [];

  // Source 1: PR body + commit messages via gh pr view
  if (prUrl) {
    const prNumber = prUrl.match(/\/pull\/(\d+)/)?.[1];
    if (prNumber && /^\d+$/.test(prNumber)) {
      try {
        const out = execSync(`gh pr view ${prNumber} --json body,commits`, {
          cwd: testDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10000,
        });
        const parsed = JSON.parse(out);
        if (parsed?.body) corpus.push(parsed.body);
        if (Array.isArray(parsed?.commits)) {
          for (const c of parsed.commits) {
            if (c?.messageHeadline) corpus.push(c.messageHeadline);
            if (c?.messageBody) corpus.push(c.messageBody);
          }
        }
      } catch (e) {
        console.log(`   ℹ️  gh pr view fallback (will try local commit): ${e.message}`);
      }
    }
  }

  // Source 2: local commit message (works even when PR is unavailable)
  if (commitSha && /^[a-f0-9]{7,40}$/i.test(commitSha)) {
    try {
      const msg = execSync(`git log -1 --format=%B ${commitSha}`, {
        cwd: testDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
      });
      if (msg) corpus.push(msg);
    } catch {
      /* commit may already be deleted post-merge — non-fatal */
    }
  }

  // Source 3: QF description (may carry the link from issue creation)
  if (qf?.description) corpus.push(qf.description);

  const { uuids, warnings } = await parseAndExpandFeedbackFooters({
    text: corpus.join('\n'),
    supabase,
  });
  for (const w of warnings) {
    console.log(`   ⚠️  ${w}`);
  }
  if (uuids.length === 0) {
    return;
  }

  console.log(`   🔗 Auto-resolving ${uuids.length} linked feedback row(s)...`);
  const prNumberDisplay = prUrl?.match(/\/pull\/(\d+)/)?.[1];
  for (const uuid of uuids) {
    const notes = prNumberDisplay
      ? `Shipped via QF-${qfId} PR #${prNumberDisplay}`
      : `Shipped via QF-${qfId}`;
    const result = await resolveFeedback({
      supabase,
      feedbackId: uuid,
      quickFixId: qfId,
      notes,
    });
    if (result.updated) {
      console.log(`   ✅ feedback ${uuid} → resolved (notes: ${notes})`);
    } else if (result.reason === 'no_row_or_already_resolved') {
      console.log(`   ℹ️  feedback ${uuid} → already resolved or missing (idempotent skip)`);
    } else {
      console.log(`   ⚠️  feedback ${uuid} → resolve failed: ${result.error || 'unknown'}`);
    }
  }
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
