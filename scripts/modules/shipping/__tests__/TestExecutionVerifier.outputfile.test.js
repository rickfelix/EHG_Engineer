/**
 * Regression test for QF-20260710-717.
 *
 * TestExecutionVerifier.runTests() used to extract JSON from raw vitest
 * stdout via indexOf('{')..lastIndexOf('}'). A test suite's own console.log
 * emitting a brace before the real reporter block corrupted that substring,
 * yielding data=null and a false "Test execution failed" even when every
 * test passed. The fix switches to `--outputFile` (a clean JSON file) —
 * this test proves stdout content (braces and all) is no longer read.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { TestExecutionVerifier } from '../TestExecutionVerifier.js';

vi.mock('node:child_process', () => ({ execSync: vi.fn() }));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readFileSync: vi.fn(), existsSync: actual.existsSync, statSync: actual.statSync };
});

describe('TestExecutionVerifier.runTests — outputFile parsing (QF-20260710-717)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses clean JSON from --outputFile even though stdout contains a brace before the report', () => {
    // Simulates a test's console.log('{ some debug object }') printing to
    // stdout before vitest's own JSON reporter block — the exact corruption
    // the old indexOf/lastIndexOf substring parse could not survive.
    execSync.mockImplementation((cmd) => {
      expect(cmd).toContain('--outputFile=');
      return '{ debug: "brace before real report" }\n';
    });
    readFileSync.mockReturnValue(
      JSON.stringify({ numTotalTests: 12, numPassedTests: 12, numFailedTests: 0 })
    );

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.passed).toBe(true);
    expect(result.totalTests).toBe(12);
    expect(result.passedTests).toBe(12);
    expect(result.failedTests).toBe(0);
  });

  it('reports real failures from the output file when vitest exits non-zero', () => {
    execSync.mockImplementation(() => {
      const err = new Error('vitest exited 1');
      err.status = 1;
      throw err;
    });
    readFileSync.mockReturnValue(
      JSON.stringify({ numTotalTests: 10, numPassedTests: 8, numFailedTests: 2 })
    );

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.passed).toBe(false);
    expect(result.outcome).toBe('fail');
    expect(result.failedTests).toBe(2);
  });
});

/**
 * Regression tests for SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001 (5th
 * occurrence of the same false-fail family). Under fleet load, execSync's
 * TEST_TIMEOUT_MS wall clock SIGTERM-kills a run that would have passed. The
 * old catch block never inspected error.killed/error.signal/error.code, so a
 * killed-under-load run was indistinguishable from a genuine failure and
 * reported passed:false. These tests prove the fix: a kill/timeout with no
 * failure evidence classifies as 'inconclusive' (not a failure), while a
 * kill signal accompanied by real failure evidence in the JSON report still
 * hard-blocks — the disambiguation is JSON-report-first, not signal-first.
 */
describe('TestExecutionVerifier.runTests — timeout/kill classification (SD-LEO-INFRA-TESTEXEC-TIMEOUT-INCONCLUSIVE-001)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('classifies a POSIX-shaped timeout kill (killed=true) as inconclusive, not a failure', () => {
    execSync.mockImplementation(() => {
      const err = new Error('Command timed out');
      err.killed = true;
      err.signal = 'SIGTERM';
      err.status = null;
      throw err;
    });
    readFileSync.mockImplementation(() => { throw new Error('ENOENT'); }); // report never written

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.outcome).toBe('inconclusive');
    expect(result.passed).toBe(true);
  });

  it('classifies a Windows-shaped timeout kill (killed=undefined, signal=SIGTERM, code=ETIMEDOUT) as inconclusive', () => {
    // Empirical finding (risk-agent, this SD): on this Windows/Node 24 host, an
    // execSync timeout leaves error.killed=undefined — only signal/code are set.
    // A killed===true-only check would silently no-op here, reproducing the bug.
    execSync.mockImplementation(() => {
      const err = new Error('Command timed out');
      err.killed = undefined;
      err.signal = 'SIGTERM';
      err.code = 'ETIMEDOUT';
      err.status = null;
      throw err;
    });
    readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.outcome).toBe('inconclusive');
    expect(result.passed).toBe(true);
  });

  it('a non-zero exit with a JSON report showing 0 failures and no kill signal still hard-blocks (pre-existing edge case, unchanged)', () => {
    // e.g. a vitest internal/setup crash after writing an empty-failures report —
    // not a load timeout, not a test failure, but the pre-existing behavior for
    // this corner (passed:false) must not regress when the kill-detection branch
    // was added.
    execSync.mockImplementation(() => {
      const err = new Error('vitest exited 1');
      err.status = 1;
      throw err;
    });
    readFileSync.mockReturnValue(
      JSON.stringify({ numTotalTests: 5, numPassedTests: 5, numFailedTests: 0 })
    );

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.passed).toBe(false);
    expect(result.outcome).toBe('fail');
  });

  it('still hard-blocks when a kill signal is present but the JSON report shows real failures', () => {
    // A crashing/self-terminating test could present signal=SIGTERM without
    // being a genuine load timeout. JSON-report failure evidence must win.
    execSync.mockImplementation(() => {
      const err = new Error('Command timed out');
      err.killed = true;
      err.signal = 'SIGTERM';
      throw err;
    });
    readFileSync.mockReturnValue(
      JSON.stringify({ numTotalTests: 10, numPassedTests: 7, numFailedTests: 3 })
    );

    const verifier = new TestExecutionVerifier({ cwd: '/repo' });
    const result = verifier.runTests();

    expect(result.outcome).toBe('fail');
    expect(result.passed).toBe(false);
    expect(result.failedTests).toBe(3);
  });
});
