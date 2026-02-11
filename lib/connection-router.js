/**
 * Connection Strategy Router
 * SD-LEO-INFRA-CONNECTION-STRATEGY-ROUTER-001
 *
 * Deterministic connection method selection using database-driven ranked strategies.
 * Eliminates trial-and-error connection probing in sub-agents.
 *
 * USAGE:
 *   import { getConnectionStrategy, getSupabaseConnection } from '../lib/connection-router.js';
 *
 *   // Get best available strategy for a service
 *   const strategy = await getConnectionStrategy('supabase');
 *   // → { method_name: 'pooler_url', connection_type: 'pg_client', config: {...} }
 *
 *   // Shortcut: get a connected Supabase client via best method
 *   const client = await getSupabaseConnection();
 */

import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

// In-memory cache: { serviceName: { strategies, fetchedAt } }
const _cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get a Supabase service client for querying strategies.
 * Lazy-loaded to avoid circular dependency with supabase-factory.
 */
async function _getQueryClient() {
  const { getServiceClient } = await import('./supabase-factory.js');
  return getServiceClient();
}

/**
 * Fetch ranked strategies for a service from the database.
 * Uses cache to avoid repeated queries within TTL.
 *
 * @param {string} serviceName - e.g., 'supabase', 'ollama', 'anthropic'
 * @returns {Promise<Array>} Ordered strategies (rank ASC, enabled only)
 */
async function _fetchStrategies(serviceName) {
  const cached = _cache.get(serviceName);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.strategies;
  }

  try {
    const supabase = await _getQueryClient();
    const { data, error } = await supabase
      .from('v_active_connection_strategies')
      .select('*')
      .eq('service_name', serviceName)
      .order('rank', { ascending: true });

    if (error) throw error;

    const strategies = data || [];
    _cache.set(serviceName, { strategies, fetchedAt: Date.now() });
    return strategies;
  } catch (err) {
    // If DB is unreachable, return cached (even if stale) or empty
    if (cached) return cached.strategies;
    return [];
  }
}

/**
 * Check if the required environment variable for a strategy is available.
 *
 * @param {Object} strategy - A connection_strategies row
 * @returns {boolean} True if env var is set (or none required)
 */
function _isStrategyAvailable(strategy) {
  if (!strategy.env_var_required) return true;
  return !!process.env[strategy.env_var_required];
}

/**
 * Log a connection selection to the audit table.
 *
 * @param {Object} params
 * @param {string} params.serviceName
 * @param {string} params.methodSelected
 * @param {number} params.methodRank
 * @param {Array} params.methodsSkipped
 * @param {number} params.durationMs
 * @param {string} params.caller
 * @param {boolean} params.success
 * @param {string} [params.errorMessage]
 */
async function _logSelection(params) {
  try {
    const supabase = await _getQueryClient();
    await supabase.from('connection_selection_log').insert({
      service_name: params.serviceName,
      method_selected: params.methodSelected,
      method_rank: params.methodRank,
      methods_skipped: params.methodsSkipped || [],
      selection_duration_ms: params.durationMs,
      caller: params.caller || null,
      success: params.success,
      error_message: params.errorMessage || null,
    });
  } catch (_err) {
    // Logging failure should never block connection selection
  }
}

// ────────────────────────────────────────────────────────────
// Hardcoded fallback strategies (used when DB is unavailable)
// ────────────────────────────────────────────────────────────

const FALLBACK_STRATEGIES = {
  supabase: [
    { method_name: 'pooler_url', rank: 1, env_var_required: 'SUPABASE_POOLER_URL', connection_type: 'pg_client', config: { ssl: { rejectUnauthorized: false }, timeout_ms: 10000 } },
    { method_name: 'service_client', rank: 2, env_var_required: 'SUPABASE_SERVICE_ROLE_KEY', connection_type: 'supabase_service', config: { auto_refresh: false } },
    { method_name: 'direct_password', rank: 3, env_var_required: 'SUPABASE_DB_PASSWORD', connection_type: 'pg_client', config: { ssl: { rejectUnauthorized: false }, timeout_ms: 10000, region: 'aws-1-us-east-1' } },
  ],
  ollama: [
    { method_name: 'local_http', rank: 1, env_var_required: null, connection_type: 'http', config: { base_url: 'http://localhost:11434', timeout_ms: 30000 } },
  ],
  anthropic: [
    { method_name: 'api_key', rank: 1, env_var_required: 'OPENAI_API_KEY', connection_type: 'http', config: { timeout_ms: 60000 } },
  ],
};

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Select the best available connection strategy for a service.
 *
 * Walks the ranked list, checks env var availability, and returns
 * the first viable strategy. Logs the selection for observability.
 *
 * @param {string} serviceName - Service to connect to ('supabase', 'ollama', 'anthropic')
 * @param {Object} [options]
 * @param {string} [options.caller] - Identifier for the calling module (for logging)
 * @param {boolean} [options.skipLog=false] - Skip audit logging
 * @returns {Promise<Object|null>} Selected strategy or null if none available
 */
export async function getConnectionStrategy(serviceName, options = {}) {
  const start = Date.now();
  const skipped = [];

  let strategies = await _fetchStrategies(serviceName);

  // Fallback to hardcoded if DB returned nothing
  if (strategies.length === 0 && FALLBACK_STRATEGIES[serviceName]) {
    strategies = FALLBACK_STRATEGIES[serviceName];
  }

  for (const strategy of strategies) {
    if (_isStrategyAvailable(strategy)) {
      const durationMs = Date.now() - start;

      if (!options.skipLog) {
        _logSelection({
          serviceName,
          methodSelected: strategy.method_name,
          methodRank: strategy.rank,
          methodsSkipped: skipped,
          durationMs,
          caller: options.caller,
          success: true,
        });
      }

      return {
        method_name: strategy.method_name,
        rank: strategy.rank,
        connection_type: strategy.connection_type,
        config: typeof strategy.config === 'string' ? JSON.parse(strategy.config) : (strategy.config || {}),
        env_var_required: strategy.env_var_required,
        description: strategy.description,
      };
    }

    skipped.push({
      method: strategy.method_name,
      reason: `env var ${strategy.env_var_required} not set`,
    });
  }

  // No strategy available
  const durationMs = Date.now() - start;
  if (!options.skipLog) {
    _logSelection({
      serviceName,
      methodSelected: 'none',
      methodRank: null,
      methodsSkipped: skipped,
      durationMs,
      caller: options.caller,
      success: false,
      errorMessage: `No available connection method for service "${serviceName}"`,
    });
  }

  return null;
}

/**
 * Get all available strategies for a service (not just the best).
 *
 * @param {string} serviceName
 * @returns {Promise<Array>} All strategies with availability status
 */
export async function listStrategies(serviceName) {
  let strategies = await _fetchStrategies(serviceName);
  if (strategies.length === 0 && FALLBACK_STRATEGIES[serviceName]) {
    strategies = FALLBACK_STRATEGIES[serviceName];
  }

  return strategies.map(s => ({
    method_name: s.method_name,
    rank: s.rank,
    connection_type: s.connection_type,
    available: _isStrategyAvailable(s),
    env_var_required: s.env_var_required,
    description: s.description,
  }));
}

/**
 * Get a connected Supabase client using the best available method.
 *
 * Routes through ranked strategies:
 *   1. pooler_url → pg.Client with SUPABASE_POOLER_URL
 *   2. service_client → @supabase/supabase-js with service role key
 *   3. direct_password → pg.Client with password
 *
 * @param {Object} [options]
 * @param {string} [options.caller] - Calling module identifier
 * @param {boolean} [options.preferPg=false] - Prefer pg.Client even if service_client ranks higher
 * @returns {Promise<{client: Object, type: string, method: string}>}
 * @throws {Error} If no connection method is available
 */
export async function getSupabaseConnection(options = {}) {
  const strategy = await getConnectionStrategy('supabase', {
    caller: options.caller,
  });

  if (!strategy) {
    throw new Error(
      'No Supabase connection method available. ' +
      'Set one of: SUPABASE_POOLER_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_DB_PASSWORD'
    );
  }

  if (strategy.connection_type === 'pg_client') {
    const pg = await import('pg');
    const { Client } = pg.default || pg;

    let connectionString;
    if (strategy.method_name === 'pooler_url') {
      connectionString = process.env.SUPABASE_POOLER_URL;
    } else if (strategy.method_name === 'direct_password') {
      const { buildConnectionString } = await import('../scripts/lib/supabase-connection.js');
      connectionString = buildConnectionString('engineer', process.env.SUPABASE_DB_PASSWORD);
    }

    const client = new Client({
      connectionString,
      ssl: strategy.config.ssl || { rejectUnauthorized: false },
      connectionTimeoutMillis: strategy.config.timeout_ms || 10000,
    });

    await client.connect();
    return { client, type: 'pg_client', method: strategy.method_name };
  }

  if (strategy.connection_type === 'supabase_service') {
    const { getServiceClient } = await import('./supabase-factory.js');
    const client = await getServiceClient();
    return { client, type: 'supabase_service', method: strategy.method_name };
  }

  throw new Error(`Unsupported connection type: ${strategy.connection_type}`);
}

/**
 * Clear the strategy cache. Useful after DB changes or in tests.
 */
export function clearCache() {
  _cache.clear();
}

/**
 * Get cache status (for debugging/monitoring).
 * @returns {Object} Cache entries with ages
 */
export function getCacheStatus() {
  const status = {};
  for (const [key, val] of _cache.entries()) {
    status[key] = {
      strategyCount: val.strategies.length,
      ageMs: Date.now() - val.fetchedAt,
      stale: (Date.now() - val.fetchedAt) >= CACHE_TTL_MS,
    };
  }
  return status;
}
