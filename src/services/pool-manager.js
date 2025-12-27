/**
 * Pool Manager Module
 * Extracted from DatabaseManager.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P1-005: DatabaseManager Refactoring
 *
 * Contains PostgreSQL pool initialization and management logic.
 * @module PoolManager
 * @version 1.0.0
 */

import { Pool } from 'pg';

// =============================================================================
// POOL CONFIGURATION DEFAULTS
// =============================================================================

/**
 * Default pool configuration values
 */
export const DEFAULT_POOL_CONFIG = {
  max: 10,                      // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,     // How long a client can be idle before removal
  connectionTimeoutMillis: 5000, // How long to wait for connection
  ssl: { rejectUnauthorized: false } // Required for Supabase
};

// =============================================================================
// POOL FACTORY
// =============================================================================

/**
 * Create a PostgreSQL connection pool with standard configuration
 * @param {object} config - Database configuration
 * @param {string} config.dbHost - Database host
 * @param {number} config.dbPort - Database port (default: 5432)
 * @param {string} config.dbName - Database name (default: 'postgres')
 * @param {string} config.dbUser - Database user (default: 'postgres')
 * @param {string} config.dbPassword - Database password
 * @param {object} options - Optional pool overrides
 * @returns {Pool} Configured pg Pool instance
 */
export function createPool(config, options = {}) {
  if (!config.dbHost || !config.dbPassword) {
    throw new Error('createPool requires dbHost and dbPassword');
  }

  const poolConfig = {
    host: config.dbHost,
    port: config.dbPort || 5432,
    database: config.dbName || 'postgres',
    user: config.dbUser || 'postgres',
    password: config.dbPassword,
    ssl: options.ssl || DEFAULT_POOL_CONFIG.ssl,
    max: options.max || DEFAULT_POOL_CONFIG.max,
    idleTimeoutMillis: options.idleTimeoutMillis || DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis || DEFAULT_POOL_CONFIG.connectionTimeoutMillis
  };

  return new Pool(poolConfig);
}

/**
 * Create a pool from a connection string
 * @param {string} connectionString - PostgreSQL connection string
 * @param {object} options - Optional pool overrides
 * @returns {Pool} Configured pg Pool instance
 */
export function createPoolFromConnectionString(connectionString, options = {}) {
  return new Pool({
    connectionString,
    ssl: options.ssl || DEFAULT_POOL_CONFIG.ssl,
    max: options.max || DEFAULT_POOL_CONFIG.max,
    idleTimeoutMillis: options.idleTimeoutMillis || DEFAULT_POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: options.connectionTimeoutMillis || DEFAULT_POOL_CONFIG.connectionTimeoutMillis
  });
}

// =============================================================================
// POOL ERROR HANDLING
// =============================================================================

/**
 * Attach standard error handler to a pool
 * @param {Pool} pool - pg Pool instance
 * @param {string} appName - Application name for logging
 * @param {function} customHandler - Optional custom error handler
 */
export function attachPoolErrorHandler(pool, appName, customHandler = null) {
  pool.on('error', (err) => {
    console.error(`[POOL ERROR:${appName}]`, err.message);
    if (customHandler) {
      customHandler(err, appName);
    }
  });
}

/**
 * Create a pool with error handler attached
 * @param {object} config - Database configuration
 * @param {string} appName - Application name for logging
 * @param {object} options - Optional pool and handler options
 * @returns {Pool} Configured pg Pool instance with error handler
 */
export function createManagedPool(config, appName, options = {}) {
  const pool = createPool(config, options);
  attachPoolErrorHandler(pool, appName, options.customErrorHandler);
  return pool;
}

// =============================================================================
// POOL HEALTH CHECK
// =============================================================================

/**
 * Test pool connection health
 * @param {Pool} pool - pg Pool instance
 * @returns {Promise<boolean>} True if healthy, throws on error
 */
export async function testPoolConnection(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    return true;
  } finally {
    client.release();
  }
}

/**
 * Get pool status information
 * @param {Pool} pool - pg Pool instance
 * @returns {object} Pool status metrics
 */
export function getPoolStatus(pool) {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}

// =============================================================================
// POOL LIFECYCLE
// =============================================================================

/**
 * Gracefully close a pool
 * @param {Pool} pool - pg Pool instance
 * @param {string} appName - Application name for logging
 */
export async function closePool(pool, appName) {
  await pool.end();
  console.log(`  ✅ Closed pool: ${appName}`);
}

/**
 * Gracefully close multiple pools
 * @param {object} pools - Map of appName to Pool instance
 */
export async function closePools(pools) {
  for (const [appName, pool] of Object.entries(pools)) {
    await closePool(pool, appName);
  }
}

// =============================================================================
// URL UTILITIES
// =============================================================================

/**
 * Extract database host from Supabase URL
 * @param {string} url - Supabase project URL
 * @returns {string|null} Database host or null
 */
export function extractHostFromSupabaseUrl(url) {
  if (!url) return null;
  // Convert https://xxx.supabase.co to db.xxx.supabase.co
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  if (match) {
    return `db.${match[1]}.supabase.co`;
  }
  return null;
}

/**
 * Build connection string from config
 * @param {object} config - Database configuration
 * @returns {string} PostgreSQL connection string
 */
export function buildConnectionString(config) {
  const user = config.dbUser || 'postgres';
  const password = config.dbPassword;
  const host = config.dbHost;
  const port = config.dbPort || 5432;
  const database = config.dbName || 'postgres';

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}
