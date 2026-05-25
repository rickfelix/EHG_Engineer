/**
 * Verification Utilities for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import path from 'path';
import { execSync } from 'child_process';

/**
 * Hard cap on QF size. Aligned with CLAUDE.md routing: Tier 1 ≤30,
 * Tier 2 31–75 (Standard QF), Tier 3 >75 (full SD). QF-20260504-501.
 */
export const QF_HARD_LOC_CAP = 75;

/**
 * Validate source-LOC constraint against the QF hard cap (CLAUDE.md routing).
 *
 * SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001:
 *   - Cap now applies to source-only LOC (test LOC excluded; FR-1)
 *   - --force-complete (forceComplete=true) bypasses the cap entirely (FR-2)
 *   - Escalation UPDATE only writes actual_source_loc/actual_test_loc when within
 *     the loosened CHECK; falls back to logging the rejected values (FR-5)
 *
 * @param {number} sourceLoc - Source-only lines of code (the policy-relevant value)
 * @param {number} testLoc - Test-only LOC (recorded but not capped)
 * @param {string} qfId - Quick-fix ID
 * @param {object} supabase - Supabase client
 * @param {Function} prompt - Prompt function for user input
 * @param {object} flags - { forceComplete?: bool, reason?: string, nonInteractive?: bool }
 * @returns {Promise<boolean>} True if validation passed, false if should exit
 */
export async function validateLOC(sourceLoc, testLoc, qfId, supabase, prompt, flags = {}) {
  // FR-2: --force-complete bypasses the cap entirely (audit trail in verification_notes JSON)
  if (flags.forceComplete) {
    console.log(`\n⚠️  --force-complete: source-LOC cap bypassed (source=${sourceLoc}, test=${testLoc}, reason="${flags.reason}")`);
    return true;
  }

  // SD-FDBK-ENH-SOURCE-LOC-CAP-001: --over-cap-reason bypasses ONLY the source-LOC cap
  // (audit trail in verification_notes). Unlike --force-complete it does NOT touch the
  // failing-tests, compliance, or self-verification (scope-creep) gates.
  if (flags.overCapReason && sourceLoc > QF_HARD_LOC_CAP) {
    console.log(`\n⚠️  --over-cap-reason: source-LOC cap bypassed (source=${sourceLoc}, test=${testLoc}, cap=${QF_HARD_LOC_CAP}, reason="${flags.overCapReason}")`);
    return true;
  }

  if (sourceLoc <= QF_HARD_LOC_CAP) {
    return true;
  }

  console.log('\n❌ CANNOT COMPLETE - SOURCE LOC EXCEEDS LIMIT\n');
  console.log(`   Source LOC: ${sourceLoc}`);
  console.log(`   Test LOC:   ${testLoc} (excluded from cap)`);
  console.log(`   Limit:      ${QF_HARD_LOC_CAP}\n`);
  console.log('⚠️  This issue must be escalated to a full Strategic Directive.\n');
  console.log('   To bypass with audit trail: --force-complete --reason "<text>"\n');

  const escalate = await prompt('Auto-escalate to SD? (yes/no): ');

  if (escalate.toLowerCase().startsWith('y')) {
    // FR-5: write split-LOC fields, fall back if CHECK rejects
    let updateError = null;
    let updateResult = await supabase
      .from('quick_fixes')
      .update({
        status: 'escalated',
        escalation_reason: `Actual source LOC (${sourceLoc}) exceeds ${QF_HARD_LOC_CAP} line hard cap (test LOC: ${testLoc})`,
        actual_source_loc: sourceLoc,
        actual_test_loc: testLoc
      })
      .eq('id', qfId);
    updateError = updateResult.error;

    // FR-5 fallback: if loosened CHECK still rejects, escalate without writing LOC fields
    if (updateError && /actual_loc_reasonable/i.test(updateError.message || '')) {
      console.log(`   ⚠️  CHECK rejected (${updateError.message}); falling back: escalate WITHOUT writing LOC fields, log to verification_notes`);
      const fallbackNotes = JSON.stringify({
        escalated_with_loc_check_violation: true,
        rejected_source_loc: sourceLoc,
        rejected_test_loc: testLoc,
        timestamp: new Date().toISOString()
      });
      const fallback = await supabase
        .from('quick_fixes')
        .update({
          status: 'escalated',
          escalation_reason: `Actual source LOC (${sourceLoc}) exceeds cap; CHECK rejected LOC write (see verification_notes for forensics)`,
          verification_notes: fallbackNotes
        })
        .eq('id', qfId);
      updateError = fallback.error;
    }

    if (updateError) {
      console.log('❌ Failed to escalate:', updateError.message);
      return false;
    }

    console.log('\n✅ Status updated to: escalated');
    console.log('   Follow full LEAD→PLAN→EXEC workflow for this issue.\n');
    return false;
  }

  console.log(`\n⚠️  Quick-fix not completed. Reduce source LOC to ≤${QF_HARD_LOC_CAP}, or use --force-complete --reason "<text>".\n`);
  return false;
}

/**
 * Validate test results
 *
 * QF-20260509-552: sibling-parity --force-complete short-circuit (matches
 * validateLOC / validateSelfVerification / validateCompliance pattern from
 * QF-407). When --force-complete is set, log bypass with reason in audit
 * trail and accept failing tests.
 *
 * @param {object} unitResult - Unit test results
 * @param {object} e2eResult - E2E test results
 * @param {boolean} testsPass - Cached test result
 * @param {object} flags - { forceComplete?: bool, reason?: string }
 * @returns {boolean} True if tests pass
 */
export function validateTests(unitResult, e2eResult, testsPass, flags = {}) {
  if (!testsPass) {
    if (flags.forceComplete) {
      console.log(`\n⚠️  --force-complete: failing-tests gate bypassed (reason="${flags.reason}")`);
      console.log(`   Unit: ${unitResult?.passed ? '✅ PASS' : '❌ FAIL'}, E2E: ${e2eResult?.passed ? '✅ PASS' : '❌ FAIL'}\n`);
      return true;
    }
    console.log('\n❌ CANNOT COMPLETE - TESTS NOT PASSING\n');
    console.log('   Quick-fixes REQUIRE both test suites to pass (programmatically verified).\n');
    console.log('📊 Test Results:');
    console.log(`   Unit Tests:  ${unitResult?.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   E2E Tests:   ${e2eResult?.passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('\n📋 Next steps:');
    console.log('   1. Review test output above');
    console.log('   2. Fix failing tests');
    console.log('   3. Re-run this script\n');
    return false;
  }

  console.log('✅ All tests passed (programmatically verified)\n');
  return true;
}

/**
 * Validate TypeScript compilation
 * @param {object} tscResult - TypeScript check result
 * @returns {boolean} True if TypeScript passes
 */
export function validateTypeScript(tscResult) {
  if (!tscResult.passed && !tscResult.skipped) {
    console.log('\n❌ CANNOT COMPLETE - TYPESCRIPT ERRORS\n');
    console.log('   Quick-fixes must not introduce TypeScript errors.\n');
    console.log('📋 Next steps:');
    console.log('   1. Run: npx tsc --noEmit');
    console.log('   2. Fix all TypeScript errors');
    console.log('   3. Re-run this script\n');
    return false;
  }
  return true;
}

/**
 * Validate UAT verification
 * @param {boolean} uatVerified - Whether UAT was verified
 * @returns {boolean} True if UAT is verified
 */
export function validateUAT(uatVerified) {
  if (!uatVerified) {
    console.log('\n❌ CANNOT COMPLETE - UAT NOT VERIFIED\n');
    console.log('   Quick-fixes REQUIRE manual UAT verification.\n');
    console.log('📋 Next steps:');
    console.log('   1. Navigate to the affected area');
    console.log('   2. Follow steps to reproduce');
    console.log('   3. Verify fix works as expected');
    console.log('   4. Re-run this script\n');
    return false;
  }
  return true;
}

/**
 * Validate PR exists
 * @param {string} prUrl - PR URL
 * @param {string} qfId - Quick-fix ID
 * @param {string} qfTitle - Quick-fix title
 * @returns {boolean} True if PR is valid
 */
export function validatePR(prUrl, qfId, qfTitle) {
  if (!prUrl || !prUrl.includes('github.com')) {
    console.log('\n❌ CANNOT COMPLETE - PR REQUIRED\n');
    console.log('   Quick-fixes MUST create a PR (no direct merge).\n');
    console.log('📋 Next steps:');
    console.log(`   1. Create PR: gh pr create --title "fix(${qfId}): ${qfTitle}"`);
    console.log('   2. Re-run this script with --pr-url flag\n');
    return false;
  }
  return true;
}

/**
 * Verify test coverage for changed files
 * @param {Array} filesChanged - List of changed files
 * @returns {object} Test coverage info
 */
export function verifyTestCoverage(filesChanged) {
  console.log('📋 Test Coverage Verification\n');

  const testCoverage = {
    unitTestsExist: false,
    e2eTestsExist: false,
    filesWithTests: []
  };

  try {
    for (const file of filesChanged) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.ts')) {
        testCoverage.unitTestsExist = true;
      }
      if (file.includes('e2e') || file.includes('playwright')) {
        testCoverage.e2eTestsExist = true;
      }

      const baseName = file.replace(/\.(tsx?|jsx?)$/, '');
      const testPatterns = [
        `${baseName}.test.ts`,
        `${baseName}.test.tsx`,
        `${baseName}.spec.ts`,
        `__tests__/${path.basename(baseName)}.test.ts`
      ];

      for (const testPattern of testPatterns) {
        try {
          execSync(`test -f "${testPattern}"`, { stdio: 'pipe' });
          testCoverage.filesWithTests.push(file);
          break;
        } catch {
          // Test file doesn't exist
        }
      }
    }

    console.log(`   Unit Tests: ${testCoverage.unitTestsExist ? '✅ Found' : '⚠️  Not found in changes'}`);
    console.log(`   E2E Tests: ${testCoverage.e2eTestsExist ? '✅ Found' : '⚠️  Not found in changes'}`);
    console.log(`   Files with Test Coverage: ${testCoverage.filesWithTests.length}/${filesChanged.length}`);

    if (testCoverage.filesWithTests.length < filesChanged.length) {
      const uncoveredFiles = filesChanged.filter(f => !testCoverage.filesWithTests.includes(f));
      console.log('   ⚠️  Files without test coverage:');
      uncoveredFiles.forEach(f => console.log(`      - ${f}`));
    }

    console.log();
  } catch (err) {
    console.log(`   ⚠️  Could not verify test coverage: ${err.message}\n`);
  }

  return testCoverage;
}

/**
 * Validate self-verification results
 *
 * SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2: --force-complete bypasses
 * the low-confidence proceed-anyway prompt. Audit trail goes in verification_notes.
 *
 * @param {object} verificationResults - Results from self-verification
 * @param {Function} prompt - Prompt function for user input
 * @param {object} flags - { forceComplete?: bool, reason?: string }
 * @returns {Promise<boolean>} True if verification passed
 */
export async function validateSelfVerification(verificationResults, prompt, flags = {}) {
  if (!verificationResults.passed) {
    if (flags.forceComplete) {
      console.log(`\n⚠️  --force-complete: self-verification blockers bypassed (reason="${flags.reason}")`);
      verificationResults.blockers.forEach((blocker, i) => console.log(`   [bypassed] ${i + 1}. ${blocker}`));
      return true;
    }
    console.log('\n❌ CANNOT COMPLETE - Verification blockers detected\n');
    console.log('   Resolve the following issues:\n');
    verificationResults.blockers.forEach((blocker, i) => {
      console.log(`   ${i + 1}. ${blocker}`);
    });
    console.log('\n   To bypass with audit trail: --force-complete --reason "<text>"\n');
    console.log('   Run this script again after resolving blockers.\n');
    return false;
  }

  if (verificationResults.confidence < 80) {
    if (flags.forceComplete) {
      console.log(`\n⚠️  --force-complete: low-confidence (${verificationResults.confidence}%) bypassed (reason="${flags.reason}")`);
      return true;
    }
    console.log(`\n⚠️  VERIFICATION PASSED BUT CONFIDENCE LOW (${verificationResults.confidence}%)\n`);
    console.log('   Warnings detected:\n');
    verificationResults.warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });

    const proceed = await prompt('\n   Proceed anyway? (yes/no): ');
    if (!proceed.toLowerCase().startsWith('y')) {
      console.log('\n   Completion cancelled. Review warnings and try again.\n');
      return false;
    }
  }

  return true;
}

/**
 * Validate compliance rubric results.
 *
 * QF-20260508-407 (RCA from 5-witness wedge): mirrors {forceComplete,reason}
 * short-circuit pattern from validateLOC + validateSelfVerification. SD-FDBK
 * FR-2 patched 2 of 3 sibling validators; this was the missed third sibling.
 *
 * @param {object} complianceResults - Results from compliance rubric
 * @param {Function} prompt - Prompt function for user input
 * @param {object} flags - { forceComplete?: bool, reason?: string }
 * @returns {Promise<boolean>} True if compliance passed
 */
export async function validateCompliance(complianceResults, prompt, flags = {}) {
  if (complianceResults.verdict === 'FAIL') {
    console.log('\n❌ CANNOT COMPLETE - Compliance rubric failed after all refinement attempts\n');
    console.log(`   Final Score: ${complianceResults.totalScore}/100 (${complianceResults.confidence.toFixed(1)}%)\n`);
    console.log('   Failed criteria:\n');
    complianceResults.criteriaResults.filter(c => !c.passed).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
      console.log(`      ${c.evidence}\n`);
    });
    // QF-20260509-407: --force-complete bypasses FAIL-verdict (parity with WARN
    // branch below). The flag docs say "Bypass self-verification + LOC-cap blocks"
    // — without this branch, FAIL still hard-blocks even after the refinement-loop
    // skip from QF-20260509-COMPLIANCE-LOOP. Audit trail lives in verification_notes
    // JSON via SD-FDBK-INFRA-FIX-COMPLETION-LIFECYCLE-001 FR-2.
    if (flags.forceComplete) {
      console.log(`   ⚠️  --force-complete: FAIL-verdict gate bypassed (reason="${flags.reason}")`);
      console.log('       quick_fixes.force_completed=true; failed criteria recorded in audit trail.\n');
      return true;
    }
    console.log('   Options:');
    console.log('   1. Manually fix issues and re-run completion script');
    console.log('   2. Escalate to full Strategic Directive\n');
    return false;
  }

  if (complianceResults.verdict === 'WARN') {
    console.log(`\n⚠️  COMPLIANCE PASSED WITH WARNINGS (${complianceResults.confidence.toFixed(1)}%)\n`);
    console.log(`   Score: ${complianceResults.totalScore}/100\n`);
    const failedCriteria = complianceResults.criteriaResults.filter(c => !c.passed);
    if (failedCriteria.length > 0) {
      console.log('   Issues detected:\n');
      failedCriteria.forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
        console.log(`      ${c.evidence}\n`);
      });
    }

    // QF-20260508-407: --force-complete bypasses WARN-verdict prompt (audit
    // trail in verification_notes JSON). 6th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
    if (flags.forceComplete) {
      console.log(`   ⚠️  --force-complete: WARN-verdict prompt bypassed (reason="${flags.reason}")\n`);
      return true;
    }

    // QF-20260524-587: --accept-compliance-warn clears ONLY this WARN-verdict prompt
    // (so completion works under --non-interactive) WITHOUT the over-broad --force-complete
    // (which also clears FAIL/LOC/self-verification). Audit trail in verification_notes.
    if (flags.acceptComplianceWarn) {
      console.log(`   ⚠️  --accept-compliance-warn: WARN-verdict prompt cleared (reason="${flags.reason}"). FAIL/LOC/self-verification gates still enforced.\n`);
      return true;
    }

    const proceedCompliance = await prompt('   Proceed with completion? (yes/no): ');
    if (!proceedCompliance.toLowerCase().startsWith('y')) {
      console.log('\n   Completion cancelled. Improve compliance score and try again.\n');
      return false;
    }
  }

  return true;
}
