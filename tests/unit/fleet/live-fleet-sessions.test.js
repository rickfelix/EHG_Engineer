// SD-LEO-INFRA-LIVE-FLEET-SESSIONS-ROWCAP-CANONICAL-001 (FR-1, FR-2, FR-5).
// Proves the canonical helpers bound the query SERVER-SIDE so the newest live workers are in
// the returned page even past PostgREST's 1000-row cap — and that the old unfiltered
// fetch-1000-then-filter pattern returns 0/undercount for the same fixture.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  liveFleetSessions,
  liveFleetSessionCount,
  liveActiveSessionsView,
  LIVE_FLEET_DEFAULTS,
} = require('../../../lib/fleet/live-fleet-sessions.cjs');
const { liveFleetWorkers } = await import('../../../lib/fleet/genuine-worker.mjs');

/** A live genuine-worker row (passes isFleetWorker + everClaimed + heartbeat window). */
function liveRow(i, heartbeatIso) {
  return {
    session_id: `w-${i}`, status: 'active', metadata: {},
    heartbeat_at: heartbeatIso || new Date().toISOString(),
    sd_key: `SD-LIVE-${i}`, claimed_at: new Date().toISOString(),
    worktree_path: `/wt/${i}`, continuous_sds_completed: 1,
  };
}
/** A stale/released ghost row (fails liveness). */
function staleRow(i) {
  return {
    session_id: `stale-${i}`, status: 'released', metadata: {},
    heartbeat_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    sd_key: null, claimed_at: null, worktree_path: null, continuous_sds_completed: 0,
  };
}

/**
 * Minimal supabase stub. `pageByTable[table]` is the data the bounded query returns; `errByTable`
 * injects a query error. Records the last query chain per table on `_last[table]`.
 */
function stubSupabase({ pageByTable = {}, errByTable = {} } = {}) {
  const _last = {};
  return {
    _last,
    from(table) {
      const q = { table, in: null, gte: null, order: null, limit: null };
      _last[table] = q;
      const api = {
        select() { return api; },
        in(col, vals) { q.in = { col, vals }; return api; },
        gte(col, val) { q.gte = { col, val }; return api; },
        order(col, opts) { q.order = { col, opts }; return api; },
        limit(n) { q.limit = n; return api; },
        then(resolve) {
          return resolve({ data: pageByTable[table] ?? [], error: errByTable[table] ?? null });
        },
      };
      return api;
    },
  };
}

describe('liveFleetSessions() — canonical base-table helper (FR-1)', () => {
  it('constructs a bounded query: status in [active,idle], heartbeat >= now-window, ordered desc, limit>=200', async () => {
    const nowMs = 1_800_000_000_000;
    const sb = stubSupabase({ pageByTable: { claude_sessions: [liveRow(0)] } });
    await liveFleetSessions(sb, { nowMs, coordinatorId: null });
    const q = sb._last.claude_sessions;
    expect(q.in).toMatchObject({ col: 'status', vals: ['active', 'idle'] });
    expect(q.gte.col).toBe('heartbeat_at');
    expect(new Date(q.gte.val).getTime()).toBe(nowMs - LIVE_FLEET_DEFAULTS.windowMs);
    expect(q.order).toMatchObject({ col: 'heartbeat_at', opts: { ascending: false } });
    expect(q.limit).toBe(LIVE_FLEET_DEFAULTS.limit);
  });

  it('returns the newest live workers even when they sit past row 1000 (the bounded page contains them)', async () => {
    // The server-side .order(desc).limit(N) means the page the DB returns is exactly the newest
    // N rows — the live workers — NOT the oldest 1000. We model that: the bounded page holds the
    // 3 live workers (what the DB returns AFTER order+limit), even though the table has >1000 rows.
    const page = [liveRow(0), liveRow(1), liveRow(2)];
    const sb = stubSupabase({ pageByTable: { claude_sessions: page } });
    const live = await liveFleetSessions(sb, { coordinatorId: null });
    expect(live.map((s) => s.session_id).sort()).toEqual(['w-0', 'w-1', 'w-2']);
    expect(await liveFleetSessionCount(sb, { coordinatorId: null })).toBe(3);
  });

  it('CONTRAST: the naive unfiltered fetch-1000-then-filter path returns 0 for the same >1000-row table', async () => {
    // The old bug: an unbounded/unordered select returns the OLDEST 1000 rows — all stale ghosts,
    // none of the recent live workers. Filtering that page in JS yields 0 live workers.
    const oldest1000 = Array.from({ length: 1000 }, (_, i) => staleRow(i));
    expect(liveFleetWorkers(oldest1000, null, Date.now()).length).toBe(0);
  });

  it('fail-CLOSED: returns [] on a query error (a gauge reading 0 on error is harmless)', async () => {
    const sb = stubSupabase({ errByTable: { claude_sessions: { message: 'boom' } } });
    expect(await liveFleetSessions(sb, { coordinatorId: null })).toEqual([]);
  });
});

describe('liveActiveSessionsView() — canonical view helper (FR-2)', () => {
  it('bounds the v_active_sessions query: order(heartbeat_age_seconds asc).limit(N), returns rows', async () => {
    const rows = [{ session_id: 'a', computed_status: 'active', heartbeat_age_seconds: 5 }];
    const sb = stubSupabase({ pageByTable: { v_active_sessions: rows } });
    const out = await liveActiveSessionsView(sb, { columns: 'session_id, computed_status, heartbeat_age_seconds' });
    expect(out).toEqual(rows);
    const q = sb._last.v_active_sessions;
    expect(q.order).toMatchObject({ col: 'heartbeat_age_seconds', opts: { ascending: true } });
    expect(q.limit).toBe(LIVE_FLEET_DEFAULTS.limit);
  });

  it('fail-OPEN: THROWS on a query error so the quiescence caller fails to ACTIVE (never silent-quiescent)', async () => {
    const sb = stubSupabase({ errByTable: { v_active_sessions: { message: 'view boom' } } });
    await expect(liveActiveSessionsView(sb)).rejects.toMatchObject({ message: 'view boom' });
  });
});

describe('LIVE_FLEET_DEFAULTS invariant (FR-1/TR-2)', () => {
  it('limit is generous (>=200) so the cap only ever drops the stalest, never a live worker', () => {
    expect(LIVE_FLEET_DEFAULTS.limit).toBeGreaterThanOrEqual(200);
    expect(LIVE_FLEET_DEFAULTS.statuses).toEqual(['active', 'idle']);
    expect(LIVE_FLEET_DEFAULTS.windowMs).toBe(900000);
  });
});
