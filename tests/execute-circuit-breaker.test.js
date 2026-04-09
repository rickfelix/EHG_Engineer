/**
 * Unit tests for execute-circuit-breaker.mjs
 * SD: SD-MULTISESSION-EXECUTION-TEAM-COMMAND-ORCH-001-A (FR-005)
 *
 * Pure function tests — no DB, no I/O. Validates rolling-window failure tracking.
 */

import { describe, test, expect } from 'vitest';
import { recordFailure, shouldHalt, initState } from '../lib/execute/execute-circuit-breaker.mjs';

describe('execute-circuit-breaker', () => {
  describe('initState', () => {
    test('returns sane defaults', () => {
      const s = initState();
      expect(s.failure_threshold).toBe(3);
      expect(s.failure_window_min).toBe(10);
      expect(s.recent_failures).toEqual([]);
    });

    test('accepts overrides', () => {
      const s = initState({ failure_threshold: 5, failure_window_min: 20 });
      expect(s.failure_threshold).toBe(5);
      expect(s.failure_window_min).toBe(20);
    });
  });

  describe('recordFailure', () => {
    test('first failure does not trigger halt', () => {
      const t0 = new Date('2026-04-09T12:00:00Z');
      const { state, halted } = recordFailure(initState(), t0);
      expect(state.recent_failures).toHaveLength(1);
      expect(halted).toBe(false);
    });

    test('three failures within window trigger halt', () => {
      let s = initState();
      const t0 = new Date('2026-04-09T12:00:00Z');
      const t1 = new Date('2026-04-09T12:02:00Z');
      const t2 = new Date('2026-04-09T12:05:00Z');

      ({ state: s } = recordFailure(s, t0));
      ({ state: s } = recordFailure(s, t1));
      const { state: final, halted } = recordFailure(s, t2);

      expect(final.recent_failures).toHaveLength(3);
      expect(halted).toBe(true);
    });

    test('failures spread beyond window do NOT trigger halt (oldest pruned)', () => {
      let s = initState({ failure_window_min: 10 });
      const t0 = new Date('2026-04-09T12:00:00Z');
      const t1 = new Date('2026-04-09T12:05:00Z');
      const t2 = new Date('2026-04-09T12:11:00Z'); // 11 min after t0 — t0 prunes
      const t3 = new Date('2026-04-09T12:16:00Z'); // 11 min after t1 — t1 prunes

      ({ state: s } = recordFailure(s, t0));
      ({ state: s } = recordFailure(s, t1));
      ({ state: s } = recordFailure(s, t2));
      const { state: final, halted } = recordFailure(s, t3);

      // After t3: only t2 + t3 should remain (t0 pruned at t2, t1 pruned at t3)
      expect(final.recent_failures).toHaveLength(2);
      expect(halted).toBe(false);
    });

    test('respects custom threshold', () => {
      let s = initState({ failure_threshold: 5 });
      const base = new Date('2026-04-09T12:00:00Z');
      for (let i = 0; i < 4; i++) {
        const t = new Date(base.getTime() + i * 60_000);
        ({ state: s } = recordFailure(s, t));
      }
      // 4 failures, threshold 5, should NOT halt
      const four = recordFailure(initState({ failure_threshold: 5 }), base);
      expect(four.halted).toBe(false);

      // 5th failure → halt
      const t5 = new Date(base.getTime() + 4 * 60_000);
      const fifth = recordFailure(s, t5);
      expect(fifth.state.recent_failures).toHaveLength(5);
      expect(fifth.halted).toBe(true);
    });

    test('handles missing/null state gracefully', () => {
      const t0 = new Date('2026-04-09T12:00:00Z');
      const r = recordFailure(null, t0);
      expect(r.state.recent_failures).toHaveLength(1);
      expect(r.halted).toBe(false);
    });

    test('ignores invalid timestamp strings', () => {
      const state = {
        failure_threshold: 3,
        failure_window_min: 10,
        recent_failures: ['not-a-date', 'also bad']
      };
      const t0 = new Date('2026-04-09T12:00:00Z');
      const { state: out, halted } = recordFailure(state, t0);
      // Bad entries pruned + 1 new entry
      expect(out.recent_failures).toHaveLength(1);
      expect(halted).toBe(false);
    });
  });

  describe('shouldHalt', () => {
    test('returns false when below threshold', () => {
      const state = {
        failure_threshold: 3,
        failure_window_min: 10,
        recent_failures: ['2026-04-09T12:00:00Z', '2026-04-09T12:01:00Z']
      };
      expect(shouldHalt(state, new Date('2026-04-09T12:02:00Z'))).toBe(false);
    });

    test('returns true when at threshold within window', () => {
      const state = {
        failure_threshold: 3,
        failure_window_min: 10,
        recent_failures: ['2026-04-09T12:00:00Z', '2026-04-09T12:01:00Z', '2026-04-09T12:02:00Z']
      };
      expect(shouldHalt(state, new Date('2026-04-09T12:03:00Z'))).toBe(true);
    });

    test('returns false when oldest failures fall outside window', () => {
      const state = {
        failure_threshold: 3,
        failure_window_min: 10,
        recent_failures: ['2026-04-09T11:00:00Z', '2026-04-09T11:30:00Z', '2026-04-09T11:45:00Z']
      };
      // At 12:00, t0 is 60min old, t1 is 30min old, t2 is 15min old → all outside 10-min window
      expect(shouldHalt(state, new Date('2026-04-09T12:00:00Z'))).toBe(false);
    });

    test('does not mutate input state', () => {
      const state = {
        failure_threshold: 3,
        failure_window_min: 10,
        recent_failures: ['2026-04-09T12:00:00Z']
      };
      shouldHalt(state, new Date('2026-04-09T12:01:00Z'));
      expect(state.recent_failures).toHaveLength(1);
    });
  });
});
