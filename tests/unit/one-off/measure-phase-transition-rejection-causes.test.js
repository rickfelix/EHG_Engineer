import { describe, it, expect } from 'vitest';
import { extractCodes, KNOWN_CODES, INFO_CODES, computeRanking } from '../../../scripts/one-off/measure-phase-transition-rejection-causes.mjs';

describe('measure-phase-transition-rejection-causes: extractCodes (TS-4)', () => {
  it('extracts a single known code from a reason string', () => {
    expect(extractCodes('GATE_SUBAGENT_EVIDENCE validation failed - SUBAGENT_EVIDENCE_MISSING: TESTING')).toEqual(['SUBAGENT_EVIDENCE_MISSING']);
  });

  it('does not double-count a gate-name/detail-code pair as two causes', () => {
    // Real specimen: GATE_MECHANISM_CLAIM_VERIFIER's own message embeds MECHANISM_CLAIM_UNVERIFIED text.
    const reason = 'GATE_MECHANISM_CLAIM_VERIFIER validation failed - MECHANISM_CLAIM_UNVERIFIED: the spine asserts...';
    expect(extractCodes(reason)).toEqual(['GATE_MECHANISM_CLAIM_VERIFIER']);
  });

  it('excludes info-severity codes even if present in the text', () => {
    for (const code of INFO_CODES) {
      expect(KNOWN_CODES).not.toContain(code);
      expect(extractCodes(`some reason mentioning ${code}`)).toEqual([]);
    }
  });

  it('returns an empty array for null/undefined/unmatched reasons', () => {
    expect(extractCodes(null)).toEqual([]);
    expect(extractCodes(undefined)).toEqual([]);
    expect(extractCodes('SD status is draft, expected active')).toEqual([]);
  });

  it('is pure and reproducible: identical input yields identical output across calls', () => {
    const reason = 'SMOKE_TEST_SPECIFICATION validation failed - placeholder steps';
    expect(extractCodes(reason)).toEqual(extractCodes(reason));
  });
});

describe('measure-phase-transition-rejection-causes: computeRanking denominator (VALIDATION finding VAL-3)', () => {
  it('uses the FULL row count as the denominator, not the matched-row count', () => {
    const rows = [
      { rejection_reason: 'SUBAGENT_EVIDENCE_MISSING: TESTING' },
      { rejection_reason: 'SD status is draft, expected active' }, // unmatched
      { rejection_reason: 'SD status is draft, expected active' }, // unmatched
    ];
    const result = computeRanking(rows);
    expect(result.total_rejected_rows).toBe(3);
    expect(result.matched_rows).toBe(1);
    expect(result.unmatched_rows).toBe(2);
    // The regression this test pins: an earlier version divided by matched_rows (1),
    // giving a 100% share for a cause that's actually 1/3 of all rejections.
    const entry = result.ranked.find((r) => r.code === 'SUBAGENT_EVIDENCE_MISSING');
    expect(entry.soleBlocker).toBe(1);
    expect(entry.soleBlocker / result.total_rejected_rows).toBeCloseTo(1 / 3, 5);
  });

  it('does not double-count a gate-name/detail-code pair as two ranked causes', () => {
    const rows = [
      { rejection_reason: 'GATE_MECHANISM_CLAIM_VERIFIER validation failed - MECHANISM_CLAIM_UNVERIFIED: ...' },
    ];
    const result = computeRanking(rows);
    expect(result.ranked).toHaveLength(1);
    expect(result.ranked[0].code).toBe('GATE_MECHANISM_CLAIM_VERIFIER');
    expect(result.ranked[0].soleBlocker).toBe(1);
  });
});
