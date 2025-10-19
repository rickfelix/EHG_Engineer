#!/usr/bin/env node
/**
 * Autonomous Real Testing Campaign
 * Tests all completed SDs with REAL Vitest and Playwright tests
 * Runs fully autonomous for hours, compiling results in database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Simple inline failure extractor (avoiding module import complexity)
function extractFailuresFromOutput(output) {
  const failures = [];

  // Extract unit test failures (Vitest format)
  const vitestFailRegex = /FAIL\s+(.+?)\n.*?(?:Error|Expected):\s*(.+?)(?:\n|$)/gs;
  let match;
  while ((match = vitestFailRegex.exec(output)) !== null) {
    failures.push({
      framework: 'vitest',
      test_file: match[1].trim(),
      error_message: match[2].trim().substring(0, 200)
    });
  }

  // Extract E2E test failures (Playwright format)
  const playwrightFailRegex = /\d+\)\s+\[.+?\]\s+›\s+(.+?\.spec\.ts).*?›\s+(.+?)\n.*?Error:\s*(.+?)(?:\n|$)/gs;
  while ((match = playwrightFailRegex.exec(output)) !== null) {
    failures.push({
      framework: 'playwright',
      test_file: match[1].trim(),
      test_name: match[2].trim(),
      error_message: match[3].trim().substring(0, 200)
    });
  }

  return failures;
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const LOG_DIR = '/tmp';
const ERROR_LOG = path.join(LOG_DIR, 'batch-test-errors.log');
const PROGRESS_LOG = path.join(LOG_DIR, 'batch-test-progress.log');
const HEARTBEAT_FILE = path.join(LOG_DIR, 'campaign-heartbeat.txt');
const CHECKPOINT_FILE = path.join(LOG_DIR, 'campaign-checkpoint.json');
const STATUS_FILE = path.join(LOG_DIR, 'campaign-status.json');
const ALERT_LOG = path.join(LOG_DIR, 'campaign-alerts.log');

function logError(sd_id, error) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${sd_id}: ${error}\n`;
  fs.appendFileSync(ERROR_LOG, logEntry);
}

function logProgress(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(PROGRESS_LOG, logEntry);
  console.log(message);
}

function updateHeartbeat(currentSD, tested, total, status = 'running') {
  const heartbeat = {
    timestamp: Date.now(),
    iso_time: new Date().toISOString(),
    current_sd: currentSD,
    progress: `${tested}/${total}`,
    percent: ((tested / total) * 100).toFixed(1),
    status,
    pid: process.pid,
    target_application: process.env.TARGET_APPLICATION || 'EHG'
  };
  fs.writeFileSync(HEARTBEAT_FILE, JSON.stringify(heartbeat, null, 2));
}

function saveCheckpoint(tested, total, passed, failed, errors, lastSD) {
  const checkpoint = {
    timestamp: Date.now(),
    iso_time: new Date().toISOString(),
    tested,
    total,
    passed,
    failed,
    errors,
    last_sd: lastSD,
    can_resume: true
  };
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

function updateStatus(status, message = '') {
  const statusData = {
    status, // RUNNING, HEALTHY, WARNING, FAILED, COMPLETE
    message,
    timestamp: Date.now(),
    iso_time: new Date().toISOString()
  };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2));
}

function logAlert(message, severity = 'warning') {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${severity.toUpperCase()}: ${message}\n`;
  fs.appendFileSync(ALERT_LOG, logEntry);
  console.log(`⚠️  ALERT [${severity}]: ${message}`);
}

async function storeTestResults(sd_id, testResults) {
  try {
    // Add timeout to prevent hanging on database operations
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database operation timeout (30s)')), 30000)
    );

    const {
      unit_test_count = 0,
      unit_tests_passed = 0,
      unit_tests_failed = 0,
      e2e_test_count = 0,
      e2e_tests_passed = 0,
      e2e_tests_failed = 0,
      total_duration_seconds = 0,
      coverage_percentage = null,
      overall_verdict = 'UNKNOWN'
    } = testResults;

    const total_tests = unit_test_count + e2e_test_count;
    const total_passed = unit_tests_passed + e2e_tests_passed;
    const total_failed = unit_tests_failed + e2e_tests_failed;
    const pass_rate = total_tests > 0 ? (total_passed / total_tests) * 100 : 0;

    // Build detailed testing notes with failure information
    let detailedNotes = `Real Testing: Unit (${unit_tests_passed}/${unit_test_count}), E2E (${e2e_tests_passed}/${e2e_test_count}), Coverage: ${coverage_percentage?.toFixed(1) || 'N/A'}%, Verdict: ${overall_verdict}`;

    // Add failure details if any
    if (testResults.failures && testResults.failures.length > 0) {
      detailedNotes += '\n\nFAILURES:\n';
      testResults.failures.forEach((failure, idx) => {
        const num = idx + 1;
        const framework = failure.framework || 'unknown';
        const file = failure.test_file || failure.test_name || 'unknown';
        const error = failure.error_message || 'No error message';
        detailedNotes += `${num}. [${framework}] ${file}: ${error}\n`;
      });
    }

    // Prepare test_results JSONB with error details for remediation
    const test_results_payload = {};

    // Add failures if present
    if (testResults.failures && testResults.failures.length > 0) {
      test_results_payload.failures = testResults.failures;
    }

    // Add detailed error information for remediation (if error occurred)
    if (testResults.error) {
      test_results_payload.error = {
        message: testResults.error,
        details: testResults.error_details || null,
        timestamp: new Date().toISOString()
      };
    }

    // Race database operation against timeout
    const upsertPromise = supabase.from('sd_testing_status').upsert({
      sd_id: sd_id,
      tested: true,
      test_count: total_tests,
      tests_passed: total_passed,
      tests_failed: total_failed,
      test_pass_rate: pass_rate,
      test_framework: 'qa-director-v2-real',
      test_duration_seconds: Math.round(total_duration_seconds),
      testing_sub_agent_used: true,
      testing_notes: detailedNotes.substring(0, 2000), // Limit to 2000 chars
      last_tested_at: new Date().toISOString(),
      updated_by: 'QA Engineering Director v2.0 - Real Testing Campaign',
      // Store all test results including detailed error info in JSONB field
      test_results: Object.keys(test_results_payload).length > 0 ? test_results_payload : null
    }, { onConflict: 'sd_id' });

    const { error } = await Promise.race([upsertPromise, timeoutPromise]);

    if (error) {
      logError(sd_id, `Database update failed: ${error.message}`);
      return false;
    }

    return true;
  } catch (err) {
    logError(sd_id, `Store results error: ${err.message}`);
    return false;
  }
}

async function runRealTests(sd_id, attempt = 1) {
  const MAX_RETRIES = 1;
  const results = {
    unit_test_count: 0,
    unit_tests_passed: 0,
    unit_tests_failed: 0,
    e2e_test_count: 0,
    e2e_tests_passed: 0,
    e2e_tests_failed: 0,
    total_duration_seconds: 0,
    coverage_percentage: null,
    overall_verdict: 'UNKNOWN',
    error: null,
    failures: []
  };

  try {
    logProgress(`   Executing QA Director for ${sd_id}...`);

    // Check for smoke-only mode (fast testing)
    const smokeOnly = process.env.SMOKE_ONLY === 'true';
    const qaFlags = smokeOnly ? '--skip-build --smoke-only' : '--skip-build';

    if (smokeOnly) {
      logProgress(`   ⚡ FAST MODE: Smoke tests only (~60s)`);
    }

    // Use try-catch for execSync since QA director exits with code 1 on test failures
    let output;
    try {
      output = execSync(
        `node scripts/qa-engineering-director-enhanced.js ${sd_id} ${qaFlags}`,
        {
          cwd: '/mnt/c/_EHG/EHG_Engineer',
          encoding: 'utf8',
          timeout: 3600000, // 60 min max per SD
          stdio: 'pipe'
        }
      );
    } catch (execError) {
      // QA director exits with code 1 when tests fail - this is EXPECTED behavior
      // The output still contains all test results, so we can parse them
      output = execError.stdout || '';

      // Only throw if this is a real execution error (not just test failures)
      if (!output || output.length < 100) {
        // Real error - no meaningful output
        throw execError;
      }

      // Log that tests failed but QA director completed successfully
      logProgress(`   ℹ️  QA Director completed (tests failed, exit code ${execError.status})`);
    }

    // Parse QA Director output for test results
    // Look for smoke test results
    const smokeMatch = output.match(/Unit tests (PASSED|FAILED) \((\d+)\/(\d+) tests, ([\d.]+)s\)/);
    if (smokeMatch) {
      results.unit_tests_passed = parseInt(smokeMatch[2]);
      results.unit_test_count = parseInt(smokeMatch[3]);
      results.unit_tests_failed = results.unit_test_count - results.unit_tests_passed;
      results.total_duration_seconds += parseFloat(smokeMatch[4]);
    }

    // Look for coverage
    const coverageMatch = output.match(/Coverage: ([\d.]+)%/);
    if (coverageMatch) {
      results.coverage_percentage = parseFloat(coverageMatch[1]);
    }

    // Look for E2E test results
    const e2eMatch = output.match(/E2E tests (PASSED|FAILED) \((\d+)\/(\d+) tests, (\d+)m (\d+)s\)/);
    if (e2eMatch) {
      results.e2e_tests_passed = parseInt(e2eMatch[2]);
      results.e2e_test_count = parseInt(e2eMatch[3]);
      results.e2e_tests_failed = results.e2e_test_count - results.e2e_tests_passed;
      const minutes = parseInt(e2eMatch[4]);
      const seconds = parseInt(e2eMatch[5]);
      results.total_duration_seconds += (minutes * 60) + seconds;
    }

    // Extract failure details from output
    if (results.unit_tests_failed > 0 || results.e2e_tests_failed > 0) {
      results.failures = extractFailuresFromOutput(output);
    }

    // Determine overall verdict
    const totalFailed = results.unit_tests_failed + results.e2e_tests_failed;
    results.overall_verdict = totalFailed === 0 ? 'PASS' : 'FAIL';

    return results;

  } catch (error) {
    // Capture detailed error information for remediation
    const errorDetails = {
      message: error.message,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      stack: error.stack || '',
      attempt: attempt
    };

    // Log detailed error (multi-line for readability)
    const detailedLog = [
      `[ERROR] SD: ${sd_id} (attempt ${attempt})`,
      `Message: ${error.message}`,
      error.stdout ? `\nSTDOUT:\n${error.stdout}` : '',
      error.stderr ? `\nSTDERR:\n${error.stderr}` : '',
      error.stack ? `\nSTACK:\n${error.stack}` : '',
      '\n' + '='.repeat(80) + '\n'
    ].filter(Boolean).join('\n');

    logError(sd_id, detailedLog);

    // Retry once on timeout/network errors
    if (attempt < MAX_RETRIES && (error.message.includes('timeout') || error.message.includes('ECONNREFUSED'))) {
      logProgress(`   Retrying ${sd_id} (attempt ${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
      return runRealTests(sd_id, attempt + 1);
    }

    results.error = error.message;
    results.error_details = errorDetails;
    results.overall_verdict = 'ERROR';
    return results;
  }
}

async function batchTestCompletedSDsReal() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔬 AUTONOMOUS REAL TESTING CAMPAIGN');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Initialize log files
    fs.writeFileSync(ERROR_LOG, `Real Testing Campaign Started: ${new Date().toISOString()}\n`);
    fs.writeFileSync(PROGRESS_LOG, `Real Testing Campaign Started: ${new Date().toISOString()}\n`);
    updateStatus('RUNNING', 'Campaign initialization');

    // Get application filter from environment or default to EHG
    const targetApp = process.env.TARGET_APPLICATION || 'EHG';
    logProgress(`🎯 Target Application: ${targetApp}`);

    // Get all completed untested SDs for target application
    const testLimit = process.env.TEST_LIMIT ? parseInt(process.env.TEST_LIMIT) : null;

    let query = supabase
      .from('v_untested_sds')
      .select('id, title, testing_priority, target_application')
      .eq('status', 'completed')
      .eq('tested', false)
      .eq('target_application', targetApp)
      .order('testing_priority', { ascending: false });

    if (testLimit) {
      query = query.limit(testLimit);
    }

    const { data: sds, error } = await query;

    if (error) {
      console.error('❌ Error querying SDs:', error.message);
      updateStatus('FAILED', `Query failed: ${error.message}`);
      logAlert(`Failed to query SDs: ${error.message}`, 'critical');
      return;
    }

    if (sds.length === 0) {
      logProgress('✅ No SDs need testing - all are up to date!');
      updateStatus('COMPLETE', 'No SDs to test');
      return;
    }

    const limitMsg = testLimit ? ` (limited to ${testLimit})` : '';
    logProgress(`📊 Found ${sds.length} completed ${targetApp} SDs needing REAL testing${limitMsg}`);
    logProgress(`⏱️  Estimated runtime: ${Math.round(sds.length * 5 / 60)} hours (5 min avg per SD)\n`);
    updateStatus('HEALTHY', `Testing ${sds.length} ${targetApp} SDs${limitMsg}`);

    const startTime = Date.now();
    let tested = 0;
    let passed = 0;
    let failed = 0;
    let errors = 0;

    for (const sd of sds) {
      tested++;
      const sdStartTime = Date.now();

      // Update heartbeat BEFORE starting SD
      updateHeartbeat(sd.id, tested, sds.length, 'running');

      logProgress(`\n[${ tested}/${sds.length}] Testing: ${sd.id}`);
      logProgress(`   Title: ${sd.title}`);
      logProgress(`   Priority: ${sd.testing_priority}`);

      // Run real tests with error handling
      let testResults;
      try {
        testResults = await runRealTests(sd.id);
      } catch (err) {
        logError(sd.id, `Unexpected error during test execution: ${err.message}`);
        logAlert(`Critical test failure on ${sd.id}: ${err.message}`, 'critical');
        testResults = {
          overall_verdict: 'ERROR',
          error: err.message,
          unit_test_count: 0,
          unit_tests_passed: 0,
          unit_tests_failed: 0,
          e2e_test_count: 0,
          e2e_tests_passed: 0,
          e2e_tests_failed: 0,
          total_duration_seconds: 0,
          coverage_percentage: null,
          failures: []
        };
      }

      // Store results in database
      logProgress(`   💾 Storing test results in database...`);
      const stored = await storeTestResults(sd.id, testResults);
      if (stored) {
        logProgress(`   ✅ Results stored successfully`);
      } else {
        logProgress(`   ⚠️  Database storage failed (continuing anyway)`);
      }

      // Update counters
      const sdDuration = (Date.now() - sdStartTime) / 1000;
      if (testResults.overall_verdict === 'PASS') {
        passed++;
        logProgress(`   ✅ PASSED - Unit: ${testResults.unit_tests_passed}/${testResults.unit_test_count}, E2E: ${testResults.e2e_tests_passed}/${testResults.e2e_test_count} (${sdDuration.toFixed(0)}s)`);
      } else if (testResults.overall_verdict === 'FAIL') {
        failed++;
        logProgress(`   ❌ FAILED - ${testResults.unit_tests_failed + testResults.e2e_tests_failed} test failures (${sdDuration.toFixed(0)}s)`);
        if (failed > tested * 0.5) {
          logAlert(`High failure rate: ${failed}/${tested} SDs failing`, 'warning');
        }
      } else {
        errors++;
        logProgress(`   ⚠️  ERROR - ${testResults.error || 'Unknown error'} (${sdDuration.toFixed(0)}s)`);
        if (errors > tested * 0.3) {
          logAlert(`High error rate: ${errors}/${tested} SDs with errors`, 'warning');
        }
      }

      if (!stored) {
        logProgress(`   ⚠️  Failed to store results in database`);
        logAlert(`Failed to store results for ${sd.id}`, 'warning');
      }

      // Save checkpoint after EACH SD
      saveCheckpoint(tested, sds.length, passed, failed, errors, sd.id);

      // Progress update every 10 SDs
      if (tested % 10 === 0) {
        const elapsed = (Date.now() - startTime) / 1000 / 60; // minutes
        const avgTime = elapsed / tested;
        const remaining = (sds.length - tested) * avgTime;

        logProgress(`\n📊 Progress Report:`);
        logProgress(`   Completed: ${tested}/${sds.length} (${((tested/sds.length)*100).toFixed(1)}%)`);
        logProgress(`   ✅ Passed: ${passed} (${((passed/tested)*100).toFixed(1)}%)`);
        logProgress(`   ❌ Failed: ${failed} (${((failed/tested)*100).toFixed(1)}%)`);
        logProgress(`   ⚠️  Errors: ${errors} (${((errors/tested)*100).toFixed(1)}%)`);
        logProgress(`   ⏱️  Elapsed: ${elapsed.toFixed(0)}m, Remaining: ~${remaining.toFixed(0)}m\n`);

        updateStatus('HEALTHY', `Progress: ${tested}/${sds.length}, ${passed} passed`);
      }
    }

    const totalDuration = (Date.now() - startTime) / 1000 / 60; // minutes

    logProgress('\n═══════════════════════════════════════════════════════════');
    logProgress('🎉 REAL TESTING CAMPAIGN COMPLETE');
    logProgress('═══════════════════════════════════════════════════════════');
    logProgress(`\n📊 Final Results:`);
    logProgress(`   Total SDs Tested: ${tested}`);
    logProgress(`   ✅ Passed: ${passed} (${((passed/tested)*100).toFixed(1)}%)`);
    logProgress(`   ❌ Failed: ${failed} (${((failed/tested)*100).toFixed(1)}%)`);
    logProgress(`   ⚠️  Errors: ${errors} (${((errors/tested)*100).toFixed(1)}%)`);
    logProgress(`   ⏱️  Total Time: ${totalDuration.toFixed(0)} minutes (${(totalDuration/60).toFixed(1)} hours)`);
    logProgress(`\n📝 Logs saved to:`);
    logProgress(`   Progress: ${PROGRESS_LOG}`);
    logProgress(`   Errors: ${ERROR_LOG}\n`);

    updateHeartbeat('COMPLETE', tested, sds.length, 'complete');
    updateStatus('COMPLETE', `Tested ${tested} SDs: ${passed} passed, ${failed} failed, ${errors} errors`);

  } catch (err) {
    logError('FATAL', `Campaign crashed: ${err.message}\n${err.stack}`);
    logAlert(`FATAL: Campaign crashed - ${err.message}`, 'critical');
    updateStatus('FAILED', `Fatal error: ${err.message}`);
    updateHeartbeat('CRASHED', 0, 0, 'crashed');
    throw err;
  }
}

// Process signal handlers for graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  Received SIGTERM - shutting down gracefully...');
  logAlert('Campaign terminated via SIGTERM', 'warning');
  updateStatus('TERMINATED', 'Received SIGTERM signal');
  updateHeartbeat('TERMINATED', 0, 0, 'terminated');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  Received SIGINT (Ctrl+C) - shutting down gracefully...');
  logAlert('Campaign interrupted via SIGINT', 'warning');
  updateStatus('INTERRUPTED', 'Received SIGINT signal');
  updateHeartbeat('INTERRUPTED', 0, 0, 'interrupted');
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  console.error('\n💥 UNCAUGHT EXCEPTION:', err);
  logError('UNCAUGHT_EXCEPTION', `${err.message}\n${err.stack}`);
  logAlert(`Uncaught exception: ${err.message}`, 'critical');
  updateStatus('CRASHED', `Uncaught exception: ${err.message}`);
  updateHeartbeat('CRASHED', 0, 0, 'crashed');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 UNHANDLED PROMISE REJECTION:', reason);
  logError('UNHANDLED_REJECTION', `${reason}`);
  logAlert(`Unhandled promise rejection: ${reason}`, 'critical');
  updateStatus('CRASHED', `Unhandled rejection: ${reason}`);
  updateHeartbeat('CRASHED', 0, 0, 'crashed');
  process.exit(1);
});

// Run the campaign
console.log(`\n🔍 Process ID: ${process.pid}`);
console.log(`📁 Monitoring files:`);
console.log(`   Heartbeat: ${HEARTBEAT_FILE}`);
console.log(`   Checkpoint: ${CHECKPOINT_FILE}`);
console.log(`   Status: ${STATUS_FILE}`);
console.log(`   Alerts: ${ALERT_LOG}\n`);

batchTestCompletedSDsReal().catch(err => {
  console.error('Fatal error:', err);
  logError('FATAL', err.message);
  updateStatus('FAILED', `Fatal error: ${err.message}`);
  updateHeartbeat('FAILED', 0, 0, 'failed');
  process.exit(1);
});
