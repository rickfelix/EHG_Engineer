import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

describe('worktree-manager selfHealEmptyStaleWorktreeDir (QF-20260511-699)', () => {
  let tmpRepo;
  let worktreePath;

  beforeEach(() => {
    tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-selfheal-'));
    git(tmpRepo, 'init', '-q', '-b', 'main');
    git(tmpRepo, 'config', 'user.email', 'test@example.com');
    git(tmpRepo, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(tmpRepo, 'seed.txt'), 'seed');
    git(tmpRepo, 'add', '.');
    git(tmpRepo, 'commit', '-q', '-m', 'seed');
    worktreePath = path.join(tmpRepo, '.worktrees', 'QF-TEST-EMPTY');
    fs.mkdirSync(worktreePath, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpRepo, { recursive: true, force: true }); } catch {}
  });

  it('removes empty unregistered worktree dir even when downstream fetchBaseRef fails (proves self-heal ran)', async () => {
    const mod = await import('../lib/worktree-manager.js?selfheal-empty-' + Date.now());
    expect(fs.existsSync(worktreePath)).toBe(true);
    expect(fs.readdirSync(worktreePath).length).toBe(0);

    // tmpRepo has no `origin` remote, so createWorktree will throw at fetchBaseRef.
    // The self-heal step runs BEFORE that; observable side effect: the empty dir
    // gets removed, proving the helper executed.
    try {
      mod.createWorktree({
        sdKey: 'QF-TEST-EMPTY',
        branch: 'qf/QF-TEST-EMPTY',
        repoRoot: tmpRepo,
      });
    } catch {
      // expected: WorktreeBaseFetchFailedError (no origin remote)
    }

    // Self-heal removed the empty stale dir before the existence check tripped.
    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  it('does NOT remove worktreePath when it has files (self-heal skips non-empty dirs)', async () => {
    const mod = await import('../lib/worktree-manager.js?selfheal-nonempty-' + Date.now());
    fs.writeFileSync(path.join(worktreePath, 'leftover.txt'), 'do not delete');
    try {
      mod.createWorktree({
        sdKey: 'QF-TEST-EMPTY',
        branch: 'qf/QF-TEST-EMPTY',
        repoRoot: tmpRepo,
      });
    } catch {
      // expected: getWorktreeBranch throws on non-git dir
    }
    // File survives — self-heal must skip non-empty dirs.
    expect(fs.existsSync(path.join(worktreePath, 'leftover.txt'))).toBe(true);
  });

  it('does NOT remove worktreePath when it is registered in git worktree list', async () => {
    const mod = await import('../lib/worktree-manager.js?selfheal-registered-' + Date.now());
    // Create a legitimate worktree at worktreePath.
    fs.rmdirSync(worktreePath); // remove the fixture-empty one
    git(tmpRepo, 'worktree', 'add', worktreePath, '-b', 'real-branch');
    expect(fs.existsSync(path.join(worktreePath, '.git'))).toBe(true);
    const sentinel = path.join(worktreePath, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'real worktree content');

    try {
      mod.createWorktree({
        sdKey: 'QF-TEST-EMPTY',
        branch: 'qf/QF-TEST-EMPTY',
        repoRoot: tmpRepo,
      });
    } catch {
      // expected: 'already exists' or similar
    }
    expect(fs.existsSync(sentinel)).toBe(true);
  });
});
