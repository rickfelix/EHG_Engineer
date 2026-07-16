/**
 * Unit tests for lib/governance/hold-state-sweep.js.
 * SD-LEO-INFRA-HOLD-STATE-CONTRACT-001 (FR-6) — covers TS-5 (pure portion).
 */
import { describe, it, expect } from 'vitest';
import { findOverdueHolds } from '../../../lib/governance/hold-state-sweep.js';

const NOW = Date.parse('2026-08-15T00:00:00Z');
const PAST = '2026-08-01T00:00:00Z';
const FUTURE = '2026-09-01T00:00:00Z';

describe('findOverdueHolds', () => {
  it('TS-5: flags a parked SD whose park_review_at has passed', () => {
    const rows = [{ sd_key: 'SD-A', status: 'deferred', metadata: { park_review_at: PAST } }];
    const { count, overdue } = findOverdueHolds(rows, NOW);
    expect(count).toBe(1);
    expect(overdue[0]).toMatchObject({ sd_key: 'SD-A', surface: 'sd_park', review_at: PAST });
  });

  it('does not flag a park whose review_at is still in the future', () => {
    const rows = [{ sd_key: 'SD-B', status: 'deferred', metadata: { park_review_at: FUTURE } }];
    expect(findOverdueHolds(rows, NOW).count).toBe(0);
  });

  it('does not flag a park that has already been unparked (status no longer deferred)', () => {
    const rows = [{ sd_key: 'SD-C', status: 'active', metadata: { park_review_at: PAST } }];
    expect(findOverdueHolds(rows, NOW).count).toBe(0);
  });

  it('flags an overdue exec_boundary_hold only while the hold is still active (true)', () => {
    const active = [{ sd_key: 'SD-D', status: 'active', metadata: { exec_boundary_hold: true, exec_boundary_hold_review_at: PAST } }];
    expect(findOverdueHolds(active, NOW).count).toBe(1);

    const cleared = [{ sd_key: 'SD-D', status: 'active', metadata: { exec_boundary_hold: false, exec_boundary_hold_review_at: PAST } }];
    expect(findOverdueHolds(cleared, NOW).count).toBe(0);
  });

  it('flags an overdue min_tier_rank floor regardless of status (a floor has no active boolean)', () => {
    const rows = [{ sd_key: 'SD-E', status: 'in_progress', metadata: { min_tier_rank: 4, min_tier_rank_review_at: PAST } }];
    const { count, overdue } = findOverdueHolds(rows, NOW);
    expect(count).toBe(1);
    expect(overdue[0].surface).toBe('min_tier_rank');
  });

  it('a row with no hold-review_at keys at all is never flagged', () => {
    const rows = [{ sd_key: 'SD-F', status: 'active', metadata: {} }, { sd_key: 'SD-G', status: 'draft', metadata: null }];
    expect(findOverdueHolds(rows, NOW).count).toBe(0);
  });

  it('a single SD can carry multiple overdue surfaces simultaneously, each counted separately', () => {
    const rows = [{
      sd_key: 'SD-MULTI', status: 'deferred',
      metadata: { park_review_at: PAST, min_tier_rank: 4, min_tier_rank_review_at: PAST },
    }];
    const { count, overdue } = findOverdueHolds(rows, NOW);
    expect(count).toBe(2);
    expect(overdue.map((o) => o.surface).sort()).toEqual(['min_tier_rank', 'sd_park']);
  });

  it('ignores an unparseable review_at rather than throwing', () => {
    const rows = [{ sd_key: 'SD-BAD', status: 'deferred', metadata: { park_review_at: 'not-a-date' } }];
    expect(() => findOverdueHolds(rows, NOW)).not.toThrow();
    expect(findOverdueHolds(rows, NOW).count).toBe(0);
  });

  it('handles an empty/undefined row list', () => {
    expect(findOverdueHolds([], NOW)).toEqual({ count: 0, overdue: [] });
    expect(findOverdueHolds(undefined, NOW)).toEqual({ count: 0, overdue: [] });
  });
});
