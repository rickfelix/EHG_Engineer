/**
 * ClientFactory - Centralized Factory for Service Clients
 * LEO Protocol - Industrial Hardening
 *
 * Purpose: Provides singleton access to service clients to:
 * 1. Eliminate duplicate lazy initialization patterns
 * 2. Ensure consistent configuration across all modules
 * 3. Enable easy testing through reset methods
 * 4. Reduce boilerplate code
 *
 * Usage:
 *   import { getSupabaseClient, getSupabaseServiceClient } from '../factories/client-factory.js';
 *
 *   const supabase = await getSupabaseClient();
 *   const serviceSupabase = await getSupabaseServiceClient('engineer');
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

// Singleton instances
let _clients = {
  supabase: null,        // Default Supabase client (engineer service role)
  supabaseByApp: {},     // App-specific clients (keyed by app name)
};

// Default configuration
const DEFAULT_CONFIG = {
  app: 'engineer',
  options: { verbose: false }
};

/**
 * Get the default Supabase service client (engineer app)
 * This is the most commonly used client across the codebase.
 *
 * @param {Object} options - Optional configuration overrides
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getSupabaseClient(options = {}) {
  if (!_clients.supabase) {
    _clients.supabase = await createSupabaseServiceClient(
      DEFAULT_CONFIG.app,
      { ...DEFAULT_CONFIG.options, ...options }
    );
  }
  return _clients.supabase;
}

/**
 * Get a Supabase service client for a specific app
 * Use this when you need app-specific configurations.
 *
 * @param {string} app - The app name (e.g., 'engineer', 'app', 'platform')
 * @param {Object} options - Optional configuration
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getSupabaseServiceClient(app, options = {}) {
  const cacheKey = `${app}:${JSON.stringify(options)}`;

  if (!_clients.supabaseByApp[cacheKey]) {
    _clients.supabaseByApp[cacheKey] = await createSupabaseServiceClient(
      app,
      { ...DEFAULT_CONFIG.options, ...options }
    );
  }
  return _clients.supabaseByApp[cacheKey];
}

/**
 * Reset all clients (useful for testing)
 * After calling this, the next getClient call will create new instances.
 */
export function resetClients() {
  _clients = {
    supabase: null,
    supabaseByApp: {}
  };
}

/**
 * Get client status (for debugging/monitoring)
 *
 * @returns {Object} Status of all clients
 */
export function getClientStatus() {
  return {
    supabase: {
      initialized: !!_clients.supabase
    },
    supabaseByApp: Object.keys(_clients.supabaseByApp).map(key => ({
      key,
      initialized: !!_clients.supabaseByApp[key]
    }))
  };
}
