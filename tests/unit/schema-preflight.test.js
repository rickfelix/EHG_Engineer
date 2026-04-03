/**
 * Unit Tests: Schema Pre-Flight Validation Library
 * SD-LEO-ORCH-SELF-HEALING-DATABASE-001-B
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// We need to mock before requiring the modules
// Reset module cache between tests
let validateOperation;
let getTableSchema, flushCache, getCacheStats;

describe('schema-preflight', () => {
  beforeEach(() => {
    // Clear module cache to reset singleton state
    vi.resetModules();

    // Re-require fresh modules
    delete require.cache[require.resolve('../../lib/schema-cache.cjs')];
    delete require.cache[require.resolve('../../lib/schema-preflight.cjs')];

    const cache = require('../../lib/schema-cache.cjs');
    const preflight = require('../../lib/schema-preflight.cjs');

    getTableSchema = cache.getTableSchema;
    flushCache = cache.flushCache;
    getCacheStats = cache.getCacheStats;
    validateOperation = preflight.validateOperation;
  });

  describe('validateOperation', () => {
    // Mock Supabase client that returns known schema
    function createMockClient(tableData = {}) {
      return {
        rpc: (fnName, params) => {
          const tableName = params?.p_table_name;
          const data = tableData[tableName] || null;
          if (data === null) {
            return Promise.resolve({ data: [], error: null });
          }
          return Promise.resolve({ data, error: null });
        },
      };
    }

    const sdColumns = [
      { table_name: 'test_table', column_name: 'id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()' },
      { table_name: 'test_table', column_name: 'title', data_type: 'character varying', udt_name: 'varchar', is_nullable: 'NO', column_default: null },
      { table_name: 'test_table', column_name: 'progress', data_type: 'integer', udt_name: 'int4', is_nullable: 'YES', column_default: '0' },
      { table_name: 'test_table', column_name: 'metadata', data_type: 'jsonb', udt_name: 'jsonb', is_nullable: 'YES', column_default: null },
      { table_name: 'test_table', column_name: 'is_active', data_type: 'boolean', udt_name: 'bool', is_nullable: 'YES', column_default: 'true' },
      { table_name: 'test_table', column_name: 'created_at', data_type: 'timestamp with time zone', udt_name: 'timestamptz', is_nullable: 'YES', column_default: 'now()' },
      { table_name: 'test_table', column_name: 'description', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null },
    ];

    const mockClient = createMockClient({ test_table: sdColumns });

    it('returns valid=true for known columns with correct types', async () => {
      const result = await validateOperation('test_table', 'select', { title: 'hello' }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects unknown column names', async () => {
      const result = await validateOperation('test_table', 'select', { fake_column: 'test' }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown column: fake_column');
    });

    it('detects type mismatches (string → integer)', async () => {
      const result = await validateOperation('test_table', 'update', { progress: 'not_a_number' }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Type mismatch.*progress.*string.*int4/);
    });

    it('detects type mismatches (number → boolean)', async () => {
      const result = await validateOperation('test_table', 'update', { is_active: 42 }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Type mismatch.*is_active/);
    });

    it('accepts string values for varchar columns', async () => {
      const result = await validateOperation('test_table', 'update', { title: 'valid string' }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('accepts number values for integer columns', async () => {
      const result = await validateOperation('test_table', 'update', { progress: 50 }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('accepts boolean values for bool columns', async () => {
      const result = await validateOperation('test_table', 'update', { is_active: false }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('accepts object values for jsonb columns', async () => {
      const result = await validateOperation('test_table', 'update', { metadata: { key: 'value' } }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('accepts array values for jsonb columns', async () => {
      const result = await validateOperation('test_table', 'update', { metadata: [1, 2, 3] }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('accepts Date values for timestamptz columns', async () => {
      const result = await validateOperation('test_table', 'update', { created_at: new Date() }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('detects JSONB double-stringification', async () => {
      const result = await validateOperation('test_table', 'update', { metadata: JSON.stringify({ key: 'value' }) }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true); // valid because string→jsonb is allowed
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/double-stringified/);
    });

    it('returns error for non-existent table', async () => {
      const result = await validateOperation('nonexistent', 'select', { id: 1 }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Table not found/);
    });

    it('handles null value for nullable column', async () => {
      const result = await validateOperation('test_table', 'update', { description: null }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('detects null for non-nullable column without default', async () => {
      const result = await validateOperation('test_table', 'insert', { title: null }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/NOT NULL/);
    });

    it('allows null for non-nullable column with default', async () => {
      const result = await validateOperation('test_table', 'insert', { id: null }, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('handles empty params gracefully', async () => {
      const result = await validateOperation('test_table', 'select', {}, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
    });

    it('handles null params gracefully', async () => {
      const result = await validateOperation('test_table', 'select', null, { supabaseClient: mockClient });
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No params to validate');
    });

    it('fails open on RPC error', async () => {
      const errorClient = {
        rpc: () => Promise.resolve({ data: null, error: { message: 'connection refused' } }),
      };
      flushCache();
      const result = await validateOperation('test_table', 'select', { id: 'test' }, { supabaseClient: errorClient });
      expect(result.valid).toBe(true);
      expect(result.warnings[0]).toMatch(/schema validation skipped/);
    });

    it('fails open on thrown exception', async () => {
      const throwClient = {
        rpc: () => { throw new Error('unexpected'); },
      };
      flushCache();
      const result = await validateOperation('test_table', 'select', { id: 'test' }, { supabaseClient: throwClient });
      expect(result.valid).toBe(true);
      expect(result.warnings[0]).toMatch(/schema validation skipped/);
    });

    it('validates multiple params, reporting all errors', async () => {
      const result = await validateOperation('test_table', 'update', {
        fake_col: 'x',
        progress: 'bad',
        title: 'ok',
      }, { supabaseClient: mockClient });
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2); // fake_col + progress type mismatch
    });
  });

  describe('schema-cache', () => {
    function createMockClient() {
      let callCount = 0;
      return {
        rpc: (fnName, params) => {
          callCount++;
          return Promise.resolve({
            data: [
              { table_name: params.p_table_name, column_name: 'id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', column_default: 'gen_random_uuid()' },
            ],
            error: null,
          });
        },
        getCallCount: () => callCount,
      };
    }

    it('caches schema on first call', async () => {
      const client = createMockClient();
      const schema = await getTableSchema('cache_test', client);
      expect(schema).toBeTruthy();
      expect(schema.get('id')).toBeTruthy();
      expect(client.getCallCount()).toBe(1);
    });

    it('returns cached schema on second call (no extra RPC)', async () => {
      const client = createMockClient();
      await getTableSchema('cache_test2', client);
      await getTableSchema('cache_test2', client);
      expect(client.getCallCount()).toBe(1); // Only 1 RPC call
    });

    it('flushCache forces re-query', async () => {
      const client = createMockClient();
      await getTableSchema('flush_test', client);
      flushCache('flush_test');
      await getTableSchema('flush_test', client);
      expect(client.getCallCount()).toBe(2);
    });

    it('flushCache with no arg clears all', async () => {
      const client = createMockClient();
      await getTableSchema('all_test1', client);
      await getTableSchema('all_test2', client);
      expect(getCacheStats().size).toBe(2);
      flushCache();
      expect(getCacheStats().size).toBe(0);
    });

    it('getCacheStats returns correct metadata', async () => {
      flushCache();
      const client = createMockClient();
      await getTableSchema('stats_test', client);
      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.tables).toContain('stats_test');
      expect(stats.ttl).toBe(5 * 60 * 1000);
    });
  });
});
