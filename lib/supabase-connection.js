#!/usr/bin/env node

/**
 * Supabase PostgreSQL Connection Utilities
 *
 * Provides direct PostgreSQL connection to Supabase databases for operations
 * that require bypassing RLS policies or need transaction support.
 *
 * Usage:
 *   import { createDatabaseClient } from './lib/supabase-connection.js';
 *   const client = await createDatabaseClient('engineer');
 *   await client.query('SELECT * FROM strategic_directives_v2 LIMIT 1');
 *   await client.end();
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

/**
 * Get SSL configuration based on environment
 * SD-SEC-CONFIG-SECURITY-001: Environment-aware SSL verification
 *
 * - Production: SSL verification enabled (rejectUnauthorized: true)
 * - Development: SSL verification can be disabled via DISABLE_SSL_VERIFY=true
 *
 * @returns {object} SSL configuration for pg client
 */
function getSSLConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  const disableSSLVerify = process.env.DISABLE_SSL_VERIFY === 'true';

  // In production, always verify SSL certificates
  if (isProduction) {
    return { rejectUnauthorized: true };
  }

  // In development, allow disabling SSL verification (e.g., for local proxies)
  if (disableSSLVerify) {
    console.warn('⚠️  SSL verification disabled (DISABLE_SSL_VERIFY=true). Do not use in production.');
    return { rejectUnauthorized: false };
  }

  // Default: enable SSL verification
  return { rejectUnauthorized: true };
}

/**
 * Database connection configurations
 */
const DATABASE_CONFIGS = {
  engineer: {
    url: process.env.SUPABASE_POOLER_URL,
    description: 'EHG_Engineer management database'
  },
  app: {
    url: process.env.EHG_POOLER_URL,
    description: 'EHG application database'
  }
};

/**
 * Create a PostgreSQL client connected to specified Supabase database
 *
 * @param {string} database - Database identifier ('engineer' or 'app')
 * @param {object} options - Connection options
 * @param {boolean} options.verify - Whether to verify connection (default: true)
 * @returns {Promise<pg.Client>} Connected PostgreSQL client
 *
 * @example
 * const client = await createDatabaseClient('engineer');
 * const result = await client.query('SELECT NOW()');
 * await client.end();
 */
export async function createDatabaseClient(database = 'engineer', options = {}) {
  const { verify = true } = options;

  const config = DATABASE_CONFIGS[database];
  if (!config) {
    throw new Error(`Unknown database: ${database}. Valid options: ${Object.keys(DATABASE_CONFIGS).join(', ')}`);
  }

  if (!config.url) {
    throw new Error(`Database URL not configured for ${database}. Check environment variables.`);
  }

  const client = new Client({
    connectionString: config.url,
    ssl: getSSLConfig()
  });

  try {
    await client.connect();

    if (verify) {
      // Verify connection with simple query
      await client.query('SELECT NOW()');
    }

    return client;
  } catch (error) {
    // Clean up on error
    try {
      await client.end();
    } catch (_endError) {
      // Ignore cleanup errors
    }
    throw new Error(`Failed to connect to ${database} database: ${error.message}`);
  }
}

/**
 * Split PostgreSQL statements for execution
 * Handles multi-statement SQL files by splitting on semicolons
 * while preserving statements inside function bodies
 *
 * @param {string} sql - SQL content to split
 * @returns {string[]} Array of individual SQL statements
 */
export function splitPostgreSQLStatements(sql) {
  const statements = [];
  let current = '';
  let inFunction = false;
  let dollarQuoteTag = null;

  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith('--')) {
      continue;
    }

    // Detect function start
    if (trimmed.match(/CREATE (OR REPLACE )?FUNCTION/i)) {
      inFunction = true;
    }

    // Detect dollar quote start/end ($$, $body$, etc)
    const dollarMatch = line.match(/\$([a-zA-Z_]*)\$/);
    if (dollarMatch) {
      if (dollarQuoteTag === null) {
        dollarQuoteTag = dollarMatch[0];
      } else if (dollarMatch[0] === dollarQuoteTag) {
        dollarQuoteTag = null;
      }
    }

    current += line + '\n';

    // End of statement: semicolon outside function body
    if (trimmed.endsWith(';') && !inFunction && dollarQuoteTag === null) {
      const statement = current.trim();
      if (statement && !statement.startsWith('--')) {
        statements.push(statement);
      }
      current = '';
    }

    // Detect function end
    if (trimmed.match(/END;?\s*\$\$?\s*LANGUAGE/i)) {
      inFunction = false;
    }
  }

  // Add any remaining content
  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements.filter(s => s.length > 0);
}

/**
 * Execute a SQL file against the database
 *
 * @param {pg.Client} client - Connected database client
 * @param {string} sqlContent - SQL content to execute
 * @param {object} options - Execution options
 * @param {boolean} options.transaction - Wrap in transaction (default: false)
 * @returns {Promise<object>} Execution results
 */
export async function executeSQLFile(client, sqlContent, options = {}) {
  const { transaction = false } = options;

  const statements = splitPostgreSQLStatements(sqlContent);
  const results = [];

  try {
    if (transaction) {
      await client.query('BEGIN');
    }

    for (const statement of statements) {
      try {
        const result = await client.query(statement);
        results.push({
          success: true,
          statement: statement.substring(0, 100) + (statement.length > 100 ? '...' : ''),
          rowCount: result.rowCount
        });
      } catch (error) {
        results.push({
          success: false,
          statement: statement.substring(0, 100) + (statement.length > 100 ? '...' : ''),
          error: error.message
        });

        if (transaction) {
          throw error; // Will trigger rollback
        }
      }
    }

    if (transaction) {
      await client.query('COMMIT');
    }

    return {
      success: true,
      totalStatements: statements.length,
      results
    };
  } catch (error) {
    if (transaction) {
      await client.query('ROLLBACK');
    }

    return {
      success: false,
      totalStatements: statements.length,
      results,
      error: error.message
    };
  }
}

/**
 * Query helper with automatic error handling
 *
 * @param {pg.Client} client - Connected database client
 * @param {string} query - SQL query
 * @param {array} params - Query parameters
 * @returns {Promise<object>} Query results
 */
export async function safeQuery(client, query, params = []) {
  try {
    const result = await client.query(query, params);
    return {
      success: true,
      rows: result.rows,
      rowCount: result.rowCount
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

export default createDatabaseClient;
