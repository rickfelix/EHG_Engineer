import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { existsSync } from 'fs';
import { getRepoPaths, resolveRepoPath, resolveGitHubRepo, isVentureRepo, clearCache, getRepoRoot, isInsideWorktree, stripWorktreeSuffix, ENGINEER_ROOT } from '../../lib/repo-paths.js';

describe('lib/repo-paths', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('getRepoPaths()', () => {
    it('returns a map with at least EHG_Engineer and ehg', () => {
      const repos = getRepoPaths();
      expect(repos).toHaveProperty('EHG_Engineer');
      expect(repos).toHaveProperty('ehg');
      expect(typeof repos.EHG_Engineer).toBe('string');
      expect(typeof repos.ehg).toBe('string');
    });

    it('returns absolute paths', () => {
      const repos = getRepoPaths();
      for (const repoPath of Object.values(repos)) {
        expect(path.isAbsolute(repoPath)).toBe(true);
      }
    });

    it('includes active ventures from registry', () => {
      const repos = getRepoPaths();
      // registry.json has commitcraft-ai as APP005
      expect(repos).toHaveProperty('commitcraft-ai');
    });

    it('always includes EHG_Engineer', () => {
      const repos = getRepoPaths();
      expect(repos.EHG_Engineer).toBe(ENGINEER_ROOT);
    });

    it('returns consistent results on repeated calls (cached)', () => {
      const first = getRepoPaths();
      const second = getRepoPaths();
      expect(first).toEqual(second);
    });
  });

  describe('resolveRepoPath()', () => {
    it('resolves EHG_Engineer to ENGINEER_ROOT', () => {
      expect(resolveRepoPath('EHG_Engineer')).toBe(ENGINEER_ROOT);
    });

    it('resolves ehg to sibling directory', () => {
      const result = resolveRepoPath('ehg');
      expect(result).toBeTruthy();
      expect(path.isAbsolute(result)).toBe(true);
      expect(result).toContain('ehg');
    });

    it('resolves venture repos', () => {
      const result = resolveRepoPath('commitcraft-ai');
      expect(result).toBeTruthy();
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('returns null for unknown apps', () => {
      expect(resolveRepoPath('nonexistent-app')).toBeNull();
    });

    it('defaults to ENGINEER_ROOT for null/undefined', () => {
      expect(resolveRepoPath(null)).toBe(ENGINEER_ROOT);
      expect(resolveRepoPath(undefined)).toBe(ENGINEER_ROOT);
    });

    it('is case-insensitive', () => {
      const lower = resolveRepoPath('ehg');
      const upper = resolveRepoPath('EHG');
      expect(lower).toBe(upper);
    });
  });

  describe('resolveGitHubRepo()', () => {
    it('resolves ehg to rickfelix/ehg', () => {
      expect(resolveGitHubRepo('ehg')).toBe('rickfelix/ehg');
    });

    it('strips .git suffix', () => {
      // registry has 'rickfelix/ehg.git'
      const result = resolveGitHubRepo('ehg');
      expect(result).not.toContain('.git');
    });

    it('resolves venture repos', () => {
      expect(resolveGitHubRepo('commitcraft-ai')).toBe('rickfelix/commitcraft-ai');
    });

    it('returns null for unknown apps', () => {
      expect(resolveGitHubRepo('nonexistent-app')).toBeNull();
    });

    it('defaults to EHG_Engineer for null input', () => {
      expect(resolveGitHubRepo(null)).toBe('rickfelix/EHG_Engineer');
    });

    // SD-LEO-INFRA-CANONICAL-REPO-APP-001 (FR-2): EHG_Engineer is never itself a
    // registry.json entry (it's "this repo"), so resolveGitHubRepo needs an explicit
    // self-reference branch — without it, an EXPLICIT target_application='EHG_Engineer'
    // (630/632 of all quick_fixes rows) falsely resolved to null instead of its own repo.
    it('resolves an explicit EHG_Engineer string to its own repo (not null)', () => {
      expect(resolveGitHubRepo('EHG_Engineer')).toBe('rickfelix/EHG_Engineer');
    });

    it('resolves EHG_Engineer case/separator-insensitively', () => {
      expect(resolveGitHubRepo('ehg_engineer')).toBe('rickfelix/EHG_Engineer');
      expect(resolveGitHubRepo('EHGEngineer')).toBe('rickfelix/EHG_Engineer');
    });
  });

  describe('isVentureRepo()', () => {
    it('returns false for platform repos', () => {
      expect(isVentureRepo('ehg')).toBe(false);
      expect(isVentureRepo('EHG_Engineer')).toBe(false);
      expect(isVentureRepo('EHG')).toBe(false);
    });

    it('returns true for venture repos', () => {
      expect(isVentureRepo('commitcraft-ai')).toBe(true);
      expect(isVentureRepo('test-venture')).toBe(true);
    });

    it('returns false for null/empty', () => {
      expect(isVentureRepo(null)).toBe(false);
      expect(isVentureRepo('')).toBe(false);
    });
  });

  describe('fallback behavior', () => {
    it('FALLBACK_REPOS has ehg and EHG_Engineer', async () => {
      const mod = await import('../../lib/repo-paths.js');
      expect(mod.default.FALLBACK_REPOS).toHaveProperty('EHG_Engineer');
      expect(mod.default.FALLBACK_REPOS).toHaveProperty('ehg');
    });
  });

  // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5)
  //
  // CORRECTED by SD-LEO-INFRA-REPO-HYGIENE-PATH-001 (RCA finding, 2026-08-24): the original
  // assertions here pinned getRepoRoot() === ENGINEER_ROOT unconditionally, which is only true
  // when the test process itself is NOT running from inside a .worktrees/<SD>/ checkout. Nearly
  // all real EXEC-phase work runs from exactly such a worktree, so these assertions were false
  // most of the time this suite actually ran -- the file was quarantined as "assertion-drift" on
  // 2026-06-11 rather than recognized as a genuine defect (a real, worktree-resolution bug in
  // resolveLocalPath() went undetected as a direct result -- see lib/repo-paths.js's own doc
  // comment on resolveLocalPath for the full incident). The correct, environment-INDEPENDENT
  // invariant is that getRepoRoot() always equals stripWorktreeSuffix(ENGINEER_ROOT) -- true from
  // main (a no-op) AND from any worktree (strips the suffix) -- and never itself contains a
  // '/.worktrees/' segment.
  describe('getRepoRoot()', () => {
    it('equals stripWorktreeSuffix(ENGINEER_ROOT) -- true from main AND from a worktree', () => {
      expect(getRepoRoot()).toBe(stripWorktreeSuffix(ENGINEER_ROOT));
    });

    it('never itself contains a /.worktrees/ segment, regardless of where the test runs', () => {
      expect(getRepoRoot().replace(/\\/g, '/')).not.toContain('/.worktrees/');
    });

    it('is invariant regardless of options', () => {
      expect(getRepoRoot({})).toBe(getRepoRoot());
      expect(getRepoRoot({ cwd: '/totally/elsewhere' })).toBe(getRepoRoot());
    });

    it('returns an absolute path', () => {
      expect(path.isAbsolute(getRepoRoot())).toBe(true);
    });

    it('is exported from the default module export', async () => {
      const mod = await import('../../lib/repo-paths.js');
      expect(typeof mod.default.getRepoRoot).toBe('function');
      expect(mod.default.getRepoRoot()).toBe(getRepoRoot());
    });
  });

  // SD-LEO-INFRA-REPO-HYGIENE-PATH-001 (RCA preventive control P2): pure-function coverage for
  // resolveLocalPath's `base` parameter, proving the wrong-base and right-base arithmetic
  // directly rather than only through the module's own default expression (which a test using
  // only the default can never observe changing).
  describe('resolveLocalPath() base parameter', () => {
    it('an already-absolute value is returned unchanged regardless of base', async () => {
      const { resolveLocalPath } = await import('../../lib/repo-paths.js');
      expect(resolveLocalPath('C:/abs/path', '/some/base')).toBe(path.resolve('C:/abs/path'));
    });

    it('a relative value resolves against the explicit base parameter, not ENGINEER_ROOT', async () => {
      const { resolveLocalPath } = await import('../../lib/repo-paths.js');
      const worktreeShaped = path.resolve(ENGINEER_ROOT, '.worktrees', 'FAKE-SD-FOR-TEST');
      const mainShaped = path.resolve(ENGINEER_ROOT, '..', 'main-shaped-root');
      // Same relative input, two different explicit bases -- proves resolution genuinely
      // depends on the passed base, not a closed-over module constant.
      expect(resolveLocalPath('../ehg', worktreeShaped)).toBe(path.resolve(worktreeShaped, '../ehg'));
      expect(resolveLocalPath('../ehg', mainShaped)).toBe(path.resolve(mainShaped, '../ehg'));
      expect(resolveLocalPath('../ehg', worktreeShaped)).not.toBe(resolveLocalPath('../ehg', mainShaped));
    });

    it('demonstrates the wrong-base vs right-base arithmetic that caused the regression', () => {
      // Simulates the exact bug class without needing a real worktree directory: resolving a
      // relative registry value against a worktree-shaped path (wrong) vs. its
      // stripWorktreeSuffix()'d equivalent (right) must differ, proving the base choice is
      // load-bearing, not cosmetic.
      const worktreeShaped = path.resolve(ENGINEER_ROOT, '.worktrees', 'FAKE-SD-FOR-TEST');
      const wrongBase = path.resolve(worktreeShaped, '../ehg');
      const rightBase = path.resolve(stripWorktreeSuffix(worktreeShaped), '../ehg');
      expect(wrongBase).not.toBe(rightBase);
      expect(rightBase.replace(/\\/g, '/')).not.toContain('/.worktrees/');
    });

    // TESTING sub-agent finding (mutation testing, 2026-08-24): every test above passes an
    // EXPLICIT base parameter, so none of them ever evaluate the default expression
    // `base = getRepoRoot()` -- reverting the default back to ENGINEER_ROOT (the original bug)
    // survived all of them. This test calls resolveLocalPath with NO base argument at all, so it
    // is the one assertion that actually exercises the default and would fail if it regressed.
    it('LOAD-BEARING: with NO base argument, the default (getRepoRoot(), not ENGINEER_ROOT) is used', async () => {
      const { resolveLocalPath } = await import('../../lib/repo-paths.js');
      const resolved = resolveLocalPath('../ehg'); // no second argument -- exercises the default
      expect(resolved).toBe(path.resolve(getRepoRoot(), '..', 'ehg'));
      expect(resolved.replace(/\\/g, '/')).not.toContain('/.worktrees/');
    });

    // Same load-bearing requirement, exercised through the real public API rather than the
    // internal helper: resolveRepoPath('ehg') is what every consumer actually calls, and its
    // result must both avoid /.worktrees/ AND point at a directory that genuinely exists --
    // stronger than a string-shape assertion alone.
    it('LOAD-BEARING: resolveRepoPath(\'ehg\') from THIS actual runtime location resolves to a real, existing directory', async () => {
      const { resolveRepoPath } = await import('../../lib/repo-paths.js');
      const resolved = resolveRepoPath('ehg');
      expect(resolved).toBeTruthy();
      expect(resolved.replace(/\\/g, '/')).not.toContain('/.worktrees/');
      expect(existsSync(resolved)).toBe(true);
    });
  });

  // SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5 enhancement B)
  describe('isInsideWorktree()', () => {
    it('returns inside=false for the main repo root', () => {
      const result = isInsideWorktree(ENGINEER_ROOT);
      expect(result.inside).toBe(false);
      expect(result.repoRoot).toBe(ENGINEER_ROOT);
      expect(result.worktreesDir).toBe(path.resolve(ENGINEER_ROOT, '.worktrees'));
    });

    it('returns inside=true for the worktrees directory itself', () => {
      const worktreesDir = path.resolve(ENGINEER_ROOT, '.worktrees');
      expect(isInsideWorktree(worktreesDir).inside).toBe(true);
    });

    it('returns inside=true for a specific worktree subdirectory', () => {
      const nested = path.resolve(ENGINEER_ROOT, '.worktrees', 'SD-EXAMPLE-001');
      expect(isInsideWorktree(nested).inside).toBe(true);
    });

    it('returns inside=true for a deep worktree subdirectory', () => {
      const deep = path.resolve(ENGINEER_ROOT, '.worktrees', 'SD-EXAMPLE-001', 'lib', 'deep');
      expect(isInsideWorktree(deep).inside).toBe(true);
    });

    it('returns inside=false for a sibling directory that starts with the worktrees name', () => {
      // Defend against naive startsWith: ENGINEER_ROOT/.worktrees-backup should NOT match
      const sibling = path.resolve(ENGINEER_ROOT, '.worktrees-backup');
      expect(isInsideWorktree(sibling).inside).toBe(false);
    });

    it('returns inside=false for an unrelated path', () => {
      expect(isInsideWorktree('/tmp').inside).toBe(false);
      expect(isInsideWorktree(path.resolve(ENGINEER_ROOT, '..', 'ehg')).inside).toBe(false);
    });

    it('defaults cwd to process.cwd()', () => {
      // Just assert it runs without throwing and returns a well-formed object
      const result = isInsideWorktree();
      expect(result).toHaveProperty('inside');
      expect(typeof result.inside).toBe('boolean');
      expect(result).toHaveProperty('repoRoot', ENGINEER_ROOT);
    });

    it('is exported from the default module export', async () => {
      const mod = await import('../../lib/repo-paths.js');
      expect(typeof mod.default.isInsideWorktree).toBe('function');
    });
  });
});
