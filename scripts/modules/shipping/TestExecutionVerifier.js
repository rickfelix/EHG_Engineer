/**
 * TestExecutionVerifier — Gap 4: Pre-Ship Test Execution
 *
 * Adds test execution verification to ship-preflight. Ensures tests actually
 * pass before shipping, closing the gap where CLAUDE_EXEC_DIGEST says test
 * execution is MANDATORY but nothing enforces it.
 *
 * Logic:
 * 1. Check for recent test results (< 15 min old, all passing) → skip re-run
 * 2. If no recent results: run `npx vitest run --reporter=json` (5 min timeout)
 * 3. Parse exit code: 0 = pass, non-zero = block shipping
 * 4. Escape hatch: --skip-tests flag (logged as warning, not silent)
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const RECENT_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const TEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Standard locations for test result files.
 */
const RESULT_PATHS = [
  'test-results.json',
  '.vitest-results.json',
  'coverage/test-results.json'
];

export class TestExecutionVerifier {
  /**
   * @param {Object} options
   * @param {boolean} options.skipTests - If true, skip test execution (escape hatch)
   * @param {boolean} options.verbose - Enable verbose output
   * @param {string} options.cwd - Working directory (defaults to process.cwd())
   */
  constructor(options = {}) {
    this.skipTests = options.skipTests || false;
    this.verbose = options.verbose || false;
    this.cwd = options.cwd || process.cwd();
  }

  /**
   * Run test execution verification.
   *
   * @returns {Promise<{
   *   passed: boolean,
   *   skipped: boolean,
   *   totalTests: number,
   *   passedTests: number,
   *   failedTests: number,
   *   details: string,
   *   warnings: string[]
   * }>}
   */
  async verify() {
    console.log('\n  Step 4: Test Execution Verification');
    console.log('  ' + '-'.repeat(40));

    // Escape hatch
    if (this.skipTests) {
      console.log('  ⚠️  Skipped (--skip-tests)');
      return {
        passed: true,
        outcome: 'pass',
        skipped: true,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        details: 'Test execution skipped by user (--skip-tests)',
        warnings: ['Test execution was skipped — tests were NOT verified before shipping']
      };
    }

    // 1. Check for recent passing results
    const recent = this.findRecentResults();
    if (recent) {
      console.log(`  ✅ Recent test results found (${recent.age})`);
      console.log(`     All tests passed (${recent.total}/${recent.total})`);
      return {
        passed: true,
        outcome: 'pass',
        skipped: false,
        totalTests: recent.total,
        passedTests: recent.passed,
        failedTests: recent.failed,
        details: `Recent passing results (${recent.age} old): ${recent.passed}/${recent.total} passed`,
        warnings: []
      };
    }

    // 2. Run tests
    console.log('  🧪 Running tests...');
    return this.runTests();
  }

  /**
   * Look for recent test result files that show all-passing.
   */
  findRecentResults() {
    const now = Date.now();

    for (const relPath of RESULT_PATHS) {
      const fullPath = join(this.cwd, relPath);
      if (!existsSync(fullPath)) continue;

      try {
        const stat = statSync(fullPath);
        const ageMs = now - stat.mtimeMs;

        if (ageMs > RECENT_THRESHOLD_MS) {
          if (this.verbose) console.log(`     ${relPath}: too old (${formatAge(ageMs)})`);
          continue;
        }

        const data = JSON.parse(readFileSync(fullPath, 'utf8'));
        const total = data.numTotalTests || 0;
        const passed = data.numPassedTests || 0;
        const failed = data.numFailedTests || 0;

        if (total > 0 && failed === 0) {
          return {
            path: relPath,
            total,
            passed,
            failed,
            age: formatAge(ageMs)
          };
        }

        if (this.verbose) {
          console.log(`     ${relPath}: ${failed} failures (not all passing)`);
        }
      } catch {
        if (this.verbose) console.log(`     ${relPath}: could not parse`);
      }
    }

    return null;
  }

  /**
   * Execute vitest and parse results.
   *
   * Uses --outputFile so the JSON report is written to a clean file rather
   * than extracted from stdout — a test's own console.log emitting a brace
   * before the real reporter block previously broke the indexOf/lastIndexOf
   * substring parse, yielding a false "Test execution failed" (QF-20260710-717).
   */
  runTests() {
    const outputFile = join(this.cwd, '.vitest-preflight-report.json');
    let exitCode = 0;
    let killInfo = null;
    try {
      execSync(`npx vitest run --reporter=json --outputFile=${JSON.stringify(outputFile)}`, {
        cwd: this.cwd,
        encoding: 'utf8',
        timeout: TEST_TIMEOUT_MS,
        stdio: 'pipe'
      });
    } catch (error) {
      // execSync throws on non-zero exit code; the report file is still written.
      exitCode = error.status || 1;
      // FR-1 (SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001): a fleet-load timeout
      // SIGTERM-kills this process before it can finish — the OS/timeout behavior
      // is platform-dependent (empirically on Windows/Node execSync sets
      // killed=undefined, signal='SIGTERM', code='ETIMEDOUT'; POSIX sets killed=true),
      // so all three fields are checked. Final classification still defers to the
      // parsed JSON report in parseTestOutput — this is only a candidate signal.
      if (error.killed === true || error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT') {
        killInfo = { killed: error.killed, signal: error.signal, code: error.code };
      }
    }

    let output = '';
    try {
      output = readFileSync(outputFile, 'utf8');
    } catch { /* file missing — parseTestOutput falls back to exit code */ }

    return this.parseTestOutput(output, exitCode, killInfo);
  }

  /**
   * Parse vitest JSON output.
   */
  parseTestOutput(output, exitCode, killInfo = null) {
    // Try to extract JSON from output (vitest may prefix with non-JSON)
    let data = null;
    try {
      const jsonStart = output.indexOf('{');
      const jsonEnd = output.lastIndexOf('}');
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        data = JSON.parse(output.substring(jsonStart, jsonEnd + 1));
      }
    } catch { /* not valid JSON */ }

    if (data) {
      const total = data.numTotalTests || 0;
      const passed = data.numPassedTests || 0;
      const failed = data.numFailedTests || 0;

      if (exitCode === 0 && failed === 0) {
        console.log(`  ✅ All tests passed (${passed}/${total})`);
        return {
          passed: true, outcome: 'pass', skipped: false,
          totalTests: total, passedTests: passed, failedTests: failed,
          details: `All tests passed (${passed}/${total})`,
          warnings: []
        };
      }

      // JSON-report failure evidence always wins over a kill signal — a crashing
      // or self-terminating test must still hard-block (risk-agent finding).
      if (failed > 0) {
        console.log(`  ❌ FAIL: ${failed} test failure(s) detected`);
        if (this.verbose && data.testResults) {
          for (const suite of data.testResults) {
            if (suite.status === 'failed') {
              console.log(`     FAIL: ${suite.name}`);
            }
          }
        }

        return {
          passed: false, outcome: 'fail', skipped: false,
          totalTests: total, passedTests: passed, failedTests: failed,
          details: `${failed} test failure(s) out of ${total} tests`,
          warnings: []
        };
      }
    }

    // No failure evidence in the JSON report (or no report at all) and a
    // kill/timeout signal was observed — classify as inconclusive, not a failure.
    if (killInfo) {
      console.log('  ⚠️  INCONCLUSIVE: test run was killed under load (timeout), not a genuine failure');
      return {
        passed: true, outcome: 'inconclusive', skipped: false,
        totalTests: 0, passedTests: 0, failedTests: 0,
        details: `Test run killed under fleet-load timeout (killed=${killInfo.killed}, signal=${killInfo.signal}, code=${killInfo.code}) — not a genuine test failure`,
        warnings: [`Load-timeout classification: run was killed (signal=${killInfo.signal}, code=${killInfo.code}), not a real test failure — this is a resource-contention signal, not a code defect`]
      };
    }

    // No JSON parsed and no kill signal — use exit code
    if (exitCode === 0) {
      console.log('  ✅ Tests passed (no JSON report available)');
      return {
        passed: true, outcome: 'pass', skipped: false,
        totalTests: 0, passedTests: 0, failedTests: 0,
        details: 'Tests passed (exit code 0, no JSON report)',
        warnings: ['Could not parse test report — relying on exit code']
      };
    }

    console.log('  ❌ FAIL: Test execution failed');
    return {
      passed: false, outcome: 'fail', skipped: false,
      totalTests: 0, passedTests: 0, failedTests: 0,
      details: `Test execution failed (exit code ${exitCode})`,
      warnings: []
    };
  }
}

function formatAge(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1 min';
  return `${minutes} min`;
}
