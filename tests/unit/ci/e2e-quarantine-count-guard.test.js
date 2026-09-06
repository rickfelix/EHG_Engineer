/**
 * SD-LEO-INFRA-REPAIR-DECAYED-EHG-001 (FR-2) -- the CI-asserted quarantine count predicate.
 */
import { describe, it, expect } from 'vitest';
import { countQuarantineEntries, evaluateQuarantineGrowth } from '../../../scripts/ci/e2e-quarantine-count-guard.mjs';

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
});
