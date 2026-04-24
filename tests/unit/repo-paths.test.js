import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { getRepoPaths, resolveRepoPath, resolveGitHubRepo, isVentureRepo, clearCache, getRepoRoot, isInsideWorktree, ENGINEER_ROOT } from '../../lib/repo-paths.js';

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
  describe('getRepoRoot()', () => {
    it('returns ENGINEER_ROOT', () => {
      expect(getRepoRoot()).toBe(ENGINEER_ROOT);
    });

    it('is invariant regardless of options', () => {
      expect(getRepoRoot({})).toBe(ENGINEER_ROOT);
      expect(getRepoRoot({ cwd: '/totally/elsewhere' })).toBe(ENGINEER_ROOT);
    });

    it('returns an absolute path', () => {
      expect(path.isAbsolute(getRepoRoot())).toBe(true);
    });

    it('is exported from the default module export', async () => {
      const mod = await import('../../lib/repo-paths.js');
      expect(typeof mod.default.getRepoRoot).toBe('function');
      expect(mod.default.getRepoRoot()).toBe(ENGINEER_ROOT);
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
