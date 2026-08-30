/**
 * QF-20260830-380: post-provision worktree index integrity check — the mass-deletion anomaly
 * detector matching the Hotel-2 (b94295c8) specimen (every tracked file staged-deleted after a
 * git command timed out mid-write right after worktree provisioning).
 */
import { describe, it, expect } from 'vitest';
import {
  assessIndexIntegrity,
  renderIndexCorruptMessage,
  checkWorktreeIndexIntegrity,
} from '../../lib/worktree/post-provision-integrity-check.mjs';

function deletedLines(n) {
  return Array.from({ length: n }, (_, i) => `D  file-${i}.txt`);
}

describe('assessIndexIntegrity', () => {
  it('flags the mass-deletion anomaly: every tracked entry staged-deleted, over threshold', () => {
    const r = assessIndexIntegrity(deletedLines(50), { threshold: 20 });
    expect(r.corrupt).toBe(true);
    expect(r.deletedCount).toBe(50);
    expect(r.totalLines).toBe(50);
    expect(r.reason).toMatch(/mass-deletion anomaly/);
  });

  it('[TWO-SIDED] does NOT flag an ordinary in-progress diff (mixed statuses, below threshold)', () => {
    const lines = ['M  a.txt', 'A  b.txt', '?? c.txt', 'D  d.txt'];
    const r = assessIndexIntegrity(lines, { threshold: 20 });
    expect(r.corrupt).toBe(false);
    expect(r.reason).toBeNull();
  });

  it('does NOT flag a small, all-deleted set below the threshold (e.g. an intentional cleanup commit)', () => {
    const r = assessIndexIntegrity(deletedLines(5), { threshold: 20 });
    expect(r.corrupt).toBe(false);
  });

  it('empty porcelain output → not corrupt', () => {
    const r = assessIndexIntegrity([], { threshold: 20 });
    expect(r.corrupt).toBe(false);
    expect(r.totalLines).toBe(0);
  });
});

describe('renderIndexCorruptMessage', () => {
  it('names the bracket token and the guarded recovery command with the cwd', () => {
    const assessment = { reason: 'mass-deletion anomaly: all 50 tracked entries show staged-deleted' };
    const msg = renderIndexCorruptMessage('/repo/.worktrees/QF-X', assessment);
    expect(msg).toMatch(/^\[WORKTREE_INDEX_CORRUPT\]/);
    expect(msg).toContain('scripts/recover-worktree-index.mjs --cwd "/repo/.worktrees/QF-X"');
  });
});

describe('checkWorktreeIndexIntegrity', () => {
  it('detects corruption via an injected git runner (no real git process)', () => {
    const fakeGit = () => deletedLines(30).join('\n') + '\n';
    const r = checkWorktreeIndexIntegrity({ cwd: '/repo', git: fakeGit });
    expect(r.corrupt).toBe(true);
    expect(r.deletedCount).toBe(30);
  });

  it('FAIL-OPEN: a git error is reported as skipped, never thrown', () => {
    const throwingGit = () => { throw new Error('git status failed'); };
    expect(() => checkWorktreeIndexIntegrity({ cwd: '/repo', git: throwingGit })).not.toThrow();
    const r = checkWorktreeIndexIntegrity({ cwd: '/repo', git: throwingGit });
    expect(r.corrupt).toBe(false);
    expect(r.skipped).toBe(true);
    expect(r.error).toMatch(/git status failed/);
  });

  it('no cwd → skipped, never blocks', () => {
    const r = checkWorktreeIndexIntegrity({});
    expect(r.corrupt).toBe(false);
    expect(r.skipped).toBe(true);
  });
});
