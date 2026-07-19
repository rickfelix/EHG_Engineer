// adam-solomon-lane-probe.test.js — SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 (FR-3, TS-4/TS-5).
//
// BINDING bidirectional lane-probe: proves the real register -> identity-resolution ->
// advisory-target-resolution WIRING (not just each function in isolation) using the actual
// registerSolomon / registerAdam / getActiveSolomonId / getActiveAdamId /
// resolveAdamAdvisoryTarget / resolveSolomonAdvisoryTarget functions, against an injected fake
// claude_sessions table.
//
// Deliberately NOT a live-DB integration test. fetchAllSolomons/fetchAllAdams (the single-role
// guard's read, invoked unconditionally by registerSolomon/registerAdam per FR-1) query ALL
// role=solomon/role=adam sessions with NO namespace scoping. Unlike the namespaced-fixture-row
// pattern other live-DB integration tests use (e.g.
// tests/integration/claim-boundary-probe.integration.test.js, where fixture ids can never collide
// with real rows), running registerSolomon/registerAdam for real against the shared production DB
// would have this test's synthetic registration see — and, if it happened to be stale at that
// instant, actually RETIRE — the REAL live Solomon/Adam session. That is a genuine, hard-to-reverse
// production side effect from a test, not an acceptable risk. A fake table proves the identical
// call chain with zero blast radius and runs deterministically in every environment.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { registerSolomon } = require('../../../scripts/solomon-register.cjs');
const { registerAdam } = require('../../../scripts/adam-register.cjs');
const { getActiveSolomonId } = require('../../../lib/coordinator/solomon-identity.cjs');
const { getActiveAdamId } = require('../../../lib/coordinator/adam-identity.cjs');
const { resolveAdamAdvisoryTarget } = require('../../../scripts/adam-advisory.cjs');
const { resolveSolomonAdvisoryTarget } = require('../../../scripts/solomon-advisory.cjs');

// A minimal fake claude_sessions table sufficient for the exact query shapes registerSolomon /
// registerAdam / fetchAllSolomons / fetchAllAdams / fetchFreshSolomons / fetchFreshAdams issue:
// select().eq().maybeSingle(), select().filter() (all-role scan), select().gte().filter() (fresh
// scan), update().eq(), insert(), and rpc('set_{solomon,adam}_flag'|'clear_{solomon,adam}_flag').
function fakeSessionsDb() {
  const rows = new Map();
  const table = {
    _eqVal: null,
    select() { return table; },
    eq(_col, val) { table._eqVal = val; return table; },
    gte() { return table; }, // freshness cutoff not modeled — every seeded row is "fresh" enough for this probe
    // FR-6 (count-truncation discipline): the role scans paginate via fetchAllPaginated, so the
    // chain continues .order(...).range(from, to) after .filter() — record the role filter and
    // resolve the page at .range.
    filter(_col, _op, val) { table._roleVal = val; return table; },
    order() { return table; },
    range(from, to) {
      const out = [...rows.values()].filter((r) => r.metadata && r.metadata.role === table._roleVal);
      return Promise.resolve({ data: out.slice(from, to + 1), error: null });
    },
    maybeSingle() {
      const row = rows.get(table._eqVal) || null;
      return Promise.resolve({ data: row, error: null });
    },
    insert(payload) {
      rows.set(payload.session_id, { session_id: payload.session_id, heartbeat_at: new Date().toISOString(), metadata: payload.metadata });
      return Promise.resolve({ error: null });
    },
    update(payload) {
      return {
        eq: (_col, val) => {
          const row = rows.get(val) || { session_id: val };
          row.metadata = payload.metadata;
          rows.set(val, row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return {
    from: () => table,
    rpc: (fn, args) => {
      if (fn === 'set_solomon_flag' || fn === 'set_adam_flag') {
        const role = fn === 'set_solomon_flag' ? 'solomon' : 'adam';
        const sinceKey = fn === 'set_solomon_flag' ? 'solomon_since' : 'adam_since';
        const row = rows.get(args.p_session_id) || { session_id: args.p_session_id };
        row.heartbeat_at = new Date().toISOString();
        row.metadata = { ...(row.metadata || {}), role, non_fleet: true, [sinceKey]: new Date().toISOString() };
        rows.set(args.p_session_id, row);
      }
      return Promise.resolve({ error: null }); // clear_*_flag: no priors in this probe, never exercised
    },
  };
}

describe('adam <-> solomon lane-probe (FR-3: register -> identity -> advisory-target wiring)', () => {
  it('TS-4: after registerSolomon, getActiveSolomonId resolves it and adam-advisory targets it directly', async () => {
    const db = fakeSessionsDb();
    const SID_SOLOMON = 'lane-probe-solomon-target';

    const reg = await registerSolomon(db, SID_SOLOMON);
    expect(reg.ok, JSON.stringify(reg)).toBe(true);

    const solomonId = await getActiveSolomonId(db);
    expect(solomonId).toBe(SID_SOLOMON);

    const { target, via } = resolveAdamAdvisoryTarget({ toSolomon: true, flagOn: true, coordinatorId: 'coord-x', solomonId });
    expect(target).toBe(SID_SOLOMON);
    expect(via).toBe('direct');
  });

  it('TS-5: after registerAdam, getActiveAdamId resolves it and solomon-advisory targets it directly', async () => {
    const db = fakeSessionsDb();
    const SID_ADAM = 'lane-probe-adam-target';

    const reg = await registerAdam(db, SID_ADAM);
    expect(reg.ok, JSON.stringify(reg)).toBe(true);

    const adamId = await getActiveAdamId(db);
    expect(adamId).toBe(SID_ADAM);

    const { target, via } = resolveSolomonAdvisoryTarget({ toAdam: true, flagOn: true, coordinatorId: 'coord-x', adamId });
    expect(target).toBe(SID_ADAM);
    expect(via).toBe('direct');
  });

  it('cross-check: a session registered as Solomon is not picked up by getActiveAdamId (roles are not conflated)', async () => {
    const db = fakeSessionsDb();
    await registerSolomon(db, 'lane-probe-solomon-only');
    expect(await getActiveAdamId(db)).toBeNull();
  });

  it('TS-4/5 negative: with no session registered, the direct lane falls back to the broadcast sentinel (never a stale/wrong target)', async () => {
    const db = fakeSessionsDb();
    const solomonId = await getActiveSolomonId(db);
    expect(solomonId).toBeNull();
    const { target } = resolveAdamAdvisoryTarget({ toSolomon: true, flagOn: true, coordinatorId: 'coord-x', solomonId });
    expect(target).toBe('broadcast-solomon');
  });
});
