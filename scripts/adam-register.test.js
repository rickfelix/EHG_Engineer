// Tests for SD-LEO-INFRA-ADAM-ROLE-FORMALIZATION-001-A
// scripts/adam-register.cjs — Adam role tagger.
//
// registerAdam's behavioral suite (guard, RPC success/fail, retire, drain, FR-2 readback) lives
// in tests/unit/coordination/adam-singleton.test.js; this file covers computeAdamTag (the pure
// merge helper, still used by the fallback write path) plus a focused registerAdam smoke suite.

import { describe, it, expect } from 'vitest';

const { computeAdamTag, registerAdam, ADAM_ROLE } = require('./adam-register.cjs');

describe('computeAdamTag (pure)', () => {
  it('tags an untagged metadata and preserves existing keys', () => {
    const { alreadyTagged, merged } = computeAdamTag({ callsign: 'Adam', cc_pid: 123 });
    expect(alreadyTagged).toBe(false);
    expect(merged.role).toBe('adam');
    expect(merged.non_fleet).toBe(true);
    expect(merged.callsign).toBe('Adam'); // preserved
    expect(merged.cc_pid).toBe(123);
  });

  it('detects already-tagged (idempotent no-op)', () => {
    const { alreadyTagged } = computeAdamTag({ role: 'adam', non_fleet: true, callsign: 'X' });
    expect(alreadyTagged).toBe(true);
  });

  it('treats role-only or non_fleet-only as NOT fully tagged', () => {
    expect(computeAdamTag({ role: 'adam' }).alreadyTagged).toBe(false);
    expect(computeAdamTag({ non_fleet: true }).alreadyTagged).toBe(false);
  });

  it('handles null/array metadata defensively', () => {
    expect(computeAdamTag(null).merged.role).toBe('adam');
    expect(computeAdamTag([]).merged.non_fleet).toBe(true);
  });
});

// Stateful stub: rpc('set_adam_flag') and the update()/insert() fallback both mutate the tracked
// row, so registerAdam's mandatory FR-2 readback sees the real effect of whichever path fired —
// same convention as adam-singleton.test.js's regStub.
function stub({ row = null, updateErr = null, selectErr = null, rpcError = null, priorAdams = [] } = {}) {
  const calls = { updated: null, inserted: null, rpc: [] };
  let currentRow = row;
  const chain = {
    select: () => chain,
    eq: () => chain,
    // fetchAllAdamsStrict — FR-6 (count-truncation discipline) paginates it, so the chain
    // continues .order(...).range(from, to) after .filter().
    filter: () => chain,
    order: () => chain,
    range: (from, to) => Promise.resolve({ data: priorAdams.slice(from, to + 1), error: null }),
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
      if (fn === 'set_adam_flag' && !rpcError) {
        currentRow = { session_id: args.p_session_id, metadata: { ...((currentRow && currentRow.metadata) || {}), role: ADAM_ROLE, non_fleet: true, adam_since: 'test' } };
      }
      return Promise.resolve({ error: rpcError });
    },
  };
  return { sb, calls };
}

describe('registerAdam', () => {
  it('errors without a session id', async () => {
    const { sb } = stub({ row: null });
    const r = await registerAdam(sb, '');
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
  });

  // SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 FR-1: the bug this SD fixes. A session with no existing
  // claude_sessions row used to be a hard "not found" error; set_adam_flag now creates it
  // (INSERT ... ON CONFLICT), so this is the ordinary first-boot case, not a fault.
  it('creates the session row when absent, instead of erroring "not found"', async () => {
    const { sb, calls } = stub({ row: null });
    const r = await registerAdam(sb, 'sess-x');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
    expect(calls.rpc.map((c) => c.fn)).toContain('set_adam_flag');
  });

  it('RPC-absent fallback tags an untagged session and preserves existing metadata keys', async () => {
    const { sb, calls } = stub({
      row: { session_id: 'sess-1', metadata: { callsign: 'Adam' } },
      rpcError: { code: 'PGRST202', message: 'Could not find the function set_adam_flag' },
    });
    const r = await registerAdam(sb, 'sess-1');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged_fallback');
    expect(calls.updated.metadata.role).toBe(ADAM_ROLE);
    expect(calls.updated.metadata.non_fleet).toBe(true);
    expect(calls.updated.metadata.callsign).toBe('Adam'); // preserved
  });

  it('re-registering an already-tagged session still succeeds (idempotent re-tag via RPC)', async () => {
    const { sb } = stub({ row: { session_id: 'sess-2', metadata: { role: ADAM_ROLE, non_fleet: true } } });
    const r = await registerAdam(sb, 'sess-2');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
  });
});
