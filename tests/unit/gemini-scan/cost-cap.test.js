import { describe, test, expect } from 'vitest';
import { withinCycleCap, withinPerCandidateCap, CYCLE_CAP_USD, PER_CANDIDATE_CAP_USD } from '../../../lib/gemini-scan/cost-cap.js';

describe('cost-cap', () => {
  test('CYCLE_CAP_USD is $5, PER_CANDIDATE_CAP_USD is $1', () => {
    expect(CYCLE_CAP_USD).toBe(5);
    expect(PER_CANDIDATE_CAP_USD).toBe(1);
  });

  test('withinCycleCap: spending that stays under $5 total is allowed', () => {
    expect(withinCycleCap(3, 1.5)).toBe(true);
  });

  test('withinCycleCap: spending that would exceed $5 total is refused', () => {
    expect(withinCycleCap(4.5, 1)).toBe(false);
  });

  test('withinCycleCap: landing exactly on the cap is allowed (<=)', () => {
    expect(withinCycleCap(4, 1)).toBe(true);
  });

  test('withinPerCandidateCap: under $1 is allowed', () => {
    expect(withinPerCandidateCap(0.5)).toBe(true);
  });

  test('withinPerCandidateCap: over $1 is refused', () => {
    expect(withinPerCandidateCap(1.5)).toBe(false);
  });
});
