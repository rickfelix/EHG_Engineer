/**
 * SD-REFILL-00KUKQVS — stale .git/index.lock auto-clear (the silent origin/main drift root).
 *
 * Removes the SHARED checkout's .git/index.lock ONLY when stale (0-byte crash-orphan, or
 * mtime older than the threshold); a FRESH non-empty lock (an active git op) is NEVER removed.
 */
import { describe, it, expect, vi } from 'vitest';
import { clearStaleGitIndexLock, DEFAULT_STALE_LOCK_MAX_AGE_MS } from '../../lib/git/clear-stale-index-lock.mjs';

const NOW = 1_000_000_000_000;
function fakeFs({ size, mtimeMs, unlinkThrows = false } = {}) {
  const calls = { unlinked: 0 };
  return {
    calls,
    statSync: () => {
      if (size === undefined) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return { size, mtimeMs };
    },
    unlinkSync: () => { calls.unlinked++; if (unlinkThrows) throw new Error('EBUSY'); },
  };
}

describe('clearStaleGitIndexLock (SD-REFILL-00KUKQVS)', () => {
  it('absent lock → no-op (the common case)', () => {
    const fs = fakeFs({}); // statSync throws ENOENT
    const r = clearStaleGitIndexLock({ repoRoot: '/repo', fs, now: NOW });
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('absent');
    expect(fs.calls.unlinked).toBe(0);
  });

  it('0-byte lock → cleared even if fresh (crash-orphan signal)', () => {
    const fs = fakeFs({ size: 0, mtimeMs: NOW - 1000 }); // 1s old but 0-byte
    const r = clearStaleGitIndexLock({ repoRoot: '/repo', fs, now: NOW });
    expect(r.cleared).toBe(true);
    expect(r.reason).toBe('zero_byte');
    expect(fs.calls.unlinked).toBe(1);
  });

  it('old non-empty lock (mtime > threshold) → cleared', () => {
    const fs = fakeFs({ size: 41, mtimeMs: NOW - (DEFAULT_STALE_LOCK_MAX_AGE_MS + 5000) });
    const r = clearStaleGitIndexLock({ repoRoot: '/repo', fs, now: NOW });
    expect(r.cleared).toBe(true);
    expect(r.reason).toBe('stale_mtime');
    expect(fs.calls.unlinked).toBe(1);
  });

  it('FRESH non-empty lock (active git op) → NEVER removed', () => {
    const fs = fakeFs({ size: 41, mtimeMs: NOW - 2000 }); // 2s old, has content
    const r = clearStaleGitIndexLock({ repoRoot: '/repo', fs, now: NOW });
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('fresh_active');
    expect(fs.calls.unlinked).toBe(0);
  });

  it('unlink failure → fail-soft (cleared:false, reason unlink_failed, never throws)', () => {
    const fs = fakeFs({ size: 0, mtimeMs: NOW - 1000, unlinkThrows: true });
    const r = clearStaleGitIndexLock({ repoRoot: '/repo', fs, now: NOW });
    expect(r.cleared).toBe(false);
    expect(r.reason).toBe('unlink_failed');
  });

  it('no repoRoot → no-op', () => {
    expect(clearStaleGitIndexLock({}).cleared).toBe(false);
  });
});
