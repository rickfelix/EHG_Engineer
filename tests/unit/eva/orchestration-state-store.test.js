import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveState,
  loadState,
  clearState,
  clearCache,
  getCachedVentureIds,
  getVersion,
} from '../../../lib/eva/orchestration-state-store.js';

function mockSupabase(overrides = {}) {
  const upsertResult = overrides.upsertError
    ? { error: { message: overrides.upsertError } }
    : { error: null };
  const selectResult = overrides.selectData
    ? { data: overrides.selectData, error: null }
    : overrides.selectError
      ? { data: null, error: { message: overrides.selectError } }
      : { data: null, error: null };
  const deleteResult = { error: null };

  return {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve(upsertResult)),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve(selectResult)),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve(deleteResult)),
      })),
    })),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('orchestration-state-store', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('saveState', () => {
    it('saves state to cache and Supabase', async () => {
      const supabase = mockSupabase();
      const result = await saveState(
        supabase,
        'venture-1',
        { orchestratorState: 'PROCESSING', currentStep: 'stage-3' },
        { logger: silentLogger },
      );

      expect(result.saved).toBe(true);
      expect(result.version).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
      expect(supabase.from).toHaveBeenCalledWith('eva_config');
    });

    it('returns error when supabase is null', async () => {
      const result = await saveState(null, 'venture-1', { orchestratorState: 'IDLE' });
      expect(result.saved).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('returns error when ventureId is missing', async () => {
      const result = await saveState(mockSupabase(), '', { orchestratorState: 'IDLE' });
      expect(result.saved).toBe(false);
      expect(result.error).toContain('Missing');
    });

    it('caches state even when Supabase write fails', async () => {
      const supabase = mockSupabase({ upsertError: 'Connection timeout' });
      const result = await saveState(
        supabase,
        'venture-2',
        { orchestratorState: 'PROCESSING' },
        { logger: silentLogger },
      );

      expect(result.saved).toBe(true);
      expect(result.warning).toContain('persistence failed');
      expect(getCachedVentureIds()).toContain('venture-2');
    });

    it('increments version on each save', async () => {
      const supabase = mockSupabase();
      const r1 = await saveState(supabase, 'v1', { orchestratorState: 'IDLE' }, { logger: silentLogger });
      const r2 = await saveState(supabase, 'v1', { orchestratorState: 'PROCESSING' }, { logger: silentLogger });
      expect(r2.version).toBeGreaterThan(r1.version);
    });
  });

  describe('loadState', () => {
    it('loads from cache when available', async () => {
      const supabase = mockSupabase();
      await saveState(supabase, 'v-cached', { orchestratorState: 'BLOCKED' }, { logger: silentLogger });

      const result = await loadState(supabase, 'v-cached');
      expect(result.source).toBe('cache');
      expect(result.state.orchestratorState).toBe('BLOCKED');
    });

    it('loads from database when not in cache', async () => {
      const storedState = {
        orchestratorState: 'PROCESSING',
        ventureId: 'v-db',
        version: 1,
        savedAt: new Date().toISOString(),
      };
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify(storedState) },
      });

      const result = await loadState(supabase, 'v-db', { logger: silentLogger });
      expect(result.source).toBe('database');
      expect(result.state.orchestratorState).toBe('PROCESSING');
    });

    it('returns none for expired state', async () => {
      const staleState = {
        orchestratorState: 'IDLE',
        ventureId: 'v-stale',
        version: 1,
        savedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
      };
      const supabase = mockSupabase({
        selectData: { value: JSON.stringify(staleState) },
      });

      const result = await loadState(supabase, 'v-stale', { logger: silentLogger });
      expect(result.source).toBe('none');
      expect(result.warning).toContain('expired');
    });

    it('returns error when ventureId is missing', async () => {
      const result = await loadState(mockSupabase(), '');
      expect(result.source).toBe('none');
      expect(result.error).toContain('Missing');
    });

    it('returns none when no supabase and no cache', async () => {
      const result = await loadState(null, 'v-no-sb', { logger: silentLogger });
      expect(result.source).toBe('none');
      expect(result.error).toContain('No supabase');
    });
  });

  describe('clearState', () => {
    it('clears cache and database entry', async () => {
      const supabase = mockSupabase();
      await saveState(supabase, 'v-clear', { orchestratorState: 'IDLE' }, { logger: silentLogger });
      expect(getCachedVentureIds()).toContain('v-clear');

      const result = await clearState(supabase, 'v-clear');
      expect(result.cleared).toBe(true);
      expect(getCachedVentureIds()).not.toContain('v-clear');
    });

    it('clears cache even without supabase', async () => {
      const supabase = mockSupabase();
      await saveState(supabase, 'v-nosb', { orchestratorState: 'IDLE' }, { logger: silentLogger });

      const result = await clearState(null, 'v-nosb');
      expect(result.cleared).toBe(true);
    });
  });

  describe('utility functions', () => {
    it('clearCache resets all state', () => {
      clearCache();
      expect(getCachedVentureIds()).toHaveLength(0);
      expect(getVersion()).toBe(0);
    });
  });
});
