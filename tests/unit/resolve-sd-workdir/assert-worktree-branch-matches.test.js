/**
 * Regression test for QF-20260905-634: resolve-sd-workdir.js's three worktree-attach
 * sites (createWorktree's reuse check, the DB path, the scan path) read the checked-out
 * branch but never COMPARED it to feat/<sdKey> or the slot-free reuse marker -- a reused
 * directory sitting on a foreign, already-merged branch was handed to the worker silently,
 * hiding real unmerged commits on feat/<sdKey>. assertWorktreeBranchMatches is the shared
 * predicate all three sites now call before attaching.
 *
 * Uses os.tmpdir + git init fixture repos (mirrors worktree-atomicity.test.js's pattern) --
 * no main-repo mutations. This repo's Unit Tier runs everything through vitest (no
 * node:test manifest exemption for this file), so this suite uses vitest's describe/it/
 * expect, matching the other resolve-sd-workdir sibling suites (reject-descendant-branch,
 * branch-resolution-prefix-collision, worktree-binding-fail-closed, platform-invariant).
 */
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { writeReuseMarker } from '../../../lib/fleet/worktree-reuse-marker.js';
import { assertWorktreeBranchMatches } from '../../../scripts/resolve-sd-workdir.js';

function createFixtureRepo() {
  const dir = join(tmpdir(), `wt-branch-match-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });
  writeFileSync(join(dir, 'README.md'), '# test');
  execSync('git add . && git commit -m "init"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('assertWorktreeBranchMatches (QF-20260905-634)', () => {
  it('a directory already on feat/<sdKey> attaches unchanged (no checkout, no mismatch)', async () => {
    const repo = createFixtureRepo();
    try {
      execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
      const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
      expect(result).toEqual({ ok: true, branch: 'feat/SD-TEST' });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a reused directory on a foreign merged branch, clean tree, corrects to feat/<sdKey>', async () => {
    const repo = createFixtureRepo();
    try {
      const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
      execSync(`git checkout ${initialBranch} -b docs/some-other-merged-branch`, { cwd: repo, stdio: 'pipe' });

      const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
      expect(result.ok).toBe(true);
      expect(result.branch).toBe('feat/SD-TEST');
      expect(result.corrected).toBe(true);

      const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      expect(nowOn).toBe('feat/SD-TEST');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('same foreign-branch case with a DIRTY tree refuses rather than discarding work', async () => {
    const repo = createFixtureRepo();
    try {
      const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      execSync('git checkout -b feat/SD-TEST', { cwd: repo, stdio: 'pipe' });
      execSync(`git checkout ${initialBranch} -b docs/some-other-merged-branch`, { cwd: repo, stdio: 'pipe' });
      writeFileSync(join(repo, 'uncommitted.txt'), 'wip');

      const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
      expect(result.ok).toBe(false);
      expect(result.foreign).toBe('docs/some-other-merged-branch');
      expect(result.expected).toBe('feat/SD-TEST');

      const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      expect(nowOn, 'must not have switched branches on a dirty tree').toBe('docs/some-other-merged-branch');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('foreign branch with feat/<sdKey> unavailable anywhere refuses (nothing to check out)', async () => {
    const repo = createFixtureRepo();
    try {
      execSync('git checkout -b docs/some-other-merged-branch', { cwd: repo, stdio: 'pipe' });
      const result = await assertWorktreeBranchMatches('SD-NEVER-EXISTED', repo, repo);
      expect(result.ok).toBe(false);
      expect(result.foreign).toBe('docs/some-other-merged-branch');
      expect(result.expected).toBe('feat/SD-NEVER-EXISTED');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('a marker-keyed directory (mid-flight reuse handoff) attaches unchanged, no checkout attempted', async () => {
    const repo = createFixtureRepo();
    try {
      execSync('git checkout -b docs/prior-occupant-branch', { cwd: repo, stdio: 'pipe' });
      writeReuseMarker(repo, { key: 'SD-TEST' });

      const result = await assertWorktreeBranchMatches('SD-TEST', repo, repo);
      expect(result).toEqual({ ok: true, branch: 'docs/prior-occupant-branch', markerKeyed: true });

      const nowOn = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo, encoding: 'utf8' }).trim();
      expect(nowOn, 'marker authority must not trigger a checkout').toBe('docs/prior-occupant-branch');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
