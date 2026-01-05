#!/usr/bin/env node

/**
 * Smart Test Selection
 * SD-TEST-MGMT-SELECTION-001
 *
 * Provides intelligent test selection based on risk, history, and duration.
 * Features: risk-based prioritization, flaky detection, duration ordering.
 *
 * Usage:
 *   node scripts/test-selection.js [command] [options]
 *
 * Commands:
 *   select      Select tests based on criteria (default)
 *   flaky       Detect and report flaky tests
 *   analyze     Analyze test history and patterns
 *   report      Generate selection report
 *
 * Options:
 *   --risk <level>    Minimum risk level (low, medium, high, critical)
 *   --limit <n>       Maximum number of tests to select
 *   --duration <ms>   Maximum total duration in ms
 *   --since <ref>     Git ref for change-based selection
 *   --output <path>   Output file for selected tests
 *   --verbose, -v     Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(PROJECT_ROOT, '.env') });
dotenv.config({ path: path.join(PROJECT_ROOT, '.env.claude') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }
  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('-') ? args[0] : 'select';
  const options = {
    risk: 'low',
    limit: null,
    duration: null,
    since: null,
    output: null,
    verbose: false
  };

  for (let i = command === args[0] ? 1 : 0; i < args.length; i++) {
    switch (args[i]) {
      case '--risk':
        options.risk = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--duration':
        options.duration = parseInt(args[++i], 10);
        break;
      case '--since':
        options.since = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
    }
  }

  return { command, options };
}

/**
 * Risk level priority (higher = more critical)
 */
const RISK_PRIORITY = {
  'low': 1,
  'medium': 2,
  'high': 3,
  'critical': 4
};

/**
 * Get changed files since a git ref
 */
function getChangedFiles(since = 'HEAD~1') {
  try {
    const output = execSync(`git diff --name-only ${since}`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8'
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Map file paths to affected test types/areas
 */
function getAffectedAreas(changedFiles) {
  const areas = new Set();

  for (const file of changedFiles) {
    // Determine affected areas based on file path
    if (file.includes('auth') || file.includes('login') || file.includes('session')) {
      areas.add('auth');
    }
    if (file.includes('api') || file.includes('endpoint') || file.includes('route')) {
      areas.add('api');
    }
    if (file.includes('component') || file.includes('src/') && file.endsWith('.tsx')) {
      areas.add('ui');
    }
    if (file.includes('database') || file.includes('migration') || file.includes('schema')) {
      areas.add('database');
    }
    if (file.includes('security') || file.includes('rls') || file.includes('permission')) {
      areas.add('security');
    }
    if (file.includes('config') || file.includes('env')) {
      areas.add('config');
    }
  }

  return Array.from(areas);
}

/**
 * Get all registered tests from database
 */
async function getRegisteredTests(supabase) {
  const { data: tests, error } = await supabase
    .from('uat_test_cases')
    .select(`
      id,
      test_name,
      description,
      test_type,
      priority,
      automation_status,
      timeout_ms,
      metadata,
      suite_id,
      uat_test_suites (
        suite_name,
        module,
        test_type
      )
    `)
    .eq('automation_status', 'automated');

  if (error) {
    throw new Error(`Failed to fetch tests: ${error.message}`);
  }

  return tests || [];
}

/**
 * Get test run history for flaky detection
 */
async function getTestRunHistory(supabase, limit = 10) {
  const { data: runs, error } = await supabase
    .from('test_runs')
    .select('id, run_type, total_tests, passed, failed, success_rate, start_time, config')
    .order('start_time', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Warning: Could not fetch test run history:', error.message);
    return [];
  }

  return runs || [];
}

/**
 * Get test failures for analysis
 */
async function getTestFailures(supabase, limit = 100) {
  const { data: failures, error } = await supabase
    .from('test_failures')
    .select('test_id, target_component, error_type, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Warning: Could not fetch test failures:', error.message);
    return [];
  }

  return failures || [];
}

/**
 * Calculate risk score for a test
 */
function calculateRiskScore(test, affectedAreas, failureHistory) {
  let score = 0;

  // Base priority score
  const priorityScores = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
  score += priorityScores[test.priority] || 2;

  // Test type score
  const typeScores = { 'security': 4, 'e2e': 3, 'integration': 2, 'unit': 1 };
  score += typeScores[test.test_type] || 1;

  // Affected area match
  const testPath = test.metadata?.file_path || '';
  for (const area of affectedAreas) {
    if (testPath.toLowerCase().includes(area)) {
      score += 3; // Boost for affected areas
    }
  }

  // Recent failure history
  const testFailures = failureHistory.filter(f =>
    f.target_component?.includes(test.test_name) ||
    testPath.includes(f.target_component || '')
  );
  if (testFailures.length > 0) {
    score += Math.min(testFailures.length, 5); // Max +5 for failure history
  }

  return score;
}

/**
 * Detect flaky tests based on history
 */
async function detectFlakyTests(supabase, options) {
  console.log('\n  Detecting Flaky Tests\n');
  console.log('='.repeat(60));

  const failures = await getTestFailures(supabase, 500);

  // Group failures by test/component
  const failureCounts = {};
  for (const failure of failures) {
    const key = failure.target_component || 'unknown';
    if (!failureCounts[key]) {
      failureCounts[key] = { count: 0, errors: new Set() };
    }
    failureCounts[key].count++;
    if (failure.error_message) {
      failureCounts[key].errors.add(failure.error_message.substring(0, 100));
    }
  }

  // Identify flaky tests (multiple failures, inconsistent patterns)
  const flakyTests = [];
  for (const [component, data] of Object.entries(failureCounts)) {
    // Multiple failures with different error messages = likely flaky
    if (data.count >= 2 && data.errors.size >= 2) {
      flakyTests.push({
        component,
        failureCount: data.count,
        uniqueErrors: data.errors.size,
        flakinessScore: data.count * data.errors.size,
        sampleErrors: Array.from(data.errors).slice(0, 3)
      });
    }
  }

  // Sort by flakiness score
  flakyTests.sort((a, b) => b.flakinessScore - a.flakinessScore);

  if (flakyTests.length === 0) {
    console.log('   No flaky tests detected based on failure history.');
    return { flakyTests: [], total: 0 };
  }

  console.log(`   Found ${flakyTests.length} potentially flaky tests:\n`);

  const limit = options.limit || 10;
  for (const test of flakyTests.slice(0, limit)) {
    console.log(`   ${test.component}`);
    console.log(`     Failures: ${test.failureCount}, Unique Errors: ${test.uniqueErrors}`);
    console.log(`     Flakiness Score: ${test.flakinessScore}`);
    if (options.verbose && test.sampleErrors.length > 0) {
      console.log('     Sample errors:');
      test.sampleErrors.forEach(e => console.log(`       - ${e}`));
    }
    console.log();
  }

  return { flakyTests: flakyTests.slice(0, limit), total: flakyTests.length };
}

/**
 * Analyze test patterns
 */
async function analyzeTests(supabase, options) {
  console.log('\n  Analyzing Test Patterns\n');
  console.log('='.repeat(60));

  const tests = await getRegisteredTests(supabase);
  const runs = await getTestRunHistory(supabase, 20);
  const failures = await getTestFailures(supabase, 200);

  // Test distribution
  const byType = {};
  const byPriority = {};
  const bySuite = {};

  for (const test of tests) {
    byType[test.test_type] = (byType[test.test_type] || 0) + 1;
    byPriority[test.priority] = (byPriority[test.priority] || 0) + 1;
    const suiteName = test.uat_test_suites?.suite_name || 'Unknown';
    bySuite[suiteName] = (bySuite[suiteName] || 0) + 1;
  }

  console.log('  Test Distribution:\n');
  console.log('   By Type:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`     ${type}: ${count}`);
  });

  console.log('\n   By Priority:');
  Object.entries(byPriority).forEach(([priority, count]) => {
    console.log(`     ${priority}: ${count}`);
  });

  if (options.verbose) {
    console.log('\n   By Suite:');
    Object.entries(bySuite)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([suite, count]) => {
        console.log(`     ${suite}: ${count}`);
      });
  }

  // Run history analysis
  if (runs.length > 0) {
    const avgSuccessRate = runs.reduce((sum, r) => sum + (r.success_rate || 0), 0) / runs.length;
    const totalFailures = runs.reduce((sum, r) => sum + (r.failed || 0), 0);

    console.log('\n  Run History (last 20):\n');
    console.log(`   Average Success Rate: ${avgSuccessRate.toFixed(1)}%`);
    console.log(`   Total Failures: ${totalFailures}`);
  }

  // Failure patterns
  const failureTypes = {};
  for (const failure of failures) {
    failureTypes[failure.error_type || 'unknown'] = (failureTypes[failure.error_type || 'unknown'] || 0) + 1;
  }

  if (Object.keys(failureTypes).length > 0) {
    console.log('\n  Failure Types:\n');
    Object.entries(failureTypes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`     ${type}: ${count}`);
      });
  }

  return {
    totalTests: tests.length,
    byType,
    byPriority,
    bySuite,
    runs: runs.length,
    failures: failures.length
  };
}

/**
 * Select tests based on criteria
 */
async function selectTests(supabase, options) {
  console.log('\n  Smart Test Selection\n');
  console.log('='.repeat(60));

  const tests = await getRegisteredTests(supabase);
  const failures = await getTestFailures(supabase, 200);

  // Get affected areas from git changes
  let affectedAreas = [];
  if (options.since) {
    const changedFiles = getChangedFiles(options.since);
    affectedAreas = getAffectedAreas(changedFiles);
    console.log(`\n   Changed files since ${options.since}: ${changedFiles.length}`);
    console.log(`   Affected areas: ${affectedAreas.join(', ') || 'none detected'}`);
  }

  // Calculate risk scores
  const scoredTests = tests.map(test => ({
    ...test,
    riskScore: calculateRiskScore(test, affectedAreas, failures)
  }));

  // Filter by minimum risk level
  const minRisk = RISK_PRIORITY[options.risk] || 1;
  let filteredTests = scoredTests.filter(t => {
    const testRisk = RISK_PRIORITY[t.priority] || 2;
    return testRisk >= minRisk;
  });

  // Sort by risk score (highest first)
  filteredTests.sort((a, b) => b.riskScore - a.riskScore);

  // Apply limit
  if (options.limit) {
    filteredTests = filteredTests.slice(0, options.limit);
  }

  // Apply duration limit (estimate based on timeout)
  if (options.duration) {
    let totalDuration = 0;
    filteredTests = filteredTests.filter(t => {
      const testDuration = t.timeout_ms || 30000;
      if (totalDuration + testDuration <= options.duration) {
        totalDuration += testDuration;
        return true;
      }
      return false;
    });
  }

  console.log(`\n   Total registered tests: ${tests.length}`);
  console.log(`   Selected tests: ${filteredTests.length}`);

  if (options.verbose) {
    console.log('\n   Selected tests:');
    filteredTests.slice(0, 20).forEach((t, i) => {
      console.log(`     ${i + 1}. [${t.priority}] ${t.test_name} (score: ${t.riskScore})`);
    });
    if (filteredTests.length > 20) {
      console.log(`     ... and ${filteredTests.length - 20} more`);
    }
  }

  // Generate output file if requested
  if (options.output) {
    const outputData = {
      timestamp: new Date().toISOString(),
      criteria: options,
      affectedAreas,
      totalTests: tests.length,
      selectedTests: filteredTests.map(t => ({
        id: t.id,
        name: t.test_name,
        type: t.test_type,
        priority: t.priority,
        riskScore: t.riskScore,
        filePath: t.metadata?.file_path
      }))
    };

    const outputPath = path.isAbsolute(options.output)
      ? options.output
      : path.join(PROJECT_ROOT, options.output);

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    console.log(`\n   Selection saved to: ${outputPath}`);
  }

  return {
    total: tests.length,
    selected: filteredTests.length,
    tests: filteredTests,
    affectedAreas
  };
}

/**
 * Generate comprehensive selection report
 */
async function generateReport(supabase, options) {
  console.log('\n  Test Selection Report\n');
  console.log('='.repeat(60));

  const analysis = await analyzeTests(supabase, { ...options, verbose: false });
  const flaky = await detectFlakyTests(supabase, { ...options, verbose: false });
  const selection = await selectTests(supabase, { ...options, verbose: false });

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalRegistered: analysis.totalTests,
      totalSelected: selection.selected,
      flakyTests: flaky.total,
      recentRuns: analysis.runs,
      recentFailures: analysis.failures
    },
    distribution: {
      byType: analysis.byType,
      byPriority: analysis.byPriority
    },
    recommendations: []
  };

  // Generate recommendations
  if (flaky.total > 5) {
    report.recommendations.push({
      type: 'flaky_tests',
      severity: 'high',
      message: `${flaky.total} flaky tests detected - consider quarantining or fixing`
    });
  }

  if (analysis.byPriority['critical'] > 0 || analysis.byPriority['high'] > 0) {
    const highPriorityCount = (analysis.byPriority['critical'] || 0) + (analysis.byPriority['high'] || 0);
    report.recommendations.push({
      type: 'priority_tests',
      severity: 'info',
      message: `${highPriorityCount} high/critical priority tests should run on every PR`
    });
  }

  // Save report
  const reportPath = path.join(PROJECT_ROOT, 'test-selection-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n  Report Summary:\n');
  console.log(`   Total Registered: ${report.summary.totalRegistered}`);
  console.log(`   Total Selected: ${report.summary.totalSelected}`);
  console.log(`   Flaky Tests: ${report.summary.flakyTests}`);
  console.log(`   Recent Runs: ${report.summary.recentRuns}`);
  console.log(`   Recent Failures: ${report.summary.recentFailures}`);

  if (report.recommendations.length > 0) {
    console.log('\n  Recommendations:\n');
    report.recommendations.forEach(r => {
      console.log(`   [${r.severity.toUpperCase()}] ${r.message}`);
    });
  }

  console.log(`\n  Report saved to: ${reportPath}`);

  return report;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
Smart Test Selection
SD-TEST-MGMT-SELECTION-001

Usage:
  node scripts/test-selection.js [command] [options]

Commands:
  select      Select tests based on criteria (default)
  flaky       Detect and report flaky tests
  analyze     Analyze test history and patterns
  report      Generate selection report
  help        Show this help message

Options:
  --risk <level>    Minimum risk level (low, medium, high, critical)
  --limit <n>       Maximum number of tests to select
  --duration <ms>   Maximum total duration in ms
  --since <ref>     Git ref for change-based selection
  --output <path>   Output file for selected tests
  --verbose, -v     Show detailed output

Examples:
  node scripts/test-selection.js select --risk high --limit 50
  node scripts/test-selection.js flaky --verbose
  node scripts/test-selection.js analyze
  node scripts/test-selection.js select --since main --output selected-tests.json
`);
}

/**
 * Main function
 */
async function main() {
  console.log('  Smart Test Selection');
  console.log('   SD-TEST-MGMT-SELECTION-001\n');
  console.log('='.repeat(60));

  const { command, options } = parseArgs();

  if (command === 'help') {
    showHelp();
    return;
  }

  try {
    const supabase = getSupabaseClient();

    switch (command) {
      case 'select':
        await selectTests(supabase, options);
        break;
      case 'flaky':
        await detectFlakyTests(supabase, options);
        break;
      case 'analyze':
        await analyzeTests(supabase, options);
        break;
      case 'report':
        await generateReport(supabase, options);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        showHelp();
    }

    console.log('\n  Done!\n');

  } catch (err) {
    console.error(`\n  Error: ${err.message}\n`);
    process.exit(1);
  }
}

// Run main
main().catch(err => {
  console.error('  Error:', err.message);
  process.exit(1);
});
