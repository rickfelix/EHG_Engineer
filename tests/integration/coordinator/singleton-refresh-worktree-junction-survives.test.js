/**
 * SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-C
 * TS-4: retireOldSession's worktree cleanup goes through the EXISTING guarded
 * removal path (lib/worktree-manager.js removeWorktreeViaGit -> preUnlinkWorktreeNodeModules),
 * so a node_modules junction inside the retired worktree does not let removal
 * follow the link and wipe the shared store it points at. Mirrors the fixture
 * pattern in tests/integration/worktree-remove-junction-survives.test.js, but
 * exercises retireOldSession end-to-end against a REAL git-registered worktree
 * (removeWorktreeViaGit shells `git worktree remove --force`, which requires one).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { retireOldSession } from '../../../lib/coordinator/singleton-refresh-sequencer.cjs';

let repoRoot, store, sentinel, wtPath;

function sh(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'pipe' });
}

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'singleton-refresh-repo-'));
  sh('git init -q', repoRoot);
  sh('git config user.email test@example.com', repoRoot);
  sh('git config user.name test', repoRoot);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'x');
  // node_modules must be gitignored (as it is in every real checkout of this repo) so the
  // worktree's node_modules junction is NOT reported as an untracked/dirty-tree change --
  // isReapable's guard would otherwise (correctly) refuse to remove a dirty worktree.
  fs.writeFileSync(path.join(repoRoot, '.gitignore'), 'node_modules/\n');
  sh('git add -A', repoRoot);
  sh('git commit -q -m init', repoRoot);

  store = path.join(repoRoot, '..', `${path.basename(repoRoot)}-store`);
  fs.mkdirSync(store, { recursive: true });
  sentinel = path.join(store, 'SENTINEL.txt');
  fs.writeFileSync(sentinel, 'do-not-delete');

  wtPath = path.join(repoRoot, '..', `${path.basename(repoRoot)}-wt`);
  sh(`git worktree add -q -b singleton-refresh-test-branch "${wtPath}"`, repoRoot);

  // Simulate a shared node_modules store: node_modules INSIDE the worktree is a
  // junction/symlink pointing at the sentinel store, as it would be for a worker
  // worktree sharing the main tree's install.
  fs.symlinkSync(store, path.join(wtPath, 'node_modules'), 'junction');
});

afterEach(() => {
  for (const p of [repoRoot, store, wtPath]) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function makeNoopSupabase() {
  return {
    from() {
      return { update: () => ({ eq: async () => ({ error: null }) }) };
    },
  };
}

describe('retireOldSession — worktree removal survives a node_modules junction (TS-4)', () => {
  it('removes the worktree but the shared store the junction pointed at is untouched', async () => {
    expect(fs.existsSync(sentinel)).toBe(true);

    const result = await retireOldSession(makeNoopSupabase(), {
      oldSessionId: 'old-session-under-test',
      oldWorktreePath: wtPath,
      repoRoot,
    });

    expect(result.worktreeResult).toBeTruthy();
    expect(result.worktreeResult.ok).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(false);   // worktree itself is gone
    expect(fs.existsSync(sentinel)).toBe(true);  // shared store SURVIVES
    expect(fs.existsSync(store)).toBe(true);
  });

  it('session-only retirement (no worktree path) still marks the session released without touching the filesystem', async () => {
    const result = await retireOldSession(makeNoopSupabase(), {
      oldSessionId: 'old-session-no-worktree',
      oldWorktreePath: null,
      repoRoot,
    });
    expect(result.worktreeResult).toBeNull();
    expect(result.sessionUpdateError).toBeNull();
  });
});
