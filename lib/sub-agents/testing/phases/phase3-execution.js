/**
 * Phase 3: E2E Test Execution
 *
 * Executes Playwright E2E tests and handles cached results.
 *
 * Extracted from TESTING sub-agent v3.0
 * SD: SD-LEO-REFAC-TESTING-INFRA-001
 */

import { spawn } from 'child_process';
import { mkdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  suggestTroubleshootingTactics,
  logTroubleshootingTactics
} from '../utils/troubleshooting.js';

const DEFAULT_E2E_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Execute E2E tests
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} options - Execution options
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} Test execution results
 */
export async function executeE2ETests(sdId, options, supabase) {
  console.log('   🎭 Executing Playwright E2E tests...');

  const results = {
    tests_executed: 0,
    tests_passed: 0,
    failed_tests: 0,
    skipped_tests: 0,
    execution_time_ms: 0,
    failures: [],
    report_url: null,
    troubleshooting_tactics: []
  };

  try {
    if (options.full_e2e) {
      console.log('      🚀 Full E2E suite requested — executing Playwright');
      const e2eResults = await runFullE2ESuite(sdId, options);
      Object.assign(results, e2eResults);
      const icon = results.failed_tests === 0 && !results.error ? '✅' : '❌';
      console.log(`      ${icon} E2E: ${results.tests_passed}/${results.tests_executed} passed, ${results.failed_tests} failed, ${results.skipped_tests} skipped (${Math.round(results.execution_time_ms / 1000)}s)`);
    } else {
      console.log('      ℹ️  Full E2E suite not requested (use --full-e2e flag)');
      console.log('      💡 Checking for existing test evidence...');

      // Check database for previous test results
      const cachedResults = await getCachedTestResults(sdId, supabase);

      if (cachedResults) {
        Object.assign(results, cachedResults);
      } else {
        console.log('      ⚠️  No previous test evidence found');
        console.log('      💡 Run tests with --full-e2e flag to execute E2E suite');
      }
    }
  } catch (error) {
    console.error(`      ❌ Test execution error: ${error.message}`);
    results.error = error.message;

    // Provide troubleshooting guidance
    results.troubleshooting_tactics = suggestTroubleshootingTactics(error);
    logTroubleshootingTactics(results.troubleshooting_tactics);
  }

  return results;
}

/**
 * Run the full Playwright E2E suite for real and parse the JSON report.
 * Was a simulated no-op (hard-coded 10/10 pass) until QF-20260713-266.
 */
export async function runFullE2ESuite(sdId, options = {}) {
  const evidenceDir = path.join('tests', 'e2e', 'evidence', String(sdId));
  mkdirSync(evidenceDir, { recursive: true });
  const jsonReportPath = path.join(evidenceDir, 'playwright-results.json');
  const timeoutMs = options.e2e_timeout_ms || DEFAULT_E2E_TIMEOUT_MS;
  const startedAt = Date.now();

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn('npx', ['playwright', 'test', '--config=playwright.config.js', '--reporter=json'], {
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonReportPath },
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: process.platform === 'win32'
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`E2E suite timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code ?? 1); });
  });

  const report = JSON.parse(readFileSync(jsonReportPath, 'utf8'));
  const stats = report.stats || {};
  const failures = [];
  for (const suite of report.suites || []) collectFailures(suite, failures);

  const parsed = {
    tests_executed: (stats.expected || 0) + (stats.unexpected || 0) + (stats.flaky || 0),
    tests_passed: (stats.expected || 0) + (stats.flaky || 0),
    failed_tests: stats.unexpected || 0,
    skipped_tests: stats.skipped || 0,
    execution_time_ms: Math.round(stats.duration || (Date.now() - startedAt)),
    failures: failures.slice(0, 20),
    report_url: jsonReportPath
  };
  // Non-zero exit with zero reported failures = config/infra error, never a pass
  if (exitCode !== 0 && parsed.failed_tests === 0) {
    parsed.error = `Playwright exited ${exitCode} with no failing tests in report — config/infra error, not a pass`;
  }
  return parsed;
}

/** Recursively collect failed specs from a Playwright JSON-report suite. */
export function collectFailures(suite, failures) {
  for (const spec of suite.specs || []) {
    if (spec.ok === false) failures.push({ test: spec.title, file: spec.file, line: spec.line });
  }
  for (const child of suite.suites || []) collectFailures(child, failures);
}

/**
 * Get cached test results from database
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object|null>} Cached results or null
 */
async function getCachedTestResults(sdId, supabase) {
  const { data: previousTest, error } = await supabase
    .from('sub_agent_execution_results')
    .select('id, sd_id, sub_agent_code, verdict, confidence, metadata, created_at')
    .eq('sd_id', sdId)
    .eq('sub_agent_code', 'TESTING')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !previousTest) return null;

  // Check if cached results are recent (within 1 hour)
  const testAge = Date.now() - new Date(previousTest.created_at).getTime();
  const oneHour = 60 * 60 * 1000;
  const isRecent = testAge < oneHour;

  console.log('      ✅ Found previous test execution');
  console.log(`         Verdict: ${previousTest.verdict}`);
  console.log(`         Date: ${previousTest.created_at}`);
  console.log(`         Age: ${Math.floor(testAge / 1000 / 60)} minutes ago`);

  if (!isRecent) {
    console.log('      ⏰ Cached results too old (> 1 hour)');
    console.log('      💡 Re-run tests with --full-e2e flag for fresh results');
    return null;
  }

  console.log('      ♻️  Using cached results (< 1 hour old)');

  // Extract test execution data with size validation
  const rawCachedData = previousTest.metadata?.findings?.phase3_execution || previousTest.metadata || {};
  const cachedDataSize = JSON.stringify(rawCachedData).length;
  const MAX_CACHE_SIZE = 50000; // 50 KB threshold

  let cachedData = rawCachedData;
  if (cachedDataSize > MAX_CACHE_SIZE) {
    console.log(`      ⚠️  Cached data too large (${Math.round(cachedDataSize / 1024)} KB > ${MAX_CACHE_SIZE / 1024} KB threshold)`);
    console.log('      💡 Extracting only essential fields to prevent bloat');
    cachedData = {
      tests_executed: rawCachedData.tests_executed || 0,
      tests_passed: rawCachedData.tests_passed || 0,
      failed_tests: rawCachedData.failed_tests || 0,
      _size_limited: true,
      _original_size_kb: Math.round(cachedDataSize / 1024)
    };
  }

  const results = {
    tests_executed: cachedData.tests_executed || 0,
    tests_passed: cachedData.tests_passed || 0,
    failed_tests: cachedData.failed_tests || 0,
    from_cache: true,
    cache_age_minutes: Math.floor(testAge / 1000 / 60)
  };

  // QF/F2 SD-LEO-INFRA-LEADFINAL-ACCEPTANCE-INTEGRITY-001-B
  // Do NOT fabricate a synthetic 1/1-passed from a bare prior PASS/CONDITIONAL_PASS
  // verdict that carried no real execution counts. Synthesizing tests_executed:1 from a
  // verdict-with-no-numbers manufactured evidence out of thin air, which let phase5
  // generateVerdict treat "we once said PASS" as "tests ran and passed". A verdict
  // without real execution counts is zero evidence: only the real cachedData counts
  // extracted above are carried forward; otherwise tests_executed stays 0 so phase5
  // correctly treats it as no-evidence (non-passing). Fail-soft: we only log.
  if (results.tests_executed === 0 && (previousTest.verdict === 'PASS' || previousTest.verdict === 'CONDITIONAL_PASS')) {
    console.log('      ⚠️  Cached verdict found but real execution counts are missing');
    console.log('      💡 Not fabricating synthetic results - leaving tests_executed:0 (no evidence)');
  }

  return results;
}
