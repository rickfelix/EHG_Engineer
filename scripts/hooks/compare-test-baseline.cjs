#!/usr/bin/env node

/**
 * Compare Test Baseline Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 3 Baseline Integration
 *
 * Compares current test state against the captured baseline to identify
 * only NEW failures introduced during the session. Pre-existing failures
 * are filtered out from the report.
 *
 * Can be run as PostToolUse hook or invoked directly for on-demand comparison.
 *
 * Hook Type: PostToolUse (after test commands) or manual
 * Purpose: Distinguish new vs pre-existing failures
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-002
 */

const fs = require('fs');
const path = require('path');
const { captureBaseline, captureUnitTestState, captureTypeCheckState } = require('./capture-baseline-test-state');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');

/**
 * Load current session state
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[compare-baseline] Error loading session state:', error.message);
  }
  return {};
}

/**
 * Save session state
 */
function saveSessionState(state) {
  try {
    fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('[compare-baseline] Error saving session state:', error.message);
  }
}

/**
 * Compare test counts and identify new failures
 */
function compareTestCounts(baseline, current, label) {
  const result = {
    label,
    baseline_failed: baseline?.failed || 0,
    current_failed: current?.failed || 0,
    new_failures: 0,
    fixed: 0,
    status: 'UNKNOWN'
  };

  result.new_failures = Math.max(0, result.current_failed - result.baseline_failed);
  result.fixed = Math.max(0, result.baseline_failed - result.current_failed);

  if (result.new_failures > 0) {
    result.status = 'REGRESSION';
  } else if (result.fixed > 0) {
    result.status = 'IMPROVED';
  } else if (result.current_failed === 0) {
    result.status = 'CLEAN';
  } else {
    result.status = 'STABLE';  // Same failures as baseline
  }

  return result;
}

/**
 * Generate comparison report
 */
function generateComparisonReport(baseline, current) {
  const report = {
    generated_at: new Date().toISOString(),
    baseline_captured_at: baseline?.captured_at,
    comparisons: {},
    summary: {
      total_new_failures: 0,
      total_fixed: 0,
      overall_status: 'CLEAN'
    }
  };

  // Compare Engineer tests
  report.comparisons.engineer_tests = compareTestCounts(
    baseline?.engineer?.unit_tests,
    current?.engineer?.unit_tests,
    'Engineer Unit Tests'
  );

  // Compare App tests
  report.comparisons.app_tests = compareTestCounts(
    baseline?.app?.unit_tests,
    current?.app?.unit_tests,
    'App Unit Tests'
  );

  // Compare TypeScript errors (treated as failures)
  report.comparisons.engineer_types = {
    label: 'Engineer TypeScript',
    baseline_errors: baseline?.engineer?.type_check?.errors || 0,
    current_errors: current?.engineer?.type_check?.errors || 0,
    new_errors: Math.max(0, (current?.engineer?.type_check?.errors || 0) - (baseline?.engineer?.type_check?.errors || 0)),
    status: 'UNKNOWN'
  };
  if (report.comparisons.engineer_types.new_errors > 0) {
    report.comparisons.engineer_types.status = 'REGRESSION';
  } else if (report.comparisons.engineer_types.current_errors === 0) {
    report.comparisons.engineer_types.status = 'CLEAN';
  } else {
    report.comparisons.engineer_types.status = 'STABLE';
  }

  report.comparisons.app_types = {
    label: 'App TypeScript',
    baseline_errors: baseline?.app?.type_check?.errors || 0,
    current_errors: current?.app?.type_check?.errors || 0,
    new_errors: Math.max(0, (current?.app?.type_check?.errors || 0) - (baseline?.app?.type_check?.errors || 0)),
    status: 'UNKNOWN'
  };
  if (report.comparisons.app_types.new_errors > 0) {
    report.comparisons.app_types.status = 'REGRESSION';
  } else if (report.comparisons.app_types.current_errors === 0) {
    report.comparisons.app_types.status = 'CLEAN';
  } else {
    report.comparisons.app_types.status = 'STABLE';
  }

  // Calculate summary
  report.summary.total_new_failures =
    (report.comparisons.engineer_tests.new_failures || 0) +
    (report.comparisons.app_tests.new_failures || 0) +
    (report.comparisons.engineer_types.new_errors || 0) +
    (report.comparisons.app_types.new_errors || 0);

  report.summary.total_fixed =
    (report.comparisons.engineer_tests.fixed || 0) +
    (report.comparisons.app_tests.fixed || 0);

  // Determine overall status
  const hasRegression = Object.values(report.comparisons).some(c => c.status === 'REGRESSION');
  const hasImprovement = Object.values(report.comparisons).some(c => c.status === 'IMPROVED');
  const allClean = Object.values(report.comparisons).every(c => c.status === 'CLEAN');

  if (hasRegression) {
    report.summary.overall_status = 'REGRESSION';
  } else if (allClean) {
    report.summary.overall_status = 'CLEAN';
  } else if (hasImprovement) {
    report.summary.overall_status = 'IMPROVED';
  } else {
    report.summary.overall_status = 'STABLE';
  }

  return report;
}

/**
 * Print comparison report
 */
function printReport(report) {
  console.log('\n' + '='.repeat(60));
  console.log('BASELINE COMPARISON REPORT');
  console.log('='.repeat(60));
  console.log(`Generated: ${report.generated_at}`);
  console.log(`Baseline from: ${report.baseline_captured_at || 'unknown'}`);
  console.log('-'.repeat(60));

  for (const [key, comparison] of Object.entries(report.comparisons)) {
    const icon = comparison.status === 'REGRESSION' ? '❌' :
                 comparison.status === 'IMPROVED' ? '✅' :
                 comparison.status === 'CLEAN' ? '✅' : '⚪';
    console.log(`${icon} ${comparison.label}: ${comparison.status}`);

    if (comparison.new_failures > 0) {
      console.log(`   NEW FAILURES: ${comparison.new_failures}`);
    }
    if (comparison.new_errors > 0) {
      console.log(`   NEW ERRORS: ${comparison.new_errors}`);
    }
    if (comparison.fixed > 0) {
      console.log(`   FIXED: ${comparison.fixed}`);
    }
  }

  console.log('-'.repeat(60));
  console.log(`OVERALL: ${report.summary.overall_status}`);
  console.log(`New failures: ${report.summary.total_new_failures}`);
  console.log(`Fixed: ${report.summary.total_fixed}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main hook execution
 */
function main() {
  const state = loadSessionState();

  if (!state.test_baseline) {
    console.log('[compare-baseline] No baseline captured yet');
    console.log('[compare-baseline] Run capture-baseline-test-state.js first');
    return;
  }

  console.log('[compare-baseline] Capturing current test state...');
  const current = captureBaseline();

  console.log('[compare-baseline] Comparing against baseline...');
  const report = generateComparisonReport(state.test_baseline, current);

  // Store report in session state
  state.last_comparison = report;
  state.comparisons = state.comparisons || [];
  state.comparisons.push({
    at: report.generated_at,
    status: report.summary.overall_status,
    new_failures: report.summary.total_new_failures
  });

  // Keep last 10 comparisons
  if (state.comparisons.length > 10) {
    state.comparisons = state.comparisons.slice(-10);
  }

  saveSessionState(state);

  printReport(report);

  // Exit with appropriate code
  if (report.summary.overall_status === 'REGRESSION') {
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { generateComparisonReport, compareTestCounts };
