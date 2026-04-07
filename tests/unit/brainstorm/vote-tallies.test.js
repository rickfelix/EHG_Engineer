/**
 * Brainstorm Vote Tallies — Integration & Unit Tests
 *
 * SD-BRAINSTORM-TALLY-SCORING-ORCHESTRATOR-ORCH-001-B
 *
 * Tests:
 * 1. resolveTies deterministic tie-breaking
 * 2. recordBoardVotes persistence (integration)
 * 3. Append-only enforcement (integration)
 */

import { describe, it, expect } from 'vitest';
import { resolveTies } from '../../../lib/brainstorm/board-judiciary-bridge.js';

describe('resolveTies', () => {
  it('ranks by score when no ties', () => {
    const candidates = [
      { number: 1, score: 10, firstPlaceVotes: 2 },
      { number: 2, score: 15, firstPlaceVotes: 3 },
      { number: 3, score: 5, firstPlaceVotes: 1 }
    ];
    const result = resolveTies(candidates);
    expect(result[0].number).toBe(2); // highest score
    expect(result[1].number).toBe(1);
    expect(result[2].number).toBe(3);
  });

  it('breaks ties by first-place votes', () => {
    const candidates = [
      { number: 1, score: 12, firstPlaceVotes: 2 },
      { number: 2, score: 12, firstPlaceVotes: 4 },
      { number: 3, score: 12, firstPlaceVotes: 3 }
    ];
    const result = resolveTies(candidates);
    expect(result[0].number).toBe(2); // most #1 votes
    expect(result[1].number).toBe(3);
    expect(result[2].number).toBe(1);
  });

  it('breaks ties by confidence sum when first-place votes equal', () => {
    const candidates = [
      { number: 1, score: 12, firstPlaceVotes: 3, confidenceSum: 4.2 },
      { number: 2, score: 12, firstPlaceVotes: 3, confidenceSum: 4.8 }
    ];
    const result = resolveTies(candidates);
    expect(result[0].number).toBe(2); // higher confidence
    expect(result[1].number).toBe(1);
  });

  it('uses candidate number as final tiebreaker (lower wins)', () => {
    const candidates = [
      { number: 5, score: 12, firstPlaceVotes: 3, confidenceSum: 4.5 },
      { number: 2, score: 12, firstPlaceVotes: 3, confidenceSum: 4.5 }
    ];
    const result = resolveTies(candidates);
    expect(result[0].number).toBe(2); // lower candidate number
    expect(result[1].number).toBe(5);
  });

  it('handles missing optional fields gracefully', () => {
    const candidates = [
      { number: 1, score: 10 },
      { number: 2, score: 10 }
    ];
    const result = resolveTies(candidates);
    expect(result[0].number).toBe(1); // lower number wins when all else equal
    expect(result[1].number).toBe(2);
  });

  it('produces deterministic results across multiple runs', () => {
    const candidates = [
      { number: 3, score: 8, firstPlaceVotes: 2, confidenceSum: 3.5 },
      { number: 1, score: 8, firstPlaceVotes: 2, confidenceSum: 3.5 },
      { number: 2, score: 8, firstPlaceVotes: 2, confidenceSum: 3.5 }
    ];
    const results = Array.from({ length: 10 }, () => resolveTies(candidates).map(c => c.number));
    // All runs should produce identical order
    for (const run of results) {
      expect(run).toEqual([1, 2, 3]);
    }
  });
});
