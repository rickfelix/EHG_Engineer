/**
 * SD-LEO-INFRA-SESSION-TICK-CLEAR-001 (FR-2/FR-3/FR-4/FR-5) — the marker-INDEPENDENT DB-join
 * fallback. rotation-closure-wiring.test.js covers the pre-existing marker-based path (PASS 1,
 * unchanged); this file covers PASS 2, added because a marker file shared across every daemon
 * one session_id ever spawns is unlinked unconditionally by the FIRST sibling to exit
 * (session-tick.cjs:528), blinding PASS 1 for every survivor. Also covers stampCcParentPid, the
 * write half of the fix.
 *
 * The acceptance-gate fixture the folded-in RCA explicitly required (Solomon advisory a58e7151):
 * "live two-daemon run, DELETE the marker, /clear -> assert the old row is STILL released" is
 * TS-2 below.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const { closeRotatedOutSessions, stampCcParentPid } = require_('../../../scripts/hooks/session-register.cjs');

function markerDir(markers) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-close-db-'));
  for (const [name, body] of Object.entries(markers)) {
    fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

/**
 * A fuller fake supporting both PASS 1's `.select().in()` shape and PASS 2's
 * `.select().eq().eq().neq().in()` chain, plus stampCcParentPid's
 * `.select().eq().maybeSingle()` / `.update().eq()`. Filters `rows` in memory to keep this a
 * pure unit double, not a query-language reimplementation.
 */
function fakeSupabase(rows) {
  const released = [];
  const metadataUpdates = [];
  const live = rows.map((r) => ({ ...r }));

  function selectChain(selected) {
    const filters = [];
    const chain = {
      eq: (col, val) => { filters.push((r) => String(getPath(r, col)) === String(val)); return chain; },
      neq: (col, val) => { filters.push((r) => String(getPath(r, col)) !== String(val)); return chain; },
      in: (col, ids) => {
        // Two uses in this file: `.select().in('session_id', ids)` (PASS 1's marker query) and
        // `...in('status', [...])` (PASS 2's status filter). Both now end with a trailing
        // `.limit(999)` in production (count-truncation-diff-lint requires a bounding marker), so
        // this must return something `.limit()`-chainable, not a bare {data,error}.
        filters.push((r) => ids.map(String).includes(String(getPath(r, col))));
        const matched = live.filter((r) => filters.every((f) => f(r)));
        const result = { data: matched.map((r) => pick(r, selected)), error: null };
        return { ...result, limit: () => result };
      },
      maybeSingle: () => {
        const matched = live.filter((r) => filters.every((f) => f(r)));
        return { data: matched[0] ? pick(matched[0], selected) : null, error: null };
      },
    };
    return chain;
  }

  function getPath(row, col) {
    if (col === 'metadata->>cc_parent_pid') return row.metadata?.cc_parent_pid;
    return row[col];
  }

  function pick(row, selected) {
    if (selected === '*' || !selected) return { ...row };
    const cols = selected.split(',').map((s) => s.trim());
    const out = {};
    for (const c of cols) out[c] = row[c];
    return out;
  }

  return {
    released,
    metadataUpdates,
    rows: live,
    from(table) {
      if (table !== 'claude_sessions') throw new Error(`unexpected table ${table}`);
      return {
        select: (cols) => selectChain(cols),
        update: (patch) => {
          if ('status' in patch) {
            return { in: (_c, ids) => { released.push({ patch, ids }); for (const id of ids) { const r = live.find((x) => x.session_id === id); if (r) r.status = patch.status; } return { error: null }; } };
          }
          if ('metadata' in patch) {
            return { eq: (_c, id) => { metadataUpdates.push({ session_id: id, metadata: patch.metadata }); const r = live.find((x) => x.session_id === id); if (r) r.metadata = patch.metadata; return { error: null }; } };
          }
          throw new Error(`unexpected update patch ${JSON.stringify(patch)}`);
        },
      };
    },
  };
}

describe('stampCcParentPid (FR-1)', () => {
  it('merges cc_parent_pid into existing metadata without clobbering other keys', async () => {
    const sb = fakeSupabase([{ session_id: 'new', metadata: { account_email: 'x@y.com' } }]);
    await stampCcParentPid(sb, 'new', 22196);
    expect(sb.metadataUpdates).toEqual([{ session_id: 'new', metadata: { account_email: 'x@y.com', cc_parent_pid: '22196' } }]);
  });

  it('is a no-op when already stamped with the same pid', async () => {
    const sb = fakeSupabase([{ session_id: 'new', metadata: { cc_parent_pid: '22196' } }]);
    await stampCcParentPid(sb, 'new', 22196);
    expect(sb.metadataUpdates).toEqual([]);
  });

  it('never throws when parentPid is undefined', async () => {
    const sb = fakeSupabase([{ session_id: 'new', metadata: {} }]);
    await expect(stampCcParentPid(sb, 'new', undefined)).resolves.toBeUndefined();
    expect(sb.metadataUpdates).toEqual([]);
  });
});

describe('closeRotatedOutSessions PASS 2 — DB-join fallback (FR-2)', () => {
  const PID = 22196;
  const HOST = os.hostname();

  // ─── TS-2: THE ACCEPTANCE-GATE FIXTURE THE RCA EXPLICITLY REQUIRED ──────────────────────────
  it('TS-2: releases a rotated-out session whose tick marker is GONE, via the DB-join path (mutation-sensitive: fails if FR-2 is absent)', async () => {
    const dir = markerDir({}); // marker already deleted — the live specimen's exact shape
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
      { session_id: 'new', status: 'active', hostname: HOST, metadata: {} },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('TS-1 regression control: marker-based PASS 1 still closes when a marker exists (unchanged behavior)', async () => {
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: {} },
      { session_id: 'new', status: 'active', hostname: HOST, metadata: {} },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('TS-3: identity guard (marker disagrees with discovered pid) closes nothing via EITHER path', async () => {
    const dir = markerDir({ 'tick-new.json': { session_id: 'new', cc_parent_pid: 777 } }); // marker says 777
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
      { session_id: 'new', status: 'active', hostname: HOST, metadata: {} },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir }); // discovered PID
    expect(sb.released).toEqual([]);
  });

  it('TS-4: a parked worker (same session_id as current) is never a DB-join candidate, no marker needed', async () => {
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'parked', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
    ]);
    await closeRotatedOutSessions(sb, 'parked', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]);
  });

  it('TS-5: a pre-SD row with no metadata.cc_parent_pid is NOT released, even alongside a decoy row that IS stamped and matches', async () => {
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'pre-sd-row', status: 'active', hostname: HOST, metadata: {} }, // no cc_parent_pid at all
      { session_id: 'decoy-match', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    const closedIds = sb.released.flatMap((r) => r.ids);
    expect(closedIds).not.toContain('pre-sd-row');
    expect(closedIds).toContain('decoy-match');
  });

  it('TS-6: cross-host isolation — a different-host row with a coincidentally-matching pid is NOT released', async () => {
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'other-host', status: 'active', hostname: 'some-other-machine', metadata: { cc_parent_pid: String(PID) } },
      { session_id: 'same-host', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    const closedIds = sb.released.flatMap((r) => r.ids);
    expect(closedIds).not.toContain('other-host');
    expect(closedIds).toContain('same-host');
  });

  it('TS-7: fail-closed on the unknown/degenerate hostname bucket — DB-join closes nothing even with a matching pid AND a matching-hostname row (mutation-sensitive)', async () => {
    // TESTING review (evidence 484d5121): the original version of this test used only
    // hostname=HOST rows, so it passed vacuously whether or not the `hostname !== 'unknown'`
    // guard existed (a real hostname query simply never matches 'unknown'). This decoy row
    // shares the 'unknown' bucket the CURRENT session resolved to -- if the guard were removed,
    // `.eq('hostname', 'unknown')` WOULD match it, proving the guard is load-bearing, not
    // incidental. Reachable in production: any host whose os.hostname() throws stamps its own
    // rows hostname:'unknown' (session-register.cjs's own getHostname() fallback), so two such
    // machines share one bucket and a coincidentally-matching pid would otherwise collide.
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'other-machine-unknown-host', status: 'active', hostname: 'unknown', metadata: { cc_parent_pid: String(PID) } },
      { session_id: 'same-host-normal', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir, hostname: 'unknown' });
    expect(sb.released).toEqual([]);
  });

  it('TS-8: cc_parent_pid type round-trip — a numeric parentPid still matches a string-stamped metadata value', async () => {
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: { cc_parent_pid: '22196' } },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: 22196, pidsDir: dir }); // number, not string
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('secondary specimen: an orphan-swept marker for a still-LIVE (non-rotated) daemon does not cause a false-positive release of that session', async () => {
    // The live daemon's OWN session_id still equals currentSessionId at its own next
    // SessionStart -- it is never a rotation candidate, independent of any marker's absence.
    const dir = markerDir({});
    const sb = fakeSupabase([
      { session_id: 'still-live', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } },
    ]);
    await closeRotatedOutSessions(sb, 'still-live', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([]);
  });

  it('a malformed PASS-2 row (null session_id) is dropped, not injected into the shared release call — PASS 1\'s legitimate release still succeeds (TESTING review Q3)', async () => {
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } }); // found by PASS 1
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: {} },
      { session_id: null, status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } }, // malformed
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    // If the null id leaked into toCloseIds, this array would contain null and/or the whole
    // release call would be a different shape -- assert it is exactly the one legitimate id.
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]);
  });

  it('does not double-release a session already found by the marker path (dedup across passes)', async () => {
    const dir = markerDir({ 'tick-old.json': { session_id: 'old', cc_parent_pid: PID } });
    const sb = fakeSupabase([
      { session_id: 'old', status: 'active', hostname: HOST, metadata: { cc_parent_pid: String(PID) } }, // found by BOTH passes
      { session_id: 'new', status: 'active', hostname: HOST, metadata: {} },
    ]);
    await closeRotatedOutSessions(sb, 'new', { parentPid: PID, pidsDir: dir });
    expect(sb.released).toEqual([{ patch: { status: 'released' }, ids: ['old'] }]); // one release call, one id
  });
});
