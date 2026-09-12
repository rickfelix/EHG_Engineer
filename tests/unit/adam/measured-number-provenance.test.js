/**
 * QF-20260912-901 (FIX SHAPE (a) of QF-20260912-079) — measured_by[] provenance detector.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { extractNumberTokens, checkMeasuredByProvenance } = require('../../../lib/adam/measured-number-provenance.cjs');

describe('extractNumberTokens', () => {
  it('finds standalone multi-digit numbers', () => {
    expect(extractNumberTokens('785 of 785 checks, 171 ventures, 28 blocked')).toEqual(
      expect.arrayContaining(['785', '171', '28']),
    );
  });

  it('excludes numbers embedded in ids/dates/PR refs', () => {
    expect(extractNumberTokens('See QF-20260912-901 and PR #8788, filed 2026-09-12.')).toEqual([]);
  });

  it('returns [] for a body with no digits', () => {
    expect(extractNumberTokens('no numbers here')).toEqual([]);
  });

  it('de-duplicates repeated occurrences of the same number', () => {
    expect(extractNumberTokens('785 of 785 checks')).toEqual(['785']);
  });

  it('handles non-string / empty input without throwing', () => {
    expect(extractNumberTokens(null)).toEqual([]);
    expect(extractNumberTokens(undefined)).toEqual([]);
    expect(extractNumberTokens('')).toEqual([]);
  });
});

describe('checkMeasuredByProvenance', () => {
  it('ok when the body has no digit-bearing claims', () => {
    expect(checkMeasuredByProvenance('no numbers here', null)).toEqual({ ok: true });
  });

  it('refuses and names the first unstamped number', () => {
    const result = checkMeasuredByProvenance('171 ventures, 0 rows measured', []);
    expect(result.ok).toBe(false);
    expect(['171', '0']).not.toContain(undefined);
    expect(result.unstampedNumber).toBeTruthy();
  });

  it('ok when every cited number has a matching measured_by[] stamp', () => {
    const result = checkMeasuredByProvenance('171 ventures', [
      { value: '171', instrument: 'venture-count-query', row_ref: 'ventures', measured_at: '2026-09-12T16:00:00Z' },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it('refuses when only SOME cited numbers are stamped', () => {
    const result = checkMeasuredByProvenance('171 ventures, 785 checks', [
      { value: '171', instrument: 'venture-count-query' },
    ]);
    expect(result).toEqual({ ok: false, unstampedNumber: '785' });
  });

  it('matches a numeric measured_by value stringified, not only a string value', () => {
    const result = checkMeasuredByProvenance('171 ventures', [{ value: 171, instrument: 'venture-count-query' }]);
    expect(result).toEqual({ ok: true });
  });
});
