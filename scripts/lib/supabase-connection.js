#!/usr/bin/env node
/**
 * 🗄️ Supabase Database Connection Utility
 *
 * LESSONS LEARNED (2025-01-09):
 * 1. Connection format: postgresql://postgres.PROJECT_ID:PASSWORD@aws-1-us-east-1.pooler.supabase.com:5432/postgres
 * 2. DO NOT use ?sslmode=require parameter
 * 3. SSL config: { rejectUnauthorized: false }
 * 4. Region: aws-1 (Transaction Mode, port 5432)
 * 5. Password can be reset in Supabase Dashboard > Project Settings > Database
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../..', '.env') });

const { Client } = pg;

/**
 * Database configuration for different projects
 *
 * NOTE: As of SD-ARCH-EHG-006 (2025-11-30), both EHG and EHG_Engineer
 * now use the CONSOLIDATED database (dedlbzhpgkmetvhbkyzq).
 * The old EHG database (liapbndqlqxdcgpwntbv) is deprecated.
 */
export const DB_CONFIGS = {
  // EHG Application (customer-facing) - NOW USES CONSOLIDATED DATABASE
  ehg: {
    projectId: 'dedlbzhpgkmetvhbkyzq',  // MIGRATED from liapbndqlqxdcgpwntbv (SD-ARCH-EHG-006)
    region: 'aws-1-us-east-1',
    port: 5432,
    database: 'postgres',
    description: 'EHG Consolidated Database (Business App + Governance)',
  },

  // EHG_Engineer Application (management dashboard)
  engineer: {
    projectId: 'dedlbzhpgkmetvhbkyzq',
    region: 'aws-1-us-east-1',
    port: 5432,
    database: 'postgres',
    description: 'EHG Consolidated Database (LEO Protocol + Business App)',
  },

  // DEPRECATED: Old EHG database - kept for reference only
  ehg_legacy: {
    projectId: 'liapbndqlqxdcgpwntbv',
    region: 'aws-0-us-east-1',
    port: 5432,
    database: 'postgres',
    description: 'DEPRECATED: Old EHG Database (migrated to consolidated)',
    deprecated: true,
    deprecatedAt: '2025-11-30',
    migratedTo: 'dedlbzhpgkmetvhbkyzq',
  }
};

/**
 * Build Supabase connection string
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @param {string} password - Database password
 * @returns {string} Connection string
 */
export function buildConnectionString(projectKey, password) {
  const config = DB_CONFIGS[projectKey];
  if (!config) {
    throw new Error(`Unknown project: ${projectKey}. Use 'ehg' or 'engineer'`);
  }

  // CRITICAL: Do NOT add ?sslmode=require - causes "self-signed certificate" errors
  return `postgresql://postgres.${config.projectId}:${encodeURIComponent(password)}@${config.region}.pooler.supabase.com:${config.port}/${config.database}`;
}

/**
 * Create a connected PostgreSQL client
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @param {Object} options - Connection options
 * @returns {Promise<pg.Client>} Connected client
 */
export async function createDatabaseClient(projectKey = 'ehg', options = {}) {
  const config = DB_CONFIGS[projectKey];

  // Get password from environment or options
  const password = options.password ||
                   process.env.SUPABASE_DB_PASSWORD ||
                   process.env.EHG_DB_PASSWORD ||
                   'Fl!M32DaM00n!1'; // Fallback

  const connStr = options.connectionString || buildConnectionString(projectKey, password);

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }, // Required for Supabase
    connectionTimeoutMillis: options.timeout || 10000,
  });

  // Add error handlers
  if (options.onError) {
    client.on('error', options.onError);
  }

  if (options.onEnd) {
    client.on('end', options.onEnd);
  }

  // Connect
  await client.connect();

  // Verify connection
  if (options.verify !== false) {
    const result = await client.query('SELECT current_database(), current_user, version();');
    if (options.verbose) {
      console.info(`✅ Connected to: ${result.rows[0].current_database}`);
      console.info(`   User: ${result.rows[0].current_user}`);
      console.info(`   PostgreSQL: ${result.rows[0].version.substring(0, 50)}...`);
    }
  }

  return client;
}

/**
 * Test database connection
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @returns {Promise<boolean>} Success
 */
export async function testConnection(projectKey = 'ehg') {
  const config = DB_CONFIGS[projectKey];
  console.info(`\n🔧 Testing connection to: ${config.description}`);
  console.info(`   Project: ${config.projectId}`);
  console.info(`   Region: ${config.region}\n`);

  try {
    const client = await createDatabaseClient(projectKey, {
      verify: true,
      verbose: true
    });
    await client.end();
    console.info('✅ Connection test successful!\n');
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Verify database password is correct');
    console.error('   2. Wait 1-2 minutes if you just reset the password');
    console.error('   3. Check Supabase Dashboard > Project Settings > Database');
    console.error('   4. Ensure no firewall blocking aws-1-us-east-1.pooler.supabase.com:5432\n');
    return false;
  }
}

/**
 * Get Supabase Service Role Key from environment
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @returns {string} Service role key
 * @throws {Error} If service role key not found
 */
export function getServiceRoleKey(projectKey = 'engineer') {
  const key = projectKey === 'ehg'
    ? process.env.EHG_SUPABASE_SERVICE_ROLE_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error(
      `SERVICE_ROLE_KEY not found for project "${projectKey}". ` +
      `Set ${projectKey === 'ehg' ? 'EHG_SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'} in .env file.`
    );
  }

  return key;
}

/**
 * Get Supabase Anon Key from environment
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @returns {string} Anon key
 * @throws {Error} If anon key not found
 */
export function getAnonKey(projectKey = 'engineer') {
  const key = projectKey === 'ehg'
    ? process.env.EHG_SUPABASE_ANON_KEY
    : process.env.SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error(
      `ANON_KEY not found for project "${projectKey}". ` +
      `Set ${projectKey === 'ehg' ? 'EHG_SUPABASE_ANON_KEY' : 'SUPABASE_ANON_KEY'} in .env file.`
    );
  }

  return key;
}

/**
 * Get Supabase URL from environment
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @returns {string} Supabase URL
 * @throws {Error} If URL not found
 */
export function getSupabaseUrl(projectKey = 'engineer') {
  const config = DB_CONFIGS[projectKey];
  const url = projectKey === 'ehg'
    ? process.env.EHG_SUPABASE_URL
    : process.env.SUPABASE_URL;

  if (!url) {
    // Fallback to constructing from project ID
    return `https://${config.projectId}.supabase.co`;
  }

  return url;
}

/**
 * Create Supabase client with SERVICE_ROLE_KEY
 *
 * USE THIS WHEN:
 * - Reading protected data (handoffs, sub-agent results)
 * - Server-side operations requiring authenticated access
 * - Bypassing RLS policies (admin operations)
 *
 * SECURITY WARNING:
 * - SERVICE_ROLE_KEY bypasses ALL RLS policies
 * - NEVER expose to client-side code
 * - Only use in server-side scripts
 *
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @param {Object} options - Client options
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>} Supabase client with service role
 */
export async function createSupabaseServiceClient(projectKey = 'engineer', options = {}) {
  // Lazy import to avoid loading in environments without @supabase/supabase-js
  const { createClient } = await import('@supabase/supabase-js');

  const url = getSupabaseUrl(projectKey);
  const key = getServiceRoleKey(projectKey);

  if (options.verbose) {
    console.info('✅ Creating Supabase client with SERVICE_ROLE_KEY');
    console.info(`   Project: ${projectKey}`);
    console.info(`   URL: ${url}`);
    console.info('   Role: service_role (bypasses RLS)');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    ...options.clientOptions
  });
}

/**
 * Create Supabase client with ANON_KEY
 *
 * USE THIS WHEN:
 * - Public read operations
 * - Client-side operations
 * - Operations respecting RLS policies
 *
 * @param {string} projectKey - 'ehg' or 'engineer'
 * @param {Object} options - Client options
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>} Supabase client with anon key
 */
export async function createSupabaseAnonClient(projectKey = 'engineer', options = {}) {
  // Lazy import to avoid loading in environments without @supabase/supabase-js
  const { createClient } = await import('@supabase/supabase-js');

  const url = getSupabaseUrl(projectKey);
  const key = getAnonKey(projectKey);

  if (options.verbose) {
    console.info('✅ Creating Supabase client with ANON_KEY');
    console.info(`   Project: ${projectKey}`);
    console.info(`   URL: ${url}`);
    console.info('   Role: anon (subject to RLS)');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    ...options.clientOptions
  });
}

/**
 * PostgreSQL statement splitter that respects $$ delimiters
 * @param {string} sql - SQL content
 * @returns {string[]} Array of statements
 */
export function splitPostgreSQLStatements(sql) {
  let inDollarQuote = false;
  let current = '';
  const statements = [];

  for (let i = 0; i < sql.length; i++) {
    // Check for $$ delimiter (used in function bodies)
    if (sql[i] === '$' && sql[i+1] === '$') {
      inDollarQuote = !inDollarQuote;
      current += '$$';
      i++; // Skip next $
    }
    // Semicolon only terminates if not in dollar quote
    else if (sql[i] === ';' && !inDollarQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        // Remove comment-only lines
        const lines = trimmed.split('\n').filter(line => {
          const l = line.trim();
          return l.length > 0 && !l.startsWith('--');
        });
        if (lines.length > 0) {
          statements.push(lines.join('\n'));
        }
      }
      current = '';
    }
    else {
      current += sql[i];
    }
  }

  // Add final statement if exists
  if (current.trim().length > 0) {
    statements.push(current.trim());
  }

  return statements;
}

// If run directly, test the connection
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectKey = process.argv[2] || 'ehg';
  testConnection(projectKey)
    .then(success => process.exit(success ? 0 : 1))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
