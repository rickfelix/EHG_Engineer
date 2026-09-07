/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-2) -- the CI-asserted quarantine count predicate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Adversarial review finding (deep-tier /ship gate, PR #8382): readBaseDoc() used to catch every
// git-show failure identically, so a bad --base ref or a corrupt base file silently read as "list
// absent" -> bootstrap -> unconditional PASS, the exact "fails open" shape this guard exists to
// prevent. execFileSync is mocked so both failure modes are exercised without touching real git.
let execFileSyncMock;
vi.mock('node:child_process', () => ({
  execFileSync: (...args) => execFileSyncMock(...args),
}));

const { countQuarantineEntries, evaluateQuarantineGrowth, readBaseDoc } =
  await import('../../../scripts/ci/e2e-quarantine-count-guard.mjs');

describe('countQuarantineEntries', () => {
  it('counts entries in a bare array document', () => {
    expect(countQuarantineEntries([{ spec: 'a', reason: 'x' }, { spec: 'b', reason: 'y' }])).toBe(2);
  });

  it('counts entries in a {quarantined: [...]} document', () => {
    expect(countQuarantineEntries({ quarantined: [{ spec: 'a', reason: 'x' }] })).toBe(1);
  });

  it('treats null/undefined as zero entries (a not-yet-existing file)', () => {
    expect(countQuarantineEntries(null)).toBe(0);
    expect(countQuarantineEntries(undefined)).toBe(0);
  });

  it('throws on a malformed entry missing spec or reason', () => {
    expect(() => countQuarantineEntries([{ spec: 'a' }])).toThrow(/malformed/);
    expect(() => countQuarantineEntries([{ reason: 'x' }])).toThrow(/malformed/);
  });

  it('throws when the document is neither an array nor {quarantined: array}', () => {
    expect(() => countQuarantineEntries({ foo: 'bar' })).toThrow(/must be an array/);
  });
});

describe('evaluateQuarantineGrowth', () => {
  it('PASSes when current count is less than or equal to base', () => {
    expect(evaluateQuarantineGrowth(5, 10).status).toBe('PASS');
    expect(evaluateQuarantineGrowth(10, 10).status).toBe('PASS');
  });

  it('FAILs when current count exceeds base', () => {
    const result = evaluateQuarantineGrowth(11, 10);
    expect(result.status).toBe('FAIL');
    expect(result.delta).toBe(1);
  });

  it('PASSes a brand-new list against a zero baseline (first-ever merge)', () => {
    expect(evaluateQuarantineGrowth(0, 0).status).toBe('PASS');
  });

  it('PASSes a large first-ever population against a zero baseline (bootstrap, not growth)', () => {
    const result = evaluateQuarantineGrowth(259, 0);
    expect(result.status).toBe('PASS');
    expect(result.bootstrap).toBe(true);
  });

  it('FAILs growth once a real (nonzero) baseline exists, even by one', () => {
    const result = evaluateQuarantineGrowth(260, 259);
    expect(result.status).toBe('FAIL');
    expect(result.bootstrap).toBe(false);
  });
});

describe('readBaseDoc', () => {
  beforeEach(() => { execFileSyncMock = undefined; });

  it('returns [] when git reports the path genuinely absent at the base ref (legitimate bootstrap)', () => {
    execFileSyncMock = () => {
      const e = new Error('Command failed');
      e.stderr = "fatal: path 'tests/e2e/quarantine.json' does not exist in 'origin/main'";
      throw e;
    };
    expect(readBaseDoc('origin/main')).toEqual([]);
  });

  it('THROWS (never silently returns []) on a bad/unresolvable --base ref', () => {
    execFileSyncMock = () => {
      const e = new Error('Command failed');
      e.stderr = "fatal: invalid object name 'not-a-real-ref'.";
      throw e;
    };
    expect(() => readBaseDoc('not-a-real-ref')).toThrow(/git show .* failed/);
  });

  it('THROWS (never silently returns []) on a corrupt/malformed JSON base document', () => {
    execFileSyncMock = () => '{ this is not valid json';
    expect(() => readBaseDoc('origin/main')).toThrow(/not valid JSON/);
  });

  it('parses a valid base document normally', () => {
    execFileSyncMock = () => JSON.stringify([{ spec: 'a', reason: 'x' }]);
    expect(readBaseDoc('origin/main')).toEqual([{ spec: 'a', reason: 'x' }]);
  });
});
