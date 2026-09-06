import { describe, it, expect } from 'vitest';
import { UNSCORED, COMPARATOR_VERSION, computePriorityScore, compareByPriorityScore } from './comparator.cjs';

describe('computePriorityScore', () => {
  it('scores all 4 numeric components and averages them when all inputs present', () => {
    const result = computePriorityScore({}, { criticality: 8, alignment: 4, leverage: 6, age: 2 });
    expect(result.components).toEqual({ criticality: 8, alignment: 4, leverage: 6, age: 2 });
    expect(result.score).toBe((8 + 4 + 6 + 2) / 4);
    expect(result.comparatorVersion).toBe(COMPARATOR_VERSION);
  });

  it('reads a missing component as the literal string UNSCORED, never a fabricated 0', () => {
    const result = computePriorityScore({}, { criticality: 8 });
    expect(result.components.alignment).toBe(UNSCORED);
    expect(result.components.leverage).toBe(UNSCORED);
    expect(result.components.age).toBe(UNSCORED);
    expect(result.components.alignment).not.toBe(0);
  });

  it('computes score from only the present components when some are missing', () => {
    const result = computePriorityScore({}, { criticality: 10, alignment: 6 });
    expect(result.score).toBe((10 + 6) / 2);
  });

  it('reads overall score as UNSCORED when every component is missing (never 0)', () => {
    const result = computePriorityScore({}, {});
    expect(result.components).toEqual({
      criticality: UNSCORED, alignment: UNSCORED, leverage: UNSCORED, age: UNSCORED,
    });
    expect(result.score).toBe(UNSCORED);
  });

  it('never returns fewer than all 4 named components', () => {
    const result = computePriorityScore({}, { criticality: 5 });
    expect(Object.keys(result.components).sort()).toEqual(['age', 'alignment', 'criticality', 'leverage']);
  });

  it('treats non-finite or non-numeric inputs (NaN, Infinity, string, null) as UNSCORED', () => {
    const result = computePriorityScore({}, { criticality: NaN, alignment: Infinity, leverage: '7', age: null });
    expect(result.components).toEqual({
      criticality: UNSCORED, alignment: UNSCORED, leverage: UNSCORED, age: UNSCORED,
    });
  });

  it('does not throw when inputs is undefined or not an object', () => {
    expect(() => computePriorityScore({}, undefined)).not.toThrow();
    expect(() => computePriorityScore({})).not.toThrow();
    expect(computePriorityScore({}, null).score).toBe(UNSCORED);
  });

  it('does not mutate the item argument', () => {
    const item = { sd_key: 'SD-TEST-001' };
    const snapshot = { ...item };
    computePriorityScore(item, { criticality: 5 });
    expect(item).toEqual(snapshot);
  });
});

describe('compareByPriorityScore', () => {
  it('orders descending by score (higher score first)', () => {
    const a = { score: 3 };
    const b = { score: 7 };
    expect(compareByPriorityScore(a, b)).toBeGreaterThan(0); // a sorts after b
    expect(compareByPriorityScore(b, a)).toBeLessThan(0); // b sorts before a
  });

  it('sorts an UNSCORED score after every numeric score', () => {
    const scored = { score: 1 };
    const unscored = { score: UNSCORED };
    expect(compareByPriorityScore(unscored, scored)).toBeGreaterThan(0);
    expect(compareByPriorityScore(scored, unscored)).toBeLessThan(0);
  });

  it('is stable (returns 0) when both sides are UNSCORED', () => {
    expect(compareByPriorityScore({ score: UNSCORED }, { score: UNSCORED })).toBe(0);
  });

  it('does not throw on a null/undefined score object', () => {
    expect(() => compareByPriorityScore(null, undefined)).not.toThrow();
    expect(compareByPriorityScore(null, undefined)).toBe(0);
  });
});
