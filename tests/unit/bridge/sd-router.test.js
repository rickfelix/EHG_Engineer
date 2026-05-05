/**
 * Unit tests for lib/eva/bridge/sd-router.js
 *
 * Original behavior (silent EHG fallback) replaced by SD-LEO-INFRA-FAIL-CLOSED-
 * VENTURE-001-B PA-1 fail-closed throws + sd_type-constrained null-venture
 * branch + error taxonomy split (security C-SEC-4, C-SEC-8B).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveTargetApplication,
  resolveTargetApplicationAsync,
  LEGITIMATE_NO_VENTURE_SD_TYPES,
} from '../../../lib/eva/bridge/sd-router.js';
import {
  VentureNotRegisteredError,
  VentureRegistryUnavailableError,
} from '../../../lib/eva/bridge/venture-routing-error.js';

// Mock venture-resolver. Registry keyed by NORMALIZED name (NFKD + alnum)
// to match Child A's getVentureConfig behavior.
vi.mock('../../../lib/venture-resolver.js', () => {
  const registry = {
    // normalized keys
    ehg: { name: 'ehg', github_repo: 'rickfelix/ehg.git', local_path: 'C:/Projects/ehg', supabase_schema: null },
    testleoproject: {
      name: 'test-leo-project',
      github_repo: 'rickf-test/leo-test-repo',
      local_path: 'C:/Projects/test-leo-project',
      supabase_schema: 'venture_test_leo',
    },
  };

  function normalize(name) {
    if (!name) return '';
    return String(name).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  return {
    getVentureConfig: vi.fn((name) => {
      const k = normalize(name);
      return k ? registry[k] || null : null;
    }),
    getVentureConfigAsync: vi.fn(async () => null), // overridden per test
  };
});

const silentLogger = { log: vi.fn(), warn: vi.fn() };

describe('sd-router (PA-1 fail-closed + taxonomy split)', () => {
  describe('LEGITIMATE_NO_VENTURE_SD_TYPES (C-SEC-8B allowlist)', () => {
    it('exports the documented set of legitimate types', () => {
      expect(LEGITIMATE_NO_VENTURE_SD_TYPES.has('infrastructure')).toBe(true);
      expect(LEGITIMATE_NO_VENTURE_SD_TYPES.has('governance')).toBe(true);
      expect(LEGITIMATE_NO_VENTURE_SD_TYPES.has('leo')).toBe(true);
      expect(LEGITIMATE_NO_VENTURE_SD_TYPES.has('feature')).toBe(false);
    });
  });

  describe('resolveTargetApplication (sync) — FR-B1, FR-B2', () => {
    it('resolves known venture from registry', () => {
      const result = resolveTargetApplication('ehg', { logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(false);
    });

    it('resolves second registered venture', () => {
      const result = resolveTargetApplication('test-leo-project', { logger: silentLogger });
      expect(result.targetApp).toBe('test-leo-project');
      expect(result.supabaseSchema).toBe('venture_test_leo');
      expect(result.fallback).toBe(false);
    });

    it('FR-B1: throws VentureNotRegisteredError for unregistered venture name', () => {
      expect(() =>
        resolveTargetApplication('unknown-venture', { sd_type: 'feature', logger: silentLogger })
      ).toThrow(VentureNotRegisteredError);
    });

    it('FR-B1: thrown error has code VENTURE_NOT_REGISTERED and attemptedName', () => {
      try {
        resolveTargetApplication('unknown-venture', { sd_type: 'feature', logger: silentLogger });
        throw new Error('Expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VentureNotRegisteredError);
        expect(err.code).toBe('VENTURE_NOT_REGISTERED');
        expect(err.attemptedName).toBe('unknown-venture');
      }
    });

    it('FR-B2: returns EHG fallback for null with sd_type=infrastructure (legitimate)', () => {
      const result = resolveTargetApplication(null, { sd_type: 'infrastructure', logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('FR-B2: returns EHG fallback for null with sd_type=governance (legitimate)', () => {
      const result = resolveTargetApplication(null, { sd_type: 'governance', logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
    });

    it('FR-B2: returns EHG fallback for null with metadata.engineering_only=true', () => {
      const result = resolveTargetApplication(null, {
        sd_type: 'feature', // would normally throw
        metadata: { engineering_only: true },
        logger: silentLogger,
      });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('C-SEC-8B: throws when null venture + sd_type is not legitimate', () => {
      expect(() =>
        resolveTargetApplication(null, { sd_type: 'feature', logger: silentLogger })
      ).toThrow(VentureNotRegisteredError);
    });

    it('C-SEC-8B: throws when null venture + no sd_type provided', () => {
      expect(() => resolveTargetApplication(null, { logger: silentLogger })).toThrow(
        VentureNotRegisteredError
      );
    });

    it('C-SEC-8B: empty-string venture treated as null and validated against sd_type', () => {
      expect(() =>
        resolveTargetApplication('', { sd_type: 'feature', logger: silentLogger })
      ).toThrow(VentureNotRegisteredError);
      const result = resolveTargetApplication('', { sd_type: 'infrastructure', logger: silentLogger });
      expect(result.targetApp).toBe('ehg');
    });

    it('FR-B2: error message lists allowlisted sd_types as remediation hint', () => {
      try {
        resolveTargetApplication(null, { sd_type: 'feature', logger: silentLogger });
        throw new Error('Expected throw');
      } catch (err) {
        expect(err.resolution_hint).toMatch(/infrastructure/);
        expect(err.resolution_hint).toMatch(/governance/);
        expect(err.resolution_hint).toMatch(/engineering_only/);
      }
    });
  });

  describe('resolveTargetApplicationAsync — FR-B1, FR-B8 (taxonomy split)', () => {
    function makeMockSupabase(getResult) {
      // resolveTargetApplicationAsync calls getVentureConfigAsync from venture-resolver,
      // which we mock at module level. Override the mock per test.
      return { /* placeholder; behavior controlled via vi.mocked */ };
    }

    it('resolves known venture via async path', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');
      vi.mocked(getVentureConfigAsync).mockResolvedValueOnce({
        id: 'v-1',
        name: 'commitcraft-ai',
        repo_url: 'https://github.com/rickfelix/commitcraft-ai.git',
        local_path: 'C:/Projects/commitcraft-ai',
      });

      const result = await resolveTargetApplicationAsync({
        ventureName: 'CommitCraft AI',
        supabase: makeMockSupabase(),
        logger: silentLogger,
      });
      expect(result.targetApp).toBe('commitcraft-ai');
      expect(result.fallback).toBe(false);
    });

    it('FR-B1 async: throws VentureNotRegisteredError on registry-success-with-null-result', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');
      vi.mocked(getVentureConfigAsync).mockResolvedValueOnce(null);

      await expect(
        resolveTargetApplicationAsync({
          ventureName: 'unknown-venture',
          supabase: makeMockSupabase(),
          sd_type: 'feature',
          logger: silentLogger,
        })
      ).rejects.toBeInstanceOf(VentureNotRegisteredError);
    });

    it('FR-B8 + C-SEC-4: throws VentureRegistryUnavailableError on registry-query-error', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');
      const supabaseError = new Error('connection refused');
      vi.mocked(getVentureConfigAsync).mockRejectedValueOnce(supabaseError);

      try {
        await resolveTargetApplicationAsync({
          ventureName: 'commitcraft-ai',
          supabase: makeMockSupabase(),
          sd_type: 'feature',
          logger: silentLogger,
        });
        throw new Error('Expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(VentureRegistryUnavailableError);
        expect(err.code).toBe('VENTURE_REGISTRY_UNAVAILABLE');
        expect(err.attemptedName).toBe('commitcraft-ai');
        expect(err.underlyingError).toBe(supabaseError);
        expect(err.resolution_hint).toMatch(/retry/i);
      }
    });

    it('C-SEC-4: NotRegistered and Unavailable errors are distinguishable by code', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');

      vi.mocked(getVentureConfigAsync).mockResolvedValueOnce(null);
      const e1 = await resolveTargetApplicationAsync({
        ventureName: 'unknown',
        supabase: makeMockSupabase(),
        sd_type: 'feature',
        logger: silentLogger,
      }).catch((e) => e);

      vi.mocked(getVentureConfigAsync).mockRejectedValueOnce(new Error('outage'));
      const e2 = await resolveTargetApplicationAsync({
        ventureName: 'commitcraft-ai',
        supabase: makeMockSupabase(),
        sd_type: 'feature',
        logger: silentLogger,
      }).catch((e) => e);

      expect(e1.code).toBe('VENTURE_NOT_REGISTERED');
      expect(e2.code).toBe('VENTURE_REGISTRY_UNAVAILABLE');
      // Caller can branch: retry on UNAVAILABLE, abort on NOT_REGISTERED
    });

    it('preserves null-venture EHG fallback for legitimate sd_type', async () => {
      const result = await resolveTargetApplicationAsync({
        ventureName: null,
        supabase: makeMockSupabase(),
        sd_type: 'infrastructure',
        logger: silentLogger,
      });
      expect(result.targetApp).toBe('ehg');
      expect(result.fallback).toBe(true);
    });

    it('throws Error when supabase missing for non-null name', async () => {
      await expect(
        resolveTargetApplicationAsync({
          ventureName: 'commitcraft-ai',
          sd_type: 'feature',
          logger: silentLogger,
        })
      ).rejects.toThrow(/requires supabase/);
    });

    it('re-throws VentureRegistryCollisionError without wrapping in Unavailable', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');
      const collisionError = new Error('collision');
      collisionError.name = 'VentureRegistryCollisionError';
      vi.mocked(getVentureConfigAsync).mockRejectedValueOnce(collisionError);

      try {
        await resolveTargetApplicationAsync({
          ventureName: 'collision-name',
          supabase: makeMockSupabase(),
          sd_type: 'feature',
          logger: silentLogger,
        });
        throw new Error('Expected throw');
      } catch (err) {
        expect(err.name).toBe('VentureRegistryCollisionError');
        expect(err.name).not.toBe('VentureRegistryUnavailableError');
      }
    });

    it('re-throws VentureRegistryInvalidNameError without wrapping', async () => {
      const { getVentureConfigAsync } = await import('../../../lib/venture-resolver.js');
      const invalidNameError = new Error('invalid name');
      invalidNameError.name = 'VentureRegistryInvalidNameError';
      vi.mocked(getVentureConfigAsync).mockRejectedValueOnce(invalidNameError);

      const err = await resolveTargetApplicationAsync({
        ventureName: '😀',
        supabase: makeMockSupabase(),
        sd_type: 'feature',
        logger: silentLogger,
      }).catch((e) => e);
      expect(err.name).toBe('VentureRegistryInvalidNameError');
    });
  });
});
