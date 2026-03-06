/**
 * Unit tests for lib/venture-resolver.js
 * SD-LEO-REFAC-ELIMINATE-HARD-CODED-001
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getVenturePath,
  getVentureConfig,
  listVentures,
  getGitHubRepo,
  getCurrentVenture,
  clearRegistryCache,
  ENGINEER_ROOT
} from '../../lib/venture-resolver.js';
import path from 'path';

describe('venture-resolver', () => {
  beforeEach(() => {
    clearRegistryCache();
  });

  describe('getVenturePath', () => {
    it('resolves ehg to its registry path', () => {
      const result = getVenturePath('ehg');
      expect(result).toContain('ehg');
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('resolves EHG case-insensitively', () => {
      const lower = getVenturePath('ehg');
      const upper = getVenturePath('EHG');
      // Both should resolve to same path
      expect(lower.toLowerCase()).toBe(upper.toLowerCase());
    });

    it('resolves EHG_Engineer to this repo root', () => {
      const result = getVenturePath('EHG_Engineer');
      expect(result).toContain('EHG_Engineer');
    });

    it('returns an absolute path for null/undefined input', () => {
      const nullPath = getVenturePath(null);
      const undefPath = getVenturePath(undefined);
      expect(path.isAbsolute(nullPath)).toBe(true);
      expect(path.isAbsolute(undefPath)).toBe(true);
      expect(nullPath).toContain('EHG_Engineer');
    });

    it('auto-discovers unknown ventures as sibling directories', () => {
      const result = getVenturePath('some-new-venture');
      expect(result).toContain('some-new-venture');
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('getVentureConfig', () => {
    it('returns config for known ventures', () => {
      const config = getVentureConfig('ehg');
      expect(config).not.toBeNull();
      expect(config.name).toBe('ehg');
      expect(config.github_repo).toContain('rickfelix');
    });

    it('returns null for unknown ventures', () => {
      const config = getVentureConfig('nonexistent-venture');
      expect(config).toBeNull();
    });

    it('returns null for null input', () => {
      expect(getVentureConfig(null)).toBeNull();
    });
  });

  describe('listVentures', () => {
    it('returns active ventures from registry', () => {
      const ventures = listVentures();
      expect(ventures.length).toBeGreaterThan(0);
      expect(ventures.every(v => v.status === 'active')).toBe(true);
    });

    it('includes ehg in the list', () => {
      const ventures = listVentures();
      const names = ventures.map(v => v.name);
      expect(names).toContain('ehg');
    });
  });

  describe('getGitHubRepo', () => {
    it('returns GitHub repo for known ventures', () => {
      const repo = getGitHubRepo('ehg');
      expect(repo).toBe('rickfelix/ehg');
    });

    it('strips .git suffix', () => {
      const repo = getGitHubRepo('ehg');
      expect(repo).not.toContain('.git');
    });

    it('generates fallback for unknown ventures', () => {
      const repo = getGitHubRepo('my-venture');
      expect(repo).toBe('rickfelix/my-venture');
    });
  });

  describe('getCurrentVenture', () => {
    it('returns a string', () => {
      const venture = getCurrentVenture();
      expect(typeof venture).toBe('string');
      expect(venture.length).toBeGreaterThan(0);
    });

    it('does not match ehg when running from EHG_Engineer', () => {
      // When running from EHG_Engineer worktree, should not return 'ehg'
      const venture = getCurrentVenture();
      // The test runs from EHG_Engineer context
      if (process.cwd().toLowerCase().includes('ehg_engineer')) {
        expect(venture).toBe('EHG_Engineer');
      }
    });
  });
});
