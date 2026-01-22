/**
 * QA Engineering Director - Verdict Utilities
 * Final verdict calculation, summary generation, recommendations
 */

import { storeAndCompressResults } from '../modules/qa/sub-agent-result-handler.js';

/**
 * Calculate final verdict based on all phase results
 * @param {Object} results - All phase results
 * @returns {Object} Final verdict with confidence and time saved
 */
export function calculateFinalVerdict(results) {
  const { pre_flight, test_execution } = results.phases;

  // Check for blockers
  if (pre_flight?.build?.verdict === 'BLOCKED') {
    return { verdict: 'BLOCKED', confidence: 0, time_saved: '2-3 hours' };
  }

  if (pre_flight?.migrations?.verdict === 'BLOCKED') {
    return { verdict: 'BLOCKED', confidence: 0, time_saved: '1-2 hours' };
  }

  // Check user story coverage
  const userStoryCount = pre_flight?.user_stories?.stories_count || 0;
  const e2eTestsPassed = test_execution?.smoke?.e2e_tests?.passed || 0;
  const userStoryCoverage = userStoryCount > 0 ? Math.round((e2eTestsPassed / userStoryCount) * 100) : 0;

  // Check test results (Dual test execution - BOTH required)
  const smokePass = test_execution?.smoke?.verdict === 'PASS';
  const unitPass = test_execution?.smoke?.unit_tests?.verdict === 'PASS';
  const e2ePass = test_execution?.smoke?.e2e_tests?.verdict === 'PASS';

  // PASS requires BOTH unit AND E2E tests to pass AND 100% user story coverage
  if (smokePass && unitPass && e2ePass && userStoryCoverage >= 100) {
    return { verdict: 'PASS', confidence: 95, time_saved: '3-4 hours' };
  }

  // CONDITIONAL_PASS if tests pass but user story coverage < 100%
  if (smokePass && unitPass && e2ePass && userStoryCoverage < 100) {
    return {
      verdict: 'CONDITIONAL_PASS',
      confidence: 75,
      time_saved: '2-3 hours',
      note: `User story coverage ${userStoryCoverage}% (${e2eTestsPassed}/${userStoryCount}) - 100% required for PASS`
    };
  }

  // CONDITIONAL_PASS if only one test type passed (needs review)
  if ((unitPass && !e2ePass) || (!unitPass && e2ePass)) {
    return { verdict: 'CONDITIONAL_PASS', confidence: 50, time_saved: '1-2 hours', note: 'Only one test type passed - both required' };
  }

  return { verdict: 'FAIL', confidence: 0, time_saved: '0 hours' };
}

/**
 * Generate executive summary
 * @param {Object} results - All phase results
 * @returns {Object} Executive summary
 */
export function generateSummary(results) {
  const { pre_flight, test_planning, test_execution } = results.phases;

  // Calculate user story coverage
  const userStoryCount = pre_flight?.user_stories?.stories_count || 0;
  const completedStoryCount = pre_flight?.user_stories?.completed_count || 0;
  const e2eTestsPassed = test_execution?.smoke?.e2e_tests?.passed || 0;

  let userStoryCoverage = 0;
  if (userStoryCount > 0) {
    userStoryCoverage = Math.round((e2eTestsPassed / userStoryCount) * 100);
  }

  return {
    pre_flight_checks: {
      user_stories: pre_flight?.user_stories?.verdict || 'NOT_CHECKED',
      user_story_count: userStoryCount,
      user_story_coverage: `${userStoryCoverage}%`,
      build: pre_flight?.build?.verdict || 'SKIP',
      migrations: pre_flight?.migrations?.verdict || 'SKIP',
      dependencies: pre_flight?.dependencies?.verdict || 'SKIP',
      integration: pre_flight?.integration?.verdict || 'SKIP'
    },
    test_plan: {
      primary_tier: test_planning?.tier_selection?.primary_tier?.name,
      estimated_time: test_planning?.tier_selection?.total_estimated_time_display,
      infrastructure_available: test_planning?.infrastructure?.summary?.auth_available,
      bmad_test_plan: test_planning?.test_plan ? {
        id: test_planning.test_plan.id,
        unit_tests: test_planning.test_plan.unit_tests,
        e2e_tests: test_planning.test_plan.e2e_tests,
        integration_tests: test_planning.test_plan.integration_tests,
        performance_tests: test_planning.test_plan.performance_tests,
        user_story_mapping: test_planning.test_plan.user_story_mapping,
        coverage_requirement: test_planning.test_plan.coverage_requirement
      } : null
    },
    test_results: {
      smoke: test_execution?.smoke?.verdict || 'NOT_RUN',
      e2e: test_execution?.e2e?.verdict || 'NOT_RUN',
      manual: test_execution?.manual?.required || false
    },
    user_story_validation: {
      total_stories: userStoryCount,
      completed_stories: completedStoryCount,
      e2e_tests_passed: e2eTestsPassed,
      coverage_percentage: userStoryCoverage,
      meets_requirement: userStoryCoverage >= 100
    }
  };
}

/**
 * Generate recommendations for EXEC agent
 * @param {Object} results - All phase results
 * @returns {Array} Recommendations
 */
export function generateRecommendations(results) {
  const recommendations = [];

  // Infrastructure recommendations
  const infraRecommendations = results.phases.test_planning?.infrastructure?.recommendations || [];
  recommendations.push(...infraRecommendations);

  // Dependency recommendations
  if (results.phases.pre_flight?.dependencies?.verdict === 'WARNING') {
    recommendations.push(...results.phases.pre_flight.dependencies.recommendations);
  }

  // Integration recommendations
  if (results.phases.pre_flight?.integration?.warnings) {
    for (const warning of results.phases.pre_flight.integration.warnings) {
      recommendations.push({
        type: 'INTEGRATION',
        priority: warning.severity === 'high' ? 'HIGH' : 'MEDIUM',
        message: warning.recommendation
      });
    }
  }

  return recommendations;
}

/**
 * Store results in database with compression
 * @param {Object} supabase - Supabase client
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} results - All phase results
 */
export async function storeResults(supabase, sd_id, results) {
  const fullReport = {
    sub_agent_code: 'QA',
    sub_agent_name: 'QA Engineering Director v2.0',
    verdict: results.verdict,
    confidence: results.confidence,
    critical_issues: extractCriticalIssues(results),
    warnings: extractWarnings(results),
    recommendations: results.recommendations || [],
    phases: results.phases,
    targetApp: results.targetApp,
    time_saved: results.time_saved,
    summary: results.summary,
    execution_time_seconds: calculateExecutionTime(results)
  };

  const { compressed, tier, savings } = await storeAndCompressResults(
    supabase,
    sd_id,
    fullReport,
    'EXEC'
  );

  results._compressed = compressed;
  results._compression_tier = tier;
  results._token_savings = savings;
}

/**
 * Extract critical issues from results
 */
function extractCriticalIssues(results) {
  const criticalIssues = [];

  if (results.phases.pre_flight?.build?.verdict === 'BLOCKED') {
    criticalIssues.push({
      severity: 'CRITICAL',
      issue: 'Build validation failed',
      location: 'Build process',
      recommendation: 'Fix build errors before proceeding',
      details: results.phases.pre_flight.build
    });
  }

  if (results.phases.pre_flight?.migrations?.verdict === 'BLOCKED') {
    criticalIssues.push({
      severity: 'CRITICAL',
      issue: 'Database migrations not applied',
      location: 'Database migrations',
      recommendation: 'Apply pending migrations',
      details: results.phases.pre_flight.migrations
    });
  }

  if (results.phases.test_execution?.smoke?.verdict === 'FAIL') {
    criticalIssues.push({
      severity: 'CRITICAL',
      issue: 'Smoke tests failed',
      location: 'Test execution',
      recommendation: 'Fix failing tests',
      details: results.phases.test_execution.smoke
    });
  }

  return criticalIssues;
}

/**
 * Extract warnings from results
 */
function extractWarnings(results) {
  const warnings = [];

  if (results.phases.pre_flight?.dependencies?.verdict === 'WARNING') {
    warnings.push({
      severity: 'MEDIUM',
      issue: 'Cross-SD dependency conflicts detected',
      location: 'Dependencies',
      recommendation: 'Review dependency conflicts',
      details: results.phases.pre_flight.dependencies
    });
  }

  if (results.phases.pre_flight?.integration?.verdict === 'WARNING') {
    warnings.push({
      severity: 'MEDIUM',
      issue: 'Component integration issues',
      location: 'Component integration',
      recommendation: 'Verify component imports',
      details: results.phases.pre_flight.integration
    });
  }

  if (results.summary?.user_story_validation?.coverage_percentage < 100) {
    warnings.push({
      severity: 'HIGH',
      issue: `User story coverage ${results.summary.user_story_validation.coverage_percentage}% (requires 100%)`,
      location: 'E2E test coverage',
      recommendation: 'Add E2E tests for uncovered user stories',
      details: results.summary.user_story_validation
    });
  }

  return warnings;
}

/**
 * Calculate execution time from results
 */
function calculateExecutionTime(results) {
  let totalSeconds = 0;

  if (results.phases.test_execution?.smoke?.unit_tests?.duration_seconds) {
    totalSeconds += results.phases.test_execution.smoke.unit_tests.duration_seconds;
  }

  if (results.phases.test_execution?.smoke?.e2e_tests?.duration_seconds) {
    totalSeconds += results.phases.test_execution.smoke.e2e_tests.duration_seconds;
  }

  return totalSeconds;
}
