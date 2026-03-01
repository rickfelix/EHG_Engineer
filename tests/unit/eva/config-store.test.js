import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadConfig,
  saveConfig,
  getStageDependencies,
  getQualityThresholds,
  clearConfigCache,
  getDefaults,
} from '../../../lib/eva/config-store.js';

function mockSupabase(overrides = {}) {
  const selectResult = overrides.selectData
    ? { data: overrides.selectData, error: null }
    : overrides.selectError
      ? { data: null, error: { message: overrides.selectError } }
      : { data: null, error: { message: 'not found' } };

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(() => chain),
    then: (resolve) => resolve(selectResult),
  };

  const upsertResult = overrides.upsertError
    ? { error: { message: overrides.upsertError } }
    : { error: null };

  return {
    from: vi.fn(() => ({
      ...chain,
      upsert: vi.fn(() => Promise.resolve(upsertResult)),
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('config-store', () => {
  beforeEach(() => {
    clearConfigCache();
  });

  describe('loadConfig', () => {
    it('returns fallback when no supabase', async () => {
      const result = await loadConfig(null, 'test_key', 'default_val', { logger: silentLogger });
      expect(result.value).toBe('default_val');
      expect(result.source).toBe('fallback');
    });

    it('returns error when no configKey', async () => {
      const result = await loadConfig(null, null, null);
      expect(result.error).toBe('Missing configKey');
    });

    it('loads from database when available', async () => {
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify({ key: 'value' }) },
      });

      const result = await loadConfig(supabase, 'my_config', null, { logger: silentLogger });
      expect(result.value).toEqual({ key: 'value' });
      expect(result.source).toBe('database');
    });

    it('caches loaded values', async () => {
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify('cached_val') },
      });

      // First call — from database
      await loadConfig(supabase, 'cache_key', null, { logger: silentLogger });

      // Second call — from cache
      const result = await loadConfig(supabase, 'cache_key', null, { logger: silentLogger });
      expect(result.value).toBe('cached_val');
      expect(result.source).toBe('cache');
    });

    it('expires cache after TTL', async () => {
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify('fresh_val') },
      });

      // Load with very short TTL
      await loadConfig(supabase, 'ttl_key', null, { logger: silentLogger, cacheTtlMs: 1 });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should re-fetch from database (cache expired)
      const result = await loadConfig(supabase, 'ttl_key', null, { logger: silentLogger, cacheTtlMs: 1 });
      expect(result.source).toBe('database');
    });

    it('falls back to default when database query fails', async () => {
      const supabase = mockSupabase({ selectError: 'Connection failed' });

      const result = await loadConfig(supabase, 'fail_key', 'fallback_val', { logger: silentLogger });
      expect(result.value).toBe('fallback_val');
      expect(result.source).toBe('fallback');
    });

    it('returns null when no database and no fallback', async () => {
      const supabase = mockSupabase();

      const result = await loadConfig(supabase, 'missing_key', null, { logger: silentLogger });
      expect(result.value).toBeNull();
      expect(result.source).toBe('fallback');
    });
  });

  describe('saveConfig', () => {
    it('saves config to database', async () => {
      const supabase = mockSupabase();
      const result = await saveConfig(supabase, 'save_key', { data: true }, { logger: silentLogger });
      expect(result.saved).toBe(true);
    });

    it('returns error when no supabase', async () => {
      const result = await saveConfig(null, 'key', 'val');
      expect(result.saved).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles save failure', async () => {
      const supabase = mockSupabase({ upsertError: 'Write failed' });
      const result = await saveConfig(supabase, 'fail_save', 'val', { logger: silentLogger });
      expect(result.saved).toBe(false);
      expect(result.error).toBe('Write failed');
    });

    it('updates cache after saving', async () => {
      const supabase = mockSupabase();
      await saveConfig(supabase, 'cached_save', { saved: true }, { logger: silentLogger });

      // Load from cache
      const result = await loadConfig(supabase, 'cached_save', null, { logger: silentLogger });
      expect(result.value).toEqual({ saved: true });
      expect(result.source).toBe('cache');
    });
  });

  describe('getStageDependencies', () => {
    it('returns fallback dependencies when no database', async () => {
      const result = await getStageDependencies(null, { logger: silentLogger });
      expect(result.dependencies).toBeDefined();
      expect(result.dependencies[3]).toEqual([1, 2]);
      expect(result.source).toBe('fallback');
    });

    it('returns database dependencies when available', async () => {
      const dbDeps = { 3: [1, 2], 5: [3] };
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify(dbDeps) },
      });

      const result = await getStageDependencies(supabase, { logger: silentLogger });
      expect(result.dependencies).toEqual(dbDeps);
      expect(result.source).toBe('database');
    });
  });

  describe('getQualityThresholds', () => {
    it('returns all thresholds when no sdType specified', async () => {
      const result = await getQualityThresholds(null, undefined, { logger: silentLogger });
      expect(result.thresholds).toBeDefined();
      expect(result.thresholds.feature).toBeDefined();
      expect(result.thresholds.infrastructure).toBeDefined();
    });

    it('returns specific thresholds for an sdType', async () => {
      const result = await getQualityThresholds(null, 'feature', { logger: silentLogger });
      expect(result.thresholds).toEqual({ gate_pass_rate: 85, min_test_coverage: 80 });
    });

    it('returns all thresholds for unknown sdType', async () => {
      const result = await getQualityThresholds(null, 'unknown_type', { logger: silentLogger });
      // Should return all thresholds since unknown_type doesn't exist
      expect(result.thresholds.feature).toBeDefined();
    });
  });

  describe('getDefaults', () => {
    it('returns hardcoded fallback defaults', () => {
      const defaults = getDefaults();
      expect(defaults.stageDependencies).toBeDefined();
      expect(defaults.qualityThresholds).toBeDefined();
      expect(defaults.qualityThresholds.feature.gate_pass_rate).toBe(85);
    });
  });

  describe('clearConfigCache', () => {
    it('clears all cached configs', async () => {
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify('val') },
      });

      // Load to populate cache
      await loadConfig(supabase, 'clear_key', null, { logger: silentLogger });

      clearConfigCache();

      // After clear, should not find in cache — will hit DB again
      const result = await loadConfig(supabase, 'clear_key', null, { logger: silentLogger });
      expect(result.source).toBe('database'); // Not 'cache'
    });
  });
});
