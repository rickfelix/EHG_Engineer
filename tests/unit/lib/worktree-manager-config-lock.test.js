/**
 * SD-FDBK-INFRA-FLEET-WIDE-BLOCKER-001: a stale .git/config.lock blocked ALL new
 * worktree/branch creation fleet-wide — classifyWorktreeError didn't recognize git's
 * "could not lock config file X: File exists" text as transient (zero retry), and
 * extractGitLockPath couldn't resolve the actual lock path from that message shape
 * (git names the config FILE, not its .lock, unlike the index.lock message format).
 * Mirrors tests/unit/lib/worktree-manager-stale-lock.test.js's style (QF-20260609-032).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { classifyWorktreeError, extractGitLockPath, clearStaleGitLock } from '../../../lib/worktree-manager.js';

const CONFIG_LOCK_MSG = 'error: could not lock config file .git/config: File exists';

describe('SD-FDBK-INFRA-FLEET-WIDE-BLOCKER-001: classifyWorktreeError', () => {
  it('TS-1: recognizes the config-lock error text as transient', () => {
    expect(classifyWorktreeError(CONFIG_LOCK_MSG).transient).toBe(true);
  });

  it('TS-2: existing transient shapes (index.lock, ref, concurrent process) are unchanged', () => {
    expect(classifyWorktreeError("fatal: Unable to create '/r/.git/index.lock': File exists.").transient).toBe(true);
    expect(classifyWorktreeError('cannot lock ref: something').transient).toBe(true);
    expect(classifyWorktreeError('another git process seems to be running').transient).toBe(true);
  });

  it('TS-3: unrelated errors still classify non-transient, unchanged', () => {
    expect(classifyWorktreeError('fatal: already checked out at /other').transient).toBe(false);
    expect(classifyWorktreeError('fatal: ENOSPC: no space left on device').transient).toBe(false);
  });
});

describe('SD-FDBK-INFRA-FLEET-WIDE-BLOCKER-001: extractGitLockPath', () => {
  it('TS-4: resolves .git/config.lock from the config-lock message shape', () => {
    expect(extractGitLockPath(CONFIG_LOCK_MSG)).toBe('.git/config.lock');
  });

  it('TS-5: still resolves an explicitly-quoted .lock path unchanged (index.lock precedence)', () => {
    expect(extractGitLockPath("fatal: Unable to create '/r/.git/index.lock': File exists."))
      .toBe('/r/.git/index.lock');
  });

  it('TS-6: returns null for a message matching neither shape', () => {
    expect(extractGitLockPath('another git process seems to be running')).toBeNull();
    expect(extractGitLockPath('')).toBeNull();
  });
});

describe('SD-FDBK-INFRA-FLEET-WIDE-BLOCKER-001: end-to-end stale/fresh config.lock handling', () => {
  let tmpDir;
  const withTmp = (fn) => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-lock-test-'));
    try { fn(); } finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* fine */ } }
  };

  it('TS-7/TS-8: a STALE config.lock derived from the message is cleared; a FRESH one is not', () => {
    withTmp(() => {
      const configPath = path.join(tmpDir, '.git', 'config');
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      const lockPath = `${configPath}.lock`;

      const msg = `error: could not lock config file ${configPath}: File exists`;
      const derivedPath = extractGitLockPath(msg);
      expect(derivedPath).toBe(lockPath);

      // Stale (old mtime) — cleared
      fs.writeFileSync(lockPath, '');
      const old = new Date(Date.now() - 120000);
      fs.utimesSync(lockPath, old, old);
      expect(clearStaleGitLock(derivedPath, { staleMs: 30000 })).toBe(true);
      expect(fs.existsSync(lockPath)).toBe(false);

      // Fresh — left alone
      fs.writeFileSync(lockPath, '');
      expect(clearStaleGitLock(derivedPath, { staleMs: 30000 })).toBe(false);
      expect(fs.existsSync(lockPath)).toBe(true);
    });
  });
});
