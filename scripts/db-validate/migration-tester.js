/**
 * Migration Tester
 * SD-DATABASE-VALIDATION-001: Phase 2 - Migration Safety
 *
 * Tests database migrations by:
 * - Parsing SQL migration files
 * - Applying migrations in a transaction
 * - Verifying schema changes
 * - Rolling back to validate reversibility
 *
 * CRITICAL: Uses isolated test environment, NEVER production!
 *
 * Usage:
 *   node scripts/db-validate/migration-tester.js [--migration=file.sql] [--dry-run] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { createDatabaseClient, splitPostgreSQLStatements } from '../lib/supabase-connection.js';

/**
 * Migration test result
 * @typedef {Object} MigrationTestResult
 * @property {boolean} success - Whether migration test passed
 * @property {string} migrationFile - Migration file path
 * @property {boolean} applied - Whether migration was applied
 * @property {boolean} rolledBack - Whether rollback succeeded
 * @property {string[]} errors - List of errors
 * @property {Object} metadata - Test metadata
 */

/**
 * Migration file info
 * @typedef {Object} MigrationInfo
 * @property {string} filename - File name
 * @property {string} path - Full path
 * @property {string} content - SQL content
 * @property {string[]} statements - Parsed SQL statements
 * @property {Date} timestamp - Migration timestamp from filename
 */

export class MigrationTester {
  constructor(project = 'engineer', options = {}) {
    this.project = project;
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.migrationsDir = options.migrationsDir || 'database/migrations';
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
   * List all migration files
   * @returns {MigrationInfo[]} List of migration info objects
   */
  listMigrations() {
    const migrationsPath = path.resolve(this.migrationsDir);

    if (!fs.existsSync(migrationsPath)) {
      return [];
    }

    const files = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const filePath = path.join(migrationsPath, filename);
      const content = fs.readFileSync(filePath, 'utf-8');
      const statements = splitPostgreSQLStatements(content);

      // Parse timestamp from filename (format: YYYYMMDD_description.sql)
      const timestampMatch = filename.match(/^(\d{8})/);
      const timestamp = timestampMatch
        ? new Date(
            parseInt(timestampMatch[1].substring(0, 4)),
            parseInt(timestampMatch[1].substring(4, 6)) - 1,
            parseInt(timestampMatch[1].substring(6, 8))
          )
        : new Date(0);

      return {
        filename,
        path: filePath,
        content,
        statements,
        timestamp
      };
    });
  }

  /**
   * Get a specific migration by filename
   * @param {string} filename - Migration filename
   * @returns {MigrationInfo|null} Migration info or null if not found
   */
  getMigration(filename) {
    const migrations = this.listMigrations();
    return migrations.find(m => m.filename === filename || m.filename.includes(filename)) || null;
  }

  /**
   * Validate migration SQL syntax
   * @param {MigrationInfo} migration - Migration to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateSyntax(migration) {
    const errors = [];

    // Check for empty migration
    if (migration.statements.length === 0) {
      errors.push('Migration file is empty or contains no valid statements');
    }

    // Check for dangerous operations
    const dangerousPatterns = [
      { pattern: /DROP\s+DATABASE/i, message: 'Contains DROP DATABASE - extremely dangerous' },
      { pattern: /TRUNCATE\s+TABLE\s+(?!test_)/i, message: 'Contains TRUNCATE on non-test table' },
      { pattern: /DELETE\s+FROM\s+\w+\s*;/i, message: 'Contains DELETE without WHERE clause' }
    ];

    for (const { pattern, message } of dangerousPatterns) {
      if (pattern.test(migration.content)) {
        errors.push(message);
      }
    }

    // Check for missing transaction boundaries (warning only)
    const hasBegin = /BEGIN\s*;/i.test(migration.content);
    const hasCommit = /COMMIT\s*;/i.test(migration.content);

    if (hasBegin !== hasCommit) {
      errors.push('Unbalanced BEGIN/COMMIT statements');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Test a migration in a transaction (apply then rollback)
   * @param {MigrationInfo} migration - Migration to test
   * @returns {Promise<MigrationTestResult>}
   */
  async testMigration(migration) {
    const startTime = Date.now();
    const errors = [];
    let applied = false;
    let rolledBack = false;

    // Validate syntax first
    const syntaxResult = this.validateSyntax(migration);
    if (!syntaxResult.valid) {
      return {
        success: false,
        migrationFile: migration.filename,
        applied: false,
        rolledBack: false,
        errors: syntaxResult.errors,
        metadata: { duration: Date.now() - startTime }
      };
    }

    if (this.dryRun) {
      return {
        success: true,
        migrationFile: migration.filename,
        applied: false,
        rolledBack: false,
        errors: [],
        metadata: {
          dryRun: true,
          statementCount: migration.statements.length,
          duration: Date.now() - startTime
        }
      };
    }

    try {
      // Start transaction
      await this.client.query('BEGIN');

      // Get schema snapshot before
      const beforeSchema = await this.getSchemaSnapshot();

      // Apply migration statements
      for (let i = 0; i < migration.statements.length; i++) {
        const stmt = migration.statements[i].trim();
        if (!stmt) continue;

        // Skip transaction control statements (we manage our own transaction)
        if (/^(BEGIN|COMMIT|ROLLBACK)\s*;?\s*$/i.test(stmt)) {
          continue;
        }

        try {
          if (this.verbose) {
            console.log(`  Executing statement ${i + 1}/${migration.statements.length}`);
          }
          await this.client.query(stmt);
        } catch (stmtError) {
          errors.push(`Statement ${i + 1} failed: ${stmtError.message}`);
          throw stmtError;
        }
      }

      applied = true;

      // Get schema snapshot after
      const afterSchema = await this.getSchemaSnapshot();

      // Verify schema changed (unless migration is idempotent)
      const schemaChanged = JSON.stringify(beforeSchema) !== JSON.stringify(afterSchema);
      if (this.verbose) {
        console.log(`  Schema changed: ${schemaChanged}`);
      }

      // Rollback to verify we can undo
      await this.client.query('ROLLBACK');
      rolledBack = true;

      // Verify rollback restored original schema
      const afterRollbackSchema = await this.getSchemaSnapshot();
      const rollbackClean = JSON.stringify(beforeSchema) === JSON.stringify(afterRollbackSchema);

      if (!rollbackClean) {
        errors.push('Rollback did not restore original schema state');
      }

      return {
        success: errors.length === 0,
        migrationFile: migration.filename,
        applied,
        rolledBack,
        errors,
        metadata: {
          statementCount: migration.statements.length,
          schemaChanged,
          rollbackClean,
          duration: Date.now() - startTime
        }
      };

    } catch (error) {
      // Ensure we rollback on any error
      try {
        await this.client.query('ROLLBACK');
        rolledBack = true;
      } catch {
        // Rollback failed, connection may be broken
      }

      return {
        success: false,
        migrationFile: migration.filename,
        applied,
        rolledBack,
        errors: errors.length > 0 ? errors : [error.message],
        metadata: { duration: Date.now() - startTime }
      };
    }
  }

  /**
   * Get a simplified schema snapshot for comparison
   * @returns {Promise<Object>} Schema snapshot
   */
  async getSchemaSnapshot() {
    const result = await this.client.query(`
      SELECT
        t.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) as columns
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON t.table_name = c.table_name
        AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name
      ORDER BY t.table_name
    `);

    return result.rows.reduce((acc, row) => {
      acc[row.table_name] = row.columns;
      return acc;
    }, {});
  }

  /**
   * Test all migrations in order
   * @param {Object} options - Test options
   * @returns {Promise<{success: boolean, results: MigrationTestResult[]}>}
   */
  async testAllMigrations(options = {}) {
    const migrations = this.listMigrations();
    const results = [];
    let allSuccess = true;

    const limit = options.limit || migrations.length;
    const skip = options.skip || 0;

    console.log(`\nTesting ${Math.min(limit, migrations.length - skip)} migrations...\n`);

    for (let i = skip; i < Math.min(skip + limit, migrations.length); i++) {
      const migration = migrations[i];
      console.log(`[${i + 1}/${migrations.length}] Testing: ${migration.filename}`);

      const result = await this.testMigration(migration);
      results.push(result);

      if (result.success) {
        console.log('  \x1b[32mPASSED\x1b[0m');
      } else {
        console.log('  \x1b[31mFAILED\x1b[0m');
        result.errors.forEach(err => console.log(`    - ${err}`));
        allSuccess = false;
      }
    }

    return { success: allSuccess, results };
  }

  /**
   * Analyze migration for potential issues
   * @param {MigrationInfo} migration - Migration to analyze
   * @returns {Object} Analysis result
   */
  analyzeMigration(migration) {
    const analysis = {
      filename: migration.filename,
      statementCount: migration.statements.length,
      hasDDL: false,
      hasDML: false,
      hasFunction: false,
      hasTrigger: false,
      hasRLS: false,
      hasIndex: false,
      estimatedRisk: 'low'
    };

    const content = migration.content.toUpperCase();

    // Check statement types
    analysis.hasDDL = /CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE/i.test(content);
    analysis.hasDML = /INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM/i.test(content);
    analysis.hasFunction = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i.test(content);
    analysis.hasTrigger = /CREATE\s+(OR\s+REPLACE\s+)?TRIGGER/i.test(content);
    analysis.hasRLS = /CREATE\s+POLICY|ALTER\s+TABLE.*ENABLE\s+ROW\s+LEVEL/i.test(content);
    analysis.hasIndex = /CREATE\s+(UNIQUE\s+)?INDEX/i.test(content);

    // Calculate risk
    let riskScore = 0;
    if (analysis.hasDDL) riskScore += 2;
    if (analysis.hasDML) riskScore += 3;
    if (analysis.hasFunction) riskScore += 1;
    if (analysis.hasTrigger) riskScore += 2;
    if (/DROP\s+/i.test(content)) riskScore += 3;
    if (/ALTER\s+COLUMN/i.test(content)) riskScore += 2;

    if (riskScore >= 5) {
      analysis.estimatedRisk = 'high';
    } else if (riskScore >= 3) {
      analysis.estimatedRisk = 'medium';
    }

    return analysis;
  }

  /**
   * Log test result
   * @param {MigrationTestResult} result - Test result
   */
  logResult(result) {
    if (result.success) {
      console.log('\x1b[32m%s\x1b[0m', `Migration test PASSED: ${result.migrationFile}`);
    } else {
      console.log('\x1b[31m%s\x1b[0m', `Migration test FAILED: ${result.migrationFile}`);
      result.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (this.verbose && result.metadata) {
      console.log('\nMetadata:');
      console.log(JSON.stringify(result.metadata, null, 2));
    }
  }
}

/**
 * Get latest N migrations
 * @param {number} count - Number of migrations to get
 * @returns {MigrationInfo[]} Latest migrations
 */
export function getLatestMigrations(count = 5, migrationsDir = 'database/migrations') {
  const tester = new MigrationTester('engineer', { migrationsDir });
  const all = tester.listMigrations();
  return all.slice(-count);
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = process.argv.slice(2);
  const project = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'engineer';
  const migrationArg = args.find(a => a.startsWith('--migration='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');
  const analyze = args.includes('--analyze');
  const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0') || undefined;
  const latest = args.includes('--latest');

  const tester = new MigrationTester(project, { dryRun, verbose });

  async function main() {
    try {
      if (analyze) {
        // Just analyze migrations without connecting to DB
        const migrations = tester.listMigrations();
        console.log(`\nFound ${migrations.length} migrations\n`);

        for (const migration of migrations.slice(-10)) {
          const analysis = tester.analyzeMigration(migration);
          console.log(`${migration.filename}:`);
          console.log(`  Statements: ${analysis.statementCount}`);
          console.log(`  Risk: ${analysis.estimatedRisk}`);
          console.log(`  Types: ${[
            analysis.hasDDL && 'DDL',
            analysis.hasDML && 'DML',
            analysis.hasFunction && 'Function',
            analysis.hasTrigger && 'Trigger',
            analysis.hasRLS && 'RLS',
            analysis.hasIndex && 'Index'
          ].filter(Boolean).join(', ') || 'None'}`);
        }
        return;
      }

      await tester.connect();
      console.log(`\nMigration Tester - ${project} database`);
      console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE TEST'}\n`);

      if (migrationArg) {
        // Test specific migration
        const migration = tester.getMigration(migrationArg);
        if (!migration) {
          console.error(`Migration not found: ${migrationArg}`);
          process.exit(1);
        }
        const result = await tester.testMigration(migration);
        tester.logResult(result);
        process.exit(result.success ? 0 : 1);
      } else if (latest) {
        // Test latest 5 migrations
        const { success, results } = await tester.testAllMigrations({ limit: 5, skip: tester.listMigrations().length - 5 });
        const passed = results.filter(r => r.success).length;
        console.log(`\n${passed}/${results.length} migrations passed`);
        process.exit(success ? 0 : 1);
      } else {
        // Test all migrations (or limited set)
        const { success, results } = await tester.testAllMigrations({ limit });
        const passed = results.filter(r => r.success).length;
        console.log(`\n${passed}/${results.length} migrations passed`);
        process.exit(success ? 0 : 1);
      }
    } catch (error) {
      console.error('Migration test error:', error.message);
      process.exit(1);
    } finally {
      await tester.disconnect();
    }
  }

  main();
}
