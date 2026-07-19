// Tests for SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001
// scripts/solomon-register.cjs — Solomon role tagger (structural mirror of adam-register.cjs).
//
// Covers: computeSolomonTag (the pure merge helper, still used by the fallback write path) and
// registerSolomon's unconditional RPC-first upsert + mandatory FR-2 readback, including the
// create-if-absent fix (FR-1) that motivated this SD.

import { describe, it, expect } from 'vitest';

const { computeSolomonTag, registerSolomon, SOLOMON_ROLE } = require('./solomon-register.cjs');

describe('computeSolomonTag (pure)', () => {
  it('tags an untagged metadata and preserves existing keys', () => {
    const { alreadyTagged, merged } = computeSolomonTag({ callsign: 'Solomon', cc_pid: 123 });
    expect(alreadyTagged).toBe(false);
    expect(merged.role).toBe('solomon');
    expect(merged.non_fleet).toBe(true);
    expect(merged.callsign).toBe('Solomon'); // preserved
    expect(merged.cc_pid).toBe(123);
  });

  it('detects already-tagged (idempotent no-op)', () => {
    const { alreadyTagged } = computeSolomonTag({ role: 'solomon', non_fleet: true, callsign: 'X' });
    expect(alreadyTagged).toBe(true);
  });

  it('treats role-only or non_fleet-only as NOT fully tagged', () => {
    expect(computeSolomonTag({ role: 'solomon' }).alreadyTagged).toBe(false);
    expect(computeSolomonTag({ non_fleet: true }).alreadyTagged).toBe(false);
  });

  it('handles null/array metadata defensively', () => {
    expect(computeSolomonTag(null).merged.role).toBe('solomon');
    expect(computeSolomonTag([]).merged.non_fleet).toBe(true);
  });
});

// Stateful stub: rpc('set_solomon_flag') and the update()/insert() fallback both mutate the
// tracked row, so registerSolomon's mandatory FR-2 readback sees the real effect of whichever
// path fired — same convention as tests/unit/coordination/adam-singleton.test.js's regStub.
function stub({ row = null, updateErr = null, selectErr = null, rpcError = null, priorSolomons = [] } = {}) {
  const calls = { updated: null, inserted: null, rpc: [] };
  let currentRow = row;
  const chain = {
    select: () => chain,
    eq: () => chain,
    // fetchAllSolomonsStrict — FR-6 (count-truncation discipline) paginates it, so the chain
    // continues .order(...).range(from, to) after .filter().
    filter: () => chain,
    order: () => chain,
    range: (from, to) => Promise.resolve({ data: priorSolomons.slice(from, to + 1), error: null }),
    maybeSingle: () => Promise.resolve({ data: currentRow, error: selectErr }),
    update: (payload) => {
      calls.updated = payload;
      return {
        eq: () => {
          currentRow = { session_id: (currentRow && currentRow.session_id) || null, metadata: payload.metadata };
          return Promise.resolve({ error: updateErr });
        },
      };
    },
    insert: (payload) => {
      calls.inserted = payload;
      currentRow = { session_id: payload.session_id, metadata: payload.metadata };
      return Promise.resolve({ error: null });
    },
  };
  const sb = {
    from: () => chain,
    rpc: (fn, args) => {
      calls.rpc.push({ fn, args });
      if (fn === 'set_solomon_flag' && !rpcError) {
        currentRow = { session_id: args.p_session_id, metadata: { ...((currentRow && currentRow.metadata) || {}), role: SOLOMON_ROLE, non_fleet: true, solomon_since: 'test' } };
      }
      return Promise.resolve({ error: rpcError });
    },
  };
  return { sb, calls };
}

describe('registerSolomon', () => {
  it('errors without a session id', async () => {
    const { sb } = stub({ row: null });
    const r = await registerSolomon(sb, '');
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
  });

  // SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 FR-1/TS-1: the bug this SD fixes. A session with no
  // existing claude_sessions row used to be a hard "not found" error; set_solomon_flag now
  // creates it (INSERT ... ON CONFLICT), so this is the ordinary first-boot case, not a fault —
  // this is exactly the observed Solomon-registration failure the SD's RCA traced.
  it('creates the session row when absent, instead of erroring "not found"', async () => {
    const { sb, calls } = stub({ row: null });
    const r = await registerSolomon(sb, 'sess-x');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
    expect(calls.rpc.map((c) => c.fn)).toContain('set_solomon_flag');
  });

  // TS-7: RPC absent AND the row is absent — the JS-merge fallback must INSERT, never update() a
  // non-existent row (a silent supabase-js no-op that would leave the session untagged forever).
  it('RPC-absent fallback creates the row via insert when it was absent', async () => {
    const { sb, calls } = stub({ row: null, rpcError: { code: 'PGRST202', message: 'Could not find the function set_solomon_flag' } });
    const r = await registerSolomon(sb, 'sess-x');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged_fallback');
    expect(calls.inserted).not.toBeNull();
    expect(calls.inserted.metadata.role).toBe(SOLOMON_ROLE);
    expect(calls.updated).toBeNull();
  });

  it('RPC-absent fallback tags an untagged session and preserves existing metadata keys', async () => {
    const { sb, calls } = stub({
      row: { session_id: 'sess-1', metadata: { callsign: 'Solomon' } },
      rpcError: { code: 'PGRST202', message: 'Could not find the function set_solomon_flag' },
    });
    const r = await registerSolomon(sb, 'sess-1');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged_fallback');
    expect(calls.updated.metadata.role).toBe(SOLOMON_ROLE);
    expect(calls.updated.metadata.non_fleet).toBe(true);
    expect(calls.updated.metadata.callsign).toBe('Solomon'); // preserved
  });

  it('re-registering an already-tagged session still succeeds (idempotent re-tag via RPC)', async () => {
    const { sb } = stub({ row: { session_id: 'sess-2', metadata: { role: SOLOMON_ROLE, non_fleet: true } } });
    const r = await registerSolomon(sb, 'sess-2');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
  });

  it('a FRESH prior Solomon => REFUSED (no write, prior not cleared)', async () => {
    const NOW = Date.parse('2026-06-15T16:00:00.000Z');
    const { sb, calls } = stub({ row: null, priorSolomons: [{ session_id: 'prior', heartbeat_at: new Date(NOW).toISOString(), metadata: { role: SOLOMON_ROLE } }] });
    const r = await registerSolomon(sb, 'self', { nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.action).toBe('refused');
    expect(r.fresh_priors).toEqual(['prior']);
    expect(calls.rpc).toHaveLength(0);
  });

  // FR-2/TS-3: mandatory fail-loud readback — a write that reports success without the tag
  // actually landing (RLS, a CHECK/enum violation supabase-js swallows) must return ok:false,
  // never a false ok:true.
  it('readback cannot confirm the tag => ok:false with a loud readback error (never a false success)', async () => {
    const { sb } = stub({ row: null });
    sb.rpc = async () => ({ error: null }); // "succeeds" without mutating the row
    const r = await registerSolomon(sb, 'sess-x');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/readback/i);
  });
});
