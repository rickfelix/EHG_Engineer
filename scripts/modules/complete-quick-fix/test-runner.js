/**
 * Test Runner for Complete Quick-Fix
 * Part of quick-fix modularization
 */

import { execSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { TEST_TIMEOUT_UNIT, TEST_TIMEOUT_E2E } from './constants.js';

/** Whole no-DB unit suite (used only when the diff can't be resolved to tests). */
export const WHOLE_SUITE_UNIT_COMMAND = 'npm run test:unit';

/**
 * QF-20260906-859: a node:test file (e.g. auto-validate-user-stories-draft.test.js) is
 * vitest-excluded, so a scoped `vitest run` on it false-FAILs ("No test files found") even
 * though it passes under `node --test`. Detected by CONTENT so a real vitest file (which
 * never imports node:test) is never misrouted.
 *
 * Anchored (^ + multiline) to a real top-level import/require -- not the bare substring, which a
 * fixture-writing string literal can also contain (dogfood bug: this file's own test misdetected
 * itself before the anchor -- see test-runner-node-test-detection.test.js).
 */
export function isNodeTestFile(filePath, testDir) {
  const NODE_TEST_IMPORT_RE = /^\s*import\s.*from\s+['"]node:test['"]|^\s*(?:const|let|var)\s.*require\(\s*['"]node:test['"]\s*\)/m;
  try {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(testDir || process.cwd(), filePath);
    return NODE_TEST_IMPORT_RE.test(fs.readFileSync(abs, 'utf8'));
  } catch { return false; }
}

/** Split a change-scoped unit-test file list into vitest vs node:test buckets. */
export function partitionTestFiles(testFiles, testDir) {
  const vitestFiles = [], nodeTestFiles = [];
  for (const f of testFiles || []) (isNodeTestFile(f, testDir) ? nodeTestFiles : vitestFiles).push(f);
  return { vitestFiles, nodeTestFiles };
}

/** Parse node's built-in test-runner summary lines ("ℹ tests N", "ℹ pass N", ...). */
export function extractNodeTestSummary(output) {
  const num = (re) => { const m = output.match(re); return m ? parseInt(m[1], 10) || 0 : 0; };
  const summary = { passed: num(/[ℹI]\s*pass\s+(\d+)/i), failed: num(/[ℹI]\s*fail\s+(\d+)/i), skipped: num(/[ℹI]\s*skipped\s+(\d+)/i), total: 0 };
  summary.total = num(/[ℹI]\s*tests\s+(\d+)/i) || summary.passed + summary.failed + summary.skipped;
  return summary;
}

/** Run node:test files via `node --test`, using its own exit code as the verdict. */
export function runNodeTestFiles(files, testDir, timeout) {
  const command = `node --test ${files.map(f => `"${f.replace(/"/g, '\\"')}"`).join(' ')}`;
  try {
    const output = execSync(command, { encoding: 'utf-8', timeout, stdio: 'pipe', cwd: testDir });
    const summary = extractNodeTestSummary(output);
    return { passed: summary.total > 0 && summary.failed === 0, output: output.substring(0, 2000), exitCode: 0, summary };
  } catch (err) {
    if (err.killed || err.signal === 'SIGTERM') {
      return { passed: false, output: `Test timed out after ${timeout / 1000}s`, exitCode: 124, timedOut: true };
    }
    const output = (err.stdout?.toString() || err.stderr?.toString() || err.message).substring(0, 2000);
    return { passed: false, output, exitCode: err.status || 1, summary: extractNodeTestSummary(output) };
  }
}

/** Combine a vitest-bucket result and a node:test-bucket result into one verdict. */
export function combineUnitResults(v, n) {
  const sum = (k) => (v.summary?.[k] || 0) + (n.summary?.[k] || 0);
  return {
    passed: v.passed && n.passed,
    output: `${v.output || ''}\n--- node --test ---\n${n.output || ''}`.substring(0, 2000),
    exitCode: v.exitCode === 0 && n.exitCode === 0 ? 0 : (v.exitCode || n.exitCode),
    summary: { passed: sum('passed'), failed: sum('failed'), skipped: sum('skipped'), total: sum('total') },
    timedOut: Boolean(v.timedOut || n.timedOut)
  };
}

/**
 * Build the unit-test command, change-scoped to the QF's own unit-test files.
 *
 * SD-FDBK-INFRA-CHANGE-SCOPE-COMPLETE-001: the whole `npm run test:unit` suite
 * exceeds TEST_TIMEOUT_UNIT (and re-surfaces pre-existing baseline failures
 * unrelated to the QF), so a verified Tier-1 QF can't be completed without a
 * --skip-tests / --force-complete bypass.
 *
 * EXEC finding (deviates from PRD FR-1's literal `vitest related`): both
 * `vitest related` and `vitest --changed` must transform EVERY test file in the
 * project to build the import graph, and a pre-existing baseline file throws
 * ERR_LOAD_URL during that collection — so graph-building modes fail wholesale
 * in this repo's unit project (the exact baseline-poisoning the SD escapes). A
 * TARGETED run of explicit test-file paths does NOT build the full graph and is
 * clean/fast. So we resolve the QF's actual unit-test files (see
 * getScopedUnitTestFiles in git-operations.js) and run exactly those:
 *   `npx vitest run --project unit <testFiles>`
 * When no test files are supplied, fall back to the whole-suite command (used
 * only for the diff-unknown last-resort path; FR-1 backward-compat).
 *
 * RCA a15122006891b019b (2026-07-01): --passWithNoTests was previously appended
 * to the SCOPED branch too. When every resolved path is excluded by the unit
 * project's own filters (quarantine manifest / SHARED_EXCLUDE / DB_INCLUDE),
 * vitest finds zero test files but --passWithNoTests still exits 0 — a
 * gate-fail-open false-verification-witness (tests_passing=true with zero
 * tests ever executed). Dropped here; runTests() also asserts summary.total>0
 * for scoped runs as defense-in-depth (see below).
 *
 * Pure (no side effects) for unit-testability (FR-5). Each path is double-quoted
 * so a path with a space — or a shell metacharacter — cannot break or inject.
 *
 * @param {string[]} testFiles - repo-relative unit-test file paths to run
 * @returns {string} shell command string
 */
export function buildUnitTestCommand(testFiles) {
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    return WHOLE_SUITE_UNIT_COMMAND;
  }
  const quoted = testFiles
    .filter(f => typeof f === 'string' && f.trim().length > 0)
    .map(f => `"${f.replace(/"/g, '\\"')}"`)
    .join(' ');
  if (!quoted) {
    return WHOLE_SUITE_UNIT_COMMAND;
  }
  return `npx vitest run --project unit ${quoted}`;
}

/**
 * Run tests programmatically and return results
 * @param {string} testType - 'unit' or 'e2e'
 * @param {object} options - Test options. `testDir` sets cwd; `testFiles`
 *   (unit only) change-scopes the run to exactly those unit-test files — omit
 *   for the whole-suite run (backward compatible).
 * @returns {object} Test results with passed, output, exitCode
 */
export function runTests(testType, options = {}) {
  const testDir = options.testDir || process.cwd();

  if (testType === 'unit' && Array.isArray(options.testFiles) && options.testFiles.length > 0) {
    const { vitestFiles, nodeTestFiles } = partitionTestFiles(options.testFiles, testDir);
    if (nodeTestFiles.length > 0) {
      console.log(`   🎯 ${nodeTestFiles.length} node:test file(s) detected -- running via 'node --test' (vitest cannot collect them)`);
      const nodeResult = runNodeTestFiles(nodeTestFiles, testDir, TEST_TIMEOUT_UNIT);
      if (vitestFiles.length === 0) return nodeResult;
      return combineUnitResults(runTests('unit', { ...options, testFiles: vitestFiles }), nodeResult);
    }
  }
  const testCommands = {
    unit: buildUnitTestCommand(options.testFiles),
    e2e: 'npm run test:e2e -- --grep="smoke" --reporter=list'
  };

  const timeouts = {
    unit: TEST_TIMEOUT_UNIT,
    e2e: TEST_TIMEOUT_E2E
  };

  const command = testCommands[testType];
  const timeout = timeouts[testType];

  if (!command) {
    return { passed: false, output: `Unknown test type: ${testType}`, exitCode: 1 };
  }

  console.log(`   🧪 Running ${testType} tests...`);
  console.log(`      Command: ${command}`);
  console.log(`      Directory: ${testDir}`);
  console.log(`      Timeout: ${timeout / 1000}s\n`);

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      timeout,
      stdio: 'pipe',
      cwd: testDir
    });

    const summary = extractTestSummary(output, testType);
    // RCA a15122006891b019b: a scoped unit run (explicit testFiles) that executes
    // zero tests is NOT a pass, even though the process exited 0 — the scoped
    // files were likely excluded by the unit project's own filters. Whole-suite
    // runs (no testFiles) are unaffected.
    const scopedZeroExecution =
      testType === 'unit' && Array.isArray(options.testFiles) && options.testFiles.length > 0 && summary.total === 0;

    return {
      passed: !scopedZeroExecution,
      output: output.substring(0, 2000),
      exitCode: 0,
      summary,
      ...(scopedZeroExecution && {
        falseVerificationGuard: 'scoped testFiles resolved to zero executed tests — treated as non-pass'
      })
    };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;

    if (err.killed || err.signal === 'SIGTERM') {
      return {
        passed: false,
        output: `Test timed out after ${timeout / 1000}s`,
        exitCode: 124,
        timedOut: true
      };
    }

    return {
      passed: false,
      output: output.substring(0, 2000),
      exitCode: err.status || 1,
      summary: extractTestSummary(output, testType)
    };
  }
}

/**
 * Extract test summary from output
 * @param {string} output - Test output
 * @param {string} testType - Type of test
 * @returns {object} Summary object
 */
export function extractTestSummary(output, testType) {
  const summary = { passed: 0, failed: 0, skipped: 0, total: 0 };

  if (testType === 'unit') {
    // QF-20260701-533: vitest v4 dropped the colon and switched to a pipe-separated
    // list — "Tests  1 failed | 1 passed | 1 skipped (3)" — instead of the legacy
    // "Tests:  1 passed, 1 failed (2)". Match the summary line loosely (colon
    // optional) then pull each count by keyword so either format parses correctly.
    const lineMatch = output.match(/^[ \t]*Tests:?[ \t]+.+$/im);
    if (lineMatch) {
      const line = lineMatch[0];
      const passedMatch = line.match(/(\d+)\s+passed/i);
      const failedMatch = line.match(/(\d+)\s+failed/i);
      const skippedMatch = line.match(/(\d+)\s+skipped/i);
      const totalMatch = line.match(/\((\d+)\)/) || line.match(/(\d+)\s+total/i);
      summary.passed = passedMatch ? parseInt(passedMatch[1]) || 0 : 0;
      summary.failed = failedMatch ? parseInt(failedMatch[1]) || 0 : 0;
      summary.skipped = skippedMatch ? parseInt(skippedMatch[1]) || 0 : 0;
      summary.total = totalMatch ? parseInt(totalMatch[1]) || 0 : summary.passed + summary.failed + summary.skipped;
    }
  } else if (testType === 'e2e') {
    const passedMatch = output.match(/(\d+)\s+passed/i);
    const failedMatch = output.match(/(\d+)\s+failed/i);
    if (passedMatch) summary.passed = parseInt(passedMatch[1]);
    if (failedMatch) summary.failed = parseInt(failedMatch[1]);
    summary.total = summary.passed + summary.failed;
  }

  return summary;
}

/**
 * Run TypeScript verification
 * @param {string} testDir - Directory to run tsc in
 * @param {boolean} skip - Skip TypeScript check
 * @returns {object} Result with passed and output
 */
export function runTypeScriptCheck(testDir, skip = false) {
  if (skip) {
    console.log('   ⚠️  TypeScript check skipped (--skip-typecheck flag)\n');
    return { passed: true, skipped: true };
  }

  console.log('📘 TYPESCRIPT VERIFICATION\n');
  console.log('   🔍 Running TypeScript compiler check...');
  console.log('      Command: npx tsc --noEmit');
  console.log(`      Directory: ${testDir}`);
  console.log('      Timeout: 60s\n');

  try {
    execSync('npx tsc --noEmit', {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: 'pipe',
      cwd: testDir
    });
    console.log('   ✅ TypeScript compilation PASSED\n');
    return { passed: true };
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    console.log('   ❌ TypeScript compilation FAILED\n');

    if (output) {
      console.log('   📋 TypeScript Errors (truncated):');
      const lines = output.split('\n').slice(0, 20);
      lines.forEach(line => console.log(`      ${line}`));
      if (output.split('\n').length > 20) {
        console.log(`      ... and ${output.split('\n').length - 20} more lines`);
      }
    }

    return { passed: false, output };
  }
}

/**
 * Display test results summary
 * @param {object} unitResult - Unit test results
 * @param {object} e2eResult - E2E test results
 */
export function displayTestResults(unitResult, e2eResult) {
  if (unitResult) {
    if (unitResult.passed) {
      console.log('   ✅ Unit tests PASSED');
      if (unitResult.summary) {
        console.log(`      ${unitResult.summary.passed} passed, ${unitResult.summary.failed} failed`);
      }
    } else {
      console.log('   ❌ Unit tests FAILED');
      if (unitResult.timedOut) {
        console.log(`      Timed out after ${TEST_TIMEOUT_UNIT / 1000}s`);
      }
      if (unitResult.summary && unitResult.summary.failed > 0) {
        console.log(`      ${unitResult.summary.passed} passed, ${unitResult.summary.failed} failed`);
      }
      if (unitResult.output) {
        console.log('\n   📋 Test Output (truncated):');
        const lines = unitResult.output.split('\n').slice(-15);
        lines.forEach(line => console.log(`      ${line}`));
      }
    }
  }

  if (e2eResult) {
    if (e2eResult.passed) {
      console.log('   ✅ E2E tests PASSED');
      if (e2eResult.summary) {
        console.log(`      ${e2eResult.summary.passed} passed, ${e2eResult.summary.failed} failed`);
      }
    } else {
      console.log('   ❌ E2E tests FAILED');
      if (e2eResult.timedOut) {
        console.log(`      Timed out after ${TEST_TIMEOUT_E2E / 1000}s`);
      }
      if (e2eResult.summary && e2eResult.summary.failed > 0) {
        console.log(`      ${e2eResult.summary.passed} passed, ${e2eResult.summary.failed} failed`);
      }
      if (e2eResult.output) {
        console.log('\n   📋 Test Output (truncated):');
        const lines = e2eResult.output.split('\n').slice(-15);
        lines.forEach(line => console.log(`      ${line}`));
      }
    }
  }
}
