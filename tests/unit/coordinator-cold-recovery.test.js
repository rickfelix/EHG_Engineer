/**
 * Unit tests — SD-LEO-INFRA-BOOTSTRAPPABLE-SURVIVOR-AGNOSTIC-001
 * Survivor-agnostic coordinator cold-recovery routine. Network-free: a fake supabase
 * client + injected dispatch/resolveCoordinator make every path deterministic.
 */
import { describe, it, expect, vi } from 'vitest';
import mod from '../../scripts/coordinator-cold-recovery.cjs';

const { coldRecover, enumerateInFlight, detectOrphans, isSessionStale, IN_FLIGHT_STATUSES } = mod;

// --- Minimal fake supabase mirroring the chains the routine uses ---
function makeSupabase(store) {
  store.updates = [];
  function resolveTerminal(state) {
    const { table, filters, op } = state;
    if (table === 'strategic_directives_v2') {
      if (op === 'update') {
        store.updates.push({ filters, payload: state.updatePayload });
        return { error: store.updateError || null };
      }
      // mimic .in('status', IN_FLIGHT_STATUSES).not('claiming_session_id','is',null)
      return {
        data: store.sds.filter(
          (s) => IN_FLIGHT_STATUSES.includes(s.status) && s.claiming_session_id != null,
        ),
        error: null,
      };
    }
    if (table === 'claude_sessions') {
      return { data: store.sessions[filters.session_id] || null, error: null };
    }
    if (table === 'session_coordination') {
      return {
        data: (store.coordination || []).filter((r) => r.target_sd === filters.target_sd),
        error: null,
      };
    }
    return { data: [], error: null };
  }
  function builder(table) {
    const state = { table, filters: {}, op: 'select', updatePayload: null };
    const api = {
      select: () => api,
      in: () => api,
      not: () => api,
      gte: () => api,
      limit: () => api,
      eq: (col, val) => { state.filters[col] = val; return api; },
      update: (payload) => { state.op = 'update'; state.updatePayload = payload; return api; },
      maybeSingle: () => Promise.resolve(resolveTerminal(state)),
      then: (res, rej) => { try { res(resolveTerminal(state)); } catch (e) { rej(e); } },
    };
    return api;
  }
  return { from: builder };
}

const FRESH = new Date('2026-06-07T21:00:00Z').getTime();
const NOW = new Date('2026-06-07T21:05:00Z').getTime(); // 5 min later

describe('isSessionStale (pure)', () => {
  const ttl = 15 * 60 * 1000;
  it('treats an absent session as orphaned', () => {
    expect(isSessionStale(null, NOW, ttl)).toBe(true);
  });
  it('treats a fresh heartbeat as live', () => {
    expect(isSessionStale({ heartbeat_at: new Date(NOW - 60000).toISOString(), status: 'active' }, NOW, ttl)).toBe(false);
  });
  it('treats a heartbeat older than TTL as orphaned', () => {
    expect(isSessionStale({ heartbeat_at: new Date(NOW - ttl - 1000).toISOString(), status: 'active' }, NOW, ttl)).toBe(true);
  });
  it('treats a terminal status as orphaned even with a fresh heartbeat', () => {
    expect(isSessionStale({ heartbeat_at: new Date(NOW).toISOString(), status: 'released' }, NOW, ttl)).toBe(true);
  });
});

describe('enumerateInFlight', () => {
  it('excludes completed SDs and unclaimed SDs (TS-1)', async () => {
    const store = {
      sds: [
        { id: '1', sd_key: 'SD-A', status: 'in_progress', current_phase: 'EXEC', claiming_session_id: 'live' },
        { id: '2', sd_key: 'SD-B', status: 'completed', current_phase: 'LEAD_FINAL', claiming_session_id: 'x' },
        { id: '3', sd_key: 'SD-C', status: 'active', current_phase: 'PLAN_PRD', claiming_session_id: null },
      ],
      sessions: {},
    };
    const out = await enumerateInFlight(makeSupabase(store));
    expect(out.map((s) => s.sd_key)).toEqual(['SD-A']);
  });
});

describe('detectOrphans (TS-2)', () => {
  it('flags dead/absent claims, not live ones', async () => {
    const store = {
      sds: [],
      sessions: { live: { session_id: 'live', heartbeat_at: new Date(NOW - 30000).toISOString(), status: 'active' } },
    };
    const inflight = [
      { id: '1', sd_key: 'SD-LIVE', claiming_session_id: 'live', current_phase: 'EXEC' },
      { id: '2', sd_key: 'SD-DEAD', claiming_session_id: 'ghost', current_phase: 'EXEC' },
    ];
    const orphans = await detectOrphans(makeSupabase(store), inflight, { nowMs: NOW, ttlMs: 15 * 60 * 1000 });
    expect(orphans.map((o) => o.sd_key)).toEqual(['SD-DEAD']);
  });
});

describe('coldRecover', () => {
  function baseStore() {
    return {
      sds: [{ id: '1', sd_key: 'SD-ORPHAN', status: 'in_progress', current_phase: 'EXEC', claiming_session_id: 'ghost', progress_percentage: 60 }],
      sessions: {}, // ghost has no row => orphaned
      coordination: [],
    };
  }

  it('dry-run reports orphans but releases/dispatches nothing (TS-3a)', async () => {
    const store = baseStore();
    const dispatch = vi.fn();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch,
      resolveCoordinator: async () => 'coord-1', dryRun: true, nowMs: NOW,
    });
    expect(report.orphaned).toEqual(['SD-ORPHAN']);
    expect(report.redispatched).toEqual(['SD-ORPHAN']);
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it('execute releases the claim WITHOUT resetting phase/progress, then re-dispatches RESUME (TS-3b)', async () => {
    const store = baseStore();
    const dispatch = vi.fn();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch,
      resolveCoordinator: async () => 'coord-1', dryRun: false, nowMs: NOW,
    });
    // claim released
    expect(store.updates).toHaveLength(1);
    const payload = store.updates[0].payload;
    expect(payload.claiming_session_id).toBeNull();
    // RESUME, not restart: phase/progress are NOT touched by the release
    expect(payload).not.toHaveProperty('current_phase');
    expect(payload).not.toHaveProperty('progress_percentage');
    // re-dispatch broadcast to RESUME with phase preserved
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [, row] = dispatch.mock.calls[0];
    expect(row.target_session).toBe('broadcast');
    expect(row.payload.kind).toBe('resume');
    expect(row.payload.current_phase).toBe('EXEC');
    expect(report.released).toEqual(['SD-ORPHAN']);
  });

  it('is idempotent: a prior resume dispatch within the window is a no-op (TS-4)', async () => {
    const store = baseStore();
    store.coordination = [{ target_sd: 'SD-ORPHAN', created_at: new Date(NOW - 60000).toISOString(), payload: { kind: 'resume' } }];
    const dispatch = vi.fn();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch,
      resolveCoordinator: async () => 'coord-1', dryRun: false, nowMs: NOW,
    });
    expect(report.idempotentSkips).toEqual(['SD-ORPHAN']);
    expect(dispatch).not.toHaveBeenCalled();
    expect(store.updates).toHaveLength(0);
  });

  it('re-establishes coordinator identity purely from the DB (TS-5)', async () => {
    const store = baseStore();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch: vi.fn(),
      resolveCoordinator: async (sb) => { expect(sb).toBeTruthy(); return 'coord-from-db'; },
      dryRun: true, nowMs: NOW,
    });
    expect(report.coordinator).toBe('coord-from-db');
  });

  it('is fail-open: an identity-resolution error does not abort recovery', async () => {
    const store = baseStore();
    const dispatch = vi.fn();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch,
      resolveCoordinator: async () => { throw new Error('no coordinator yet'); },
      dryRun: false, nowMs: NOW,
    });
    expect(report.coordinator).toBeNull();
    expect(report.errors.some((e) => e.includes('identity'))).toBe(true);
    expect(report.released).toEqual(['SD-ORPHAN']); // recovery still proceeded
  });

  it('SMOKE: an in-flight claim pointed at a non-existent session is released + re-dispatched to resume, identity re-established (smoke_test_steps)', async () => {
    // Reproduce the SD's smoke test: claim -> non-existent session.
    const store = {
      sds: [{ id: '9', sd_key: 'SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A', status: 'in_progress', current_phase: 'EXEC', claiming_session_id: 'b0e6e89d-dead-dead-dead-deaddeaddead', progress_percentage: 40 }],
      sessions: {}, // the claiming session does not exist (full no-survivor restart)
      coordination: [],
    };
    const dispatch = vi.fn();
    const report = await coldRecover({
      supabase: makeSupabase(store), dispatch,
      resolveCoordinator: async () => 'fresh-coordinator', dryRun: false, nowMs: NOW,
    });
    expect(report.orphaned).toEqual(['SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A']);
    expect(store.updates[0].payload.claiming_session_id).toBeNull();
    expect(dispatch.mock.calls[0][1].payload).toMatchObject({ kind: 'resume', current_phase: 'EXEC' });
    expect(report.coordinator).toBe('fresh-coordinator');
  });
});
