/**
 * DatabaseManager Service for Multi-Database Architecture
 * Manages connections to multiple Supabase instances with full DDL capabilities
 *
 * Refactored as part of SD-REFACTOR-2025-001-P1-005
 * Pool management extracted to pool-manager.js
 * Migration logic extracted to migration-runner.js
 *
 * @module DatabaseManager
 * @version 2.0.0
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// Import extracted modules
import {
  createManagedPool,
  createPoolFromConnectionString,
  attachPoolErrorHandler,
  testPoolConnection,
  getPoolStatus,
  closePools,
  extractHostFromSupabaseUrl,
  buildConnectionString,
  DEFAULT_POOL_CONFIG
} from './pool-manager.js';

import {
  runMigration as runMigrationImpl,
  migrateUp,
  migrateDown,
  getMigrationStatus,
  getPendingMigrationCount,
  isMigrationAvailable
} from './migration-runner.js';

// Re-export for backward compatibility
export { Pool } from 'pg';
export { DEFAULT_POOL_CONFIG } from './pool-manager.js';

export class DatabaseManager {
  constructor(databaseConfigurations = null) {
    this.configs = databaseConfigurations || {};
    this.pools = {};
    this.supabaseClients = {};
    this.currentAppName = null;
    this.currentPool = null;
    this.currentSupabaseClient = null;
    this.initialized = false;
  }

  /**
   * Initialize the DatabaseManager with configurations
   * @param {object} configurations - Database configurations object
   */
  async initialize(configurations = null) {
    if (configurations) {
      this.configs = configurations;
    }

    console.log('🔌 Initializing DatabaseManager...');

    for (const appName in this.configs) {
      const config = this.configs[appName];

      // Initialize PostgreSQL connection pool for DDL operations
      if (config.dbHost && config.dbPassword) {
        this.pools[appName] = createManagedPool(config, appName);
        console.log(`  ✅ PostgreSQL pool created for: ${appName}`);
      }

      // Initialize Supabase client for data operations
      if (config.projectUrl && config.anonKey) {
        this.supabaseClients[appName] = createClient(
          config.projectUrl,
          config.anonKey
        );
        console.log(`  ✅ Supabase client created for: ${appName}`);
      }
    }

    this.initialized = true;
    console.log('🚀 DatabaseManager initialized successfully');
  }

  /**
   * Load configurations from environment or config file
   */
  async loadConfigurations() {
    // Try to load from environment variables first
    const envConfig = {
      ehg_engineer: {
        appName: 'EHG Engineer Internal DB',
        purpose: 'LEO Protocol, validation rules, system state',
        projectUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        dbHost: extractHostFromSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
        dbUser: 'postgres',
        dbPassword: process.env.SUPABASE_DB_PASSWORD,
        dbPort: 5432,
        dbName: 'postgres'
      }
    };

    // Add additional databases from config file if exists
    try {
      const configPath = path.join(process.cwd(), 'config', 'databases.json');
      const configData = await fs.readFile(configPath, 'utf-8');
      const additionalConfigs = JSON.parse(configData);
      Object.assign(envConfig, additionalConfigs);
    } catch {
      // Config file not found or invalid, use env only
      console.log('📝 No additional database configs found, using environment only');
    }

    this.configs = envConfig;
    return envConfig;
  }

  /**
   * Extract host from Supabase URL (delegated to pool-manager)
   */
  extractHostFromUrl(url) {
    return extractHostFromSupabaseUrl(url);
  }

  /**
   * Switch to a different database context
   * @param {string} appName - The application/database name to switch to
   */
  async switchDatabase(appName) {
    if (!this.initialized) {
      throw new Error('DatabaseManager not initialized. Call initialize() first.');
    }

    if (!this.pools[appName] && !this.supabaseClients[appName]) {
      throw new Error(`No database configuration found for: ${appName}`);
    }

    this.currentAppName = appName;
    this.currentPool = this.pools[appName];
    this.currentSupabaseClient = this.supabaseClients[appName];

    // Test the connection
    if (this.currentPool) {
      await testPoolConnection(this.currentPool);
      console.log(`✅ Switched to database: ${appName}`);
    }

    return true;
  }

  /**
   * Execute DDL statements (CREATE TABLE, ALTER TABLE, etc.)
   * @param {string} ddlSql - The DDL SQL to execute
   * @param {boolean} useTransaction - Whether to wrap in a transaction
   */
  async executeDDL(ddlSql, useTransaction = true) {
    if (!this.currentPool) {
      throw new Error('No active database. Call switchDatabase() first.');
    }

    const client = await this.currentPool.connect();

    try {
      if (useTransaction) {
        await client.query('BEGIN');
      }

      console.log('🔨 Executing DDL...');
      const result = await client.query(ddlSql);

      if (useTransaction) {
        await client.query('COMMIT');
      }

      console.log('✅ DDL executed successfully');
      return result;
    } catch (error) {
      if (useTransaction) {
        await client.query('ROLLBACK');
      }
      console.error('❌ DDL execution failed:', error.message);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create tables programmatically
   * @param {string} tableName - Name of the table
   * @param {object} schema - Table schema definition
   */
  async createTable(tableName, schema) {
    const columns = Object.entries(schema)
      .map(([columnName, definition]) => {
        return `${columnName} ${definition}`;
      })
      .join(',\n  ');

    const ddl = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        ${columns}
      );
    `;

    return await this.executeDDL(ddl);
  }

  /**
   * Run migrations programmatically (delegated to migration-runner)
   * @param {string} direction - 'up' or 'down'
   * @param {number} count - Number of migrations to run
   */
  async runMigration(direction = 'up', count = Infinity) {
    if (!this.currentPool) {
      throw new Error('No active database. Call switchDatabase() first.');
    }

    return runMigrationImpl(this.currentPool, this.currentAppName, direction, count);
  }

  /**
   * Execute a query using the current pool (for DDL or complex queries)
   * @param {string} query - SQL query to execute
   * @param {array} params - Query parameters
   */
  async query(query, params = []) {
    if (!this.currentPool) {
      throw new Error('No active database. Call switchDatabase() first.');
    }

    try {
      const result = await this.currentPool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Query error:', error.message);
      throw error;
    }
  }

  /**
   * Execute a query using Supabase client (respects RLS)
   * @param {string} table - Table name
   * @param {object} options - Query options
   */
  async supabaseQuery(table, options = {}) {
    if (!this.currentSupabaseClient) {
      throw new Error('No active Supabase client. Call switchDatabase() first.');
    }

    let query = this.currentSupabaseClient.from(table);

    // Apply query options
    if (options.select) query = query.select(options.select);
    if (options.filter) {
      Object.entries(options.filter).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }
    if (options.order) query = query.order(options.order);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabase query error: ${error.message}`);
    }

    return data;
  }

  /**
   * Perform cross-database query (join data from multiple databases)
   * @param {object} queryPlan - Query execution plan
   */
  async crossDatabaseQuery(queryPlan) {
    const results = {};

    // Execute queries on each database
    for (const [dbName, dbQuery] of Object.entries(queryPlan)) {
      await this.switchDatabase(dbName);
      results[dbName] = await this.query(dbQuery.sql, dbQuery.params || []);
    }

    // Perform application-level join if specified
    if (queryPlan.join) {
      console.log('Cross-database join results:', results);
    }

    return results;
  }

  /**
   * Add a new database configuration at runtime
   * @param {string} appName - Application/database name
   * @param {object} config - Database configuration
   */
  async addDatabase(appName, config) {
    this.configs[appName] = config;

    // Initialize pool if PostgreSQL config provided
    if (config.dbHost && config.dbPassword) {
      const connectionString = buildConnectionString(config);
      this.pools[appName] = createPoolFromConnectionString(connectionString);
      attachPoolErrorHandler(this.pools[appName], appName);
      console.log(`✅ Added PostgreSQL pool for: ${appName}`);
    }

    // Initialize Supabase client if config provided
    if (config.projectUrl && config.anonKey) {
      this.supabaseClients[appName] = createClient(
        config.projectUrl,
        config.anonKey
      );
      console.log(`✅ Added Supabase client for: ${appName}`);
    }
  }

  /**
   * Get pool status for current database
   */
  getPoolStatus() {
    if (!this.currentPool) {
      return null;
    }
    return getPoolStatus(this.currentPool);
  }

  /**
   * Get schema information for current database
   */
  async getSchema(tableName = null) {
    const query = tableName
      ? `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = 'public'`
      : `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;

    const params = tableName ? [tableName] : [];
    return await this.query(query, params);
  }

  /**
   * Check if a table exists
   * @param {string} tableName - Name of the table to check
   */
  async tableExists(tableName) {
    const result = await this.query(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = $1
      )`,
      [tableName]
    );
    return result[0]?.exists || false;
  }

  /**
   * Get migration status for current database
   */
  async getMigrationStatus() {
    if (!this.currentPool) {
      throw new Error('No active database. Call switchDatabase() first.');
    }
    return getMigrationStatus(this.currentPool);
  }

  /**
   * Check if migration functionality is available
   */
  async isMigrationAvailable() {
    return isMigrationAvailable();
  }

  /**
   * Gracefully shutdown all connections (delegated to pool-manager)
   */
  async shutdown() {
    console.log('🔌 Shutting down DatabaseManager...');
    await closePools(this.pools);
    this.initialized = false;
    console.log('👋 DatabaseManager shutdown complete');
  }
}

// Export singleton instance
const databaseManager = new DatabaseManager();
export default databaseManager;

// Also export migration utilities for direct access
export { migrateUp, migrateDown, getMigrationStatus, getPendingMigrationCount };
export * from './pool-manager.js';
