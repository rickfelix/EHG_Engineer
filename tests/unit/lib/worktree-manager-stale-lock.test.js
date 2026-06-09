/**
 * QF-20260609-032: execSyncWithRetry must clear a STALE .git/index.lock (dead/abandoned owner)
 * before retrying a git op — previously it only backed off and exhausted retries, never recovering.
 * Unit tests for the extracted helpers (clearStaleGitLock + extractGitLockPath); deterministic,
 * no git/DB. Mirrors tests/unit/lib/worktree-manager-retry.test.js (real tmp files).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { clearStaleGitLock, extractGitLockPath } from '../../../lib/worktree-manager.js';

describe('QF-20260609-032: clearStaleGitLock', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-lock-test-')); });
  afterEach(() => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* fine */ } });

  it('removes an AGED lock (mtime older than staleMs)', () => {
    const lock = path.join(tmpDir, 'index.lock');
    fs.writeFileSync(lock, ''); // git index.lock is 0-byte
    const old = new Date(Date.now() - 120000); // 2 min ago
    fs.utimesSync(lock, old, old);
    expect(clearStaleGitLock(lock, { staleMs: 30000 })).toBe(true);
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('LEAVES a fresh lock (mtime within staleMs — a concurrent live op)', () => {
    const lock = path.join(tmpDir, 'index.lock');
    fs.writeFileSync(lock, '');
    expect(clearStaleGitLock(lock, { staleMs: 30000 })).toBe(false);
    expect(fs.existsSync(lock)).toBe(true);
  });

  it('returns false (no throw) for a non-existent lock path', () => {
    expect(clearStaleGitLock(path.join(tmpDir, 'nope.lock'), { staleMs: 1 })).toBe(false);
  });

  it('returns false for a null/empty path (fail-open)', () => {
    expect(clearStaleGitLock(null)).toBe(false);
    expect(clearStaleGitLock('')).toBe(false);
  });
});

describe('QF-20260609-032: extractGitLockPath', () => {
  it("extracts the quoted *.lock path from a git error", () => {
    expect(extractGitLockPath("fatal: Unable to create '/r/.git/index.lock': File exists."))
      .toBe('/r/.git/index.lock');
    expect(extractGitLockPath('cannot lock ref: Unable to create "/r/.git/refs/heads/x.lock": File exists'))
      .toBe('/r/.git/refs/heads/x.lock');
  });

  it('returns null when no .lock path is named', () => {
    expect(extractGitLockPath('another git process seems to be running')).toBeNull();
    expect(extractGitLockPath('')).toBeNull();
    expect(extractGitLockPath(null)).toBeNull();
  });
});
