/**
 * Unit tests for lib/multi-repo/index.js worktree-awareness fixes
 * (SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 FR-2/FR-3/TR-1/TR-2).
 *
 * TS-3: EHG_BASE_DIR resolves to the identical sibling-repos parent directory
 * whether the module loads from the main repo or from a `.worktrees/<sd>`
 * checkout. import.meta.url itself cannot be mocked, so `url`'s
 * fileURLToPath is stubbed instead -- repo-paths.js's own __filename/__dirname
 * derivation is what's under test, not the loader mechanics.
 *
 * TS-4: discoverRepos() must distinguish a linked worktree's `.git` FILE
 * (a `gitdir:` pointer) from a real repo's `.git` DIRECTORY, using a real
 * mkdtempSync fixture rather than fs mocking (only child_process needs
 * mocking here, per direct measurement -- discoverRepos() shells out to
 * `git remote get-url origin` per candidate directory).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

vi.mock('child_process', () => ({
  execSync: vi.fn(() => { throw new Error('no remote configured (test stub)'); }),
}));

afterEach(() => {
  vi.doUnmock('url');
  vi.doUnmock('../../lib/repo-paths.js');
  vi.resetModules();
});

describe('lib/multi-repo EHG_BASE_DIR — worktree parity (SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 TS-3)', () => {
  it('resolves the identical sibling-repos parent dir from the main repo and from a .worktrees/<sd> checkout', async () => {
    async function importAsIfLoadedFrom(fakeRepoPathsFileUrl) {
      vi.resetModules();
      vi.doMock('url', async (importOriginal) => {
        const actual = await importOriginal();
        return { ...actual, fileURLToPath: () => fakeRepoPathsFileUrl };
      });
      const [multiRepo, repoPaths] = await Promise.all([
        import('../../lib/multi-repo/index.js'),
        import('../../lib/repo-paths.js'),
      ]);
      return { multiRepo, repoPaths };
    }

    const main = await importAsIfLoadedFrom('/fake/EHG_Engineer/lib/repo-paths.js');
    const worktree = await importAsIfLoadedFrom('/fake/EHG_Engineer/.worktrees/SD-TEST-001/lib/repo-paths.js');

    // Pre-fix (`resolve(__dirname, '../../..')` off a worktree-relative
    // __dirname), these would NOT match -- the worktree run would land a
    // directory too high, inside .worktrees itself.
    expect(worktree.multiRepo.EHG_BASE_DIR).toBe(main.multiRepo.EHG_BASE_DIR);
    expect(main.multiRepo.EHG_BASE_DIR).not.toMatch(/\.worktrees/);

    // US-002 AC2: explicit invariant, not just parity between the two runs.
    expect(main.multiRepo.EHG_BASE_DIR).toBe(dirname(main.repoPaths.getRepoRoot()));
    expect(worktree.multiRepo.EHG_BASE_DIR).toBe(dirname(worktree.repoPaths.getRepoRoot()));
  });
});

describe('lib/multi-repo discoverRepos — linked-worktree exclusion (SD-LEO-INFRA-SHIP-PREFLIGHT-REPORTS-001 TS-4)', () => {
  it('includes a real repo (.git dir), excludes a linked worktree (.git file) and a non-repo dir', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'multi-repo-discover-'));
    try {
      // realrepo: .git is a DIRECTORY (a real repo root).
      mkdirSync(join(fixtureRoot, 'realrepo', '.git'), { recursive: true });

      // wtlike: .git is a FILE containing a gitdir: pointer (a linked worktree).
      const wtlikeDir = join(fixtureRoot, 'wtlike');
      mkdirSync(wtlikeDir, { recursive: true });
      writeFileSync(join(wtlikeDir, '.git'), 'gitdir: /fake/main-repo/.git/worktrees/wtlike\n');

      // notarepo: no .git at all.
      mkdirSync(join(fixtureRoot, 'notarepo'), { recursive: true });

      vi.resetModules();
      vi.doMock('../../lib/repo-paths.js', () => ({
        // EHG_BASE_DIR = resolve(getRepoRoot(), '..'), so a fake one-level
        // child of fixtureRoot makes EHG_BASE_DIR resolve to fixtureRoot.
        getRepoRoot: () => join(fixtureRoot, 'EHG_Engineer'),
      }));

      const { discoverRepos } = await import('../../lib/multi-repo/index.js');
      const repos = discoverRepos();

      // Measured against unfixed code: this would be ['realrepo', 'wtlike'].
      expect(Object.keys(repos).sort()).toEqual(['realrepo']);

      // US-003 AC3: the SD's headline symptom was non-determinism across
      // repeat scans of unchanged on-disk state -- pin that two consecutive
      // calls agree, not just that one call happens to be correct.
      const reposAgain = discoverRepos();
      expect(Object.keys(reposAgain).sort()).toEqual(Object.keys(repos).sort());
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
