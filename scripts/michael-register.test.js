// Tests for SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A (FR-2, TS-1..TS-4, TS-14)
// scripts/michael-register.cjs — Michael role tagger, a copy-rename of scripts/solomon-register.cjs
// whose 13 cases (SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001) are mirrored here verbatim, plus the
// account_profile stamp cases this child adds.
//
// Covers: computeMichaelTag (the pure merge helper, still used by the fallback write path) and
// registerMichael's unconditional RPC-first upsert + mandatory readback, including create-if-absent,
// the fresh-prior REFUSE, and the profile-NAME-only stamp (SECURITY evidence 2ca8b0ee).

import { describe, it, expect } from 'vitest';

const { computeMichaelTag, registerMichael, resolveAccountProfileName, HOST_DEFAULT_PROFILE, MICHAEL_ROLE } = require('./michael-register.cjs');

describe('resolveAccountProfileName (pure, FR-2 / TS-14)', () => {
  it('returns the CLAUDE_CONFIG_DIR basename as the profile name', () => {
    expect(resolveAccountProfileName({ CLAUDE_CONFIG_DIR: 'C:\\profiles\\acct-b' })).toBe('acct-b');
    expect(resolveAccountProfileName({ CLAUDE_CONFIG_DIR: '/home/rick/.fleet-profiles/acct-c/' })).toBe('acct-c');
  });

  it("returns the 'host-default' sentinel when no isolation dir is set", () => {
    expect(resolveAccountProfileName({})).toBe(HOST_DEFAULT_PROFILE);
    expect(resolveAccountProfileName({ CLAUDE_CONFIG_DIR: '   ' })).toBe(HOST_DEFAULT_PROFILE);
  });

  it('never yields an email, a path separator, or a malformed segment (degrades to the sentinel)', () => {
    const v = resolveAccountProfileName({ CLAUDE_CONFIG_DIR: 'C:\\profiles\\rick@example.com' });
    expect(v).toBe(HOST_DEFAULT_PROFILE);
    for (const out of [v, resolveAccountProfileName({ CLAUDE_CONFIG_DIR: 'C:\\profiles\\acct-b' })]) {
      expect(out).not.toMatch(/[@\\/]/);
    }
  });
});

describe('computeMichaelTag (pure)', () => {
  it('tags an untagged metadata and preserves existing keys', () => {
    const { alreadyTagged, merged } = computeMichaelTag({ callsign: 'Michael', cc_pid: 123 });
    expect(alreadyTagged).toBe(false);
    expect(merged.role).toBe('michael');
    expect(merged.non_fleet).toBe(true);
    expect(merged.callsign).toBe('Michael'); // preserved
    expect(merged.cc_pid).toBe(123);
  });

  it('detects already-tagged (idempotent no-op)', () => {
    const { alreadyTagged } = computeMichaelTag({ role: 'michael', non_fleet: true, callsign: 'X' });
    expect(alreadyTagged).toBe(true);
  });

  it('treats role-only or non_fleet-only as NOT fully tagged', () => {
    expect(computeMichaelTag({ role: 'michael' }).alreadyTagged).toBe(false);
    expect(computeMichaelTag({ non_fleet: true }).alreadyTagged).toBe(false);
  });

  it('handles null/array metadata defensively', () => {
    expect(computeMichaelTag(null).merged.role).toBe('michael');
    expect(computeMichaelTag([]).merged.non_fleet).toBe(true);
  });
});

// Stateful stub: rpc('set_michael_flag') and the update()/insert() fallback both mutate the
// tracked row, so registerMichael's mandatory FR-2 readback sees the real effect of whichever
// path fired — same convention as tests/unit/coordination/adam-singleton.test.js's regStub.
function stub({ row = null, updateErr = null, selectErr = null, rpcError = null, priorMichaels = [] } = {}) {
  const calls = { updated: null, inserted: null, rpc: [] };
  let currentRow = row;
  const chain = {
    select: () => chain,
    eq: () => chain,
    // fetchAllMichaelsStrict — FR-6 (count-truncation discipline) paginates it, so the chain
    // continues .order(...).range(from, to) after .filter().
    filter: () => chain,
    order: () => chain,
    range: (from, to) => Promise.resolve({ data: priorMichaels.slice(from, to + 1), error: null }),
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
      if (fn === 'set_michael_flag' && !rpcError) {
        currentRow = { session_id: args.p_session_id, metadata: { ...((currentRow && currentRow.metadata) || {}), role: MICHAEL_ROLE, non_fleet: true, michael_since: 'test' } };
      }
      return Promise.resolve({ error: rpcError });
    },
  };
  return { sb, calls };
}

describe('registerMichael', () => {
  it('errors without a session id', async () => {
    const { sb } = stub({ row: null });
    const r = await registerMichael(sb, '');
    expect(r.ok).toBe(false);
    expect(r.action).toBe('error');
  });

  // SD-FDBK-INFRA-FIX-ADAM-SOLOMON-001 FR-1/TS-1: the bug this SD fixes. A session with no
  // existing claude_sessions row used to be a hard "not found" error; set_michael_flag now
  // creates it (INSERT ... ON CONFLICT), so this is the ordinary first-boot case, not a fault —
  // this is exactly the observed Michael-registration failure the SD's RCA traced.
  it('creates the session row when absent, instead of erroring "not found"', async () => {
    const { sb, calls } = stub({ row: null });
    const r = await registerMichael(sb, 'sess-x');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
    expect(calls.rpc.map((c) => c.fn)).toContain('set_michael_flag');
  });

  // TS-7: RPC absent AND the row is absent — the JS-merge fallback must INSERT, never update() a
  // non-existent row (a silent supabase-js no-op that would leave the session untagged forever).
  it('RPC-absent fallback creates the row via insert when it was absent', async () => {
    const { sb, calls } = stub({ row: null, rpcError: { code: 'PGRST202', message: 'Could not find the function set_michael_flag' } });
    const r = await registerMichael(sb, 'sess-x');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged_fallback');
    expect(calls.inserted).not.toBeNull();
    expect(calls.inserted.metadata.role).toBe(MICHAEL_ROLE);
    // The only update() after the insert is the account_profile stamp, read-modify-merged onto the
    // inserted tag (never a bare update() that would have no-op'd on the absent row).
    if (calls.updated) expect(calls.updated.metadata.role).toBe(MICHAEL_ROLE);
  });

  it('RPC-absent fallback tags an untagged session and preserves existing metadata keys', async () => {
    const { sb, calls } = stub({
      row: { session_id: 'sess-1', metadata: { callsign: 'Michael' } },
      rpcError: { code: 'PGRST202', message: 'Could not find the function set_michael_flag' },
    });
    const r = await registerMichael(sb, 'sess-1');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged_fallback');
    expect(calls.updated.metadata.role).toBe(MICHAEL_ROLE);
    expect(calls.updated.metadata.non_fleet).toBe(true);
    expect(calls.updated.metadata.callsign).toBe('Michael'); // preserved
  });

  it('stamps metadata.account_profile with the profile NAME (never the raw dir) on register (TS-4)', async () => {
    const { sb, calls } = stub({ row: null });
    const r = await registerMichael(sb, 'sess-p', { env: { CLAUDE_CONFIG_DIR: 'C:\\profiles\\acct-b' } });
    expect(r.ok).toBe(true);
    // The stamp is the last metadata update() after the RPC-tag path (which wrote no update()).
    expect(calls.updated).not.toBeNull();
    expect(calls.updated.metadata.account_profile).toBe('acct-b');
    expect(calls.updated.metadata.role).toBe(MICHAEL_ROLE); // read-modify-merge preserved the tag
    expect(JSON.stringify(calls.updated.metadata)).not.toContain('C:\\\\profiles');
  });

  it("stamps 'host-default' when CLAUDE_CONFIG_DIR is unset", async () => {
    const { sb, calls } = stub({ row: null });
    await registerMichael(sb, 'sess-h', { env: {} });
    expect(calls.updated.metadata.account_profile).toBe(HOST_DEFAULT_PROFILE);
  });

  it('re-registering an already-tagged session still succeeds (idempotent re-tag via RPC)', async () => {
    const { sb } = stub({ row: { session_id: 'sess-2', metadata: { role: MICHAEL_ROLE, non_fleet: true } } });
    const r = await registerMichael(sb, 'sess-2');
    expect(r.ok).toBe(true);
    expect(r.action).toBe('tagged');
  });

  it('a FRESH prior Michael => REFUSED (no write, prior not cleared)', async () => {
    const NOW = Date.parse('2026-06-15T16:00:00.000Z');
    const { sb, calls } = stub({ row: null, priorMichaels: [{ session_id: 'prior', heartbeat_at: new Date(NOW).toISOString(), metadata: { role: MICHAEL_ROLE } }] });
    const r = await registerMichael(sb, 'self', { nowMs: NOW });
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
    const r = await registerMichael(sb, 'sess-x');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/readback/i);
  });
});
