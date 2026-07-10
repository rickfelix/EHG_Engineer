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
    expect(result.failedTests).toBe(2);
  });
});
