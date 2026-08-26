import { describe, it, expect } from 'vitest';
import { dedupeMixed } from './dedupe-mixed.js';

describe('dedupeMixed', () => {
  it('collapses duplicate strings', () => {
    expect(dedupeMixed(['a', 'b', 'a', 'c'], 10)).toEqual(['a', 'b', 'c']);
  });

  it('collapses duplicate object entries by value (a bare Set never does this)', () => {
    const result = dedupeMixed(
      [{ learning: 'x', category: 'process' }, { learning: 'x', category: 'process' }, { learning: 'y' }],
      10
    );
    expect(result).toEqual([{ learning: 'x', category: 'process' }, { learning: 'y' }]);
  });

  it('does not collapse objects that differ only in key order or a field value', () => {
    const result = dedupeMixed(
      [{ learning: 'x', category: 'process' }, { category: 'process', learning: 'x' }, { learning: 'x', category: 'other' }],
      10
    );
    // JSON.stringify key order depends on insertion order, so these are (correctly)
    // treated as distinct -- this dedup is a cheap heuristic, not deep equality.
    expect(result).toHaveLength(3);
  });

  it('caps output at max, preserving first-seen order', () => {
    expect(dedupeMixed(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });

  it('returns an empty array for empty input', () => {
    expect(dedupeMixed([], 5)).toEqual([]);
  });
});
