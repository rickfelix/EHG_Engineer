/**
 * Tests for ChairmanPreferenceStore
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-D
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

import { ChairmanPreferenceStore, createChairmanPreferenceStore } from '../../../lib/eva/chairman-preference-store.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

function createMockSupabase(overrides = {}) {
  const mockQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => ({ ...mockQuery, ...overrides })),
    _mockQuery: mockQuery,
  };
}

describe('ChairmanPreferenceStore', () => {
  let store;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    store = new ChairmanPreferenceStore({
      supabaseClient: mockSupabase,
      logger: silentLogger,
    });
  });

  describe('constructor', () => {
    it('should create instance with custom supabase client', () => {
      expect(store).toBeInstanceOf(ChairmanPreferenceStore);
      expect(store.supabase).toBe(mockSupabase);
    });

    it('should accept logger option', () => {
      expect(store.logger).toBe(silentLogger);
    });
  });

  describe('setPreference - type validation', () => {
    it('should reject invalid valueType', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: 'x', valueType: 'invalid',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid valueType');
    });

    it('should reject value/type mismatch (string as number)', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: 'not-a-number', valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should reject null for object type', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: null, valueType: 'object',
      });
      expect(result.success).toBe(false);
    });

    it('should reject array when type is object', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: [1], valueType: 'object',
      });
      expect(result.success).toBe(false);
    });

    it('should accept object type', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'custom.obj', value: { nested: true }, valueType: 'object',
      });
      expect(result.success).toBe(true);
    });

    it('should accept array type', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'custom.arr', value: [1, 2, 3], valueType: 'array',
      });
      expect(result.success).toBe(true);
    });

    it('should accept boolean type', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'flag', value: true, valueType: 'boolean',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('setPreference - known key validators', () => {
    it('should reject risk.max_drawdown_pct > 100', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'risk.max_drawdown_pct', value: 150, valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject risk.max_drawdown_pct < 0', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'risk.max_drawdown_pct', value: -5, valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('between 0 and 100');
    });

    it('should reject negative budget', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'budget.max_monthly_usd', value: -100, valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('>= 0');
    });

    it('should accept zero budget', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'budget.max_monthly_usd', value: 0, valueType: 'number',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty tech stack directive', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'tech.stack_directive', value: '  ', valueType: 'string',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
    });

    it('should reject non-string tech stack directive', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'tech.stack_directive', value: 123, valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('must be a string');
    });
  });

  describe('setPreference - upsert', () => {
    it('should succeed with valid preference', async () => {
      const mockRecord = { id: 'pref-1', preference_key: 'budget.max_monthly_usd', preference_value: 5000 };
      const mockFrom = vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockRecord, error: null }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'budget.max_monthly_usd', value: 5000, valueType: 'number',
      });
      expect(result.success).toBe(true);
      expect(result.record).toEqual(mockRecord);
    });

    it('should use default source "chairman_directive"', async () => {
      const upsertFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }),
        }),
      });
      store.supabase = { from: vi.fn().mockReturnValue({ upsert: upsertFn }) };

      await store.setPreference({
        chairmanId: 'c1', key: 'k', value: 'v', valueType: 'string',
      });

      expect(upsertFn).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'chairman_directive' }),
        expect.any(Object),
      );
    });

    it('should pass ventureId and onConflict to upsert', async () => {
      const upsertFn = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }),
        }),
      });
      store.supabase = { from: vi.fn().mockReturnValue({ upsert: upsertFn }) };

      await store.setPreference({
        chairmanId: 'c1', ventureId: 'v1', key: 'k', value: 1, valueType: 'number',
      });

      expect(upsertFn).toHaveBeenCalledWith(
        expect.objectContaining({
          chairman_id: 'c1',
          venture_id: 'v1',
          preference_key: 'k',
          preference_value: 1,
          value_type: 'number',
        }),
        expect.objectContaining({ onConflict: 'chairman_id,venture_id,preference_key' }),
      );
    });

    it('should return error on DB failure', async () => {
      store.supabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Conflict' } }),
            }),
          }),
        }),
      };

      const result = await store.setPreference({
        chairmanId: 'c1', key: 'k', value: 1, valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to set preference');
    });
  });

  describe('getPreference - scoped resolution', () => {
    it('should return null when no preference found', async () => {
      const result = await store.getPreference({ chairmanId: 'c1', key: 'missing' });
      expect(result).toBeNull();
    });

    it('should return venture-specific preference first', async () => {
      const ventureRow = {
        id: 'v1', preference_key: 'risk.max_drawdown_pct',
        preference_value: 10, value_type: 'number',
        source: 'chairman_directive', updated_at: '2026-01-01',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
      });

      const result = await store.getPreference({
        chairmanId: 'c1', ventureId: 'venture-1', key: 'risk.max_drawdown_pct',
      });
      expect(result.scope).toBe('venture');
      expect(result.value).toBe(10);
      expect(result.key).toBe('risk.max_drawdown_pct');
    });

    it('should fall back to global when venture-specific not found', async () => {
      let callCount = 0;
      const globalRow = {
        id: 'g1', preference_key: 'risk.max_drawdown_pct',
        preference_value: 20, value_type: 'number',
        source: 'chairman_directive', updated_at: '2026-01-01',
      };

      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: globalRow, error: null });
        }),
      }));

      const result = await store.getPreference({
        chairmanId: 'c1', ventureId: 'venture-1', key: 'risk.max_drawdown_pct',
      });
      expect(result.scope).toBe('global');
      expect(result.value).toBe(20);
    });

    it('should skip venture query when ventureId is null', async () => {
      const globalRow = {
        id: 'g1', preference_key: 'key', preference_value: 'val',
        value_type: 'string', source: 'default', updated_at: '2026-01-01',
      };

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: globalRow, error: null }),
      });

      const result = await store.getPreference({ chairmanId: 'c1', key: 'key' });
      expect(result.scope).toBe('global');
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPreferences - batch resolution', () => {
    it('should return resolved map with scope metadata', async () => {
      const ventureRows = [
        { id: 'v1', preference_key: 'key1', preference_value: 'val1', value_type: 'string', source: 'test', updated_at: '2026-01-01' },
      ];
      const globalRows = [
        { id: 'g1', preference_key: 'key2', preference_value: 42, value_type: 'number', source: 'test', updated_at: '2026-01-01' },
      ];

      let queryCount = 0;
      mockSupabase.from.mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation(function () {
          queryCount++;
          if (queryCount === 1) return Promise.resolve({ data: ventureRows, error: null });
          return Promise.resolve({ data: globalRows, error: null });
        }),
      }));

      const result = await store.getPreferences({
        chairmanId: 'c1', ventureId: 'v1', keys: ['key1', 'key2', 'key3'],
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.get('key1').scope).toBe('venture');
      expect(result.get('key2').scope).toBe('global');
      expect(result.has('key3')).toBe(false);
    });

    it('should skip venture query when ventureId is null', async () => {
      const globalRows = [
        { id: 'g1', preference_key: 'k1', preference_value: 'v1', value_type: 'string', source: 's', updated_at: '2026', },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: globalRows, error: null }),
      });

      const result = await store.getPreferences({ chairmanId: 'c1', keys: ['k1'] });
      expect(result.size).toBe(1);
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    it('should skip global query when all keys resolved at venture level', async () => {
      const ventureRows = [
        { id: 'v1', preference_key: 'k1', preference_value: 'v1', value_type: 'string', source: 's', updated_at: '2026' },
        { id: 'v2', preference_key: 'k2', preference_value: 'v2', value_type: 'string', source: 's', updated_at: '2026' },
      ];

      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: ventureRows, error: null }),
      });

      const result = await store.getPreferences({
        chairmanId: 'c1', ventureId: 'v1', keys: ['k1', 'k2'],
      });
      expect(result.size).toBe(2);
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('deletePreference', () => {
    it('should delete with venture_id IS NULL when not provided', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.deletePreference({
        chairmanId: 'c1', key: 'budget.max_monthly_usd',
      });
      expect(result.success).toBe(true);
    });

    it('should delete with venture_id eq when provided', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      });
      store.supabase = { from: mockFrom };

      const result = await store.deletePreference({
        chairmanId: 'c1', ventureId: 'v1', key: 'test.key',
      });
      expect(result.success).toBe(true);
    });

    it('should return error on DB failure', async () => {
      store.supabase = {
        from: vi.fn().mockReturnValue({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
              }),
            }),
          }),
        }),
      };

      const result = await store.deletePreference({ chairmanId: 'c1', key: 'test.key' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete preference');
    });
  });

  describe('linkDecisionToPreferences', () => {
    it('should succeed with empty preferences map', async () => {
      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: new Map(),
      });
      expect(result.success).toBe(true);
    });

    it('should update decision with preference snapshot', async () => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      store.supabase = { from: vi.fn().mockReturnValue({ update: updateFn }) };

      const prefs = new Map([
        ['budget.max_monthly_usd', { id: 'p1', value: 5000, scope: 'venture', valueType: 'number' }],
        ['risk.max_drawdown_pct', { id: 'p2', value: 25, scope: 'global', valueType: 'number' }],
      ]);

      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: prefs,
      });

      expect(result.success).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          preference_key: 'budget.max_monthly_usd',
          preference_ref_id: 'p1',
          preference_snapshot: expect.objectContaining({
            'budget.max_monthly_usd': { value: 5000, scope: 'venture', valueType: 'number' },
            'risk.max_drawdown_pct': { value: 25, scope: 'global', valueType: 'number' },
          }),
        }),
      );
    });

    it('should handle null preference id', async () => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      store.supabase = { from: vi.fn().mockReturnValue({ update: updateFn }) };

      const prefs = new Map([
        ['k1', { id: null, value: 'v', scope: 'global', valueType: 'string' }],
      ]);

      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: prefs,
      });

      expect(result.success).toBe(true);
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ preference_ref_id: null }),
      );
    });

    it('should return error on DB failure', async () => {
      store.supabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
          }),
        }),
      };

      const prefs = new Map([['k1', { id: null, value: 'v', scope: 'global', valueType: 'string' }]]);

      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: prefs,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to link decision');
    });
  });

  describe('_formatResult', () => {
    it('should map DB row to formatted result', () => {
      const row = {
        id: 'pref-1', preference_key: 'budget.max_monthly_usd',
        preference_value: 5000, value_type: 'number',
        source: 'chairman_directive', updated_at: '2026-01-01T00:00:00Z',
      };

      const result = store._formatResult(row, 'venture');

      expect(result).toEqual({
        id: 'pref-1',
        key: 'budget.max_monthly_usd',
        value: 5000,
        valueType: 'number',
        source: 'chairman_directive',
        scope: 'venture',
        updatedAt: '2026-01-01T00:00:00Z',
      });
    });
  });

  describe('createChairmanPreferenceStore factory', () => {
    it('should return a ChairmanPreferenceStore instance', () => {
      const s = createChairmanPreferenceStore({ supabaseClient: mockSupabase });
      expect(s).toBeInstanceOf(ChairmanPreferenceStore);
    });
  });
});
