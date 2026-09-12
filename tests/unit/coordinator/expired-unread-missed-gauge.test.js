// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D (FR-4 / TS-5, TS-6)
import { describe, it, expect } from 'vitest';
import {
  findExpiredUnreadMissed,
  stampMissedSurfaced,
  planExpiredUnreadMissedGauge,
} from '../../../lib/coordinator/expired-unread-missed-gauge.cjs';

function fakeSupabaseDetect(rows) {
  return {
    from() {
      const query = {
        select: () => query,
        lt: () => query,
        is: () => query,
        not: () => query,
        or: () => query,
        limit: async () => ({ data: rows, error: null }),
      };
      return query;
    },
  };
}

function fakeSupabaseDetectError(message) {
  return {
    from() {
      const query = {
        select: () => query,
        lt: () => query,
        is: () => query,
        not: () => query,
        or: () => query,
        limit: async () => ({ data: null, error: { message } }),
      };
      return query;
    },
  };
}

describe('findExpiredUnreadMissed', () => {
  it('detects a row that expired unread and not yet stamped', async () => {
    const rows = [{ id: 'row-1', target_session: 'seat-a', message_type: 'WORK_ASSIGNMENT', expires_at: '2026-09-07T00:00:00Z', payload: { kind: 'completion_nudge' } }];
    const supabase = fakeSupabaseDetect(rows);
    const result = await findExpiredUnreadMissed(supabase);
    expect(result.noData).toBe(false);
    expect(result.missed).toEqual(rows);
  });

  it('returns noData:true on a query failure, never a false-clean report', async () => {
    const supabase = fakeSupabaseDetectError('connection refused');
    const result = await findExpiredUnreadMissed(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });

  it('excludes target_session IS NULL rows, sentinel broadcast targets, and payload.kind=roll_call at the query level (live false-positive fix: 682 -> 9 real misses)', async () => {
    const capturedNots = [];
    let capturedOr = null;
    const supabase = {
      from() {
        const query = {
          select: () => query,
          lt: () => query,
          is: () => query,
          not: (col, op, val) => { capturedNots.push([col, op, val]); return query; },
          or: (expr) => { capturedOr = expr; return query; },
          limit: async () => ({ data: [], error: null }),
        };
        return query;
      },
    };
    await findExpiredUnreadMissed(supabase);
    expect(capturedNots).toContainEqual(['target_session', 'is', null]);
    const sentinelCall = capturedNots.find(([col, op]) => col === 'target_session' && op === 'in');
    expect(sentinelCall).toBeTruthy();
    // Bare 'broadcast' was removed from SENTINEL_TARGETS by QF-20260911-753 (0 of 91 rows
    // ever acknowledged, all-time) — it is deliberately NOT in this exclusion list anymore,
    // so rows still carrying it (legacy, or a future misuse) now count as missed rather
    // than being silently excluded as "legitimate broadcast."
    for (const sentinel of ['broadcast-coordinator', 'broadcast-solomon', 'broadcast-adam', 'broadcast-michael']) {
      expect(sentinelCall[2]).toContain(sentinel);
    }
    // Substring check, not a prefix false-positive: 'broadcast-coordinator' also contains
    // 'broadcast', so split into exact elements before asserting bare 'broadcast' is absent.
    expect(String(sentinelCall[2]).split(',')).not.toContain('broadcast');
    // Must use an is-null-OR-not-equal shape, never a bare .neq() -- NULL <> 'roll_call' is NULL
    // in SQL, which would silently drop every row with no payload.kind at all.
    expect(capturedOr).toContain('payload->>kind.is.null');
    expect(capturedOr).toContain('payload->>kind.neq.roll_call');
  });
});

describe('stampMissedSurfaced', () => {
  it('merges missed_surfaced_at into the existing payload without discarding other keys', async () => {
    let capturedUpdate = null;
    const supabase = {
      from() {
        const query = {
          update: (patch) => {
            capturedUpdate = patch;
            return query;
          },
          eq: () => query,
          is: async () => ({ error: null }),
        };
        return query;
      },
    };
    const rows = [{ id: 'row-1', payload: { kind: 'completion_nudge', current_sd: 'QF-1' } }];
    const { stamped, failed } = await stampMissedSurfaced(supabase, rows, { nowIso: '2026-09-07T05:00:00.000Z' });
    expect(stamped).toEqual(['row-1']);
    expect(failed).toEqual([]);
    expect(capturedUpdate).toEqual({
      payload: { kind: 'completion_nudge', current_sd: 'QF-1', missed_surfaced_at: '2026-09-07T05:00:00.000Z' },
    });
  });

  it('is idempotent: a second stamp attempt on an already-stamped row updates nothing new (re-assert filter at write time)', async () => {
    // Simulates the race guard: .is('payload->>missed_surfaced_at', null) at write time finds
    // zero matching rows for an already-stamped row (a concurrent run won), reported as failed.
    const supabase = {
      from() {
        const query = {
          update: () => query,
          eq: () => query,
          is: async () => ({ error: { message: 'no rows matched (already stamped)' } }),
        };
        return query;
      },
    };
    const rows = [{ id: 'row-1', payload: { missed_surfaced_at: '2026-09-07T04:00:00.000Z' } }];
    const { stamped, failed } = await stampMissedSurfaced(supabase, rows);
    expect(stamped).toEqual([]);
    expect(failed).toHaveLength(1);
  });

  it('handles a row with no existing payload object', async () => {
    let capturedUpdate = null;
    const supabase = {
      from() {
        const query = {
          update: (patch) => { capturedUpdate = patch; return query; },
          eq: () => query,
          is: async () => ({ error: null }),
        };
        return query;
      },
    };
    const rows = [{ id: 'row-2', payload: null }];
    await stampMissedSurfaced(supabase, rows, { nowIso: '2026-09-07T05:00:00.000Z' });
    expect(capturedUpdate).toEqual({ payload: { missed_surfaced_at: '2026-09-07T05:00:00.000Z' } });
  });
});

describe('planExpiredUnreadMissedGauge', () => {
  it('detects then stamps in one call, reporting the newly-stamped ids', async () => {
    const rows = [{ id: 'row-1', target_session: 'seat-a', message_type: 'WORK_ASSIGNMENT', expires_at: '2026-09-07T00:00:00Z', payload: { kind: 'completion_nudge' } }];
    const supabase = {
      // Each .from() call gets its own closure-tracked mode: whichever of select()/update() is
      // called first on this chain decides whether the later shared .is() call is chainable
      // (select/detect path) or a terminal async resolver (update/stamp path) -- the two chains
      // never share a query object, only the method NAME collides.
      from() {
        let mode = null;
        const query = {
          select: () => { mode = 'select'; return query; },
          lt: () => query,
          not: () => query,
          or: () => query,
          limit: async () => ({ data: rows, error: null }),
          update: () => { mode = 'update'; return query; },
          eq: () => query,
          is: () => (mode === 'update' ? Promise.resolve({ error: null }) : query),
        };
        return query;
      },
    };
    const result = await planExpiredUnreadMissedGauge(supabase);
    expect(result.noData).toBe(false);
    expect(result.missed).toEqual(rows);
    expect(result.stamped).toEqual(['row-1']);
    expect(result.failed).toEqual([]);
  });

  it('returns an empty report (no stamp attempt) when nothing qualifies', async () => {
    const supabase = fakeSupabaseDetect([]);
    const result = await planExpiredUnreadMissedGauge(supabase);
    expect(result.noData).toBe(false);
    expect(result.missed).toEqual([]);
    expect(result.stamped).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('propagates noData:true from the detection query without attempting to stamp', async () => {
    const supabase = fakeSupabaseDetectError('connection refused');
    const result = await planExpiredUnreadMissedGauge(supabase);
    expect(result.noData).toBe(true);
    expect(result.reason).toContain('connection refused');
  });
});
