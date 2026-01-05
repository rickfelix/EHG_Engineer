#!/usr/bin/env node

/**
 * Test Result Capture
 * SD-TEST-MGMT-CICD-001
 *
 * Captures test results from CI/CD runs and stores them in the database.
 * Designed to work with Jest/Vitest JSON reporters and GitHub Actions.
 *
 * Usage:
 *   node scripts/test-result-capture.js [options]
 *
 * Options:
 *   --json <path>     Path to Jest/Vitest JSON results file
 *   --coverage <path> Path to coverage summary JSON
 *   --sd <sd_id>      Link results to a Strategic Directive
 *   --branch <name>   Git branch name (auto-detected if not provided)
 *   --ci              Running in CI environment (enables additional context)
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
  const options = {
    jsonPath: null,
    coveragePath: null,
    sdId: null,
    branch: null,
    ci: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--json':
        options.jsonPath = args[++i];
        break;
      case '--coverage':
        options.coveragePath = args[++i];
        break;
      case '--sd':
        options.sdId = args[++i];
        break;
      case '--branch':
        options.branch = args[++i];
        break;
      case '--ci':
        options.ci = true;
        break;
    }
  }

  return options;
}

/**
 * Get git information
 */
function getGitInfo() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
    const commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();

    return { branch, commit, commitMessage };
  } catch {
    return { branch: 'unknown', commit: 'unknown', commitMessage: '' };
  }
}

/**
 * Parse Jest/Vitest JSON results
 */
function parseTestResults(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Test results file not found: ${jsonPath}`);
  }

  const content = fs.readFileSync(jsonPath, 'utf-8');
  const results = JSON.parse(content);

  // Handle both Jest and Vitest formats
  const testResults = results.testResults || results.files || [];
  const summary = {
    numTotalTests: results.numTotalTests || 0,
    numPassedTests: results.numPassedTests || 0,
    numFailedTests: results.numFailedTests || 0,
    numPendingTests: results.numPendingTests || 0,
    startTime: results.startTime,
    duration: results.duration || 0
  };

  // Calculate from test results if summary not available
  if (!summary.numTotalTests && testResults.length > 0) {
    for (const file of testResults) {
      const tests = file.assertionResults || file.tests || [];
      summary.numTotalTests += tests.length;
      summary.numPassedTests += tests.filter(t => t.status === 'passed').length;
      summary.numFailedTests += tests.filter(t => t.status === 'failed').length;
      summary.numPendingTests += tests.filter(t => t.status === 'pending' || t.status === 'skipped').length;
    }
  }

  // Extract failures
  const failures = [];
  for (const file of testResults) {
    const tests = file.assertionResults || file.tests || [];
    for (const test of tests) {
      if (test.status === 'failed') {
        failures.push({
          testName: test.fullName || test.name || test.title,
          filePath: file.name || file.filePath,
          errorMessage: test.failureMessages?.join('\n') || test.error?.message || 'Unknown error',
          duration: test.duration || 0
        });
      }
    }
  }

  return { summary, failures, testResults };
}

/**
 * Parse coverage summary
 */
function parseCoverage(coveragePath) {
  if (!coveragePath || !fs.existsSync(coveragePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(coveragePath, 'utf-8');
    const coverage = JSON.parse(content);

    // Handle coverage-summary.json format
    const total = coverage.total || coverage;

    return {
      lines: total.lines?.pct || 0,
      statements: total.statements?.pct || 0,
      functions: total.functions?.pct || 0,
      branches: total.branches?.pct || 0
    };
  } catch {
    return null;
  }
}

/**
 * Generate unique run ID
 */
function generateRunId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `run-${timestamp}-${random}`;
}

/**
 * Store test run in database
 */
async function storeTestRun(supabase, runData) {
  const { data, error } = await supabase
    .from('test_runs')
    .insert({
      id: runData.runId,
      run_type: runData.runType,
      total_tests: runData.summary.numTotalTests,
      passed: runData.summary.numPassedTests,
      failed: runData.summary.numFailedTests,
      warnings: runData.summary.numPendingTests,
      success_rate: runData.summary.numTotalTests > 0
        ? (runData.summary.numPassedTests / runData.summary.numTotalTests) * 100
        : 0,
      start_time: new Date(runData.summary.startTime || Date.now()).toISOString(),
      end_time: new Date().toISOString(),
      duration_seconds: Math.round(runData.summary.duration / 1000),
      config: runData.config,
      environment: runData.environment,
      base_url: process.env.BASE_URL || 'http://localhost:3000',
      prd_id: runData.prdId,
      sd_id: runData.sdId,
      agent: 'test-result-capture',
      report_path: runData.jsonPath
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to store test run: ${error.message}`);
  }

  return data;
}

/**
 * Store test failures in database
 */
async function storeFailures(supabase, runId, failures, sdId) {
  if (failures.length === 0) return [];

  const failureRecords = failures.map((failure, index) => ({
    test_id: `${runId}-fail-${index}`,
    test_run_id: runId,
    target_component: failure.filePath,
    error_type: 'test_failure',
    error_message: failure.errorMessage.substring(0, 2000),
    code_location: failure.filePath,
    severity: 'MEDIUM',
    sd_id: sdId
  }));

  const { data, error } = await supabase
    .from('test_failures')
    .insert(failureRecords)
    .select();

  if (error) {
    console.error('Warning: Failed to store some test failures:', error.message);
    return [];
  }

  return data;
}

/**
 * Store coverage metrics
 */
async function storeCoverage(supabase, runId, coverage) {
  if (!coverage) return null;

  const { data, error } = await supabase
    .from('uat_coverage_metrics')
    .insert({
      run_id: runId,
      metric_date: new Date().toISOString().split('T')[0],
      line_coverage_pct: coverage.lines,
      branch_coverage_pct: coverage.branches,
      function_coverage_pct: coverage.functions,
      code_coverage_pct: coverage.statements,
      metadata: { source: 'test-result-capture' }
    })
    .select()
    .single();

  if (error) {
    console.error('Warning: Failed to store coverage:', error.message);
    return null;
  }

  return data;
}

/**
 * Main capture function
 */
async function capture() {
  console.log('📊 Test Result Capture');
  console.log('   SD-TEST-MGMT-CICD-001\n');
  console.log('='.repeat(60));

  const options = parseArgs();
  const gitInfo = getGitInfo();

  // Use provided branch or detect from git
  const branch = options.branch || gitInfo.branch;

  // Auto-detect JSON results if not provided
  let jsonPath = options.jsonPath;
  if (!jsonPath) {
    const possiblePaths = [
      'test-results.json',
      'coverage/test-results.json',
      'jest-results.json'
    ];
    for (const p of possiblePaths) {
      const fullPath = path.join(PROJECT_ROOT, p);
      if (fs.existsSync(fullPath)) {
        jsonPath = fullPath;
        break;
      }
    }
  }

  if (!jsonPath) {
    console.log('\n⚠️  No test results file found.');
    console.log('   Run tests with JSON reporter first:');
    console.log('   npm test -- --json --outputFile=test-results.json');
    return;
  }

  console.log(`\n📂 Loading results from: ${jsonPath}`);
  console.log(`   Branch: ${branch}`);
  console.log(`   Commit: ${gitInfo.commit.substring(0, 8)}`);

  // Parse test results
  const { summary, failures } = parseTestResults(jsonPath);

  console.log('\n📊 TEST SUMMARY');
  console.log(`   Total: ${summary.numTotalTests}`);
  console.log(`   Passed: ${summary.numPassedTests}`);
  console.log(`   Failed: ${summary.numFailedTests}`);
  console.log(`   Pending: ${summary.numPendingTests}`);

  // Parse coverage if available
  let coveragePath = options.coveragePath;
  if (!coveragePath) {
    const defaultCoveragePath = path.join(PROJECT_ROOT, 'coverage/coverage-summary.json');
    if (fs.existsSync(defaultCoveragePath)) {
      coveragePath = defaultCoveragePath;
    }
  }

  const coverage = parseCoverage(coveragePath);
  if (coverage) {
    console.log('\n📈 COVERAGE');
    console.log(`   Lines: ${coverage.lines}%`);
    console.log(`   Branches: ${coverage.branches}%`);
    console.log(`   Functions: ${coverage.functions}%`);
  }

  // Store in database
  console.log('\n💾 Storing results in database...');

  try {
    const supabase = getSupabaseClient();
    const runId = generateRunId();

    const runData = {
      runId,
      runType: options.ci ? 'automated' : 'manual',
      summary,
      jsonPath,
      sdId: options.sdId,
      prdId: options.sdId ? `PRD-${options.sdId}` : null,
      environment: options.ci ? 'ci' : 'local',
      config: {
        branch,
        commit: gitInfo.commit,
        commitMessage: gitInfo.commitMessage,
        ci: options.ci,
        github_run_id: process.env.GITHUB_RUN_ID,
        github_workflow: process.env.GITHUB_WORKFLOW
      }
    };

    const run = await storeTestRun(supabase, runData);
    console.log(`   ✅ Test run stored: ${runId}`);

    if (failures.length > 0) {
      const storedFailures = await storeFailures(supabase, runId, failures, options.sdId);
      console.log(`   ✅ Failures stored: ${storedFailures.length}`);
    }

    if (coverage) {
      // For coverage, we need to get the run UUID
      const { data: runRecord } = await supabase
        .from('uat_test_runs')
        .select('id')
        .eq('run_id', runId)
        .single();

      if (runRecord) {
        await storeCoverage(supabase, runRecord.id, coverage);
        console.log('   ✅ Coverage metrics stored');
      }
    }

    // Generate summary report
    const report = {
      timestamp: new Date().toISOString(),
      runId,
      branch,
      commit: gitInfo.commit,
      summary,
      coverage,
      failures: failures.length,
      sdId: options.sdId
    };

    const reportPath = path.join(PROJECT_ROOT, 'test-capture-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n✅ Test results captured successfully!\n');
}

// Run capture
capture().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
