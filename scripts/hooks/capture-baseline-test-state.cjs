#!/usr/bin/env node

/**
 * Capture Baseline Test State Hook
 * SD-CLAUDE-CODE-2.1.0-LEO-001 - Phase 3 Baseline Integration
 *
 * PreToolUse (once: true) hook that captures the current test state at session
 * start. This baseline allows distinguishing pre-existing failures from new
 * failures introduced during the session.
 *
 * Hook Type: PreToolUse (once: true)
 * Purpose: Capture test baseline for comparison
 * User Story: SD-CLAUDE-CODE-2-1-0-LEO-001:US-002
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const SESSION_STATE_FILE = path.join(process.env.HOME || '/tmp', '.claude-session-state.json');
const ENGINEER_DIR = '.';
const APP_DIR = '../ehg';

/**
 * Load current session state
 */
function loadSessionState() {
  try {
    if (fs.existsSync(SESSION_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf8'));
    }
  } catch (error) {
    console.error('[capture-baseline] Error loading session state:', error.message);
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
    console.error('[capture-baseline] Error saving session state:', error.message);
  }
}

/**
 * Run unit tests and capture results.
 *
 * SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001 (FR-4): the engineer baseline targets
 * the no-DB `unit` vitest project (testScript='test:unit') so the capture
 * terminates deterministically (db-dir suites that previously hung against the
 * test.invalid.local sentinel now live in the opt-in `db` project). The vitest
 * JSON report is written to a temp file via --outputFile (not stdout) so a
 * 16k-test report cannot overflow execSync's default maxBuffer. A non-zero exit
 * (tests failed) is EXPECTED — the JSON file is still written, so we parse it
 * regardless and only treat a missing/unparseable file as a capture failure.
 *
 * The delta-comparison model (compare-test-baseline.cjs) only flags NEW
 * failures beyond this recorded baseline, so a stable non-zero `failed` count
 * is fine — it is the denominator, not a pass/fail gate.
 *
 * @param {string} workingDir
 * @param {string} [testScript='test'] npm script to run (engineer uses 'test:unit')
 */
function captureUnitTestState(workingDir, testScript = 'test') {
  const outFile = path.join(
    os.tmpdir(),
    `vitest-baseline-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );
  try {
    execSync(`npm run ${testScript} -- --reporter=json --outputFile=${JSON.stringify(outFile)}`, {
      cwd: workingDir,
      timeout: 480000, // 8 min — unit project completes deterministically (~6 min for ~1.2k files)
      stdio: 'ignore', // results go to outFile; keeps execSync off the maxBuffer path
    });
  } catch {
    // Non-zero exit (failing tests) or timeout: fall through and try the JSON file,
    // which vitest writes even when tests fail.
  }

  try {
    const json = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    try { fs.unlinkSync(outFile); } catch { /* best-effort cleanup */ }
    return {
      passed: json.numPassedTests ?? 0,
      failed: json.numFailedTests ?? 0,
      skipped: (json.numPendingTests ?? 0) + (json.numTodoTests ?? 0),
      total: json.numTotalTests ?? 0,
      test_files_failed: json.numFailedTestSuites ?? 0,
      project: testScript,
    };
  } catch (error) {
    try { fs.unlinkSync(outFile); } catch { /* best-effort cleanup */ }
    return { error: error.message, captured: false };
  }
}

/**
 * Run TypeScript type check
 */
function captureTypeCheckState(workingDir) {
  try {
    const result = execSync('npx tsc --noEmit 2>&1 | head -50 || true', {
      encoding: 'utf8',
      cwd: workingDir,
      timeout: 60000
    });

    const errorCount = (result.match(/error TS/g) || []).length;
    return {
      errors: errorCount,
      sample_errors: result.substring(0, 500),
      passed: errorCount === 0
    };
  } catch (error) {
    return { error: error.message, captured: false };
  }
}

/**
 * Capture lint state
 */
function captureLintState(workingDir) {
  try {
    const result = execSync('npm run lint 2>&1 | tail -20 || true', {
      encoding: 'utf8',
      cwd: workingDir,
      timeout: 30000
    });

    const errorMatch = result.match(/(\d+)\s+error/i);
    const warnMatch = result.match(/(\d+)\s+warning/i);

    return {
      errors: errorMatch ? parseInt(errorMatch[1]) : 0,
      warnings: warnMatch ? parseInt(warnMatch[1]) : 0,
      sample_output: result.substring(0, 500)
    };
  } catch (error) {
    return { error: error.message, captured: false };
  }
}

/**
 * Capture full baseline state
 */
function captureBaseline() {
  console.log('[capture-baseline] Capturing test baseline...');

  const baseline = {
    captured_at: new Date().toISOString(),
    engineer: {
      // FR-4: capture the no-DB `unit` project (deterministic), not the full
      // suite (which hung against the test.invalid.local sentinel).
      unit_tests: captureUnitTestState(ENGINEER_DIR, 'test:unit'),
      type_check: captureTypeCheckState(ENGINEER_DIR)
    },
    app: {
      unit_tests: captureUnitTestState(APP_DIR),
      type_check: captureTypeCheckState(APP_DIR),
      lint: captureLintState(APP_DIR)
    }
  };

  // Summarize baseline
  baseline.summary = {
    engineer_tests_passing: baseline.engineer.unit_tests.failed === 0,
    engineer_types_clean: baseline.engineer.type_check.passed === true,
    app_tests_passing: baseline.app.unit_tests.failed === 0,
    app_types_clean: baseline.app.type_check.passed === true,
    app_lint_clean: baseline.app.lint.errors === 0
  };

  baseline.all_clean = Object.values(baseline.summary).every(v => v === true);

  return baseline;
}

/**
 * Main hook execution
 */
function main() {
  const state = loadSessionState();

  // Check if baseline already captured for this session
  if (state.test_baseline && state.baseline_captured_at) {
    const baselineAge = Date.now() - new Date(state.baseline_captured_at).getTime();
    // Skip if baseline captured within last 30 minutes
    if (baselineAge < 30 * 60 * 1000) {
      console.log('[capture-baseline] Recent baseline exists, skipping');
      console.log(`[capture-baseline] Baseline age: ${Math.round(baselineAge / 60000)}m`);
      return;
    }
  }

  const baseline = captureBaseline();

  // Store in session state
  state.test_baseline = baseline;
  state.baseline_captured_at = baseline.captured_at;

  saveSessionState(state);

  console.log('[capture-baseline] Baseline captured successfully');
  console.log(`[capture-baseline] All clean: ${baseline.all_clean}`);

  if (!baseline.all_clean) {
    console.log('[capture-baseline] Pre-existing issues detected:');
    if (!baseline.summary.engineer_tests_passing) {
      console.log('  - Engineer: unit test failures');
    }
    if (!baseline.summary.app_tests_passing) {
      console.log('  - App: unit test failures');
    }
    if (!baseline.summary.engineer_types_clean) {
      console.log('  - Engineer: TypeScript errors');
    }
    if (!baseline.summary.app_types_clean) {
      console.log('  - App: TypeScript errors');
    }
    if (!baseline.summary.app_lint_clean) {
      console.log('  - App: lint errors');
    }
  }
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { captureBaseline, captureUnitTestState, captureTypeCheckState };
