/**
 * Regression test for QF-20260701-533.
 *
 * extractTestSummary() must parse BOTH the legacy vitest summary line
 * ("Tests:  N passed, N failed (N)") and the vitest v4 format ("Tests  N failed |
 * N passed | N skipped (N)", no colon, pipe-separated). Prior to this fix the regex
 * required a literal colon, so v4 output never matched, summary.total stayed 0, and
 * the zero-execution guard in runTests() (RCA a15122006891b019b) false-negatived
 * every scoped unit-test QF completion even when all tests genuinely passed.
 */

import { describe, it, expect } from 'vitest';
import { extractTestSummary } from './test-runner.js';

describe('extractTestSummary — vitest v4 output (no colon, pipe-separated)', () => {
  it('parses an all-passing run', () => {
    const output = ' Test Files  1 passed (1)\n      Tests  6 passed (6)\n';
    const summary = extractTestSummary(output, 'unit');
    expect(summary).toEqual({ passed: 6, failed: 0, skipped: 0, total: 6 });
  });

  it('parses a mixed passed/failed run', () => {
    const output = ' Test Files  1 failed (1)\n      Tests  1 failed | 1 passed (2)\n';
    const summary = extractTestSummary(output, 'unit');
    expect(summary).toEqual({ passed: 1, failed: 1, skipped: 0, total: 2 });
  });

  it('parses a run with failed, passed, and skipped', () => {
    const output = ' Test Files  1 failed (1)\n      Tests  1 failed | 1 passed | 1 skipped (3)\n';
    const summary = extractTestSummary(output, 'unit');
    expect(summary).toEqual({ passed: 1, failed: 1, skipped: 1, total: 3 });
  });
});

describe('extractTestSummary — legacy colon format (backward compatible)', () => {
  it('parses "Tests:  N passed, N failed (N)"', () => {
    const output = 'Tests:  5 passed, 1 failed (6)\n';
    const summary = extractTestSummary(output, 'unit');
    expect(summary).toEqual({ passed: 5, failed: 1, skipped: 0, total: 6 });
  });

  it('parses "Tests:  N passed" with no failed/skipped/total segments', () => {
    const output = 'Tests:  3 passed\n';
    const summary = extractTestSummary(output, 'unit');
    expect(summary).toEqual({ passed: 3, failed: 0, skipped: 0, total: 3 });
  });
});

describe('extractTestSummary — no match', () => {
  it('returns all-zero summary when no Tests line is present', () => {
    const summary = extractTestSummary('no test output here', 'unit');
    expect(summary).toEqual({ passed: 0, failed: 0, skipped: 0, total: 0 });
  });
});
