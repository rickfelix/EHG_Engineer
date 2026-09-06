/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A -- scripts/seat-checkpoint-staleness-check.mjs.
 * TS-2 (flags an artificially-staled seat), TS-3 (fails loud on an unreachable table, never a
 * false-pass 0), TS-4/TS-6 (a seat_name with zero rows ever is stale, and the check has no
 * claude_sessions/local-file dependency at all).
 */
import { describe, it, expect } from 'vitest';
import {
  STALE_THRESHOLD_MS,
  NAMED_FIRST_INSTANCE,
  evaluateSeatStaleness,
  evaluateAllSeats,
  fetchNewestVerifiedPerSeat,
} from '../../scripts/seat-checkpoint-staleness-check.mjs';

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

describe('evaluateSeatStaleness', () => {
  it('is fresh when last_verified_at is well under 24h old', () => {
    const oneHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(evaluateSeatStaleness(oneHourAgo, NOW)).toEqual({ stale: false, ageMs: 60 * 60 * 1000 });
  });

  // TS-2
  it('is stale when last_verified_at is just over 24h old', () => {
    const twentyFiveHoursAgo = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const result = evaluateSeatStaleness(twentyFiveHoursAgo, NOW);
    expect(result.stale).toBe(true);
    expect(result.ageMs).toBeGreaterThan(STALE_THRESHOLD_MS);
  });

  it('is exactly at the boundary (24h) counted as NOT stale (strictly greater-than)', () => {
    const exactlyTwentyFourHoursAgo = new Date(NOW - STALE_THRESHOLD_MS).toISOString();
    expect(evaluateSeatStaleness(exactlyTwentyFourHoursAgo, NOW).stale).toBe(false);
  });

  // TS-4: a seat_name with zero rows ever must read as stale (age=Infinity), never skipped.
  it('undefined/never-mirrored reads as maximally stale', () => {
    expect(evaluateSeatStaleness(undefined, NOW)).toEqual({ stale: true, ageMs: Infinity });
  });

  it('a malformed timestamp reads as maximally stale, never a silent pass', () => {
    expect(evaluateSeatStaleness('not-a-date', NOW)).toEqual({ stale: true, ageMs: Infinity });
  });
});

describe('evaluateAllSeats', () => {
  it('reports 0 stale seats when all 4 fixed seats are fresh', () => {
    const fresh = new Date(NOW - 60 * 60 * 1000).toISOString();
    const { staleSeats, results } = evaluateAllSeats(
      { adam: fresh, solomon: fresh, coordinator: fresh, michael: fresh },
      NOW
    );
    expect(staleSeats).toHaveLength(0);
    expect(results).toHaveLength(4);
  });

  // TS-2
  it('names exactly the stale seat(s), not the whole set', () => {
    const fresh = new Date(NOW - 60 * 60 * 1000).toISOString();
    const stale = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
    const { staleSeats } = evaluateAllSeats(
      { adam: fresh, solomon: stale, coordinator: fresh, michael: fresh },
      NOW
    );
    expect(staleSeats).toEqual([{ seatName: 'solomon', ageMs: expect.any(Number) }]);
  });

  // TS-4: a seat_name absent from the map (never mirrored) is stale, never excluded.
  it('a seat_name with NO entry in the map at all is reported as stale, not skipped', () => {
    const fresh = new Date(NOW - 60 * 60 * 1000).toISOString();
    const { staleSeats } = evaluateAllSeats({ adam: fresh, solomon: fresh, coordinator: fresh }, NOW); // michael absent
    expect(staleSeats.map((s) => s.seatName)).toContain('michael');
  });

  it('the Solomon named-first-instance constant matches the fixed registry', () => {
    expect(NAMED_FIRST_INSTANCE).toBe('solomon');
  });
});

describe('fetchNewestVerifiedPerSeat', () => {
  function stubSupabase(rows, error = null) {
    return {
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: rows, error }),
        }),
      }),
    };
  }

  it('returns the newest last_verified_at per seat_name (first row wins, query already ordered DESC)', async () => {
    const rows = [
      { seat_name: 'adam', last_verified_at: '2026-09-06T10:00:00Z' },
      { seat_name: 'adam', last_verified_at: '2026-09-06T08:00:00Z' }, // older, must be ignored
      { seat_name: 'solomon', last_verified_at: '2026-09-06T09:00:00Z' },
    ];
    const result = await fetchNewestVerifiedPerSeat(stubSupabase(rows));
    expect(result).toEqual({ adam: '2026-09-06T10:00:00Z', solomon: '2026-09-06T09:00:00Z' });
  });

  it('returns an empty object (never a throw) when the table has zero rows', async () => {
    const result = await fetchNewestVerifiedPerSeat(stubSupabase([]));
    expect(result).toEqual({});
  });

  // TS-3: THIS IS THE CORE FIX. An unreachable table / query error MUST throw, never resolve to
  // an empty/0 result a caller could mistake for "genuinely 0 stale".
  it('THROWS on a query error -- never returns a false-pass empty result', async () => {
    await expect(fetchNewestVerifiedPerSeat(stubSupabase(null, { message: 'relation does not exist' })))
      .rejects.toThrow(/relation does not exist/);
  });
});
