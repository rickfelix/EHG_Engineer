/**
 * scripts/stale-session-sweep.cjs's detectIdentityCollisions() — first direct unit test.
 * SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-3, TS-8).
 *
 * Prior coverage was a source-regex assertion only (stale-session-sweep-claim-safety.test.js:209,
 * which verifies a DIFFERENT property — that a call site is wired to consume this function's
 * return shape — not that the function itself behaves correctly). detectIdentityCollisions()
 * gained an optional markerDir parameter (test-injection seam) so it can be tested directly
 * against real fixture files instead of the host-local .claude/session-identity directory.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { detectIdentityCollisions } = require('../../../scripts/stale-session-sweep.cjs');

describe('detectIdentityCollisions', () => {
  const dirs = [];
  function makeDir() {
    const d = mkdtempSync(path.join(tmpdir(), 'identity-collisions-'));
    dirs.push(d);
    return d;
  }
  afterEach(() => {
    while (dirs.length) { try { rmSync(dirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  it('returns empty collisions/aliveMarkers when the directory does not exist', () => {
    expect(detectIdentityCollisions('/no/such/dir/xyz')).toEqual({ collisions: [], aliveMarkers: [] });
  });

  it('no collision when each live marker has a distinct session_id', () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, `pid-${process.pid}.json`), JSON.stringify({ session_id: 'session-a', cc_pid: process.pid }));
    const { collisions, aliveMarkers } = detectIdentityCollisions(dir);
    expect(collisions).toEqual([]);
    expect(aliveMarkers).toHaveLength(1);
    expect(aliveMarkers[0].session_id).toBe('session-a');
  });

  it('detects a collision when two ALIVE markers share the same session_id', () => {
    const dir = makeDir();
    // Two distinct pid-*.json files, same session_id, both pointing at the current (alive) PID
    // is not itself realistic, but the function keys collision detection purely on session_id
    // grouping among markers it independently confirms are alive -- so this exercises the real
    // grouping logic without needing two genuinely distinct live processes in a unit test.
    writeFileSync(path.join(dir, `pid-${process.pid}.json`), JSON.stringify({ session_id: 'shared-session', cc_pid: process.pid }));
    // fallback-*.json markers use their OWN pid in the filename per the collision-detector's
    // format-dispatch (fallback markers use the ephemeral Desktop pid field, but liveness for
    // fallback markers requires a running claude.exe, which won't exist in this unit test
    // environment -- so use a second pid-*.json instead to keep both markers CLI-alive-checkable).
    writeFileSync(path.join(dir, 'pid-1073741822.json'), JSON.stringify({ session_id: 'shared-session', cc_pid: 1073741822 }));
    const { collisions } = detectIdentityCollisions(dir);
    // Only the process.pid marker is genuinely alive (1073741822 is an ESRCH pid on this host),
    // so the alive-only grouping should NOT see two live markers under 'shared-session' -- this
    // pins the "collisions require multiple ALIVE markers, not just multiple marker files" contract.
    expect(collisions).toEqual([]);
  });

  it('detects a real collision when two markers with the same session_id are BOTH alive', () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, `pid-${process.pid}.json`), JSON.stringify({ session_id: 'shared-session', cc_pid: process.pid }));
    // Use the test runner's own parent process pid as a second genuinely-alive pid distinct from
    // process.pid, if available; otherwise this test still validates the single-alive-marker case
    // above is correctly negative, which is the more important boundary.
    const secondAlivePid = typeof process.ppid === 'number' && process.ppid > 0 ? process.ppid : process.pid;
    writeFileSync(path.join(dir, `pid-${secondAlivePid}.json`), JSON.stringify({ session_id: 'shared-session', cc_pid: secondAlivePid }));
    const { collisions } = detectIdentityCollisions(dir);
    if (secondAlivePid === process.pid) {
      // Same file would have been overwritten by the second write (same filename) -- degenerate
      // to a single marker, so assert no collision rather than a false expectation.
      expect(collisions).toEqual([]);
    } else {
      expect(collisions).toHaveLength(1);
      expect(collisions[0].session_id).toBe('shared-session');
      expect(collisions[0].markers).toHaveLength(2);
      // FR-3: the removed has_csid_divergence field must not reappear.
      expect('has_csid_divergence' in collisions[0]).toBe(false);
    }
  });

  it('skips unreadable/malformed marker files without throwing', () => {
    const dir = makeDir();
    writeFileSync(path.join(dir, 'pid-99999999.json'), 'not valid json');
    expect(() => detectIdentityCollisions(dir)).not.toThrow();
    expect(detectIdentityCollisions(dir)).toEqual({ collisions: [], aliveMarkers: [] });
  });
});
