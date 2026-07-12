/**
 * SD-FDBK-FIX-STAGE-PROMOTION-NEVER-001 (FR-4, TS-6)
 *
 * Regression test for backfill-venture-nursery-promotion-links.mjs
 * findHeuristicMatches() — the pure name-matching function.
 */
import { describe, it, expect } from 'vitest';
import { findHeuristicMatches } from '../../scripts/backfill-venture-nursery-promotion-links.mjs';

describe('findHeuristicMatches — name-only heuristic join', () => {
  it('matches a nursery row to a venture with the exact same name', () => {
    const nurseryRows = [{ id: 'n-1', name: 'Image Alt Text Generator' }];
    const ventures = [{ id: 'v-1', name: 'Image Alt Text Generator' }];
    const result = findHeuristicMatches(nurseryRows, ventures);
    expect(result).toEqual([
      { nursery_id: 'n-1', nursery_name: 'Image Alt Text Generator', venture_id: 'v-1' },
    ]);
  });

  it('returns no candidates when no nursery row has a matching venture name', () => {
    const nurseryRows = [{ id: 'n-1', name: 'Unmatched Idea' }];
    const ventures = [{ id: 'v-1', name: 'Something Else' }];
    expect(findHeuristicMatches(nurseryRows, ventures)).toEqual([]);
  });

  it('returns empty for empty inputs', () => {
    expect(findHeuristicMatches([], [])).toEqual([]);
    expect(findHeuristicMatches([], [{ id: 'v-1', name: 'X' }])).toEqual([]);
    expect(findHeuristicMatches([{ id: 'n-1', name: 'X' }], [])).toEqual([]);
  });

  it('matches multiple independent nursery rows to their respective ventures', () => {
    const nurseryRows = [
      { id: 'n-1', name: 'Alpha' },
      { id: 'n-2', name: 'Beta' },
      { id: 'n-3', name: 'Unmatched' },
    ];
    const ventures = [
      { id: 'v-1', name: 'Alpha' },
      { id: 'v-2', name: 'Beta' },
      { id: 'v-3', name: 'Gamma' },
    ];
    const result = findHeuristicMatches(nurseryRows, ventures);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.nursery_id).sort()).toEqual(['n-1', 'n-2']);
  });

  it('on a venture name collision, first-match-wins deterministically (never silently drops the row)', () => {
    const nurseryRows = [{ id: 'n-1', name: 'Duplicate Name' }];
    const ventures = [
      { id: 'v-first', name: 'Duplicate Name' },
      { id: 'v-second', name: 'Duplicate Name' },
    ];
    const result = findHeuristicMatches(nurseryRows, ventures);
    expect(result).toEqual([
      { nursery_id: 'n-1', nursery_name: 'Duplicate Name', venture_id: 'v-first' },
    ]);
  });
});
