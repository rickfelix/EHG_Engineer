/**
 * SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001 — defense-in-depth tests for the
 * coordinator-flag RPC fallback + the pg_proc existence canary in lib/coordinator/resolve.cjs.
 *
 * Behavior under test:
 *   - isFunctionNotFoundError(): detects an ABSENT RPC (PGRST202 / SQLSTATE 42883 / message)
 *     vs a runtime error inside an existing RPC.
 *   - setActiveCoordinator FLAG-ON: when set_coordinator_flag is absent, falls back to the
 *     read-merge-write upsert so is_coordinator is still written (never silently skipped).
 *   - assertCoordinatorRpcsExist(): loud canary that reports which write-path RPCs are missing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const {
  isFunctionNotFoundError,
  setActiveCoordinator,
  assertCoordinatorRpcsExist,
} = req('../../lib/coordinator/resolve.cjs');

// Minimal claude_sessions mock: records the upsert payload. Every builder method returns a
// thenable so any await-chain (.update().eq().gte(), .select().eq().maybeSingle(),
// .select().filter().gte()) resolves to a benign empty result, while .maybeSingle() returns
// the configured session row and .upsert() captures its payload.
function makeSupabase({ rpcImpl, sessionRow = null }) {
  const calls = { rpc: [], upserts: [], updates: [] };
  const empty = { data: null, error: null };
  const supabase = {
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      return rpcImpl(name, args);
    },
    from(table) {
      const builder = {
        update: (patch) => { calls.updates.push({ table, patch }); return builder; },
        select: () => builder,
        eq: () => builder,
        gte: async () => ({ data: [], error: null }),
        filter: () => builder,
        maybeSingle: async () => ({ data: sessionRow, error: null }),
        upsert: (payload) => { calls.upserts.push({ table, payload }); return Promise.resolve(empty); },
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return builder;
    },
    _calls: calls,
  };
  return supabase;
}

describe('isFunctionNotFoundError (SD-LEO-INFRA-COORDINATOR-FLAG-RPC-FALLBACK-001)', () => {
  it('detects PostgREST PGRST202 (function not found)', () => {
    expect(isFunctionNotFoundError({ code: 'PGRST202', message: 'Could not find the function public.set_coordinator_flag' })).toBe(true);
  });
  it('detects Postgres SQLSTATE 42883 (undefined_function)', () => {
    expect(isFunctionNotFoundError({ code: '42883', message: 'function set_coordinator_flag(uuid) does not exist' })).toBe(true);
  });
  it('detects by message when .code is absent', () => {
    expect(isFunctionNotFoundError({ message: 'Could not find the function ...' })).toBe(true);
    expect(isFunctionNotFoundError({ message: 'function foo does not exist' })).toBe(true);
  });
  it('returns false for a runtime error inside an existing RPC', () => {
    expect(isFunctionNotFoundError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
    expect(isFunctionNotFoundError(null)).toBe(false);
    expect(isFunctionNotFoundError(undefined)).toBe(false);
  });
});

describe('setActiveCoordinator FLAG-ON fallback when set_coordinator_flag is absent', () => {
  const PREV = process.env.COORDINATOR_TWOWAY_V2;
  beforeEach(() => { process.env.COORDINATOR_TWOWAY_V2 = 'on'; });
  afterEach(() => { process.env.COORDINATOR_TWOWAY_V2 = PREV; });

  it('falls back to read-merge-write upsert and still writes is_coordinator', async () => {
    const supabase = makeSupabase({
      rpcImpl: (name) => {
        if (name === 'set_coordinator_flag') return { error: { code: 'PGRST202', message: 'Could not find the function' } };
        if (name === 'exec_sql') return { data: [{ result: [] }], error: null }; // canary: both missing
        return { error: null };
      },
      sessionRow: { metadata: { existing: 'keep' } },
    });
    await setActiveCoordinator(supabase, 'sess-123');
    // The fallback upsert ran and set is_coordinator=true while preserving prior metadata.
    const coordUpsert = supabase._calls.upserts.find(u => u.payload?.metadata?.is_coordinator === true);
    expect(coordUpsert).toBeTruthy();
    expect(coordUpsert.payload.metadata.existing).toBe('keep');
    expect(coordUpsert.payload.session_id).toBe('sess-123');
  });

  it('does NOT fall back when the RPC succeeds (atomic path preserved)', async () => {
    const supabase = makeSupabase({
      rpcImpl: (name) => {
        if (name === 'set_coordinator_flag') return { error: null };
        if (name === 'exec_sql') return { data: [{ result: [{ proname: 'set_coordinator_flag' }, { proname: 'clear_coordinator_flag' }] }], error: null };
        return { error: null };
      },
    });
    await setActiveCoordinator(supabase, 'sess-456');
    const coordUpsert = supabase._calls.upserts.find(u => u.payload?.metadata?.is_coordinator === true);
    expect(coordUpsert).toBeFalsy(); // RPC succeeded → no read-merge-write fallback
  });
});

// SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001 FR-3: setActiveCoordinator's
// broadcast-coordinator buffer drain (resolve.cjs:288 flag-off / :321 flag-on) is one of the 4
// already-correct re-target paths RISK identified -- update-only, never touches sender_session/
// created_at. Regression-pin, not a fix.
describe('setActiveCoordinator broadcast-coordinator drain (FR-3 regression pin — update-only)', () => {
  const PREV = process.env.COORDINATOR_TWOWAY_V2;
  afterEach(() => { process.env.COORDINATOR_TWOWAY_V2 = PREV; });

  it('FLAG-OFF: the drain update patch is ONLY {target_session} — never sender_session/created_at', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'off';
    const supabase = makeSupabase({ rpcImpl: () => ({ error: null }) });
    await setActiveCoordinator(supabase, 'sess-789');
    const drainUpdate = supabase._calls.updates.find(
      (u) => u.table === 'session_coordination' && Object.prototype.hasOwnProperty.call(u.patch || {}, 'target_session')
    );
    expect(drainUpdate).toBeTruthy();
    expect(drainUpdate.patch).toEqual({ target_session: 'sess-789' });
  });

  it('FLAG-ON: the drain update patch is ONLY {target_session} — never sender_session/created_at', async () => {
    process.env.COORDINATOR_TWOWAY_V2 = 'on';
    const supabase = makeSupabase({
      rpcImpl: (name) => {
        if (name === 'set_coordinator_flag') return { error: null };
        if (name === 'exec_sql') return { data: [{ result: [{ proname: 'set_coordinator_flag' }, { proname: 'clear_coordinator_flag' }] }], error: null };
        return { error: null };
      },
    });
    await setActiveCoordinator(supabase, 'sess-987');
    const drainUpdate = supabase._calls.updates.find(
      (u) => u.table === 'session_coordination' && Object.prototype.hasOwnProperty.call(u.patch || {}, 'target_session')
    );
    expect(drainUpdate).toBeTruthy();
    expect(drainUpdate.patch).toEqual({ target_session: 'sess-987' });
  });
});

describe('assertCoordinatorRpcsExist canary', () => {
  it('reports ok=true when both RPCs are present in pg_proc', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({ data: [{ result: [{ proname: 'set_coordinator_flag' }, { proname: 'clear_coordinator_flag' }] }], error: null }),
    });
    const r = await assertCoordinatorRpcsExist(supabase);
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('reports ok=false and lists the missing RPCs (unapplied migration)', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({ data: [{ result: [] }], error: null }),
    });
    const r = await assertCoordinatorRpcsExist(supabase);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['set_coordinator_flag', 'clear_coordinator_flag']);
  });

  it('reports ok=null (not a false COORD_RPC_MISSING) when exec_sql returns an unexpected shape', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({ data: { unexpected: 'object-not-array' }, error: null }),
    });
    const r = await assertCoordinatorRpcsExist(supabase);
    expect(r.ok).toBeNull();
    expect(r.missing).toEqual([]);
    expect(r.reason).toBe('unexpected_exec_sql_shape');
  });

  it('reports ok=null (cannot verify) when exec_sql itself errors — never throws', async () => {
    const supabase = makeSupabase({
      rpcImpl: () => ({ data: null, error: { message: 'exec_sql missing' } }),
    });
    const r = await assertCoordinatorRpcsExist(supabase);
    expect(r.ok).toBeNull();
  });

  it('returns ok=null with no supabase client', async () => {
    const r = await assertCoordinatorRpcsExist(null);
    expect(r.ok).toBeNull();
    expect(r.reason).toBe('no_supabase_client');
  });
});
