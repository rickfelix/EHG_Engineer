/**
 * SD-LEO-INFRA-SESSIONS-PAGE-TRUE-001-A — FR-2/FR-3 persistence seam.
 *
 * TS-3 (all three handle-less shapes refuse, asserted SEPARATELY) and TS-11 (the new window-owning
 * pid is never reachable from a kill path) live here. TS-5 — that a concurrent metadata writer does
 * not drop the field — is deliberately NOT here: it needs a real database, and asserting it against
 * a stubbed client would only re-assert the SQL string I wrote. It is recorded as an integration
 * scenario rather than faked at this seam.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  setWindowVisible,
  setWindowOwner,
  readWindowOwner,
  classifyHideRefusal,
  WINDOW_VISIBLE_KEY,
  WINDOW_OWNER_KEYS,
} from '../../../lib/fleet/window-visibility-writer.js';

/** Records the SQL and params so we can assert the MERGE shape, not just that a call happened. */
function stubClient() {
  const calls = [];
  const createClientFn = async () => ({
    query: async (sql, params) => { calls.push({ sql, params }); return { rowCount: 1 }; },
    end: async () => {},
  });
  return { createClientFn, calls };
}

describe('FR-3: the write is an ATOMIC merge, not a read-spread-write', () => {
  it('uses COALESCE(metadata) || patch keyed on session_id', async () => {
    const { createClientFn, calls } = stubClient();
    await setWindowVisible('sess-1', { visible: false, by: 'test' }, { createClientFn });
    expect(calls).toHaveLength(1);
    const sql = calls[0].sql.replace(/\s+/g, ' ');
    // The whole point of FR-3: a concurrent writer must not lose its field, and we must not lose
    // ours. A SELECT-then-UPDATE-whole-blob would satisfy "it wrote" and fail that.
    expect(sql).toContain("COALESCE(metadata, '{}'::jsonb) || $2::jsonb");
    expect(sql).toContain('WHERE session_id = $1');
    expect(sql).not.toMatch(/\bSELECT\b/i);
  });

  it('sends only its own keys in the patch — a partial merge, never a full blob', async () => {
    const { createClientFn, calls } = stubClient();
    await setWindowVisible('sess-1', { visible: true, by: 'test' }, { createClientFn });
    const patch = JSON.parse(calls[0].params[1]);
    expect(Object.keys(patch).sort()).toEqual(['window_visible', 'window_visible_set_at', 'window_visible_set_by']);
    expect(patch[WINDOW_VISIBLE_KEY]).toBe(true);
  });

  it('refuses malformed input rather than writing a half-truth', async () => {
    const { createClientFn } = stubClient();
    await expect(setWindowVisible('', { visible: true, by: 'x' }, { createClientFn })).rejects.toThrow();
    await expect(setWindowVisible('s', { visible: 'yes', by: 'x' }, { createClientFn })).rejects.toThrow();
    await expect(setWindowVisible('s', { visible: true }, { createClientFn })).rejects.toThrow();
  });

  it('surfaces a DB failure as not-written instead of throwing', async () => {
    const createClientFn = async () => ({ query: async () => { throw new Error('db exploded'); }, end: async () => {} });
    const r = await setWindowVisible('sess-1', { visible: false, by: 'test' }, { createClientFn });
    expect(r.written).toBe(false);
    expect(r.error).toMatch(/db exploded/);
  });
});

describe('FR-2: owner identity is three conjuncts, and start time is required', () => {
  it('persists pid + proc + START TICKS under namespaced keys', async () => {
    const { createClientFn, calls } = stubClient();
    await setWindowOwner('sess-1', { pid: 11340, procName: 'WindowsTerminal', startTicks: '638600000000000000' }, { createClientFn });
    const patch = JSON.parse(calls[0].params[1]);
    for (const k of WINDOW_OWNER_KEYS) expect(patch).toHaveProperty(k);
    // NEVER a bare `pid` key: a future reader must not mistake the window owner for the seat process.
    expect(patch).not.toHaveProperty('pid');
  });

  it('rejects a partial identity — pid alone is not a guard', async () => {
    const { createClientFn } = stubClient();
    const bad = [
      { pid: 11340, procName: 'WindowsTerminal' },                       // no start time
      { pid: 11340, startTicks: '1' },                                   // no proc name
      { procName: 'WindowsTerminal', startTicks: '1' },                  // no pid
      { pid: 0, procName: 'WindowsTerminal', startTicks: '1' },
      { pid: 11340, procName: 'bad name; whoami', startTicks: '1' },
      { pid: 11340, procName: 'WindowsTerminal', startTicks: 'nope' },
    ];
    for (const o of bad) await expect(setWindowOwner('s', o, { createClientFn })).rejects.toThrow();
  });

  it('readWindowOwner returns null on any incomplete identity', () => {
    expect(readWindowOwner({ window_owner_pid: 1, window_owner_proc: 'x', window_owner_start_ticks: '9' })).toEqual({ pid: 1, procName: 'x', startTicks: '9' });
    for (const m of [null, {}, { window_owner_pid: 1 }, { window_owner_pid: 1, window_owner_proc: 'x' }, { window_owner_pid: 0, window_owner_proc: 'x', window_owner_start_ticks: '9' }]) {
      expect(readWindowOwner(m)).toBeNull();
    }
  });
});

describe('TS-3: all THREE handle-less shapes refuse, asserted separately', () => {
  // Aggregating these into one "refuses when no handle" case is the vacuity trap the PRD calls out:
  // spawn's bind loop can leave the key ABSENT, a capture failure writes handle_capture_failed,
  // and the key can be present-but-null. They are different states from different code paths.
  const owner = { window_owner_pid: 1, window_owner_proc: 'x', window_owner_start_ticks: '9' };

  it('shape 1: window_handle key ABSENT (bind loop never found a fresh row)', () => {
    expect(classifyHideRefusal({ ...owner })).toBe('window_handle_absent');
  });

  it('shape 2: window_handle present but NULL', () => {
    expect(classifyHideRefusal({ ...owner, window_handle: null })).toBe('window_handle_null');
  });

  it('shape 3: handle_capture_failed === true (capture failed, bind landed)', () => {
    expect(classifyHideRefusal({ ...owner, window_handle: 42, handle_capture_failed: true })).toBe('handle_capture_failed');
  });

  it('also refuses a handle with an INCOMPLETE owner identity', () => {
    expect(classifyHideRefusal({ window_handle: 42 })).toBe('window_owner_identity_incomplete');
  });

  it('permits only a complete handle + owner identity', () => {
    expect(classifyHideRefusal({ ...owner, window_handle: 42 })).toBeNull();
  });
});

describe('TS-11: the window-owning pid is NEVER reachable from a kill path', () => {
  // THE HAZARD THIS SD CREATES. window_owner_pid is the SHARED WindowsTerminal host — measured, one
  // pid for all 9 seats — so taskkill /T /F on it is a nine-seat outage. The per-seat process is
  // claude_sessions.pid, which is what the kill paths already use. Before this SD no window-owning
  // pid existed in the session row at all; this test exists because we put one there.
  //
  // Grep is the right instrument: the failure mode is a future author reasonably assuming that a pid
  // on a session row IS that session's process.
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const KILL_PATHS = ['lib/fleet/graceful-kill.mjs', 'scripts/fleet-kill.mjs'];

  it.each(KILL_PATHS)('%s references no window-owner field', (rel) => {
    const src = fs.readFileSync(root + rel, 'utf8');
    for (const key of [...WINDOW_OWNER_KEYS, 'window_handle']) {
      expect(src, `${rel} must not read ${key} — it is the shared terminal host, not the seat process`).not.toContain(key);
    }
  });

  it('the kill paths exist where this test thinks they do — negative control', () => {
    // Without this, a renamed or moved file turns the assertions above into a silent pass:
    // readFileSync would throw, but a future edit wrapping it in a try would not.
    for (const rel of KILL_PATHS) expect(fs.existsSync(root + rel), `${rel} not found`).toBe(true);
  });
});
