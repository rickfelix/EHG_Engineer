// SD-LEO-FEAT-FORECAST-LEDGER-001 — shared Brier module (FR-4). Pure, no DB, no supabase import.
import { describe, it, expect } from 'vitest';
import { brierScore, round3, meanBrier, interpretBrier, clamp01 } from '../../../lib/forecasting/brier.js';

describe('brierScore edges', () => {
  it('p=0/1 with matching vs opposing outcomes', () => {
    expect(brierScore(0, false)).toBe(0);
    expect(brierScore(0, true)).toBe(1);
    expect(brierScore(1, true)).toBe(0);
    expect(brierScore(1, false)).toBe(1);
  });
  it('p=0.5 is 0.25 regardless of outcome', () => {
    expect(brierScore(0.5, true)).toBeCloseTo(0.25);
    expect(brierScore(0.5, false)).toBeCloseTo(0.25);
  });
  it('p=0.7 outcome=true -> 0.09, but RAW is the IEEE-754 hazard 0.09000000000000002', () => {
    const raw = brierScore(0.7, true);
    expect(raw).not.toBe(0.09);            // the hazard is real — proves we must round
    expect(round3(raw)).toBe(0.09);        // callers round the result
    expect(raw).toBeCloseTo(0.09);
  });
  it('clamps p outside [0,1]', () => {
    expect(brierScore(1.5, true)).toBe(0);   // clamps to 1
    expect(brierScore(-0.5, false)).toBe(0); // clamps to 0
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-3)).toBe(0);
  });
});

describe('meanBrier', () => {
  it('empty -> 1 (worst), matching baseline-accuracy total===0 convention', () => {
    expect(meanBrier([])).toBe(1);
    expect(meanBrier(null)).toBe(1);
  });
  it('mean of raw per-point scores, rounded to 3dp', () => {
    expect(meanBrier([0.09, 0.25, 0.01])).toBe(round3((0.09 + 0.25 + 0.01) / 3));
  });
  it('accepts {p, outcome} objects', () => {
    expect(meanBrier([{ p: 0.7, outcome: true }, { p: 0.5, outcome: false }]))
      .toBe(round3((brierScore(0.7, true) + 0.25) / 2));
  });
});

describe('interpretBrier thresholds mirror baseline-accuracy.js', () => {
  it('good / moderate / poor / null', () => {
    expect(interpretBrier(0.1)).toMatch(/good/);
    expect(interpretBrier(0.2)).toMatch(/moderate/);
    expect(interpretBrier(0.3)).toMatch(/poor/);
    expect(interpretBrier(null)).toMatch(/No resolved/);
  });
});

describe('reuse regression — brierScore === the formula baseline-accuracy.js inlines', () => {
  it('(clamp01(p) - actualBinary)**2 for representative cases', () => {
    const cases = [[0.82, true], [0.12, false], [0.5, true], [0.0, false], [1.0, true], [0.7, true]];
    for (const [p, outcome] of cases) {
      const inline = (Math.min(1, Math.max(0, p)) - (outcome ? 1 : 0)) ** 2;
      expect(brierScore(p, outcome)).toBe(inline);
    }
  });
});
