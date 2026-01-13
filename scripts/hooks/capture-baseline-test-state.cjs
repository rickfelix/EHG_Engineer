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
 * Run unit tests and capture results
 */
function captureUnitTestState(workingDir) {
  try {
    // Run tests with JSON reporter for structured output
    const result = execSync('npm run test -- --reporter=json 2>/dev/null || true', {
      encoding: 'utf8',
      cwd: workingDir,
      timeout: 60000  // 60 second timeout
    });

    // Try to parse JSON output, fall back to text parsing
    try {
      return JSON.parse(result);
    } catch {
      // Parse text output for basic stats
      const passMatch = result.match(/(\d+)\s+pass/i);
      const failMatch = result.match(/(\d+)\s+fail/i);
      const skipMatch = result.match(/(\d+)\s+skip/i);

      return {
        passed: passMatch ? parseInt(passMatch[1]) : 0,
        failed: failMatch ? parseInt(failMatch[1]) : 0,
        skipped: skipMatch ? parseInt(skipMatch[1]) : 0,
        raw_output: result.substring(0, 1000)  // Keep first 1000 chars
      };
    }
  } catch (error) {
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
      unit_tests: captureUnitTestState(ENGINEER_DIR),
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
