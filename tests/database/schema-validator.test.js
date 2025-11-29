/**
 * Schema Validator Unit Tests
 * SD-DATABASE-VALIDATION-001: Phase 1 - Core Validation
 *
 * Test Coverage:
 * - Table existence validation
 * - Column type validation
 * - Constraint validation
 * - Snapshot comparison
 * - Error detection for missing/mismatched schema
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SchemaValidator,
  ENGINEER_CORE_TABLES
} from '../../scripts/db-validate/schema-validator.js';

// Mock the database connection module
vi.mock('../../scripts/lib/supabase-connection.js', () => ({
  createDatabaseClient: vi.fn()
}));

import { createDatabaseClient } from '../../scripts/lib/supabase-connection.js';

describe('SchemaValidator', () => {
  let validator;
  let mockClient;

  beforeEach(() => {
    // Create mock client with query method
    mockClient = {
      query: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined)
    };
    createDatabaseClient.mockResolvedValue(mockClient);
    validator = new SchemaValidator('engineer', { verbose: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('connect/disconnect', () => {
    test('should connect to database', async () => {
      await validator.connect();
      expect(createDatabaseClient).toHaveBeenCalledWith('engineer', { verify: false });
      expect(validator.client).toBe(mockClient);
    });

    test('should disconnect from database', async () => {
      await validator.connect();
      await validator.disconnect();
      expect(mockClient.end).toHaveBeenCalled();
      expect(validator.client).toBeNull();
    });
  });

  describe('getTables', () => {
    test('should return list of table names', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { table_name: 'strategic_directives_v2' },
          { table_name: 'product_requirements_v2' },
          { table_name: 'user_stories_v2' }
        ]
      });

      const tables = await validator.getTables();

      expect(tables).toEqual([
        'strategic_directives_v2',
        'product_requirements_v2',
        'user_stories_v2'
      ]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('information_schema.tables'));
    });
  });

  describe('getColumns', () => {
    test('should return column definitions for a table', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null },
          { column_name: 'title', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null },
          { column_name: 'status', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: "'draft'" }
        ]
      });

      const columns = await validator.getColumns('strategic_directives_v2');

      expect(columns).toHaveLength(3);
      expect(columns[0].column_name).toBe('id');
      expect(columns[1].is_nullable).toBe('NO');
    });
  });

  describe('validateTableExists', () => {
    test('should pass when table exists', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { table_name: 'strategic_directives_v2' },
          { table_name: 'product_requirements_v2' }
        ]
      });

      const result = await validator.validateTableExists('strategic_directives_v2');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.metadata.exists).toBe(true);
    });

    test('should fail when table does not exist', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { table_name: 'other_table' }
        ]
      });

      const result = await validator.validateTableExists('nonexistent_table');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Table 'nonexistent_table' does not exist");
      expect(result.metadata.exists).toBe(false);
    });
  });

  describe('validateColumns', () => {
    test('should pass when columns match expected schema', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null },
          { column_name: 'title', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null }
        ]
      });

      const expectedColumns = [
        { name: 'id', type: 'text', nullable: false },
        { name: 'title', type: 'text', nullable: false }
      ];

      const result = await validator.validateColumns('test_table', expectedColumns);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail when column is missing', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null }
        ]
      });

      const expectedColumns = [
        { name: 'id', type: 'text' },
        { name: 'missing_column', type: 'text' }
      ];

      const result = await validator.validateColumns('test_table', expectedColumns);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Column 'test_table.missing_column' does not exist");
    });

    test('should fail when column type mismatches', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO', column_default: null }
        ]
      });

      const expectedColumns = [
        { name: 'id', type: 'text' }
      ];

      const result = await validator.validateColumns('test_table', expectedColumns);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("has type 'int4', expected pattern 'text'");
    });

    test('should fail when nullable constraint mismatches', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'title', data_type: 'text', udt_name: 'text', is_nullable: 'YES', column_default: null }
        ]
      });

      const expectedColumns = [
        { name: 'title', type: 'text', nullable: false }
      ];

      const result = await validator.validateColumns('test_table', expectedColumns);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('nullable is true, expected false');
    });

    test('should accept type pattern matching', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'id', data_type: 'uuid', udt_name: 'uuid', is_nullable: 'NO', column_default: null }
        ]
      });

      const expectedColumns = [
        { name: 'id', type: 'text|varchar|uuid' }  // Using regex pattern
      ];

      const result = await validator.validateColumns('test_table', expectedColumns);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateTable', () => {
    test('should validate table with columns', async () => {
      await validator.connect();

      // Mock for getTables
      mockClient.query
        .mockResolvedValueOnce({
          rows: [{ table_name: 'test_table' }]
        })
        // Mock for getColumns
        .mockResolvedValueOnce({
          rows: [
            { column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null },
            { column_name: 'name', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null }
          ]
        });

      const tableDefinition = {
        name: 'test_table',
        columns: [
          { name: 'id', type: 'text', nullable: false },
          { name: 'name', type: 'text', nullable: false }
        ]
      };

      const result = await validator.validateTable(tableDefinition);

      expect(result.valid).toBe(true);
    });

    test('should fail if table does not exist', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({ rows: [] });

      const tableDefinition = {
        name: 'nonexistent',
        columns: []
      };

      const result = await validator.validateTable(tableDefinition);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Table 'nonexistent' does not exist");
    });
  });

  describe('validateTables', () => {
    test('should validate multiple tables', async () => {
      await validator.connect();

      // First call for first table getTables
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ table_name: 'table1' }, { table_name: 'table2' }] })
        .mockResolvedValueOnce({
          rows: [{ column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null }]
        })
        // Second table
        .mockResolvedValueOnce({ rows: [{ table_name: 'table1' }, { table_name: 'table2' }] })
        .mockResolvedValueOnce({
          rows: [{ column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO', column_default: null }]
        });

      const tables = [
        { name: 'table1', columns: [{ name: 'id', type: 'text' }] },
        { name: 'table2', columns: [{ name: 'id', type: 'text' }] }
      ];

      const result = await validator.validateTables(tables);

      expect(result.valid).toBe(true);
      expect(result.metadata.tablesChecked).toBe(2);
      expect(result.metadata.tablesValid).toBe(2);
    });

    test('should report errors from multiple tables', async () => {
      await validator.connect();

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ table_name: 'table1' }] })
        .mockResolvedValueOnce({
          rows: [{ column_name: 'id', data_type: 'integer', udt_name: 'int4', is_nullable: 'NO', column_default: null }]
        })
        .mockResolvedValueOnce({ rows: [] }); // table2 doesn't exist

      const tables = [
        { name: 'table1', columns: [{ name: 'id', type: 'text' }] }, // Type mismatch
        { name: 'table2', columns: [] } // Missing table
      ];

      const result = await validator.validateTables(tables);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.metadata.tablesChecked).toBe(2);
      expect(result.metadata.tablesValid).toBe(0);
    });
  });

  describe('compareSnapshots', () => {
    test('should pass when snapshots match', () => {
      const expected = {
        tables: {
          test_table: {
            columns: [
              { column_name: 'id' },
              { column_name: 'name' }
            ]
          }
        }
      };

      const actual = {
        tables: {
          test_table: {
            columns: [
              { column_name: 'id' },
              { column_name: 'name' }
            ]
          }
        }
      };

      const result = SchemaValidator.compareSnapshots(expected, actual);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should fail when table is missing', () => {
      const expected = {
        tables: {
          existing_table: { columns: [] },
          missing_table: { columns: [] }
        }
      };

      const actual = {
        tables: {
          existing_table: { columns: [] }
        }
      };

      const result = SchemaValidator.compareSnapshots(expected, actual);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Table 'missing_table' is missing");
    });

    test('should fail when column is missing', () => {
      const expected = {
        tables: {
          test_table: {
            columns: [
              { column_name: 'id' },
              { column_name: 'missing_col' }
            ]
          }
        }
      };

      const actual = {
        tables: {
          test_table: {
            columns: [
              { column_name: 'id' }
            ]
          }
        }
      };

      const result = SchemaValidator.compareSnapshots(expected, actual);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Column 'test_table.missing_col' is missing");
    });

    test('should warn about extra tables', () => {
      const expected = {
        tables: {
          expected_table: { columns: [] }
        }
      };

      const actual = {
        tables: {
          expected_table: { columns: [] },
          extra_table: { columns: [] }
        }
      };

      const result = SchemaValidator.compareSnapshots(expected, actual);

      expect(result.valid).toBe(true); // Extra tables don't fail validation
      expect(result.warnings).toContain("Extra table 'extra_table' found");
    });

    test('should warn about extra columns', () => {
      const expected = {
        tables: {
          test_table: {
            columns: [{ column_name: 'id' }]
          }
        }
      };

      const actual = {
        tables: {
          test_table: {
            columns: [
              { column_name: 'id' },
              { column_name: 'extra_col' }
            ]
          }
        }
      };

      const result = SchemaValidator.compareSnapshots(expected, actual);

      expect(result.valid).toBe(true); // Extra columns don't fail validation
      expect(result.warnings).toContain("Extra column 'test_table.extra_col' found");
    });
  });

  describe('ENGINEER_CORE_TABLES', () => {
    test('should define strategic_directives_v2 table', () => {
      const sdTable = ENGINEER_CORE_TABLES.find(t => t.name === 'strategic_directives_v2');
      expect(sdTable).toBeDefined();
      expect(sdTable.columns.some(c => c.name === 'id')).toBe(true);
      expect(sdTable.columns.some(c => c.name === 'title')).toBe(true);
      expect(sdTable.columns.some(c => c.name === 'status')).toBe(true);
    });

    test('should define product_requirements_v2 table', () => {
      const prdTable = ENGINEER_CORE_TABLES.find(t => t.name === 'product_requirements_v2');
      expect(prdTable).toBeDefined();
      expect(prdTable.columns.some(c => c.name === 'id')).toBe(true);
      expect(prdTable.columns.some(c => c.name === 'sd_id')).toBe(true);
    });

    test('should have correct number of core tables defined', () => {
      // Currently: strategic_directives_v2 and product_requirements_v2
      expect(ENGINEER_CORE_TABLES.length).toBe(2);
    });
  });

  describe('getForeignKeys', () => {
    test('should return foreign key relationships', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          {
            constraint_name: 'fk_prd_sd',
            column_name: 'sd_id',
            foreign_table_name: 'strategic_directives_v2',
            foreign_column_name: 'id'
          }
        ]
      });

      const fks = await validator.getForeignKeys('product_requirements_v2');

      expect(fks).toHaveLength(1);
      expect(fks[0].column_name).toBe('sd_id');
      expect(fks[0].foreign_table_name).toBe('strategic_directives_v2');
    });
  });

  describe('getIndexes', () => {
    test('should return table indexes', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { indexname: 'idx_sd_status', indexdef: 'CREATE INDEX idx_sd_status ON strategic_directives_v2 (status)' },
          { indexname: 'strategic_directives_v2_pkey', indexdef: 'CREATE UNIQUE INDEX strategic_directives_v2_pkey ON strategic_directives_v2 (id)' }
        ]
      });

      const indexes = await validator.getIndexes('strategic_directives_v2');

      expect(indexes).toHaveLength(2);
      expect(indexes.some(i => i.indexname === 'idx_sd_status')).toBe(true);
    });
  });

  describe('getPrimaryKeyColumns', () => {
    test('should return primary key columns', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [{ column_name: 'id' }]
      });

      const pkCols = await validator.getPrimaryKeyColumns('strategic_directives_v2');

      expect(pkCols).toEqual(['id']);
    });

    test('should return multiple columns for composite key', async () => {
      await validator.connect();
      mockClient.query.mockResolvedValue({
        rows: [
          { column_name: 'tenant_id' },
          { column_name: 'user_id' }
        ]
      });

      const pkCols = await validator.getPrimaryKeyColumns('tenant_users');

      expect(pkCols).toEqual(['tenant_id', 'user_id']);
    });
  });

  describe('getTableSchema', () => {
    test('should return complete table schema', async () => {
      await validator.connect();

      // Mock all the parallel queries
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ column_name: 'id', data_type: 'text', udt_name: 'text', is_nullable: 'NO' }] })
        .mockResolvedValueOnce({ rows: [] }) // foreign keys
        .mockResolvedValueOnce({ rows: [{ indexname: 'test_pkey', indexdef: 'CREATE UNIQUE INDEX' }] })
        .mockResolvedValueOnce({ rows: [{ column_name: 'id' }] }) // primary key
        .mockResolvedValueOnce({ rows: [] }) // unique constraints
        .mockResolvedValueOnce({ rows: [] }); // check constraints

      const schema = await validator.getTableSchema('test_table');

      expect(schema.name).toBe('test_table');
      expect(schema.columns).toHaveLength(1);
      expect(schema.primaryKeys).toEqual(['id']);
      expect(schema.indexes).toHaveLength(1);
    });
  });
});
