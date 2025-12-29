/**
 * Supabase Client Factory with Singleton Pattern
 * LEO Protocol - SD-REFACTOR-QUICKWINS-001 (US-004)
 *
 * PROBLEM: 87+ createClient() calls scattered across codebase
 * SOLUTION: Centralized singleton factory with lazy initialization
 *
 * USAGE:
 *   import { getServiceClient, getAnonClient } from '../lib/supabase-factory.js';
 *
 *   // Get singleton service client (creates once, reuses thereafter)
 *   const supabase = await getServiceClient();
 *
 *   // Get singleton anon client
 *   const anonClient = await getAnonClient();
 *
 * MIGRATION PATTERN:
 *   // BEFORE (scattered, creates new client each call):
 *   const supabase = createClient(url, key);
 *
 *   // AFTER (singleton, reuses existing client):
 *   const supabase = await getServiceClient();
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Singleton instances
let _serviceClient = null;
let _anonClient = null;
let _ehgServiceClient = null;
let _ehgAnonClient = null;

// Validation state
let _validated = false;

/**
 * Validate required environment variables
 * @throws {Error} If required variables are missing
 */
function validateEnvironment() {
  if (_validated) return;

  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  _validated = true;
}

/**
 * Get URL for a project
 * @param {string} project - 'engineer' or 'ehg'
 * @returns {string} Supabase URL
 */
function getUrl(project = 'engineer') {
  if (project === 'ehg') {
    return process.env.EHG_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/**
 * Get service role key for a project
 * @param {string} project - 'engineer' or 'ehg'
 * @returns {string} Service role key
 */
function getServiceKey(project = 'engineer') {
  if (project === 'ehg') {
    return process.env.EHG_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  }
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Get anon key for a project
 * @param {string} project - 'engineer' or 'ehg'
 * @returns {string} Anon key
 */
function getAnonKey(project = 'engineer') {
  if (project === 'ehg') {
    return process.env.EHG_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

/**
 * Get singleton Supabase service client
 *
 * SECURITY: Uses SERVICE_ROLE_KEY - bypasses RLS
 * Use for server-side scripts and automation only
 *
 * @param {Object} options - Configuration options
 * @param {string} options.project - 'engineer' (default) or 'ehg'
 * @param {boolean} options.forceNew - Create new client instead of using singleton
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getServiceClient(options = {}) {
  const { project = 'engineer', forceNew = false } = options;

  validateEnvironment();

  // Check for existing singleton
  if (!forceNew) {
    if (project === 'ehg' && _ehgServiceClient) return _ehgServiceClient;
    if (project === 'engineer' && _serviceClient) return _serviceClient;
  }

  const url = getUrl(project);
  const key = getServiceKey(project);

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  // Store as singleton
  if (project === 'ehg') {
    _ehgServiceClient = client;
  } else {
    _serviceClient = client;
  }

  return client;
}

/**
 * Get singleton Supabase anon client
 *
 * SECURITY: Uses ANON_KEY - subject to RLS policies
 * Safe for client-side usage
 *
 * @param {Object} options - Configuration options
 * @param {string} options.project - 'engineer' (default) or 'ehg'
 * @param {boolean} options.forceNew - Create new client instead of using singleton
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getAnonClient(options = {}) {
  const { project = 'engineer', forceNew = false } = options;

  validateEnvironment();

  // Check for existing singleton
  if (!forceNew) {
    if (project === 'ehg' && _ehgAnonClient) return _ehgAnonClient;
    if (project === 'engineer' && _anonClient) return _anonClient;
  }

  const url = getUrl(project);
  const key = getAnonKey(project);

  if (!key) {
    throw new Error(`Anon key not found for project "${project}"`);
  }

  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  // Store as singleton
  if (project === 'ehg') {
    _ehgAnonClient = client;
  } else {
    _anonClient = client;
  }

  return client;
}

/**
 * Clear singleton instances (useful for testing)
 */
export function clearSingletons() {
  _serviceClient = null;
  _anonClient = null;
  _ehgServiceClient = null;
  _ehgAnonClient = null;
  _validated = false;
}

/**
 * Get singleton status (for debugging)
 * @returns {Object} Status of singleton instances
 */
export function getSingletonStatus() {
  return {
    serviceClient: !!_serviceClient,
    anonClient: !!_anonClient,
    ehgServiceClient: !!_ehgServiceClient,
    ehgAnonClient: !!_ehgAnonClient,
    validated: _validated
  };
}

// Backwards compatibility exports
export { getServiceClient as createSupabaseServiceClient };
export { getAnonClient as createSupabaseAnonClient };

/**
 * Synchronous factory (for compatibility with existing code)
 * Note: Uses environment variables directly, no async loading
 */
export function getServiceClientSync() {
  validateEnvironment();

  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  _serviceClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  return _serviceClient;
}

export function getAnonClientSync() {
  validateEnvironment();

  if (_anonClient) return _anonClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  _anonClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  return _anonClient;
}
