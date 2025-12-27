/**
 * Migration Runner Module
 * Extracted from DatabaseManager.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P1-005: DatabaseManager Refactoring
 *
 * Contains database migration logic using node-pg-migrate.
 * @module MigrationRunner
 * @version 1.0.0
 */

import path from 'path';

// Lazy-loaded node-pg-migrate module
let pgMigrate = null;

// =============================================================================
// MIGRATION CONFIGURATION
// =============================================================================

/**
 * Default migration options
 */
export const DEFAULT_MIGRATION_OPTIONS = {
  migrationsTable: 'pgmigrations',
  singleTransaction: true,
  checkOrder: true,
  verbose: true
};

/**
 * Create standard migration logger
 * @returns {object} Logger object with info, warn, error methods
 */
export function createMigrationLogger() {
  return {
    info: (msg) => console.log(`  ℹ️ ${msg}`),
    warn: (msg) => console.warn(`  ⚠️ ${msg}`),
    error: (msg) => console.error(`  ❌ ${msg}`)
  };
}

// =============================================================================
// MIGRATION RUNNER
// =============================================================================

/**
 * Load node-pg-migrate dynamically
 * @returns {Promise<function|null>} Migration function or null if not available
 */
async function loadPgMigrate() {
  if (pgMigrate) return pgMigrate;

  try {
    const module = await import('node-pg-migrate');
    pgMigrate = module.default || module;
    return pgMigrate;
  } catch (error) {
    console.log('⚠️ node-pg-migrate not available, skipping migration functionality');
    return null;
  }
}

/**
 * Run database migrations
 * @param {Pool} pool - pg Pool instance
 * @param {string} appName - Application name for logging
 * @param {string} direction - 'up' or 'down'
 * @param {number} count - Number of migrations to run (default: Infinity)
 * @param {object} options - Optional migration configuration overrides
 * @returns {Promise<Array>} Completed migrations
 */
export async function runMigration(pool, appName, direction = 'up', count = Infinity, options = {}) {
  const migrate = await loadPgMigrate();
  if (!migrate) {
    return [];
  }

  const client = await pool.connect();

  console.log(`🔄 Running migrations ${direction} on ${appName}...`);

  try {
    const migrationsDir = options.migrationsDir || path.join(process.cwd(), 'migrations');

    const migrationOptions = {
      dbClient: client,
      direction: direction,
      dir: migrationsDir,
      migrationsTable: options.migrationsTable || DEFAULT_MIGRATION_OPTIONS.migrationsTable,
      singleTransaction: options.singleTransaction ?? DEFAULT_MIGRATION_OPTIONS.singleTransaction,
      checkOrder: options.checkOrder ?? DEFAULT_MIGRATION_OPTIONS.checkOrder,
      count: count,
      verbose: options.verbose ?? DEFAULT_MIGRATION_OPTIONS.verbose,
      log: options.log || ((msg) => console.log(`  ${msg}`)),
      logger: options.logger || createMigrationLogger()
    };

    const completedMigrations = await migrate(migrationOptions);

    if (completedMigrations.length > 0) {
      console.log(`✅ Completed ${completedMigrations.length} migrations:`);
      completedMigrations.forEach(m => console.log(`  - ${m.name}`));
    } else {
      console.log('ℹ️ No pending migrations');
    }

    return completedMigrations;
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Run migrations up (apply pending migrations)
 * @param {Pool} pool - pg Pool instance
 * @param {string} appName - Application name for logging
 * @param {number} count - Number of migrations to apply
 * @param {object} options - Optional migration configuration
 * @returns {Promise<Array>} Applied migrations
 */
export async function migrateUp(pool, appName, count = Infinity, options = {}) {
  return runMigration(pool, appName, 'up', count, options);
}

/**
 * Run migrations down (rollback migrations)
 * @param {Pool} pool - pg Pool instance
 * @param {string} appName - Application name for logging
 * @param {number} count - Number of migrations to rollback
 * @param {object} options - Optional migration configuration
 * @returns {Promise<Array>} Rolled back migrations
 */
export async function migrateDown(pool, appName, count = 1, options = {}) {
  return runMigration(pool, appName, 'down', count, options);
}

// =============================================================================
// MIGRATION UTILITIES
// =============================================================================

/**
 * Check if node-pg-migrate is available
 * @returns {Promise<boolean>} True if available
 */
export async function isMigrationAvailable() {
  const migrate = await loadPgMigrate();
  return migrate !== null;
}

/**
 * Get migration status
 * @param {Pool} pool - pg Pool instance
 * @param {string} migrationsTable - Name of migrations table (default: 'pgmigrations')
 * @returns {Promise<Array>} List of applied migrations
 */
export async function getMigrationStatus(pool, migrationsTable = 'pgmigrations') {
  const client = await pool.connect();
  try {
    // Check if migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )
    `, [migrationsTable]);

    if (!tableCheck.rows[0]?.exists) {
      return [];
    }

    // Get applied migrations
    const result = await client.query(`
      SELECT id, name, run_on
      FROM ${migrationsTable}
      ORDER BY run_on DESC
    `);

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Get count of pending migrations
 * @param {Pool} pool - pg Pool instance
 * @param {string} migrationsDir - Directory containing migration files
 * @param {string} migrationsTable - Name of migrations table
 * @returns {Promise<number>} Count of pending migrations
 */
export async function getPendingMigrationCount(pool, migrationsDir = null, migrationsTable = 'pgmigrations') {
  const dir = migrationsDir || path.join(process.cwd(), 'migrations');
  const applied = await getMigrationStatus(pool, migrationsTable);
  const appliedNames = new Set(applied.map(m => m.name));

  try {
    const fs = await import('fs/promises');
    const files = await fs.readdir(dir);
    const migrationFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.sql'));

    let pendingCount = 0;
    for (const file of migrationFiles) {
      // Extract migration name from filename (e.g., "001_create_users.js" -> "001_create_users")
      const migrationName = file.replace(/\.(js|sql)$/, '');
      if (!appliedNames.has(migrationName)) {
        pendingCount++;
      }
    }

    return pendingCount;
  } catch (error) {
    console.warn('⚠️ Could not read migrations directory:', error.message);
    return 0;
  }
}
