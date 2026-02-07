/**
 * Tests for ChairmanPreferenceStore
 * SD-LEO-INFRA-CHAIRMAN-PREFS-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChairmanPreferenceStore } from '../../../lib/eva/chairman-preference-store.js';

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
      logger: { debug: vi.fn() },
    });
  });

  describe('constructor', () => {
    it('should create instance with custom supabase client', () => {
      expect(store).toBeInstanceOf(ChairmanPreferenceStore);
      expect(store.supabase).toBe(mockSupabase);
    });
  });

  describe('setPreference', () => {
    it('should reject invalid valueType', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: 'x', valueType: 'invalid',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid valueType');
    });

    it('should reject value/type mismatch', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: 'not-a-number', valueType: 'number',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('does not match');
    });

    it('should reject risk.max_drawdown_pct > 100', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'risk.max_drawdown_pct', value: 150, valueType: 'number',
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

    it('should reject empty tech stack directive', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'tech.stack_directive', value: '  ', valueType: 'string',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
    });

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
  });

  describe('getPreference', () => {
    it('should return null when no preference found', async () => {
      const result = await store.getPreference({ chairmanId: 'c1', key: 'missing' });
      expect(result).toBeNull();
    });

    it('should return venture-specific preference over global', async () => {
      const ventureRow = {
        id: 'v1', preference_key: 'risk.max_drawdown_pct',
        preference_value: 10, value_type: 'number',
        source: 'chairman_directive', updated_at: '2026-01-01',
      };

      const mockFrom = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
      }));
      store.supabase = { from: mockFrom };

      const result = await store.getPreference({
        chairmanId: 'c1', ventureId: 'venture-1', key: 'risk.max_drawdown_pct',
      });
      expect(result.scope).toBe('venture');
      expect(result.value).toBe(10);
    });

    it('should fall back to global when venture-specific not found', async () => {
      let callCount = 0;
      const globalRow = {
        id: 'g1', preference_key: 'risk.max_drawdown_pct',
        preference_value: 20, value_type: 'number',
        source: 'chairman_directive', updated_at: '2026-01-01',
      };

      const mockFrom = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          callCount++;
          // First call = venture-specific (miss), second = global (hit)
          if (callCount === 1) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: globalRow, error: null });
        }),
      }));
      store.supabase = { from: mockFrom };

      const result = await store.getPreference({
        chairmanId: 'c1', ventureId: 'venture-1', key: 'risk.max_drawdown_pct',
      });
      expect(result.scope).toBe('global');
      expect(result.value).toBe(20);
    });
  });

  describe('getPreferences', () => {
    it('should return resolved map with scope metadata', async () => {
      const ventureRows = [
        { id: 'v1', preference_key: 'key1', preference_value: 'val1', value_type: 'string', source: 'test', updated_at: '2026-01-01' },
      ];
      const globalRows = [
        { id: 'g1', preference_key: 'key2', preference_value: 42, value_type: 'number', source: 'test', updated_at: '2026-01-01' },
      ];

      let queryCount = 0;
      const mockFrom = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockImplementation(function () {
          queryCount++;
          if (queryCount === 1) return Promise.resolve({ data: ventureRows, error: null });
          return Promise.resolve({ data: globalRows, error: null });
        }),
      }));
      store.supabase = { from: mockFrom };

      const result = await store.getPreferences({
        chairmanId: 'c1', ventureId: 'v1', keys: ['key1', 'key2', 'key3'],
      });

      expect(result.get('key1').scope).toBe('venture');
      expect(result.get('key2').scope).toBe('global');
      expect(result.has('key3')).toBe(false);
    });
  });

  describe('deletePreference', () => {
    it('should delete a preference successfully', async () => {
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
  });

  describe('linkDecisionToPreferences', () => {
    it('should succeed with empty preferences map', async () => {
      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: new Map(),
      });
      expect(result.success).toBe(true);
    });

    it('should update decision with preference snapshot', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });
      store.supabase = { from: mockFrom };

      const prefs = new Map([
        ['risk.max_drawdown_pct', { id: 'p1', value: 10, scope: 'venture', valueType: 'number' }],
      ]);

      const result = await store.linkDecisionToPreferences({
        decisionId: 'd1', resolvedPreferences: prefs,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('value type validation', () => {
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

    it('should reject array when type is object', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'test', value: [1], valueType: 'object',
      });
      expect(result.success).toBe(false);
    });
  });
});
