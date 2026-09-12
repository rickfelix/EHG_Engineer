/**
 * SD-REFILL-00IO6NQJ — the shared CC-PID liveness SSOT.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { isProcessRunning, getAliveCcPids, getMarkerSessionIds, getMarkerReadState, MARKER_DIR } = require('../../lib/fleet/cc-pid-liveness.cjs');

describe('SD-REFILL-00IO6NQJ: cc-pid-liveness', () => {
  it('isProcessRunning is true for the current process', () => {
    expect(isProcessRunning(process.pid)).toBe(true);
  });

  it('isProcessRunning is false for invalid pids', () => {
    expect(isProcessRunning(0)).toBe(false);
    expect(isProcessRunning(null)).toBe(false);
    expect(isProcessRunning(undefined)).toBe(false);
    expect(isProcessRunning('123')).toBe(false); // non-number
  });

  it('isProcessRunning is false for a pid that does not exist', () => {
    // 2^30 is well above any live PID on these boxes → ESRCH (not EPERM).
    expect(isProcessRunning(1073741823)).toBe(false);
  });

  it('getMarkerSessionIds / getAliveCcPids return safe empties for a missing marker dir', () => {
    expect(getMarkerSessionIds('/no/such/marker/dir/xyz')).toEqual({});
    expect(getAliveCcPids('/no/such/marker/dir/xyz')).toBeInstanceOf(Set);
    expect(getAliveCcPids('/no/such/marker/dir/xyz').size).toBe(0);
  });

  it('exposes the canonical marker dir', () => {
    expect(typeof MARKER_DIR).toBe('string');
    expect(MARKER_DIR.replace(/\\/g, '/')).toMatch(/\.claude\/session-identity$/);
  });
});

// QF-20260911-907: a guard may decline to run but must never report a number it did not
// take. readMarkerDir used to return {} for "directory absent", "directory exists but
// genuinely empty" and (via an uncaught throw) "directory unreadable" alike -- a caller
// could not tell a trustworthy zero from a failure to measure. getMarkerReadState exposes
// that discrimination for callers (fleet-quiescence.cjs) that must treat them differently.
describe('QF-20260911-907: getMarkerReadState discriminates absent/unreadable/ok', () => {
  it('a single absent directory reports absent', () => {
    expect(getMarkerReadState('/no/such/marker/dir/xyz')).toBe('absent');
  });

  it('a directory that exists but is not readable as a directory (ENOTDIR) reports unreadable', () => {
    // A FILE (not a directory) at the given path portably triggers ENOTDIR from
    // fs.readdirSync, without needing OS-specific permission manipulation.
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), 'marker-notdir-')), 'not-a-dir');
    writeFileSync(filePath, 'x');
    expect(getMarkerReadState(filePath)).toBe('unreadable');
    rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  it('a genuinely empty (but existing) directory is "ok", not unreadable or absent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'marker-empty-'));
    expect(getMarkerReadState(dir)).toBe('ok');
    rmSync(dir, { recursive: true, force: true });
  });

  it('across multiple directories: unreadable wins even if another is absent', () => {
    const filePath = path.join(mkdtempSync(path.join(tmpdir(), 'marker-notdir2-')), 'not-a-dir');
    writeFileSync(filePath, 'x');
    expect(getMarkerReadState(undefined, () => ['/no/such/dir', filePath])).toBe('unreadable');
    rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  it('across multiple directories: absent only if EVERY directory is absent', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'marker-mixed-'));
    expect(getMarkerReadState(undefined, () => ['/no/such/dir', dir])).toBe('ok');
    rmSync(dir, { recursive: true, force: true });
  });
});

// SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001 (FR-1): getMarkerSessionIds/getAliveCcPids
// default to the host-wide union (markerDirs()) rather than a single local directory, with an
// alive-biased OR merge across directories. markerDirsFn is the injection seam for hermetically
// testing the union path without deriving real __dirname-based paths.
describe('SD-LEO-INFRA-SESSION-IDENTITY-MARKER-CALLERS-001: union-by-default', () => {
  const dirs = [];
  function makeDir() {
    const d = mkdtempSync(path.join(tmpdir(), 'marker-union-'));
    dirs.push(d);
    return d;
  }
  function writeMarker(dir, pid, sessionId) {
    writeFileSync(path.join(dir, `pid-${pid}.json`), JSON.stringify({ session_id: sessionId, cc_pid: pid }));
  }
  afterEach(() => {
    while (dirs.length) { try { rmSync(dirs.pop(), { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  it('TS-1: no-arg call reads markers from every directory markerDirsFn() returns', () => {
    const dirA = makeDir();
    const dirB = makeDir();
    writeMarker(dirB, process.pid, 'session-in-dir-b-only');
    const result = getMarkerSessionIds(undefined, () => [dirA, dirB]);
    expect(result['session-in-dir-b-only']).toMatchObject({ pid: process.pid, alive: true });
  });

  it('TS-1b: getAliveCcPids union path via injected markerDirsFn (independent Set-merge)', () => {
    const dirA = makeDir();
    const dirB = makeDir();
    writeMarker(dirB, process.pid, 'session-in-dir-b-only');
    const alive = getAliveCcPids(undefined, () => [dirA, dirB]);
    expect(alive.has(String(process.pid))).toBe(true);
  });

  it('TS-2: alive-biased OR merge -- same session_id alive in one dir wins over dead in another', () => {
    const dirDead = makeDir();
    const dirAlive = makeDir();
    // A dead PID marker for the session in one dir...
    writeMarker(dirDead, 1073741823, 'collision-session'); // ESRCH pid, never alive
    // ...and an alive PID marker for the SAME session_id in another dir.
    writeMarker(dirAlive, process.pid, 'collision-session');
    const result = getMarkerSessionIds(undefined, () => [dirDead, dirAlive]);
    expect(result['collision-session'].alive).toBe(true);
    // Order independence: reversing the directory order must not flip the result.
    const reversed = getMarkerSessionIds(undefined, () => [dirAlive, dirDead]);
    expect(reversed['collision-session'].alive).toBe(true);
  });

  it('TS-3: an explicit markerDir argument still pins to exactly that one directory (union path never consulted)', () => {
    const dirA = makeDir();
    const dirB = makeDir();
    writeMarker(dirB, process.pid, 'session-in-dir-b-only');
    // markerDirsFn is provided but must be ignored entirely since markerDir is explicit.
    const result = getMarkerSessionIds(dirA, () => [dirA, dirB]);
    expect(result).toEqual({});
  });

  it('TS-8b: the returned shape never carries a claude_session_id field', () => {
    const dir = makeDir();
    writeMarker(dir, process.pid, 'some-session');
    const result = getMarkerSessionIds(dir);
    expect('claude_session_id' in result['some-session']).toBe(false);
    expect(Object.keys(result['some-session']).sort()).toEqual(['alive', 'pid']);
  });
});
