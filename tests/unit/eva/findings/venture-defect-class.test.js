import { describe, it, expect } from 'vitest';
import { VENTURE_DEFECT_CLASS, isRatifiedVentureDefectClass } from '../../../../lib/eva/findings/venture-defect-class.js';

describe('VENTURE_DEFECT_CLASS', () => {
  it('has exactly 3 ratified values', () => {
    expect(Object.values(VENTURE_DEFECT_CLASS)).toHaveLength(3);
  });

  it('is disjoint from GAP_CLASS values (no accidental overlap between the two taxonomies)', async () => {
    const { GAP_CLASS } = await import('../../../../lib/eva/findings/gap-class.js');
    const overlap = Object.values(VENTURE_DEFECT_CLASS).filter((v) => Object.values(GAP_CLASS).includes(v));
    expect(overlap).toEqual([]);
  });
});

describe('isRatifiedVentureDefectClass', () => {
  it('accepts a ratified value', () => {
    expect(isRatifiedVentureDefectClass(VENTURE_DEFECT_CLASS.APPLICATION_BEHAVIOR_DEFECT)).toBe(true);
  });

  it('rejects an unratified value, including a GAP_CLASS value', async () => {
    const { GAP_CLASS } = await import('../../../../lib/eva/findings/gap-class.js');
    expect(isRatifiedVentureDefectClass('NOT_REAL')).toBe(false);
    expect(isRatifiedVentureDefectClass(GAP_CLASS.GATE_CANNOT_FAIL)).toBe(false);
  });
});
