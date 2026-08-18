// SD-FDBK-ENH-AUTO-APPLY-MIGRATION-001 FR-2 — pure diff over the RECENT-gap run-history baseline.
import { describe, it, expect } from 'vitest';
import { diffNewGaps } from '../../scripts/lib/migration-gap-baseline.mjs';

describe('diffNewGaps (FR-2)', () => {
  it('identifies exactly the files present now but not in the prior set', () => {
    expect(diffNewGaps(['A', 'B'], ['A', 'B', 'C'])).toEqual(['C']);
  });

  it('identical prior and current sets → zero new gaps', () => {
    expect(diffNewGaps(['A', 'B'], ['A', 'B'])).toEqual([]);
  });

  it('empty prior set → every current file is new (first run)', () => {
    expect(diffNewGaps([], ['A', 'B'])).toEqual(['A', 'B']);
  });

  it('a file removed from RECENT is simply absent from the diff — no negative signal', () => {
    expect(diffNewGaps(['A', 'B', 'C'], ['A'])).toEqual([]);
  });

  it('a file that was RECENT, then not, then RECENT again is treated as new against the immediately-prior set', () => {
    // Simulates: run 1 sees [A], run 2 (after a fix) sees [], run 3 (regression) sees [A] again.
    // Each call only ever compares against the LAST recorded baseline, so a re-appearance is new.
    expect(diffNewGaps([], ['A'])).toEqual(['A']);
  });

  it('handles undefined/null inputs without throwing', () => {
    expect(diffNewGaps(undefined, ['A'])).toEqual(['A']);
    expect(diffNewGaps(['A'], undefined)).toEqual([]);
    expect(diffNewGaps(null, null)).toEqual([]);
  });
});
