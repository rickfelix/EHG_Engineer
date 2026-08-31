/**
 * QF-20260831-715: non-atomic preserve-then-remove.
 *
 * Live incident (SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001): removeWorktreeViaGit's `git worktree
 * remove --force` failed on EPERM partway through its own recursive delete, then removeWorktree
 * unconditionally retried with a SECOND destructive pass (safeRecursiveRm) on top of that
 * already-partial tree -- which ALSO hit a lock and aborted. Two stacked destructive attempts
 * turned one failure into a much worse one: dirty went from 46 to 3761 (most of the tracked tree
 * had been destructively half-removed). The tree still existed, still held a pool slot, and read
 * as an ordinary very-dirty worktree to every future scan.
 *
 * The fix: on a lock-contention-signature failure from the primary removal, REFUSE the second
 * destructive attempt (mocked here) and mark the result `partial: true` so the caller routes it
 * to a recovery disposition instead of a routine retry.
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../../lib/worktree-manager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    removeWorktreeViaGit: vi.fn(),
    safeRecursiveRm: vi.fn(),
  };
});

const { removeWorktreeViaGit, safeRecursiveRm } = await import('../../../lib/worktree-manager.js');
const { removeWorktree, isLockContentionError, preserveUntrackedFiles } = await import('../../../scripts/worktree-reaper.mjs');

describe('QF-20260831-715: isLockContentionError (pure matrix)', () => {
  it('recognizes EPERM, EBUSY, "resource busy", and "being used by another process"', () => {
    expect(isLockContentionError('EPERM: operation not permitted')).toBe(true);
    expect(isLockContentionError('EBUSY: resource busy or locked')).toBe(true);
    expect(isLockContentionError('resource busy')).toBe(true);
    expect(isLockContentionError('The process cannot access the file because it is being used by another process')).toBe(true);
  });

  it('does NOT flag ordinary failures (not-found, permission-denied-at-start, garbage)', () => {
    expect(isLockContentionError('fatal: not a working tree')).toBe(false);
    expect(isLockContentionError('ENOENT: no such file or directory')).toBe(false);
    expect(isLockContentionError(null)).toBe(false);
    expect(isLockContentionError(undefined)).toBe(false);
  });
});

describe('QF-20260831-715: removeWorktree refuses a second destructive attempt on lock contention', () => {
  it('EPERM from the primary removal: safeRecursiveRm is NEVER called, result is partial:true', () => {
    removeWorktreeViaGit.mockReturnValue({ ok: false, error: 'EPERM: operation not permitted, unlink \'...\'' });

    const res = removeWorktree({ wtPath: '/fake/wt', repoRoot: '/fake/repo' });

    expect(safeRecursiveRm).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.partial).toBe(true);
    expect(res.method).toBe('refused-second-attempt');
  });

  it('a NON-lock-contention primary failure still falls back to the raw recursive rm (existing behavior preserved)', () => {
    removeWorktreeViaGit.mockReturnValue({ ok: false, error: 'fatal: working tree already registered' });
    safeRecursiveRm.mockImplementation(() => {}); // succeeds

    const res = removeWorktree({ wtPath: '/fake/wt-does-not-exist', repoRoot: '/fake/repo' });

    // fs.existsSync('/fake/wt-does-not-exist') is false, so safeRecursiveRm is skipped by the
    // existing existsSync guard -- but the point under test is that the LOCK-CONTENTION refusal
    // did NOT short-circuit before reaching that (pre-existing) branch.
    expect(res.method).not.toBe('refused-second-attempt');
  });

  it('a lock-contention failure from the FALLBACK safeRecursiveRm is also tagged partial:true', () => {
    // Must actually exist so removeWorktree's `if (fs.existsSync(abs))` guard invokes the
    // (mocked) safeRecursiveRm at all.
    const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-lockcontention-'));
    try {
      removeWorktreeViaGit.mockReturnValue({ ok: false, error: 'fatal: working tree already registered' });
      safeRecursiveRm.mockImplementation(() => { throw new Error('EBUSY: resource busy or locked'); });

      const res = removeWorktree({ wtPath: realDir, repoRoot: '/fake/repo' });

      expect(res.ok).toBe(false);
      expect(res.partial).toBe(true);
    } finally {
      try { fs.rmSync(realDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});

// Duplicated (not moved) from tests/integration/worktree-reaper.test.js: that file is routed to
// the DB-tier-gated `db` vitest project purely by directory (SD-LEO-INFRA-VITEST-TIER-REAL-001),
// so it self-skips on an undesignated target and this fs-only assertion would otherwise have no
// locally-runnable coverage.
describe('QF-20260831-715: preserveUntrackedFiles reports exempt-regex exclusions loudly', () => {
  it('logs every exclusion with the file name and reason, not just failures', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-loud-exclude-'));
    try {
      const wtDir = path.join(tmpDir, '.worktrees', 'SD-TEST');
      fs.mkdirSync(path.join(wtDir, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(wtDir, '.claude', 'wake-arm-abc.json'), '{}');
      const logs = [];

      const res = preserveUntrackedFiles({
        wtPath: wtDir,
        preserveRoot: path.join(tmpDir, 'scratch'),
        untracked: ['.claude/wake-arm-abc.json'],
        repoRoot: tmpDir,
        logger: (m) => logs.push(m),
      });

      expect(res.skipped).toContain('.claude/wake-arm-abc.json');
      expect(logs.some((m) => m.includes('.claude/wake-arm-abc.json') && m.includes('exclude'))).toBe(true);
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
