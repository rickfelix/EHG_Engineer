/**
 * SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-A — fleet panel route unit tests.
 * Calls the exported handler directly with mock req/res (no supertest, no live DB) --
 * the injected req.app.locals.supabase seam mirrors server/routes/ventures.js's own pattern.
 *
 * QF-20260725-423 extended these to cover the liveness filter. The mock below is now a
 * CHAINABLE builder rather than `select().order()` returning a promise directly: the route
 * builds `.select().order().limit()` and conditionally `.lt()`, so a mock that resolves at
 * `.order()` would throw "limit is not a function" and never exercise the real path. The
 * builder also RECORDS the calls, so the tests can assert the query was ordered by the
 * numeric `heartbeat_age_seconds` and not the display string `heartbeat_age_human` — that
 * substitution is the actual defect, and it is invisible in the response body.
 */
import { describe, it, expect, vi } from 'vitest';

// loadStore is mocked to an empty store (no FS); buildNamedAccountChips is the REAL pure
// function (via importActual) so the route genuinely renders exactly 3 named chips.
vi.mock('../../../lib/fleet/account-capacity-gauge.cjs', async (importActual) => {
  const actual = await importActual();
  return { ...actual, loadStore: vi.fn(() => ({})) };
});

// SD-LEO-FEAT-ACCOUNT-USAGE-STRIP-001: the usage reader is mocked at the ROUTE boundary only —
// it reads real credentials off disk and calls a live endpoint, neither of which belongs in a unit
// test. Its own behaviour (every failure mode) is covered in tests/unit/fleet/account-usage-reader.
const MOCK_USAGE = [
  { name: 'Deep Soul Sessions', state: 'unavailable', reason: 'not_configured', fetchedAt: '2026-07-26T21:00:00.000Z' },
  { name: 'Code Street Labs', state: 'ok', weeklyPct: 54, fiveHourPct: 11, weeklyResetsAt: '2026-08-02T00:00:00Z', fiveHourResetsAt: null, fetchedAt: '2026-07-26T21:00:00.000Z' },
  { name: 'Rick Felix 2000', state: 'ok', weeklyPct: 11, fiveHourPct: 3, weeklyResetsAt: null, fiveHourResetsAt: null, fetchedAt: '2026-07-26T21:00:00.000Z' },
];
vi.mock('../../../lib/fleet/account-usage-reader.cjs', () => ({
  getAccountUsage: vi.fn(async () => MOCK_USAGE),
}));

const { getFleetPanel } = await import('../../../server/routes/fleet-panel.js');

function mockRes() {
  const res = {};
  res.json = vi.fn(() => res);
  return res;
}

function mockReq(supabase, query = {}) {
  return { app: { locals: { supabase } }, query };
}

/**
 * Chainable v_active_sessions query builder. `calls` captures what the route asked for so a
 * test can assert on the QUERY, not just the payload. Thenable so `await query` resolves.
 */
function sessionsBuilder(rows, calls) {
  const builder = {
    select: (cols) => { calls.select = cols; return builder; },
    order: (col, opts) => { calls.order = { col, opts }; return builder; },
    limit: (n) => { calls.limit = n; return builder; },
    lt: (col, value) => { calls.lt = { col, value }; return builder; },
    then: (resolve) => resolve({ data: rows, error: null }),
  };
  return builder;
}

function mockSupabase(rows, calls = {}) {
  return {
    calls,
    from: vi.fn((table) => {
      if (table === 'v_active_sessions') return sessionsBuilder(rows, calls);
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    }),
  };
}

const LIVE_WORKER = {
  session_id: 'abc-123',
  sd_key: 'SD-TEST-001',
  computed_status: 'active',
  heartbeat_age_human: '5s ago',
  heartbeat_age_seconds: 5,
  metadata: {
    fleet_identity: { callsign: 'Golf-3', color: 'blue', role: 'worker' },
    model: 'sonnet',
    effort: 'xhigh',
  },
};

// No callsign, no role, no model — heartbeating but identity-less. This is the ghost shape.
const GHOST = {
  session_id: 'ghost-1',
  sd_key: null,
  computed_status: 'active',
  heartbeat_age_human: '3s ago',
  heartbeat_age_seconds: 3,
  metadata: {},
};

describe('GET /api/fleet-panel', () => {
  it('returns structured sessions/accountChips/attentionStrip for populated sessions', async () => {
    const supabase = mockSupabase([LIVE_WORKER]);
    const res = mockRes();
    await getFleetPanel(mockReq(supabase), res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      session_id: 'abc-123',
      callsign: 'Golf-3',
      color: 'blue',
      role: 'worker',
      model_effort: 'sonnet/xhigh',
      status: 'active',
    });
    // FR-1/FR-2: exactly 3 named-account chips render (empty store → all wkPct null).
    expect(Array.isArray(payload.accountChips)).toBe(true);
    expect(payload.accountChips).toHaveLength(3);
    expect(payload.accountChips.map((c) => c.name)).toEqual(['Deep Soul', 'Rick Felix', 'CodeStreet']);
    expect(payload.accountChips.every((c) => c.wkPct === null)).toBe(true);
    expect(Array.isArray(payload.attentionStrip)).toBe(true);
  });

  it('orders by the NUMERIC heartbeat_age_seconds, never the display string', async () => {
    const supabase = mockSupabase([LIVE_WORKER]);
    await getFleetPanel(mockReq(supabase), mockRes());

    // The original defect: ordering by heartbeat_age_human sorted "15m ago" before "5s ago".
    expect(supabase.calls.order).toEqual({ col: 'heartbeat_age_seconds', opts: { ascending: true } });
    expect(supabase.calls.select).toContain('heartbeat_age_seconds');
  });

  it('defaults to live-only: filters on the 1h window and reports liveOnly', async () => {
    const supabase = mockSupabase([LIVE_WORKER]);
    const res = mockRes();
    await getFleetPanel(mockReq(supabase), res);

    expect(supabase.calls.lt).toEqual({ col: 'heartbeat_age_seconds', value: 3600 });
    expect(res.json.mock.calls[0][0].filter).toMatchObject({ liveOnly: true, windowSeconds: 3600 });
  });

  it('?all=1 drops the liveness filter so the history stays reachable', async () => {
    const supabase = mockSupabase([LIVE_WORKER, GHOST]);
    const res = mockRes();
    await getFleetPanel(mockReq(supabase, { all: '1' }), res);

    // The fix FILTERS the default view; it must not destroy access to the rows behind it.
    expect(supabase.calls.lt).toBeUndefined();
    const payload = res.json.mock.calls[0][0];
    expect(payload.filter.liveOnly).toBe(false);
    expect(payload.sessions).toHaveLength(2);
    expect(payload.filter.ghostsHidden).toBe(0);
  });

  it('?windowSeconds= overrides the window; a non-numeric value falls back to the default', async () => {
    const custom = mockSupabase([LIVE_WORKER]);
    const customRes = mockRes();
    await getFleetPanel(mockReq(custom, { windowSeconds: '300' }), customRes);
    expect(custom.calls.lt.value).toBe(300);
    expect(customRes.json.mock.calls[0][0].filter.windowSeconds).toBe(300);

    const junk = mockSupabase([LIVE_WORKER]);
    await getFleetPanel(mockReq(junk, { windowSeconds: 'abc' }), mockRes());
    expect(junk.calls.lt.value).toBe(3600);
  });

  it('hides identity-less ghosts by default and counts them, but keeps them under ?all=1', async () => {
    const supabase = mockSupabase([LIVE_WORKER, GHOST]);
    const res = mockRes();
    await getFleetPanel(mockReq(supabase), res);

    // Ghosts heartbeat, so the recency filter above cannot catch them — the absence of any
    // identity is what separates them from a real session that is simply not stamped yet.
    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions.map((s) => s.session_id)).toEqual(['abc-123']);
    expect(payload.filter.ghostsHidden).toBe(1);
  });

  it('keeps role sessions and not-yet-stamped workers, which are NOT ghosts', async () => {
    const roleSession = {
      session_id: 'coord-1',
      sd_key: null,
      computed_status: 'active',
      heartbeat_age_human: '2s ago',
      heartbeat_age_seconds: 2,
      metadata: { role: 'solomon' },
    };
    const unstamped = {
      session_id: 'fresh-1',
      sd_key: null,
      computed_status: 'active',
      heartbeat_age_human: '1s ago',
      heartbeat_age_seconds: 1,
      metadata: { model: 'opus' },
    };
    const res = mockRes();
    await getFleetPanel(mockReq(mockSupabase([roleSession, unstamped])), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.filter.ghostsHidden).toBe(0);
    expect(payload.sessions).toHaveLength(2);
    // A role session reads as itself rather than as a blank row.
    expect(payload.sessions[0]).toMatchObject({ callsign: 'solomon', identity_kind: 'solomon' });
    // A freshly spawned worker has no callsign yet — that is honest, not a ghost.
    expect(payload.sessions[1]).toMatchObject({ callsign: null, identity_kind: 'unstamped' });
  });

  it('reports truncated=true when the page hits the row cap, false otherwise', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      ...LIVE_WORKER,
      session_id: `s-${i}`,
      heartbeat_age_seconds: i,
    }));
    const cappedRes = mockRes();
    await getFleetPanel(mockReq(mockSupabase(full)), cappedRes);
    // A capped page must never be presented as the true total — that is what made 1000 rows
    // of mostly-dead sessions read as a complete list.
    expect(cappedRes.json.mock.calls[0][0].filter.truncated).toBe(true);

    const shortRes = mockRes();
    await getFleetPanel(mockReq(mockSupabase([LIVE_WORKER])), shortRes);
    expect(shortRes.json.mock.calls[0][0].filter.truncated).toBe(false);
  });

  it('degrades missing model/effort metadata to a placeholder, never a crash', async () => {
    // REWRITTEN for QF-20260725-423: this case previously used a row with `metadata: {}` and
    // asserted it still rendered. Under the ghost filter such a row is hidden by default, so
    // the row now carries a model (making it a real, not-yet-stamped session) — which is what
    // the assertion was always about: absent model/effort must degrade, not throw.
    const res = mockRes();
    await getFleetPanel(mockReq(mockSupabase([{
      session_id: 'no-meta-session',
      sd_key: null,
      computed_status: 'idle',
      heartbeat_age_human: '1m ago',
      heartbeat_age_seconds: 60,
      metadata: { model: 'opus' },
    }])), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.sessions[0].model_effort).toBe('opus/--');
    expect(payload.sessions[0].callsign).toBeNull();
  });

  it('FR-4 — exposes accountUsage additively without reshaping the legacy accountChips (TS-10)', async () => {
    const res = mockRes();
    await getFleetPanel(mockReq(mockSupabase([LIVE_WORKER])), res);
    const payload = res.json.mock.calls[0][0];

    // The new field carries one entry per named account, each with an explicit state.
    expect(payload.accountUsage.map((a) => a.name)).toEqual([
      'Deep Soul Sessions', 'Code Street Labs', 'Rick Felix 2000',
    ]);
    expect(payload.accountUsage.every((a) => a.state === 'ok' || a.state === 'unavailable')).toBe(true);

    // TS-10: the vanilla panel (server/public/fleet-ui/fleet-panel.js) still gets EXACTLY the
    // {name, wkPct} shape it parses. Reshaping accountChips instead of adding a field would have
    // broken that live surface silently.
    expect(payload.accountChips).toHaveLength(3);
    for (const chip of payload.accountChips) {
      expect(Object.keys(chip).sort()).toEqual(['name', 'wkPct']);
    }
    expect(payload.accountChips.map((c) => c.name)).toEqual(['Deep Soul', 'Rick Felix', 'CodeStreet']);
  });

  it('returns an empty attentionStrip array (not an error) when zero sessions are flagged', async () => {
    const res = mockRes();
    await getFleetPanel(mockReq(mockSupabase([])), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.attentionStrip).toEqual([]);
    expect(payload.sessions).toEqual([]);
    expect(payload.filter.truncated).toBe(false);
  });
});
