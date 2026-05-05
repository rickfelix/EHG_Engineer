/**
 * Unit tests for lib/venture-resolver.js
 * SD-LEO-REFAC-ELIMINATE-HARD-CODED-001
 * Extended by SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A (PA-3): NFKC normalization,
 * getVentureConfigAsync, collision contract, invalid-name guard.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getVenturePath,
  getVentureConfig,
  getVentureConfigAsync,
  listVentures,
  getGitHubRepo,
  getCurrentVenture,
  clearRegistryCache,
  normalizeVentureName,
  VentureRegistryCollisionError,
  VentureRegistryInvalidNameError,
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

    it.skip('auto-discovers unknown ventures as sibling directories (REMOVED by SD-LEO-INFRA-MULTI-REPO-ROUTING-001)', () => {
      // Auto-discovery fallback was removed per CRO risk assessment — unvalidated
      // filesystem guesses are unacceptable for multi-repo routing. The current
      // behavior returns null for unknown ventures. This test is preserved as
      // documentation of the removed behavior. See lib/venture-resolver.js:81-84.
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

  // ── SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A: PA-3 additions ─────────────

  describe('normalizeVentureName (NFKC + alphanumeric strip)', () => {
    it('normalizes ASCII names to lowercase alphanumeric', () => {
      expect(normalizeVentureName('CommitCraft AI')).toBe('commitcraftai');
      expect(normalizeVentureName('commitcraft-ai')).toBe('commitcraftai');
      expect(normalizeVentureName('CommitCraft_AI')).toBe('commitcraftai');
    });

    it('applies NFKC to diacritics (Café -> cafe)', () => {
      // 'Café' with combining diacritic NFD form
      const nfd = 'Café';
      expect(normalizeVentureName(nfd)).toBe('cafe');
      // 'Café' with single-char NFC form
      const nfc = 'Café';
      expect(normalizeVentureName(nfc)).toBe('cafe');
    });

    it('NFC and NFD forms produce the same normalized key', () => {
      const nfd = 'Café';
      const nfc = 'Café';
      expect(normalizeVentureName(nfd)).toBe(normalizeVentureName(nfc));
    });

    it('strips bidi-override and zero-width-joiner characters', () => {
      const bidi = 'co‮mmitcraft';
      const zwj = 'commit‍craft';
      expect(normalizeVentureName(bidi)).toBe('commitcraft');
      expect(normalizeVentureName(zwj)).toBe('commitcraft');
    });

    it('returns empty string for all-non-ASCII inputs', () => {
      expect(normalizeVentureName('😀')).toBe('');
      expect(normalizeVentureName('🚀✨')).toBe('');
    });

    it('returns empty string for non-string inputs', () => {
      expect(normalizeVentureName(null)).toBe('');
      expect(normalizeVentureName(undefined)).toBe('');
      expect(normalizeVentureName(42)).toBe('');
    });
  });

  describe('getVentureConfig (sync, with NFKC normalization)', () => {
    it('resolves CommitCraft-style name mismatch via normalization', () => {
      // registry.json has key 'commitcraft-ai'; lookup with the human form
      const config = getVentureConfig('CommitCraft AI');
      // Either resolves (if registry has commitcraft-ai entry) or returns null
      // — depends on local registry.json state. Assert that BOTH forms produce
      // the same result.
      const human = getVentureConfig('CommitCraft AI');
      const slug = getVentureConfig('commitcraft-ai');
      expect(human).toEqual(slug);
    });

    it('returns null for emoji-only input (would normalize empty)', () => {
      expect(getVentureConfig('😀')).toBeNull();
    });

    it('returns null for too-short normalized input (single letter)', () => {
      expect(getVentureConfig('a')).toBeNull();
    });
  });

  describe('getVentureConfigAsync (DB-derived view)', () => {
    function makeMockSupabase(rows = [], error = null) {
      return {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => Promise.resolve({ data: rows, error })),
          })),
        })),
      };
    }

    it('throws VentureRegistryInvalidNameError on empty normalized input', async () => {
      const supabase = makeMockSupabase();
      await expect(getVentureConfigAsync({ name: '😀', supabase }))
        .rejects.toBeInstanceOf(VentureRegistryInvalidNameError);
    });

    it('throws VentureRegistryInvalidNameError on too-short input', async () => {
      const supabase = makeMockSupabase();
      await expect(getVentureConfigAsync({ name: 'a', supabase }))
        .rejects.toMatchObject({
          name: 'VentureRegistryInvalidNameError',
          reason: 'too_short',
          attemptedName: 'a',
        });
    });

    it('throws Error when supabase client is missing', async () => {
      await expect(getVentureConfigAsync({ name: 'ehg' }))
        .rejects.toThrow(/supabase client is required/);
    });

    it('returns null for null name input', async () => {
      const supabase = makeMockSupabase();
      const result = await getVentureConfigAsync({ name: null, supabase });
      expect(result).toBeNull();
    });

    it('returns null when no rows match the normalized key', async () => {
      const supabase = makeMockSupabase([]);
      const result = await getVentureConfigAsync({ name: 'unknown-venture', supabase });
      expect(result).toBeNull();
    });

    it('returns the single row when exactly one match', async () => {
      const row = {
        id: 'venture-1',
        name: 'CommitCraft AI',
        normalized_name: 'commitcraftai',
        local_path: 'C:/path',
        repo_url: 'https://github.com/rickfelix/commitcraft-ai.git',
      };
      const supabase = makeMockSupabase([row]);
      const result = await getVentureConfigAsync({ name: 'CommitCraft AI', supabase });
      expect(result).toEqual(row);
    });

    it('throws VentureRegistryCollisionError when 2+ rows match', async () => {
      const rows = [
        { id: 'a', name: 'CommitCraft AI', normalized_name: 'commitcraftai' },
        { id: 'b', name: 'CommitCraft-AI', normalized_name: 'commitcraftai' },
      ];
      const supabase = makeMockSupabase(rows);
      try {
        await getVentureConfigAsync({ name: 'CommitCraft AI', supabase });
        throw new Error('Expected collision throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VentureRegistryCollisionError);
        expect(err.candidates).toHaveLength(2);
        expect(err.candidates[0].name).toBe('CommitCraft AI');
        expect(err.candidates[1].name).toBe('CommitCraft-AI');
        expect(err.normalizedKey).toBe('commitcraftai');
        expect(err.attemptedName).toBe('CommitCraft AI');
        expect(err.code).toBe('VENTURE_REGISTRY_COLLISION');
      }
    });

    it('propagates DB query errors as Error', async () => {
      const supabase = makeMockSupabase(null, { message: 'connection refused' });
      await expect(getVentureConfigAsync({ name: 'ehg', supabase }))
        .rejects.toThrow(/vw_venture_registry query failed/);
    });

    it('queries vw_venture_registry with the normalized key', async () => {
      const eq = vi.fn(() => Promise.resolve({ data: [], error: null }));
      const select = vi.fn(() => ({ eq }));
      const supabase = { from: vi.fn(() => ({ select })) };

      await getVentureConfigAsync({ name: 'CommitCraft AI', supabase });

      expect(supabase.from).toHaveBeenCalledWith('vw_venture_registry');
      expect(eq).toHaveBeenCalledWith('normalized_name', 'commitcraftai');
    });
  });

  describe('FR-A10 regression sentinel: no silent fallback to EHG', () => {
    // This test pairs with tests/integration/router/no-ehg-fallback.test.js.
    // The unit-level guarantee: getVentureConfig for an unregistered venture
    // returns null (not an EHG fallback). The router-level throw is sibling
    // Child B PA-1 scope.
    it('returns null (not EHG entry) for an unregistered venture name', () => {
      const result = getVentureConfig('definitely-not-registered-venture-zxyzxy');
      expect(result).toBeNull();
    });
  });
});
