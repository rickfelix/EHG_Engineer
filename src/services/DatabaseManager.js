// DatabaseManager Service for Multi-Database Architecture
// Manages connections to multiple Supabase instances with full DDL capabilities

import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';

// node-pg-migrate will be dynamically imported when needed
let pgMigrate;

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
        // Use individual connection parameters instead of connection string to avoid IPv6 issues
        this.pools[appName] = new Pool({
          host: config.dbHost,
          port: config.dbPort || 5432,
          database: config.dbName || 'postgres',
          user: config.dbUser || 'postgres',
          password: config.dbPassword,
          ssl: { rejectUnauthorized: false }, // Required for Supabase
          max: 10, // Maximum number of clients in the pool
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });

        // Add error handler for the pool
        this.pools[appName].on('error', (err) => {
          console.error(`[POOL ERROR:${appName}]`, err.message);
        });

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
        dbHost: this.extractHostFromUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
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
    } catch (error) {
      // Config file not found or invalid, use env only
      console.log('📝 No additional database configs found, using environment only');
    }

    this.configs = envConfig;
    return envConfig;
  }

  /**
   * Extract host from Supabase URL
   */
  extractHostFromUrl(url) {
    if (!url) return null;
    // Convert https://xxx.supabase.co to db.xxx.supabase.co
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
    if (match) {
      return `db.${match[1]}.supabase.co`;
    }
    return null;
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
      const client = await this.currentPool.connect();
      try {
        await client.query('SELECT NOW()');
        console.log(`✅ Switched to database: ${appName}`);
      } finally {
        client.release();
      }
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
   * Run migrations programmatically
   * @param {string} direction - 'up' or 'down'
   * @param {number} count - Number of migrations to run
   */
  async runMigration(direction = 'up', count = Infinity) {
    if (!this.currentPool) {
      throw new Error('No active database. Call switchDatabase() first.');
    }

    // Dynamically import node-pg-migrate
    if (!pgMigrate) {
      try {
        const module = await import('node-pg-migrate');
        pgMigrate = module.default || module;
      } catch (error) {
        console.log('⚠️ node-pg-migrate not available, skipping migration functionality');
        return [];
      }
    }

    const client = await this.currentPool.connect();
    
    console.log(`🔄 Running migrations ${direction} on ${this.currentAppName}...`);

    try {
      const migrationsDir = path.join(process.cwd(), 'migrations');
      
      const options = {
        dbClient: client,
        direction: direction,
        dir: migrationsDir,
        migrationsTable: 'pgmigrations',
        singleTransaction: true,
        checkOrder: true,
        count: count,
        verbose: true,
        log: (msg) => console.log(`  ${msg}`),
        logger: {
          info: (msg) => console.log(`  ℹ️ ${msg}`),
          warn: (msg) => console.warn(`  ⚠️ ${msg}`),
          error: (msg) => console.error(`  ❌ ${msg}`),
        }
      };

      const completedMigrations = await pgMigrate(options);

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
      // Implementation of join logic would go here
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
      const connectionString = `postgresql://${config.dbUser || 'postgres'}:${config.dbPassword}@${config.dbHost}:${config.dbPort || 5432}/${config.dbName || 'postgres'}`;
      
      this.pools[appName] = new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

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
   * Gracefully shutdown all connections
   */
  async shutdown() {
    console.log('🔌 Shutting down DatabaseManager...');
    
    for (const [appName, pool] of Object.entries(this.pools)) {
      await pool.end();
      console.log(`  ✅ Closed pool: ${appName}`);
    }

    this.initialized = false;
    console.log('👋 DatabaseManager shutdown complete');
  }
}

// Export singleton instance
const databaseManager = new DatabaseManager();
export default databaseManager;