// Tests for QF-20260504-749 — readLatestMarkerByMtime fallback +
// logNullResolution diagnostic canary in lib/hooks/session-id.cjs.
// Closes deferred bundle from feedback 7f49b45f.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const helper = require(path.resolve(__dirname, '../session-id.cjs'));
const { readLatestMarkerByMtime, logNullResolution } = helper;

let tmpRoot;
beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qf749-'));
});
afterEach(() => {
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
});

describe('QF-749 MTIME-1: returns null when markerDir does not exist', () => {
  it('does not throw, returns null', () => {
    expect(readLatestMarkerByMtime(path.join(tmpRoot, 'missing'))).toBeNull();
  });
});

describe('QF-749 MTIME-2: picks newest marker by mtime', () => {
  it('returns session_id from the most-recently-modified marker', () => {
    const mk = (name, sid, mtime) => {
      const p = path.join(tmpRoot, name);
      fs.writeFileSync(p, JSON.stringify({ session_id: sid }));
      fs.utimesSync(p, mtime / 1000, mtime / 1000);
    };
    mk('pid-100.json', 'older-session-aaaa', Date.now() - 60_000);
    mk('pid-200.json', 'newer-session-bbbb', Date.now());
    mk('pid-150.json', 'middle-session-cccc', Date.now() - 30_000);
    expect(readLatestMarkerByMtime(tmpRoot)).toBe('newer-session-bbbb');
  });
});

describe('QF-749 MTIME-3: skips invalid marker, falls through to next', () => {
  it('ignores marker with invalid session_id and returns the next valid one', () => {
    const newest = path.join(tmpRoot, 'pid-300.json');
    fs.writeFileSync(newest, JSON.stringify({ session_id: 'INVALID@SID!' }));
    fs.utimesSync(newest, Date.now() / 1000, Date.now() / 1000);
    const older = path.join(tmpRoot, 'pid-100.json');
    fs.writeFileSync(older, JSON.stringify({ session_id: 'valid-session-xyz' }));
    fs.utimesSync(older, (Date.now() - 60_000) / 1000, (Date.now() - 60_000) / 1000);
    expect(readLatestMarkerByMtime(tmpRoot)).toBe('valid-session-xyz');
  });
});

describe('QF-749 MTIME-4: ignores non-marker files', () => {
  it('only considers pid-*.json files', () => {
    fs.writeFileSync(path.join(tmpRoot, 'random.json'), JSON.stringify({ session_id: 'should-be-ignored' }));
    fs.writeFileSync(path.join(tmpRoot, 'pid-99.json'), JSON.stringify({ session_id: 'pid-marker-wins' }));
    expect(readLatestMarkerByMtime(tmpRoot)).toBe('pid-marker-wins');
  });
});

describe('QF-749 LOG-1: logNullResolution writes a JSON canary file', () => {
  it('creates os.tmpdir/claude-hook-resolve-null/pid-<pid>-<ts>.json', () => {
    const dir = path.join(os.tmpdir(), 'claude-hook-resolve-null');
    const before = fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
    logNullResolution({ stdin: false, env: false, marker: false, mtime: false });
    const after = fs.readdirSync(dir).length;
    expect(after).toBeGreaterThan(before);
    const newest = fs.readdirSync(dir)
      .map(f => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)[0].f;
    const data = JSON.parse(fs.readFileSync(path.join(dir, newest), 'utf8'));
    expect(data.pid).toBe(process.pid);
    expect(data.steps).toEqual({ stdin: false, env: false, marker: false, mtime: false });
  });
});

describe('QF-749 LOG-2: logNullResolution swallows errors silently', () => {
  it('does not throw even when fs.mkdirSync would fail', () => {
    expect(() => logNullResolution({ steps: 'whatever' })).not.toThrow();
  });
});
