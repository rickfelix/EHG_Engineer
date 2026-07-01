/**
 * SD-LEO-INFRA-COMMS-PRESENCE-GROUNDING-SIGNALS-001 — the shared presence/grounding-signals helper.
 * Pattern mirrors tests/unit/adaptive-comms-cadence.test.js: pure decision function tests plus
 * signal-gathering tests against a stub supabase client.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  derivePresence,
  getFleetPresence,
  getReadReceipts,
  getWorkingSignal,
} = require('../../lib/coordinator/presence-grounding-signals.cjs');

const NOW = 1_000_000_000_000;

describe('derivePresence (FR-1)', () => {
  it('returns active_now for a fresh-heartbeat session (raw_is_alive)', () => {
    const r = derivePresence({ is_alive: true }, { nowMs: NOW });
    expect(r.state).toBe('active_now');
    expect(r.reason).toBe('raw_is_alive');
    expect(r.expectationWindowMs).toBeNull();
  });

  it('returns active_now for a fresh-heartbeat session (fresh_heartbeat)', () => {
    const r = derivePresence({ heartbeat_at: new Date(NOW - 60000).toISOString() }, { nowMs: NOW });
    expect(r.state).toBe('active_now');
    expect(r.reason).toBe('fresh_heartbeat');
  });

  it('returns parked with a positive expectationWindowMs for an armed expected_silence_until session', () => {
    const r = derivePresence({ expected_silence_until: new Date(NOW + 480000).toISOString() }, { nowMs: NOW });
    expect(r.state).toBe('parked');
    expect(r.reason).toBe('armed_silence');
    expect(r.expectationWindowMs).toBe(480000);
  });

  it('returns away for a stale session with no armed silence', () => {
    const r = derivePresence({ heartbeat_at: new Date(NOW - 3600000).toISOString() }, { nowMs: NOW });
    expect(r.state).toBe('away');
    expect(r.reason).toBeNull();
    expect(r.expectationWindowMs).toBeNull();
  });

  it('returns away for a null session', () => {
    const r = derivePresence(null, { nowMs: NOW });
    expect(r.state).toBe('away');
  });

  it('carries loop_state through when present', () => {
    const r = derivePresence({ is_alive: true, loop_state: 'awaiting_tick' }, { nowMs: NOW });
    expect(r.loopState).toBe('awaiting_tick');
  });

  it('is pure: identical inputs always produce identical output', () => {
    const session = { heartbeat_at: new Date(NOW - 60000).toISOString() };
    expect(derivePresence(session, { nowMs: NOW })).toEqual(derivePresence(session, { nowMs: NOW }));
  });
});

// ---- getFleetPresence (FR-2) ---------------------------------------------------------------
function stubSupabaseSessions({ rows = [], error = null } = {}) {
  return {
    from() {
      const api = {
        select() { return api; },
        order() { return api; },
        limit() { return api; },
        then(resolve) { return resolve({ data: rows, error }); },
      };
      return api;
    },
  };
}

describe('getFleetPresence (FR-2)', () => {
  it('resolves presence for requested session ids, fetch-then-pure-filter shape', async () => {
    const sb = stubSupabaseSessions({
      rows: [
        { session_id: 'sess-1', is_alive: true, heartbeat_at: new Date(NOW).toISOString() },
        { session_id: 'sess-2', heartbeat_at: new Date(NOW - 3600000).toISOString() },
      ],
    });
    const r = await getFleetPresence(sb, ['sess-1', 'sess-2'], { nowMs: NOW });
    expect(r.get('sess-1').state).toBe('active_now');
    expect(r.get('sess-2').state).toBe('away');
  });

  it('only includes requested session ids even if more rows are fetched', async () => {
    const sb = stubSupabaseSessions({
      rows: [
        { session_id: 'sess-1', is_alive: true },
        { session_id: 'sess-unrelated', is_alive: true },
      ],
    });
    const r = await getFleetPresence(sb, ['sess-1'], { nowMs: NOW });
    expect(r.has('sess-1')).toBe(true);
    expect(r.has('sess-unrelated')).toBe(false);
  });

  it('fail-open: resolves to an empty Map on a query error, never throws', async () => {
    const sb = stubSupabaseSessions({ error: { message: 'boom' } });
    const r = await getFleetPresence(sb, ['sess-1'], { nowMs: NOW });
    expect(r.size).toBe(0);
  });

  it('fail-open: resolves to an empty Map on a thrown exception, never throws', async () => {
    const sb = { from() { throw new Error('boom'); } };
    await expect(getFleetPresence(sb, ['sess-1'], { nowMs: NOW })).resolves.toEqual(new Map());
  });

  it('returns empty Map for missing supabase/sessionIds (never throws)', async () => {
    await expect(getFleetPresence(null, ['sess-1'])).resolves.toEqual(new Map());
    await expect(getFleetPresence({}, [])).resolves.toEqual(new Map());
  });
});

// ---- getReadReceipts (FR-3) ------------------------------------------------------------------
function stubSupabaseReceipts({ rows = [], error = null, capturedFilters = {} } = {}) {
  return {
    from(table) {
      const api = {
        _table: table,
        select() { return api; },
        eq(col, val) { capturedFilters.sender_session = val; return api; },
        not(col, op, val) { capturedFilters.notFilter = { col, op, val }; return api; },
        gte() { return api; },
        order() { return api; },
        limit() { return api; },
        then(resolve) { return resolve({ data: rows, error }); },
      };
      return api;
    },
  };
}

describe('getReadReceipts (FR-3)', () => {
  it('queries session_coordination filtered by sender_session with read_at NOT NULL', async () => {
    const captured = {};
    const sb = stubSupabaseReceipts({
      rows: [{ id: 'msg-1', target_session: 'coord-1', read_at: new Date(NOW).toISOString() }],
      capturedFilters: captured,
    });
    const r = await getReadReceipts(sb, 'sess-1', {});
    expect(r).toHaveLength(1);
    expect(captured.sender_session).toBe('sess-1');
    expect(captured.notFilter).toEqual({ col: 'read_at', op: 'is', val: null });
  });

  it('fail-open: resolves to [] on a query error, never throws', async () => {
    const sb = stubSupabaseReceipts({ error: { message: 'boom' } });
    const r = await getReadReceipts(sb, 'sess-1');
    expect(r).toEqual([]);
  });

  it('fail-open: resolves to [] on a thrown exception, never throws', async () => {
    const sb = { from() { throw new Error('boom'); } };
    await expect(getReadReceipts(sb, 'sess-1')).resolves.toEqual([]);
  });

  it('returns [] for missing supabase/sessionId (never throws)', async () => {
    await expect(getReadReceipts(null, 'sess-1')).resolves.toEqual([]);
    await expect(getReadReceipts({}, null)).resolves.toEqual([]);
  });
});

// ---- getWorkingSignal (FR-5) ------------------------------------------------------------------
describe('getWorkingSignal (FR-5)', () => {
  it('returns the signal when not stale', () => {
    const session = {
      metadata: {
        working_signal: {
          body: 'investigating S17 handoff',
          eta_ms: 300000,
          stamped_at: new Date(NOW - 60000).toISOString(),
          expires_at: new Date(NOW + 60000).toISOString(),
        },
      },
    };
    const r = getWorkingSignal(session, { nowMs: NOW });
    expect(r).toEqual({ body: 'investigating S17 handoff', etaMs: 300000, stampedAt: session.metadata.working_signal.stamped_at });
  });

  it('returns null just under the expires_at boundary is fine, just over is stale', () => {
    const makeSession = (expiresAtMs) => ({
      metadata: { working_signal: { body: 'x', expires_at: new Date(expiresAtMs).toISOString() } },
    });
    expect(getWorkingSignal(makeSession(NOW + 1), { nowMs: NOW })).not.toBeNull();
    expect(getWorkingSignal(makeSession(NOW - 1), { nowMs: NOW })).toBeNull();
  });

  it('returns null when no working_signal is present', () => {
    expect(getWorkingSignal({ metadata: {} }, { nowMs: NOW })).toBeNull();
    expect(getWorkingSignal(null, { nowMs: NOW })).toBeNull();
    expect(getWorkingSignal({}, { nowMs: NOW })).toBeNull();
  });

  it('returns null when the signal has no body', () => {
    expect(getWorkingSignal({ metadata: { working_signal: {} } }, { nowMs: NOW })).toBeNull();
  });
});
