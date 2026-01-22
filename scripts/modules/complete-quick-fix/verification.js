/**
 * Verification Utilities for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import path from 'path';
import { execSync } from 'child_process';

/**
 * Validate LOC constraint (hard cap at 50)
 * @param {number} actualLoc - Actual lines of code
 * @param {string} qfId - Quick-fix ID
 * @param {object} supabase - Supabase client
 * @param {Function} prompt - Prompt function for user input
 * @returns {Promise<boolean>} True if validation passed, false if should exit
 */
export async function validateLOC(actualLoc, qfId, supabase, prompt) {
  if (actualLoc <= 50) {
    return true;
  }

  console.log('\n❌ CANNOT COMPLETE - LOC EXCEEDS LIMIT\n');
  console.log(`   Actual LOC: ${actualLoc}`);
  console.log('   Limit:      50\n');
  console.log('⚠️  This issue must be escalated to a full Strategic Directive.\n');

  const escalate = await prompt('Auto-escalate to SD? (yes/no): ');

  if (escalate.toLowerCase().startsWith('y')) {
    const { error: updateError } = await supabase
      .from('quick_fixes')
      .update({
        status: 'escalated',
        escalation_reason: `Actual LOC (${actualLoc}) exceeds 50 line hard cap`,
        actual_loc: actualLoc
      })
      .eq('id', qfId);

    if (updateError) {
      console.log('❌ Failed to escalate:', updateError.message);
      return false;
    }

    console.log('\n✅ Status updated to: escalated');
    console.log('   Follow full LEAD→PLAN→EXEC workflow for this issue.\n');
    return false;
  }

  console.log('\n⚠️  Quick-fix not completed. Reduce LOC to ≤50 or escalate.\n');
  return false;
}

/**
 * Validate test results
 * @param {object} unitResult - Unit test results
 * @param {object} e2eResult - E2E test results
 * @param {boolean} testsPass - Cached test result
 * @returns {boolean} True if tests pass
 */
export function validateTests(unitResult, e2eResult, testsPass) {
  if (!testsPass) {
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
 * @param {object} verificationResults - Results from self-verification
 * @param {Function} prompt - Prompt function for user input
 * @returns {Promise<boolean>} True if verification passed
 */
export async function validateSelfVerification(verificationResults, prompt) {
  if (!verificationResults.passed) {
    console.log('\n❌ CANNOT COMPLETE - Verification blockers detected\n');
    console.log('   Resolve the following issues:\n');
    verificationResults.blockers.forEach((blocker, i) => {
      console.log(`   ${i + 1}. ${blocker}`);
    });
    console.log('\n   Run this script again after resolving blockers.\n');
    return false;
  }

  if (verificationResults.confidence < 80) {
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
 * Validate compliance rubric results
 * @param {object} complianceResults - Results from compliance rubric
 * @param {Function} prompt - Prompt function for user input
 * @returns {Promise<boolean>} True if compliance passed
 */
export async function validateCompliance(complianceResults, prompt) {
  if (complianceResults.verdict === 'FAIL') {
    console.log('\n❌ CANNOT COMPLETE - Compliance rubric failed after all refinement attempts\n');
    console.log(`   Final Score: ${complianceResults.totalScore}/100 (${complianceResults.confidence.toFixed(1)}%)\n`);
    console.log('   Failed criteria:\n');
    complianceResults.criteriaResults.filter(c => !c.passed).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.name} (${c.score}/${c.maxScore} points)`);
      console.log(`      ${c.evidence}\n`);
    });
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

    const proceedCompliance = await prompt('   Proceed with completion? (yes/no): ');
    if (!proceedCompliance.toLowerCase().startsWith('y')) {
      console.log('\n   Completion cancelled. Improve compliance score and try again.\n');
      return false;
    }
  }

  return true;
}
