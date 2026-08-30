import { describe, it, expect } from 'vitest';
import { extractCodes, KNOWN_CODES, INFO_CODES } from '../../../scripts/one-off/measure-phase-transition-rejection-causes.mjs';

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
