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

  // Auto-detect git info
  const gitInfo = autoDetectGitInfo(testDir, options);
  let { commitSha, branchName, actualLoc } = gitInfo;

  // Manual input if not provided
  if (!actualLoc) {
    const locStr = await prompt('Actual lines of code changed: ');
    actualLoc = parseInt(locStr);
  }

  // LOC validation (hard cap at 50)
  const locValid = await validateLOC(actualLoc, qfId, supabase, prompt);
  if (!locValid) {
    process.exit(1);
  }

  // Test verification - PROGRAMMATIC (not self-reported)
  console.log('\n🧪 PROGRAMMATIC TEST VERIFICATION\n');
  console.log('   Running tests to verify fix quality (not self-reported)...\n');

  let unitTestResult = null;
  let e2eTestResult = null;
  let testsPass;

  // Allow skipping if explicitly passed and --skip-tests flag
  if (options.testsPass !== undefined && options.skipTestRun) {
    console.log('   ⚠️  Using cached test results (--skip-tests flag)\n');
    testsPass = options.testsPass;
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

  // Validate tests
  if (!validateTests(unitTestResult, e2eTestResult, testsPass)) {
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
  const selfVerificationValid = await validateSelfVerification(verificationResults, prompt);
  if (!selfVerificationValid) {
    process.exit(1);
  }

  // Evidence Capture - Console Errors After Fix
  const evidenceData = await captureEvidenceData(qfId, qf);

  // Compliance Rubric with Auto-Refinement
  const complianceContext = {
    errorsBeforeFix: evidenceData.errorsBeforeFix,
    errorsAfterFix: evidenceData.errorsAfterFix,
    actualLoc,
    filesChanged,
    testsPass
  };

  const { complianceResults } = await runComplianceWithRefinement(qfId, qf, complianceContext, prompt);
  const complianceValid = await validateCompliance(complianceResults, prompt);
  if (!complianceValid) {
    process.exit(1);
  }

  // Commit & Push
  commitSha = await commitAndPushChanges(testDir, qf, { commitSha, branchName }, actualLoc, filesChanged, finalPrUrl, testsPass, prompt);

  // Update record
  console.log('🔄 Updating quick-fix record...\n');

  const { error: updateError } = await supabase
    .from('quick_fixes')
    .update({
      status: 'completed',
      actual_loc: actualLoc,
      commit_sha: commitSha,
      branch_name: branchName,
      pr_url: finalPrUrl,
      tests_passing: testsPass,
      uat_verified: uatVerified,
      verified_by: 'UAT_AGENT',
      verification_notes: verificationNotes || null,
      files_changed: filesChanged.length > 0 ? filesChanged : null,
      completed_at: new Date().toISOString()
    })
    .eq('id', qfId);

  if (updateError) {
    console.log('❌ Failed to update quick-fix:', updateError.message);
    process.exit(1);
  }

  displayCompletionSummary(qf, actualLoc, commitSha, branchName, finalPrUrl, filesChanged);

  // Merge to Main
  await mergeToMain(testDir, qf, finalPrUrl, prompt);

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
