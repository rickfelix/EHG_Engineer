/**
 * Tests for multi-dimension extraction and grouping
 * SD-MAN-INFRA-VISION-CORRECTIVE-MULTI-DIM-001
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GRADE } from '../../../lib/standards/grade-scale.js';

vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let _extractWeakDimensions, _groupDimensions, THRESHOLDS;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  _extractWeakDimensions = mod._extractWeakDimensions;
  _groupDimensions = mod._groupDimensions;
  THRESHOLDS = mod.THRESHOLDS;
});

// ── Sample dimension_scores (object format) ───────────────────────────────────

const MIXED_DIMS = {
  V01: { name: 'Market Vision', score: 60, weight: 0.2 },
  V02: { name: 'Strategic Clarity', score: 72, weight: 0.15 },
  A01: { name: 'Technical Arch', score: 65, weight: 0.2 },
  A02: { name: 'Data Architecture', score: 90, weight: 0.15 },
  V03: { name: 'Leadership Alignment', score: 95, weight: 0.1 },
};

const ALL_STRONG = {
  V01: { name: 'Market Vision', score: 93 },
  A01: { name: 'Technical Arch', score: 88 },
};

// THRESHOLDS.MINOR = GRADE.B = 83
describe('_extractWeakDimensions', () => {
  it('returns empty array for null input', () => {
    expect(_extractWeakDimensions(null)).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(_extractWeakDimensions({})).toEqual([]);
  });

  it('returns empty array when all dims >= THRESHOLDS.MINOR', () => {
    const result = _extractWeakDimensions(ALL_STRONG);
    expect(result).toEqual([]);
  });

  it('returns dims below THRESHOLDS.MINOR sorted ascending by score', () => {
    const result = _extractWeakDimensions(MIXED_DIMS);
    // V01=60, A01=65, V02=72 are all below 83
    expect(result.length).toBe(3);
    expect(result[0].score).toBe(60); // V01 worst
    expect(result[1].score).toBe(65); // A01
    expect(result[2].score).toBe(72); // V02
  });

  it('respects maxDims cap', () => {
    const result = _extractWeakDimensions(MIXED_DIMS, 2);
    expect(result.length).toBe(2);
    expect(result[0].score).toBe(60); // V01 worst
    expect(result[1].score).toBe(65); // A01
  });

  it('includes dimId, dimensionName, score in each entry', () => {
    const result = _extractWeakDimensions(MIXED_DIMS, 1);
    expect(result[0]).toMatchObject({
      dimId: 'V01',
      dimensionName: 'Market Vision',
      score: 60,
    });
  });

  it('handles numeric-valued dimension_scores', () => {
    const numericDims = { V01: 60, V02: 90 };
    const result = _extractWeakDimensions(numericDims);
    expect(result.length).toBe(1);
    expect(result[0].dimId).toBe('V01');
    expect(result[0].score).toBe(60);
    expect(result[0].dimensionName).toBe('V01'); // no .name field
  });

  it('uses dimId as dimensionName when .name is absent', () => {
    const dims = { V99: { score: 50 } }; // no .name
    const result = _extractWeakDimensions(dims);
    expect(result[0].dimensionName).toBe('V99');
  });
});

describe('_groupDimensions', () => {
  const dims = [
    { dimId: 'V01', dimensionName: 'Market Vision', score: 60 },
    { dimId: 'V02', dimensionName: 'Strategic Clarity', score: 72 },
    { dimId: 'A01', dimensionName: 'Technical Arch', score: 65 },
    { dimId: 'X01', dimensionName: 'Unknown', score: 50 },
  ];

  it('separates V-dims and A-dims correctly', () => {
    const { vDims, aDims } = _groupDimensions(dims);
    expect(vDims.map(d => d.dimId)).toEqual(['V01', 'V02']);
    expect(aDims.map(d => d.dimId)).toEqual(['A01']);
  });

  it('puts non-V/A dims in otherDims', () => {
    const { otherDims } = _groupDimensions(dims);
    expect(otherDims.map(d => d.dimId)).toEqual(['X01']);
  });

  it('returns empty arrays when no dims of a category', () => {
    const { vDims, aDims, otherDims } = _groupDimensions([
      { dimId: 'A01', dimensionName: 'A', score: 60 },
    ]);
    expect(vDims).toEqual([]);
    expect(aDims.length).toBe(1);
    expect(otherDims).toEqual([]);
  });

  it('handles empty input', () => {
    const { vDims, aDims, otherDims } = _groupDimensions([]);
    expect(vDims).toEqual([]);
    expect(aDims).toEqual([]);
    expect(otherDims).toEqual([]);
  });

  it('V-prefix matching is strict (no false positives)', () => {
    const { vDims } = _groupDimensions([{ dimId: 'VX99', score: 50, dimensionName: 'VX99' }]);
    expect(vDims.length).toBe(1); // VX99 starts with V
  });
});

describe('integration: _extractWeakDimensions + _groupDimensions', () => {
  it('TS-001: mixed dims produce 2 groups (V and A)', () => {
    const weak = _extractWeakDimensions(MIXED_DIMS, 3);
    const { vDims, aDims, otherDims } = _groupDimensions(weak);
    expect(vDims.length).toBe(2); // V01=60, V02=72
    expect(aDims.length).toBe(1); // A01=65
    expect(otherDims.length).toBe(0);
  });

  it('TS-002: all strong dims produce empty groups', () => {
    const weak = _extractWeakDimensions(ALL_STRONG);
    const { vDims, aDims, otherDims } = _groupDimensions(weak);
    expect(vDims.length).toBe(0);
    expect(aDims.length).toBe(0);
    expect(otherDims.length).toBe(0);
  });

  it('TS-004: V-dims only — no A group created', () => {
    const onlyV = { V01: { score: 60 }, A01: { score: 90 } };
    const weak = _extractWeakDimensions(onlyV);
    const { vDims, aDims } = _groupDimensions(weak);
    expect(vDims.length).toBe(1);
    expect(aDims.length).toBe(0);
  });
});
