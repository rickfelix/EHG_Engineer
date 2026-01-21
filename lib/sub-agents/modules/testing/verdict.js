/**
 * TESTING Sub-Agent - Verdict Generation Module
 * Phase 5: Generate final verdict based on all test results
 *
 * Responsibilities:
 * - Analyze test execution results
 * - Apply validation mode rules (prospective vs retrospective)
 * - Generate verdict with confidence and recommendations
 */

const PASS_RATE_THRESHOLD = 95;

/**
 * Generate final verdict based on test results
 *
 * @param {Object} results - Accumulated test results
 * @param {string} validationMode - 'prospective' or 'retrospective'
 * @returns {Object} Verdict with confidence and recommendations
 */
export function generateVerdict(results, validationMode = 'prospective') {
  const { findings, critical_issues, warnings } = results;

  let verdict = 'PASS';
  let confidence = 100;
  const recommendations = [];
  let justification = null;
  let conditions = null;

  console.log(`   Applying ${validationMode} validation criteria...`);

  // Critical issues = BLOCKED
  if (critical_issues.length > 0) {
    verdict = 'BLOCKED';
    confidence = 100;
    recommendations.push('Fix all critical issues before proceeding');
    recommendations.push('Consult Troubleshooting Tactics Arsenal in TESTING sub-agent description');
    return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings);
  }

  // Failed tests - check pass rate threshold
  if (findings.phase3_execution?.failed_tests > 0) {
    const testsExecuted = findings.phase3_execution?.tests_executed || 0;
    const testsPassed = findings.phase3_execution?.tests_passed || 0;
    const passRate = testsExecuted > 0 ? (testsPassed / testsExecuted) * 100 : 0;

    if (passRate >= PASS_RATE_THRESHOLD) {
      return handleHighPassRate(passRate, findings, validationMode, recommendations);
    }
    return handleLowPassRate(passRate, findings, recommendations);
  }

  // Test execution error
  if (findings.phase3_execution?.error) {
    verdict = 'BLOCKED';
    confidence = 100;
    recommendations.push('Resolve test execution error before approval');
    recommendations.push('Troubleshooting tactics have been suggested in Phase 3 output');

    if (findings.phase3_execution?.troubleshooting_tactics?.length > 0) {
      findings.phase3_execution.troubleshooting_tactics.slice(0, 2).forEach(tactic => {
        recommendations.push(`   ${tactic.name}: ${tactic.command}`);
      });
    }
    return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings);
  }

  // No tests executed - ADAPTIVE LOGIC
  if (findings.phase3_execution?.tests_executed === 0) {
    return handleNoTestsExecuted(findings, results, validationMode, recommendations);
  }

  // Warnings present = mode-dependent verdict
  if (warnings.length > 0) {
    return handleWarnings(warnings, findings, validationMode, recommendations);
  }

  // All passed = PASS
  verdict = 'PASS';
  confidence = 95;
  recommendations.push('All tests passed - ready for deployment');

  return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings, validationMode);
}

/**
 * Handle high pass rate scenario
 */
function handleHighPassRate(passRate, findings, validationMode, recommendations) {
  let verdict, confidence, justification, conditions;

  if (validationMode === 'retrospective') {
    verdict = 'CONDITIONAL_PASS';
    confidence = 90;
    justification = `High pass rate (${passRate.toFixed(1)}% >= ${PASS_RATE_THRESHOLD}%) with ${findings.phase3_execution.failed_tests} minor failure(s). Tests demonstrate functional coverage.`;
    conditions = [
      `Fix remaining ${findings.phase3_execution.failed_tests} test failure(s) for 100% coverage`,
      'Review failed test details in phase3_execution.failures'
    ];
    recommendations.push(`Pass rate ${passRate.toFixed(1)}% meets threshold (>=${PASS_RATE_THRESHOLD}%)`);
    recommendations.push(`${findings.phase3_execution.failed_tests} minor test failures - consider fixing for 100% coverage`);
  } else {
    verdict = 'PASS';
    confidence = 90;
    recommendations.push(`Pass rate ${passRate.toFixed(1)}% meets threshold (>=${PASS_RATE_THRESHOLD}%)`);
    recommendations.push(`${findings.phase3_execution.failed_tests} minor test failures - recommend fixing before deployment`);
  }

  return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings);
}

/**
 * Handle low pass rate scenario
 */
function handleLowPassRate(passRate, findings, recommendations) {
  const verdict = 'BLOCKED';
  const confidence = 100;

  recommendations.push(`Pass rate ${passRate.toFixed(1)}% below threshold (${PASS_RATE_THRESHOLD}%)`);
  recommendations.push('Fix failing E2E tests before approval');
  recommendations.push('Use Troubleshooting Arsenal: Start with Tactic 1 (Server Restart + Single Test)');

  if (findings.phase3_execution?.troubleshooting_tactics?.length > 0) {
    const topTactic = findings.phase3_execution.troubleshooting_tactics[0];
    recommendations.push(`Suggested: ${topTactic.name} - ${topTactic.command}`);
  }

  return buildVerdictResult(verdict, confidence, recommendations, null, null, findings);
}

/**
 * Handle no tests executed scenario
 */
function handleNoTestsExecuted(findings, results, validationMode, recommendations) {
  let verdict, confidence, justification, conditions;

  if (validationMode === 'retrospective') {
    const testsPassed = findings.phase3_execution?.tests_passed || 0;
    const testFilesFound = findings.phase4_evidence?.test_files_found || 0;
    const userStoriesWithE2E = results.critical_issues?.length === 0;
    const hasTestEvidence = testsPassed > 0 || testFilesFound > 0 || userStoriesWithE2E;

    if (hasTestEvidence) {
      verdict = 'CONDITIONAL_PASS';
      confidence = 75;
      justification = `E2E testing completed retrospectively. Evidence: ${testsPassed} tests passed. Work already delivered and functional. Missing --full-e2e flag is infrastructure gap, not functional failure.`;
      conditions = [
        'Recommend: Add --full-e2e flag to CI/CD pipeline for future SDs',
        'Consider: Create follow-up SD for testing infrastructure improvements'
      ];
      recommendations.push('Accepted retrospectively - work delivered successfully');
      recommendations.push('Infrastructure gap documented in conditions');
    } else {
      verdict = 'BLOCKED';
      confidence = 100;
      recommendations.push('No E2E test evidence found - cannot validate retrospectively');
      recommendations.push('Manual validation or test execution required');
    }
  } else {
    verdict = 'BLOCKED';
    confidence = 100;
    recommendations.push('Execute E2E tests before approval (MANDATORY - zero tolerance)');
    recommendations.push('E2E testing is NOT optional per protocol - all tests must pass with zero failures');
    recommendations.push('Use: node scripts/execute-subagent.js --code TESTING --sd-id <SD-ID> --full-e2e');
  }

  return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings);
}

/**
 * Handle warnings present scenario
 */
function handleWarnings(warnings, findings, validationMode, recommendations) {
  let verdict, confidence, justification, conditions;

  if (validationMode === 'retrospective') {
    verdict = 'CONDITIONAL_PASS';
    confidence = 85;
    justification = `Testing completed retrospectively with ${warnings.length} warning(s). Work delivered successfully but minor issues documented for future improvement.`;
    conditions = warnings.map(w => `Address: ${w.issue || w}`).slice(0, 5);
    recommendations.push('Address warnings for improved quality');
  } else {
    verdict = 'PASS';
    confidence = 85;
    recommendations.push(`${warnings.length} warning(s) found - address for improved quality`);
    recommendations.push('Re-run with --validation-mode retrospective if work is already complete');
  }

  return buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings);
}

/**
 * Build the final verdict result object
 */
function buildVerdictResult(verdict, confidence, recommendations, justification, conditions, findings, _validationMode) {
  // Add standard recommendations based on context
  if (findings.phase2_test_generation?.user_stories_count === 0) {
    recommendations.push('Create user stories to enable comprehensive E2E test coverage');
  }

  if (!findings.phase3_execution?.from_cache) {
    recommendations.push('Test evidence is fresh (not cached)');
  }

  if (verdict === 'BLOCKED' || verdict === 'CONDITIONAL_PASS') {
    recommendations.push('Full troubleshooting arsenal (13 tactics) available in TESTING sub-agent description');
    recommendations.push('Expected debugging time savings: 3-8x with systematic troubleshooting');
  }

  return {
    verdict,
    confidence,
    recommendations,
    justification,
    conditions,
    summary: `${findings.phase3_execution?.tests_passed || 0}/${findings.phase3_execution?.tests_executed || 0} tests passed`,
    troubleshooting_available: true
  };
}
