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
    // getPreference (SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-1) uses .order() as the
    // terminal call instead of .single(), returning an array so multi-row scope
    // violations are observable instead of silently swallowed.
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => ({ ...mockQuery, ...overrides })),
    _mockQuery: mockQuery,
  };
}

/**
 * PLAN-VERIFY (validation-agent, mutation-tested): a mock whose .order() IGNORES the
 * {ascending} argument and just returns a fixture pre-sorted the "right" way lets a test
 * pass even if production code flips ascending:false -> true -- the mock never asked "which
 * direction". This one genuinely sorts by the requested column/direction, so a flip
 * produces the WRONG winning row and the assertion actually fails.
 */
function makeOrderAwareSupabase(rows) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn((col, { ascending } = {}) => {
        const sorted = [...rows].sort((a, b) => {
          const cmp = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
          return ascending ? cmp : -cmp;
        });
        return Promise.resolve({ data: sorted, error: null });
      }),
    })),
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

  // SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-6 (TS-10, TS-11): the amended
  // notifications.timezone validator -- back-compat bare-string form, new composite
  // {zone, until} form, and rejection of both malformed zones and arrays.
  describe('setPreference - notifications.timezone (composite + back-compat)', () => {
    function mockUpsertSuccess() {
      store.supabase = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
            }),
          }),
        }),
      };
    }

    it('accepts a bare IANA string (back-compat, no expiry)', async () => {
      mockUpsertSuccess();
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone', value: 'America/Jamaica', valueType: 'string',
      });
      expect(result.success).toBe(true);
    });

    it('accepts the composite {zone, until} form', async () => {
      mockUpsertSuccess();
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone',
        value: { zone: 'America/Jamaica', until: '2026-08-14T12:00:00.000Z' }, valueType: 'object',
      });
      expect(result.success).toBe(true);
    });

    it('rejects a malformed zone in the composite form', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone',
        value: { zone: 'not-a-zone', until: '2026-08-14T12:00:00.000Z' }, valueType: 'object',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid IANA timezone');
    });

    it('rejects a malformed "until" in the composite form', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone',
        value: { zone: 'America/Jamaica', until: 'not-a-date' }, valueType: 'object',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('until');
    });

    it('rejects an array, even when declared as valueType "array"', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone', value: ['America/Jamaica'], valueType: 'array',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not an array');
    });

    it('does not weaken sibling bare-string-validated keys (notifications.email still rejects an object)', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.email', value: { zone: 'x' }, valueType: 'object',
      });
      expect(result.success).toBe(false);
    });

    // SEC-QW-02: 'Asia/Kolkata' does NOT throw when handed to Intl.DateTimeFormat -- it
    // silently canonicalizes to the legacy alias 'Asia/Calcutta' -- so a bare
    // throw-or-not check (the pre-fix validator) accepted it at write time while the
    // read-time resolver (isValidCanonicalZone's round-trip check) rejects it, leaving a
    // write that reports success but is silently discarded at read. Confirmed reproducible
    // in this Node/ICU runtime.
    it('SEC-QW-02: rejects a legacy zone alias that Intl tolerates but does not canonically round-trip (bare-string form)', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone', value: 'Asia/Kolkata', valueType: 'string',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid IANA timezone');
    });

    it('SEC-QW-02: rejects the same legacy alias in the composite form', async () => {
      const result = await store.setPreference({
        chairmanId: 'c1', key: 'notifications.timezone',
        value: { zone: 'Asia/Kolkata', until: '2026-08-14T12:00:00.000Z' }, valueType: 'object',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('valid IANA timezone');
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
        order: vi.fn().mockResolvedValue({ data: [ventureRow], error: null }),
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
        order: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ data: [], error: null });
          return Promise.resolve({ data: [globalRow], error: null });
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
        order: vi.fn().mockResolvedValue({ data: [globalRow], error: null }),
      });

      const result = await store.getPreference({ chairmanId: 'c1', key: 'key' });
      expect(result.scope).toBe('global');
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    it('logs a multi-row scope violation and returns the most-recently-updated row (SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-1)', async () => {
      const older = {
        id: 'g1', preference_key: 'notifications.quiet_hours_extended_until', preference_value: 'old',
        value_type: 'string', source: 'chairman_directive', updated_at: '2026-07-25T00:00:00Z',
      };
      const newer = {
        id: 'g2', preference_key: 'notifications.quiet_hours_extended_until', preference_value: 'new',
        value_type: 'string', source: 'chairman_directive', updated_at: '2026-08-08T00:00:00Z',
      };
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [newer, older], error: null }),
      });

      const result = await store.getPreference({ chairmanId: 'c1', key: 'notifications.quiet_hours_extended_until' });
      expect(result.value).toBe('new');
      expect(silentLogger.error).toHaveBeenCalledWith(
        'chairman_preference.multi_row_scope_violation',
        expect.objectContaining({ rowCount: 2, scope: 'global' }),
      );
    });

    it('PLAN-VERIFY: genuinely requests DESCENDING order -- a flip to ascending would return the OLDER row, not just reshuffle a pre-sorted fixture', async () => {
      const older = { id: 'g1', preference_key: 'k1', preference_value: 'old', value_type: 'string', source: 's', updated_at: '2026-01-01T00:00:00Z' };
      const newer = { id: 'g2', preference_key: 'k1', preference_value: 'new', value_type: 'string', source: 's', updated_at: '2026-02-01T00:00:00Z' };
      store.supabase = makeOrderAwareSupabase([older, newer]); // fixture order deliberately NOT pre-sorted
      const result = await store.getPreference({ chairmanId: 'c1', key: 'k1' });
      expect(result.value).toBe('new');
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
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockImplementation(function () {
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
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: globalRows, error: null }),
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
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: ventureRows, error: null }),
      });

      const result = await store.getPreferences({
        chairmanId: 'c1', ventureId: 'v1', keys: ['k1', 'k2'],
      });
      expect(result.size).toBe(2);
      expect(mockSupabase.from).toHaveBeenCalledTimes(1);
    });

    // SEC-QW-01: getPreferences() previously had no .order() and last-row-wins over an
    // UNORDERED result set -- non-deterministic given real duplicate rows (the exact bug
    // class FR-1 fixed for getPreference() but missed here; resolveQuietHoursContext reads
    // through this path).
    it('SEC-QW-01: a duplicate row per key resolves to the MOST RECENT (pre-ordered) row, not whichever the DB happened to return first, and warns once per duplicated key', async () => {
      // Server-side .order('updated_at', {ascending:false}) means the most-recent row per
      // key arrives FIRST in this array -- the fake mirrors that pre-ordering.
      const globalRows = [
        { id: 'g2', preference_key: 'k1', preference_value: 'newest', value_type: 'string', source: 's', updated_at: '2026-02-01' },
        { id: 'g1', preference_key: 'k1', preference_value: 'oldest', value_type: 'string', source: 's', updated_at: '2026-01-01' },
      ];
      mockSupabase.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: globalRows, error: null }),
      });

      const result = await store.getPreferences({ chairmanId: 'c1', keys: ['k1'] });

      expect(result.get('k1').value).toBe('newest');
      expect(silentLogger.error).toHaveBeenCalledWith(
        'chairman_preference.multi_row_scope_violation',
        expect.objectContaining({ key: 'k1', scope: 'global', rowCount: 2 }),
      );
    });

    it('PLAN-VERIFY: getPreferences genuinely requests DESCENDING order too -- a flip to ascending would return the OLDER row', async () => {
      const older = { id: 'g1', preference_key: 'k1', preference_value: 'old', value_type: 'string', source: 's', updated_at: '2026-01-01T00:00:00Z' };
      const newer = { id: 'g2', preference_key: 'k1', preference_value: 'new', value_type: 'string', source: 's', updated_at: '2026-02-01T00:00:00Z' };
      store.supabase = makeOrderAwareSupabase([older, newer]);
      const result = await store.getPreferences({ chairmanId: 'c1', keys: ['k1'] });
      expect(result.get('k1').value).toBe('new');
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
