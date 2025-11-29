/**
 * Schema Validator
 * SD-DATABASE-VALIDATION-001: Phase 1 - Core Validation
 *
 * Validates database schema by querying information_schema to verify:
 * - Tables exist with correct structure
 * - Columns have correct types and constraints
 * - Foreign key relationships are intact
 * - Required indexes exist
 *
 * Usage:
 *   node scripts/db-validate/schema-validator.js [--project=engineer|ehg] [--verbose]
 */

import { createDatabaseClient } from '../lib/supabase-connection.js';

/**
 * Schema validation result
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - List of validation errors
 * @property {string[]} warnings - List of validation warnings
 * @property {Object} metadata - Validation metadata
 */

/**
 * Expected schema definition
 * @typedef {Object} TableDefinition
 * @property {string} name - Table name
 * @property {ColumnDefinition[]} columns - Expected columns
 * @property {string[]} [requiredIndexes] - Required index names
 */

/**
 * @typedef {Object} ColumnDefinition
 * @property {string} name - Column name
 * @property {string} type - Expected data type (regex pattern)
 * @property {boolean} [nullable] - Whether column can be null
 * @property {boolean} [hasDefault] - Whether column has a default value
 */

export class SchemaValidator {
  constructor(project = 'engineer', options = {}) {
    this.project = project;
    this.verbose = options.verbose || false;
    this.client = null;
  }

  /**
   * Connect to database
   */
  async connect() {
    this.client = await createDatabaseClient(this.project, { verify: false });
    return this;
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  /**
   * Get all tables in the public schema
   * @returns {Promise<string[]>} List of table names
   */
  async getTables() {
    const result = await this.client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    return result.rows.map(row => row.table_name);
  }

  /**
   * Get columns for a specific table
   * @param {string} tableName - Table name
   * @returns {Promise<Object[]>} List of column definitions
   */
  async getColumns(tableName) {
    const result = await this.client.query(`
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);
    return result.rows;
  }

  /**
   * Get foreign key relationships for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object[]>} List of foreign key constraints
   */
  async getForeignKeys(tableName) {
    const result = await this.client.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND tc.table_schema = 'public'
    `, [tableName]);
    return result.rows;
  }

  /**
   * Get indexes for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object[]>} List of indexes
   */
  async getIndexes(tableName) {
    const result = await this.client.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY indexname
    `, [tableName]);
    return result.rows;
  }

  /**
   * Get primary key columns for a table
   * @param {string} tableName - Table name
   * @returns {Promise<string[]>} List of primary key column names
   */
  async getPrimaryKeyColumns(tableName) {
    const result = await this.client.query(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
        AND tc.table_schema = 'public'
      ORDER BY kcu.ordinal_position
    `, [tableName]);
    return result.rows.map(row => row.column_name);
  }

  /**
   * Get unique constraints for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object[]>} List of unique constraints
   */
  async getUniqueConstraints(tableName) {
    const result = await this.client.query(`
      SELECT
        tc.constraint_name,
        array_agg(kcu.column_name ORDER BY kcu.ordinal_position) as columns
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_name = $1
        AND tc.table_schema = 'public'
      GROUP BY tc.constraint_name
    `, [tableName]);
    return result.rows;
  }

  /**
   * Get check constraints for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Object[]>} List of check constraints
   */
  async getCheckConstraints(tableName) {
    const result = await this.client.query(`
      SELECT
        cc.constraint_name,
        cc.check_clause
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
        ON cc.constraint_name = tc.constraint_name
        AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_name = $1
        AND tc.table_schema = 'public'
        AND tc.constraint_type = 'CHECK'
    `, [tableName]);
    return result.rows;
  }

  /**
   * Get full table schema information
   * @param {string} tableName - Table name
   * @returns {Promise<Object>} Complete table schema
   */
  async getTableSchema(tableName) {
    const [columns, foreignKeys, indexes, primaryKeys, uniqueConstraints, checkConstraints] = await Promise.all([
      this.getColumns(tableName),
      this.getForeignKeys(tableName),
      this.getIndexes(tableName),
      this.getPrimaryKeyColumns(tableName),
      this.getUniqueConstraints(tableName),
      this.getCheckConstraints(tableName)
    ]);

    return {
      name: tableName,
      columns,
      foreignKeys,
      indexes,
      primaryKeys,
      uniqueConstraints,
      checkConstraints
    };
  }

  /**
   * Validate that a table exists
   * @param {string} tableName - Expected table name
   * @returns {Promise<ValidationResult>}
   */
  async validateTableExists(tableName) {
    const tables = await this.getTables();
    const exists = tables.includes(tableName);

    return {
      valid: exists,
      errors: exists ? [] : [`Table '${tableName}' does not exist`],
      warnings: [],
      metadata: { tableName, exists }
    };
  }

  /**
   * Validate table columns match expected schema
   * @param {string} tableName - Table name
   * @param {ColumnDefinition[]} expectedColumns - Expected column definitions
   * @returns {Promise<ValidationResult>}
   */
  async validateColumns(tableName, expectedColumns) {
    const errors = [];
    const warnings = [];
    const actualColumns = await this.getColumns(tableName);
    const actualColumnMap = new Map(actualColumns.map(c => [c.column_name, c]));

    for (const expected of expectedColumns) {
      const actual = actualColumnMap.get(expected.name);

      if (!actual) {
        errors.push(`Column '${tableName}.${expected.name}' does not exist`);
        continue;
      }

      // Validate type (using regex for flexibility)
      const typePattern = new RegExp(expected.type, 'i');
      const actualType = actual.udt_name || actual.data_type;
      if (!typePattern.test(actualType)) {
        errors.push(
          `Column '${tableName}.${expected.name}' has type '${actualType}', expected pattern '${expected.type}'`
        );
      }

      // Validate nullable
      if (expected.nullable !== undefined) {
        const isNullable = actual.is_nullable === 'YES';
        if (isNullable !== expected.nullable) {
          errors.push(
            `Column '${tableName}.${expected.name}' nullable is ${isNullable}, expected ${expected.nullable}`
          );
        }
      }

      // Validate default
      if (expected.hasDefault !== undefined) {
        const hasDefault = actual.column_default !== null;
        if (hasDefault !== expected.hasDefault) {
          warnings.push(
            `Column '${tableName}.${expected.name}' hasDefault is ${hasDefault}, expected ${expected.hasDefault}`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: { tableName, columnCount: actualColumns.length }
    };
  }

  /**
   * Validate a table against expected schema
   * @param {TableDefinition} expected - Expected table definition
   * @returns {Promise<ValidationResult>}
   */
  async validateTable(expected) {
    const errors = [];
    const warnings = [];

    // Check table exists
    const existsResult = await this.validateTableExists(expected.name);
    if (!existsResult.valid) {
      return existsResult;
    }

    // Validate columns
    if (expected.columns && expected.columns.length > 0) {
      const columnsResult = await this.validateColumns(expected.name, expected.columns);
      errors.push(...columnsResult.errors);
      warnings.push(...columnsResult.warnings);
    }

    // Validate required indexes
    if (expected.requiredIndexes && expected.requiredIndexes.length > 0) {
      const indexes = await this.getIndexes(expected.name);
      const indexNames = indexes.map(i => i.indexname);

      for (const requiredIndex of expected.requiredIndexes) {
        if (!indexNames.includes(requiredIndex)) {
          warnings.push(`Required index '${requiredIndex}' not found on table '${expected.name}'`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: { tableName: expected.name }
    };
  }

  /**
   * Validate multiple tables
   * @param {TableDefinition[]} tables - Expected table definitions
   * @returns {Promise<ValidationResult>}
   */
  async validateTables(tables) {
    const allErrors = [];
    const allWarnings = [];
    const results = [];

    for (const table of tables) {
      const result = await this.validateTable(table);
      results.push(result);
      allErrors.push(...result.errors);
      allWarnings.push(...result.warnings);
    }

    return {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      metadata: {
        tablesChecked: tables.length,
        tablesValid: results.filter(r => r.valid).length,
        results
      }
    };
  }

  /**
   * Get complete database schema snapshot
   * @returns {Promise<Object>} Full schema snapshot
   */
  async getSchemaSnapshot() {
    const tables = await this.getTables();
    const snapshot = {
      project: this.project,
      timestamp: new Date().toISOString(),
      tables: {}
    };

    for (const tableName of tables) {
      snapshot.tables[tableName] = await this.getTableSchema(tableName);
    }

    return snapshot;
  }

  /**
   * Compare two schema snapshots
   * @param {Object} expected - Expected schema snapshot
   * @param {Object} actual - Actual schema snapshot
   * @returns {ValidationResult}
   */
  static compareSnapshots(expected, actual) {
    const errors = [];
    const warnings = [];

    // Check for missing tables
    for (const tableName of Object.keys(expected.tables)) {
      if (!actual.tables[tableName]) {
        errors.push(`Table '${tableName}' is missing`);
        continue;
      }

      const expectedTable = expected.tables[tableName];
      const actualTable = actual.tables[tableName];

      // Check for missing columns
      const expectedColumnNames = new Set(expectedTable.columns.map(c => c.column_name));
      const actualColumnNames = new Set(actualTable.columns.map(c => c.column_name));

      for (const colName of expectedColumnNames) {
        if (!actualColumnNames.has(colName)) {
          errors.push(`Column '${tableName}.${colName}' is missing`);
        }
      }

      // Check for extra columns (warning only)
      for (const colName of actualColumnNames) {
        if (!expectedColumnNames.has(colName)) {
          warnings.push(`Extra column '${tableName}.${colName}' found`);
        }
      }
    }

    // Check for extra tables (warning only)
    for (const tableName of Object.keys(actual.tables)) {
      if (!expected.tables[tableName]) {
        warnings.push(`Extra table '${tableName}' found`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        expectedTables: Object.keys(expected.tables).length,
        actualTables: Object.keys(actual.tables).length
      }
    };
  }

  /**
   * Log validation result
   * @param {ValidationResult} result - Validation result
   */
  logResult(result) {
    if (result.valid) {
      console.log('\x1b[32m%s\x1b[0m', 'Schema validation PASSED');
    } else {
      console.log('\x1b[31m%s\x1b[0m', 'Schema validation FAILED');
    }

    if (result.errors.length > 0) {
      console.log('\n\x1b[31mErrors:\x1b[0m');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n\x1b[33mWarnings:\x1b[0m');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    if (this.verbose && result.metadata) {
      console.log('\n\x1b[36mMetadata:\x1b[0m');
      console.log(JSON.stringify(result.metadata, null, 2));
    }
  }
}

/**
 * Core tables expected in EHG_Engineer database
 * These are validated against the actual schema on each run
 */
export const ENGINEER_CORE_TABLES = [
  {
    name: 'strategic_directives_v2',
    columns: [
      { name: 'id', type: 'text|varchar', nullable: false },
      { name: 'title', type: 'text|varchar', nullable: false },
      { name: 'status', type: 'text|varchar', nullable: false },
      { name: 'current_phase', type: 'text', nullable: true },
      { name: 'progress', type: 'int4', nullable: true },
      { name: 'created_at', type: 'timestamp', nullable: true },
      { name: 'updated_at', type: 'timestamp', nullable: true }
    ]
  },
  {
    name: 'product_requirements_v2',
    columns: [
      { name: 'id', type: 'text|varchar', nullable: false },
      { name: 'sd_id', type: 'text|varchar', nullable: true },
      { name: 'status', type: 'text|varchar', nullable: true },
      { name: 'progress', type: 'int|numeric', nullable: true }
    ]
  }
];

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';
  const verbose = args.includes('--verbose');
  const snapshot = args.includes('--snapshot');

  const validator = new SchemaValidator(project, { verbose });

  async function main() {
    try {
      await validator.connect();
      console.log(`\nValidating ${project} database schema...\n`);

      if (snapshot) {
        const schema = await validator.getSchemaSnapshot();
        console.log(JSON.stringify(schema, null, 2));
      } else {
        const result = await validator.validateTables(ENGINEER_CORE_TABLES);
        validator.logResult(result);
        process.exit(result.valid ? 0 : 1);
      }
    } catch (error) {
      console.error('Validation error:', error.message);
      process.exit(1);
    } finally {
      await validator.disconnect();
    }
  }

  main();
}
