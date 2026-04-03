/**
 * Schema Cache Module
 * SD-LEO-ORCH-SELF-HEALING-DATABASE-001-B
 *
 * Caches database schema metadata from information_schema.columns
 * with TTL-based invalidation per table. Used by schema-preflight.cjs.
 */

'use strict';

const path = require('path');

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Per-table cache entry: { columns: Map, timestamp: number }
 * @type {Map<string, {columns: Map<string, object>, timestamp: number}>}
 */
const tableCache = new Map();
let cacheTtlMs = DEFAULT_TTL_MS;
let defaultClient = null;

/**
 * Get or create the default Supabase client.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getDefaultClient() {
  if (defaultClient) return defaultClient;
  const { createClient } = require('@supabase/supabase-js');
  // Try multiple .env locations (handles worktrees where CWD differs from repo root)
  const candidates = [
    path.resolve(__dirname, '..', '.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'), // worktree → main repo
  ];
  for (const envPath of candidates) {
    require('dotenv').config({ path: envPath });
    if (process.env.SUPABASE_URL) break;
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  defaultClient = createClient(url, key);
  return defaultClient;
}

/**
 * Fetch schema for a specific table via the get_schema_columns RPC.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} tableName
 * @returns {Promise<Map<string, object>>}
 */
async function fetchTableSchema(client, tableName) {
  const { data, error } = await client.rpc('get_schema_columns', {
    p_table_name: tableName,
  });

  if (error) {
    throw new Error(`Schema fetch for ${tableName} failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null; // Table doesn't exist
  }

  const columns = new Map();
  for (const row of data) {
    columns.set(row.column_name, {
      data_type: row.data_type,
      udt_name: row.udt_name,
      is_nullable: row.is_nullable,
      column_default: row.column_default,
    });
  }
  return columns;
}

/**
 * Get schema for a specific table with TTL caching.
 * @param {string} tableName
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @param {object} [options]
 * @param {number} [options.ttlMs] - Cache TTL in milliseconds
 * @returns {Promise<Map<string, object>|null>} Column map or null if table doesn't exist
 */
async function getTableSchema(tableName, supabaseClient, options = {}) {
  const ttl = options.ttlMs || cacheTtlMs;
  const now = Date.now();
  const cached = tableCache.get(tableName);

  if (cached && (now - cached.timestamp) < ttl) {
    return cached.columns;
  }

  const client = supabaseClient || getDefaultClient();
  const columns = await fetchTableSchema(client, tableName);

  if (columns) {
    tableCache.set(tableName, { columns, timestamp: now });
  }

  return columns;
}

/**
 * Get full schema snapshot (all cached tables).
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @returns {Promise<Map<string, Map<string, object>>>}
 */
async function getSchemaSnapshot(supabaseClient) {
  const result = new Map();
  for (const [tableName, entry] of tableCache) {
    result.set(tableName, entry.columns);
  }
  return result;
}

/**
 * Flush cache for a specific table or all tables.
 * @param {string} [tableName] - If provided, flush only this table
 */
function flushCache(tableName) {
  if (tableName) {
    tableCache.delete(tableName);
  } else {
    tableCache.clear();
  }
}

/**
 * Set the default TTL for cache invalidation.
 * @param {number} ttlMs
 */
function setDefaultTtl(ttlMs) {
  cacheTtlMs = ttlMs;
}

/**
 * Get cache metadata for diagnostics.
 * @returns {{size: number, tables: string[], ttl: number}}
 */
function getCacheStats() {
  return {
    size: tableCache.size,
    tables: Array.from(tableCache.keys()),
    ttl: cacheTtlMs,
  };
}

module.exports = {
  getTableSchema,
  getSchemaSnapshot,
  flushCache,
  setDefaultTtl,
  getCacheStats,
};
