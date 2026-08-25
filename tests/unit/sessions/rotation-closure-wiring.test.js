/**
 * SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 FR-1 — the WIRING, not the predicate.
 *
 * rotation-closure.test.js proves the predicate picks the right session ids. This file proves the
 * hook feeds it the right rows, which is where this FR very nearly died: the EXEC handoff said to
 * join on `claude_sessions.cc_parent_pid`, and that column DOES NOT EXIST. The join key lives only
 * on the tick marker file. A test that exercised the predicate alone would have stayed green
 * through that entire mistake.
 *
 * Every test pins parentPid and pidsDir. Nothing here reads live PID discovery — a test that had
 * to stub that would be asserting against its own stub.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { readTickMarkers } = require_('../../../lib/sessions/rotation-closure.cjs');
const { closeRotatedOutSessions } = require_('../../../scripts/hooks/session-register.cjs');

/** Write a throwaway .claude/pids-shaped dir. Returns its path. */
function markerDir(markers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-close-'));
  for (const [name, body] of Object.entries(markers)) {
    fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

/**
 * Minimal supabase double. Records the ids it was asked to release so a test can assert on the
 * WRITE rather than on a return value — closeRotatedOutSessions is fire-and-forget by design and
 * deliberately returns nothing.
 */
function fakeSupabase(rows) {
  const released = [];
  return {
    released,
    from() {
      return {
        // .limit() must be chainable after .in() -- the real query now ends with .limit(999)
        // (SD-LEO-INFRA-SESSION-TICK-CLEAR-001, count-truncation-diff-lint requires a bounding
        // marker on every select() site).
        select: () => ({ in: (_c, ids) => { const r = { data: rows.filter((row) => ids.includes(row.session_id)), error: null }; return { ...r, limit: () => r }; } }),
        update: (patch) => ({ in: (_c, ids) => { released.push({ patch, ids }); return { error: null }; } }),
      };
    },
  };
}

describe('FR-1 wiring — marker reader', () => {
  it('reads session_id -> cc_parent_pid from tick markers', () => {
    const dir = markerDir({ 'tick-aaa.json': { session_id: 'aaa', cc_parent_pid: 111 } });
    expect(readTickMarkers(dir).get('aaa')).toBe(111);
  });

  it('skips a marker missing cc_parent_pid instead of admitting a match-anything entry', () => {
    // A marker that lost its pid must not become a wildcard — that is how a scoped filter turns
    // into a fleet-wide release.
    const dir = markerDir({ 'tick-bbb.json': { session_id: 'bbb' } });
    expect(readTickMarkers(dir).has('bbb')).toBe(false);
  });

  it('skips a half-written marker rather than throwing (the writer is not atomic)', () => {
    const dir = markerDir({ 'tick-ccc.json': '{"session_id":"ccc","cc_pare' });
    expect(() => readTickMarkers(dir)).not.toThrow();
    expect(readTickMarkers(dir).size).toBe(0);
  });

  it('ignores non-tick files and returns empty for a missing dir', () => {
    const dir = markerDir({ 'spawn-errors.log': 'noise', 'pid-42.json': '{}' });
    expect(readTickMarkers(dir).size).toBe(0);
    expect(readTickMarkers(path.join(dir, 'nope')).size).toBe(0);
  });
});

describe('FR-1 wiring — closure', () => {
  const PID = 22196;

  it('releases the rotated-out session id on our own CC process', async () => {
    const dir = markerDir({
      'tick-old.json': { session_id: 'old', cc_parent_pid: PID },
      'tick-new.json': { session_id: 'new', cc_parent_pid: PID },
    });
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active' },
      { session_id: 'new', status: 'active' },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it("writes status='released' specifically — the only value that stops the daemon", async () => {
    // session-tick.cjs:331 PATCHes `status=in.(active,idle,stale)`. Any other status leaves the
    // daemon ticking, which is this SD's defect with a tidier status column.
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const sb = fakeSupabase([{ session_id: 'old', status: 'active' }]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released[0].patch).toEqual({ status: 'released' });
  });

  // ─── TS-2: THE LOAD-BEARING ONE ────────────────────────────────────────────────────────────
  it('TS-2 leaves a PARKED /loop worker on a DIFFERENT CC process completely alone', async () => {
    const dir = markerDir({
      'tick-parked.json': { session_id: 'parked', cc_parent_pid: 99999 },
      'tick-new.json': { session_id: 'new', cc_parent_pid: PID },
    });
    const sb = fakeSupabase([
      { session_id: 'parked', status: 'active' },   // alive, between wakeups, no tool use
      { session_id: 'new', status: 'active' },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]); // nothing to close — and 'parked' was never a candidate
  });

  it('TS-2b gives the identical verdict no matter how quiet the parked worker has been', async () => {
    // No elapsed-time, last_tool_at or heartbeat input exists anywhere in this path. Rows carrying
    // wildly different activity histories must be indistinguishable to it.
    const dir = markerDir({ 'tick-parked.json': { session_id: 'parked', cc_parent_pid: 99999 } });
    const fresh = fakeSupabase([{ session_id: 'parked', status: 'active', last_tool_at: new Date().toISOString() }]);
    const ancient = fakeSupabase([{ session_id: 'parked', status: 'active', last_tool_at: '2020-01-01T00:00:00Z' }]);
    await closeRotatedOutSessions(fresh, 'new', { parentPid: PID, pidsDir: dir });
    await closeRotatedOutSessions(ancient, 'new', { parentPid: PID, pidsDir: dir });
    expect(fresh.released).toEqual(ancient.released);
    expect(fresh.released).toEqual([]);
  });

  // ─── CONTROL: prove TS-2 is not vacuous ────────────────────────────────────────────────────
  it('CONTROL — the same parked worker IS released once it shares our pid, so TS-2 can fail', async () => {
    // If this control did not release, TS-2 would be passing because the harness closes nothing
    // at all rather than because the parked worker is correctly excluded.
    const dir = markerDir({ 'tick-parked.json': { session_id: 'parked', cc_parent_pid: PID } });
    const sb = fakeSupabase([{ session_id: 'parked', status: 'active' }]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['parked'] }]);
  });

  it('never releases the CURRENT session id', async () => {
    const dir = markerDir({ 'tick-new.json': { session_id: 'new', cc_parent_pid: PID } });
    const sb = fakeSupabase([{ session_id: 'new', status: 'active' }]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]);
  });

  it('leaves already-released rows alone (no pointless re-write)', async () => {
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const sb = fakeSupabase([{ session_id: 'old', status: 'released' }]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]);
  });

  it('closes idle and stale rows too — both still tick', async () => {
    // The daemon PATCH survives active|idle|stale, so all three keep a daemon alive.
    const dir = markerDir({
      'tick-i.json': { session_id: 'i', cc_parent_pid: PID },
      'tick-s.json': { session_id: 's', cc_parent_pid: PID },
    });
    const sb = fakeSupabase([
      { session_id: 'i', status: 'idle' },
      { session_id: 's', status: 'stale' },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released[0].ids.sort()).toEqual(['i', 's']);
  });

  it('is a no-op when no markers exist, without touching the DB', async () => {
    const dir = markerDir({});
    const sb = fakeSupabase([{ session_id: 'old', status: 'active' }]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]);
  });

  // ─── Fail-closed identity guard ────────────────────────────────────────────────────────────
  it('closes NOTHING when our own marker names a different pid than we discovered', async () => {
    // Identity resolution and the marker record contradict each other. Without this guard the
    // group is closed wholesale; measured live, that included the session doing the closing.
    const dir = markerDir({
      'tick-me.json': { session_id: 'me', cc_parent_pid: 777 },   // marker says 777
      'tick-old.json': { session_id: 'old', cc_parent_pid: PID },
    });
    const sb = fakeSupabase([
      { session_id: 'me', status: 'active' },
      { session_id: 'old', status: 'active' },
    ]);
    await closeRotatedOutSessions(sb, 'me', { parentPid: PID, pidsDir: dir }); // discovered PID
    expect(sb.released).toEqual([]);
  });

  it('CONTROL — the same setup DOES close once the marker agrees, so the guard can be observed', async () => {
    const dir = markerDir({
      'tick-me.json': { session_id: 'me', cc_parent_pid: PID },   // now agrees
      'tick-old.json': { session_id: 'old', cc_parent_pid: PID },
    });
    const sb = fakeSupabase([
      { session_id: 'me', status: 'active' },
      { session_id: 'old', status: 'active' },
    ]);
    await closeRotatedOutSessions(sb, 'me', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('still closes when we have NO marker yet — the normal fresh-rotation case', async () => {
    // The new daemon spawns concurrently with this hook, so our marker is usually absent. The
    // guard must not turn that ordinary case into a no-op, or the FR never fires at all.
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const sb = fakeSupabase([{ session_id: 'old', status: 'active' }]);
    await closeRotatedOutSessions(sb, 'me', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('swallows a DB failure — SessionStart must never abort', async () => {
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const exploding = { from() { throw new Error('supabase down'); } };
    await expect(closeRotatedOutSessions(exploding, 'new', { parentPid: PID, pidsDir: dir }))
      .resolves.toBeUndefined();
  });
});
