import { describe, it, expect } from 'vitest';

// Mirror of QF_PATTERN at lib/agents/github-review-coordinator.js:checkLinkage().
// If you change this regex you must change it there too — and vice versa.
// Kept in-test (rather than imported) because the coordinator file pulls in
// Octokit at module load, which test environments shouldn't need.
const QF_PATTERN = /QF-\d{8}-[\w-]{3,}/;

describe('Agentic Review — QF linkage regex', () => {
  it('accepts numeric QF identifiers (legacy 3-digit suffix)', () => {
    expect(QF_PATTERN.test('QF-20260409-236')).toBe(true);
    expect(QF_PATTERN.test('Resolves QF-20260426-770 in body')).toBe(true);
  });

  it('accepts descriptive lowercase QF identifiers (kebab-case suffix)', () => {
    expect(QF_PATTERN.test('QF-20260502-relax-linkage-regex')).toBe(true);
    expect(QF_PATTERN.test('QF-20260502-fetch-depth-main-ref')).toBe(true);
  });

  it('accepts descriptive uppercase QF identifiers', () => {
    expect(QF_PATTERN.test('QF-20260429-LEO-DRIFT-DEDUPE')).toBe(true);
    expect(QF_PATTERN.test('QF-20260428-PLAYWRIGHT-BACKEND')).toBe(true);
  });

  it('rejects malformed QF strings (too few date digits, missing suffix, short suffix)', () => {
    expect(QF_PATTERN.test('QF-2026-001')).toBe(false);
    expect(QF_PATTERN.test('QF-20260502-')).toBe(false);
    expect(QF_PATTERN.test('QF-20260502-ab')).toBe(false);
    expect(QF_PATTERN.test('QF-not-a-date-suffix')).toBe(false);
  });
});
