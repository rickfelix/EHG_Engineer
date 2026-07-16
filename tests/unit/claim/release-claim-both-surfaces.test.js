/**
 * SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001 (escalated from QF-20260712-817) — helper behaviour.
 *
 * Verifies lib/claim/release-claim-both-surfaces.mjs against the risk/testing conditions:
 *   R1 — holder-pinned CAS on BOTH surfaces (a peer re-claim is never clobbered)
 *   R3 — the session-side clear nulls sd_key + worktree_path + worktree_branch together;
 *        a DB error is surfaced, never swallowed
 *   R6 — readback asserts OLD-HOLDER-GONE, not `=== null`
 *   + sessionStatus (retire vs keep-alive), the RPC path, drift protection, and no-op.
 *
 * Uses a tiny in-memory Supabase stub so CAS + readback are exercised end-to-end (no live DB).
 */

import { describe, it, expect } from 'vitest';
import { releaseClaimBothSurfaces } from '../../../lib/claim/release-claim-both-surfaces.mjs';

// ── Minimal in-memory Supabase double ────────────────────────────────────────
function makeDb({ sds = [], sessions = [], errorOn = null } = {}) {
  const tables = {
    strategic_directives_v2: sds.map((r) => ({ ...r })),
    claude_sessions: sessions.map((r) => ({ ...r })),
  };
  const calls = { updates: [], rpc: [] };
  const matches = (row, filters) => Object.entries(filters).every(([k, v]) => row[k] === v);

  const client = {
    from(table) {
      const ctx = { table, filters: {}, op: null, payload: null };
      const b = {
        select() { ctx.op = 'select'; return b; },
        update(payload) { ctx.op = 'update'; ctx.payload = payload; return b; },
        eq(k, v) { ctx.filters[k] = v; return b; },
        maybeSingle() {
          const row = (tables[table] || []).find((r) => matches(r, ctx.filters));
          return Promise.resolve({ data: row ? { ...row } : null, error: null });
        },
        then(onF, onR) {
          if (ctx.op === 'update') {
            calls.updates.push({ table, payload: { ...ctx.payload }, filters: { ...ctx.filters } });
            if (errorOn && errorOn.table === table && errorOn.op === 'update') {
              return Promise.resolve({ error: { message: errorOn.message || 'db error' } }).then(onF, onR);
            }
            for (const r of (tables[table] || [])) {
              if (matches(r, ctx.filters)) Object.assign(r, ctx.payload);
            }
          }
          return Promise.resolve({ error: null }).then(onF, onR);
        },
      };
      return b;
    },
    rpc(name, params) {
      calls.rpc.push({ name, params });
      if (name === 'release_session' || name === 'release_sd') {
        const sid = params.p_session_id;
        const sess = tables.claude_sessions.find((r) => r.session_id === sid);
        const sdKey = sess ? sess.sd_key : null;
        if (sess) Object.assign(sess, {
          sd_key: null, worktree_path: null, worktree_branch: null,
          status: name === 'release_session' ? 'released' : 'idle',
        });
        if (sdKey) {
          for (const sd of tables.strategic_directives_v2) {
            if (sd.sd_key === sdKey && (sd.claiming_session_id === sid || sd.active_session_id === sid)) {
              Object.assign(sd, { claiming_session_id: null, active_session_id: null, is_working_on: false });
            }
          }
        }
      }
      return Promise.resolve({ data: { success: true }, error: null });
    },
  };
  return { client, tables, calls };
}

const seed = (over = {}) => ({
  sds: [{ sd_key: 'SD-X', claiming_session_id: 'H1', active_session_id: 'H1', is_working_on: true }],
  sessions: [{ session_id: 'H1', sd_key: 'SD-X', worktree_path: '/w', worktree_branch: 'feat/x', status: 'active' }],
  ...over,
});

describe('releaseClaimBothSurfaces', () => {
  it('clears BOTH surfaces on the happy path (direct, retire)', async () => {
    const db = makeDb(seed());
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1' });
    expect(r.ok).toBe(true);
    expect(r.method).toBe('direct');
    expect(r.oldHolderGone).toBe(true);
    const sd = db.tables.strategic_directives_v2[0];
    const sess = db.tables.claude_sessions[0];
    expect(sd.claiming_session_id).toBeNull();
    expect(sd.active_session_id).toBeNull();
    expect(sd.is_working_on).toBe(false);
    expect(sess.sd_key).toBeNull();
    expect(sess.worktree_path).toBeNull();
    expect(sess.worktree_branch).toBeNull();
    expect(sess.status).toBe('released');
  });

  it('R3: the session-side UPDATE payload nulls sd_key + worktree_path + worktree_branch together', async () => {
    const db = makeDb(seed());
    await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1' });
    const sessUpdate = db.calls.updates.find((u) => u.table === 'claude_sessions');
    expect(sessUpdate).toBeTruthy();
    expect(sessUpdate.payload).toMatchObject({ sd_key: null, worktree_path: null, worktree_branch: null });
    // holder-pinned CAS on the session-side clear
    expect(sessUpdate.filters).toMatchObject({ session_id: 'H1', sd_key: 'SD-X' });
  });

  it('R1: a peer that re-claimed the SD is NOT clobbered (holder-pinned CAS)', async () => {
    // SD-side now held by peer H2; the session-side row is still stale on H1.
    const db = makeDb(seed({
      sds: [{ sd_key: 'SD-X', claiming_session_id: 'H2', active_session_id: 'H2', is_working_on: true }],
    }));
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1' });
    // H2's claim is untouched (SD-side CAS keyed on H1 did not match).
    expect(db.tables.strategic_directives_v2[0].claiming_session_id).toBe('H2');
    // H1's stale session-side pointer WAS cleared.
    expect(db.tables.claude_sessions[0].sd_key).toBeNull();
    // Old holder H1 is gone from both surfaces → release considered clean.
    expect(r.oldHolderGone).toBe(true);
  });

  it('sessionStatus: "idle" keeps the session alive (unclaim, not retire)', async () => {
    const db = makeDb(seed());
    await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1', sessionStatus: 'idle' });
    expect(db.tables.claude_sessions[0].status).toBe('idle');
  });

  it('R3: a DB error is surfaced in the result, never swallowed or thrown', async () => {
    const db = makeDb(seed({ errorOn: { table: 'claude_sessions', op: 'update', message: '23514 check violation' } }));
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/23514/);
  });

  it('tryRpc: uses the release_session RPC when the holder is still on the SD (retire)', async () => {
    const db = makeDb(seed());
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1', tryRpc: true });
    expect(r.method).toBe('rpc');
    expect(db.calls.rpc.map((c) => c.name)).toContain('release_session');
    expect(db.tables.claude_sessions[0].sd_key).toBeNull();
    expect(db.tables.strategic_directives_v2[0].claiming_session_id).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('tryRpc: does NOT RPC-release a holder that has drifted to a different SD', async () => {
    // Holder H1 is now parked on a DIFFERENT sd_key; releasing SD-X must not retire it.
    const db = makeDb(seed({
      sessions: [{ session_id: 'H1', sd_key: 'SD-OTHER', worktree_path: '/w', worktree_branch: 'b', status: 'active' }],
    }));
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X', holderSessionId: 'H1', tryRpc: true });
    expect(db.calls.rpc.length).toBe(0);          // RPC skipped (sd_key !== sdKey)
    expect(db.tables.claude_sessions[0].sd_key).toBe('SD-OTHER'); // holder's real claim untouched
    expect(r.method).toBe('direct');
  });

  it('no-op when the SD has no holder and none is supplied', async () => {
    const db = makeDb(seed({ sds: [{ sd_key: 'SD-X', claiming_session_id: null }], sessions: [] }));
    const r = await releaseClaimBothSurfaces(db.client, { sdKey: 'SD-X' });
    expect(r.method).toBe('noop');
    expect(r.ok).toBe(true);
  });

  it('requires sdKey', async () => {
    const db = makeDb(seed());
    const r = await releaseClaimBothSurfaces(db.client, { holderSessionId: 'H1' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sdKey is required/);
  });
});
