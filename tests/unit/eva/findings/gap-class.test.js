import { describe, it, expect } from 'vitest';
import { GAP_CLASS, MINTED_BY_THIS_SD, BLOCKING_GAP_CLASSES, isRatifiedGapClass } from '../../../../lib/eva/findings/gap-class.js';

describe('gap-class', () => {
  it('the ratified set has exactly 8 entries', () => {
    expect(Object.keys(GAP_CLASS)).toHaveLength(8);
  });

  it('MINTED_BY_THIS_SD is a strict subset of the ratified set', () => {
    expect(MINTED_BY_THIS_SD).toHaveLength(3);
    for (const code of MINTED_BY_THIS_SD) {
      expect(Object.values(GAP_CLASS)).toContain(code);
    }
  });

  it('BLOCKING_GAP_CLASSES contains exactly GATE_CANNOT_FAIL, INSTRUMENT_LIE, GATE_BYPASSED', () => {
    expect(BLOCKING_GAP_CLASSES.size).toBe(3);
    expect(BLOCKING_GAP_CLASSES.has('GATE_CANNOT_FAIL')).toBe(true);
    expect(BLOCKING_GAP_CLASSES.has('INSTRUMENT_LIE')).toBe(true);
    expect(BLOCKING_GAP_CLASSES.has('GATE_BYPASSED')).toBe(true);
    expect(BLOCKING_GAP_CLASSES.has('CRITERIA_DRIFT')).toBe(false);
  });

  it('isRatifiedGapClass rejects an unratified value', () => {
    expect(isRatifiedGapClass('GATE_CANNOT_FAIL')).toBe(true);
    expect(isRatifiedGapClass('NOT_A_REAL_CODE')).toBe(false);
    expect(isRatifiedGapClass(undefined)).toBe(false);
  });
});
