/**
 * QF-20260830-380: guarded recovery for a post-provision worktree index corruption. Refuses
 * `git reset --hard` unless HEAD is confirmed reachable from a remote-tracking branch (mirrors
 * Hotel-2's b94295c8 manual check), and refuses to touch a FRESH index.lock (a live git op).
 */
import { describe, it, expect, vi } from 'vitest';
import { assessRecoverySafety, recoverWorktreeIndex } from '../../scripts/recover-worktree-index.mjs';

function fakeGit({ headSha = 'abc123', remoteBranches = 'origin/main\n' } = {}) {
  return vi.fn((args) => {
    if (args[0] === 'rev-parse') return headSha;
    if (args[0] === 'branch') return remoteBranches;
    if (args[0] === 'reset') return '';
    throw new Error(`unexpected git call: ${args.join(' ')}`);
  });
}

describe('assessRecoverySafety', () => {
  it('safe when HEAD is reachable from a remote-tracking branch', () => {
    const r = assessRecoverySafety('/repo', { git: fakeGit() });
    expect(r.safe).toBe(true);
    expect(r.headOnRemote).toBe(true);
    expect(r.reason).toBeNull();
  });

  it('[TWO-SIDED] unsafe when HEAD is not reachable from any remote-tracking branch', () => {
    const r = assessRecoverySafety('/repo', { git: fakeGit({ remoteBranches: '' }) });
    expect(r.safe).toBe(false);
    expect(r.reason).toMatch(/not confirmed reachable/);
  });

  it('unsafe (fail-closed) when the git call itself errors', () => {
    const throwingGit = () => { throw new Error('not a git repo'); };
    const r = assessRecoverySafety('/repo', { git: throwingGit });
    expect(r.safe).toBe(false);
  });
});

describe('recoverWorktreeIndex', () => {
  it('refuses (throws) rather than resetting when push-state is unsafe', () => {
    const git = fakeGit({ remoteBranches: '' });
    expect(() => recoverWorktreeIndex('/repo', { git })).toThrow(/RECOVERY_REFUSED/);
    expect(git).not.toHaveBeenCalledWith(['reset', '--hard', 'HEAD']);
  });

  it('refuses when the lock is fresh and non-empty (a live git op)', () => {
    const git = fakeGit();
    const lockClear = () => ({ cleared: false, reason: 'fresh_active' });
    expect(() => recoverWorktreeIndex('/repo', { git, lockClear })).toThrow(/RECOVERY_REFUSED/);
  });

  it('clears a confirmed-stale lock and resets when push-state is safe', () => {
    const git = fakeGit();
    const lockClear = vi.fn(() => ({ cleared: true, reason: 'zero_byte' }));
    const r = recoverWorktreeIndex('/repo', { git, lockClear });
    expect(r.recovered).toBe(true);
    expect(lockClear).toHaveBeenCalledWith({ repoRoot: '/repo' });
    expect(git).toHaveBeenCalledWith(['reset', '--hard', 'HEAD']);
  });

  it('--force bypasses the push-state refusal (operator override, explicit opt-in)', () => {
    const git = fakeGit({ remoteBranches: '' });
    const lockClear = () => ({ cleared: false, reason: 'absent' });
    const r = recoverWorktreeIndex('/repo', { git, lockClear, force: true });
    expect(r.recovered).toBe(true);
  });
});
