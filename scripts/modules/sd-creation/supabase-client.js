/**
 * Shared Supabase client for SD creation scripts
 * Provides a configured client instance for database operations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Get configured Supabase client for SD operations
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001: this used to silently fall back to
  // SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY when the service-role key was
  // missing -- a caller expecting service-role access would silently get an
  // anon-permissioned client, and an RLS-filtered read would then return an empty
  // result with no error. Fail loud instead: require the service-role key explicitly.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  return createClient(url, key);
}

/**
 * Create a new Supabase client with explicit credentials
 * @param {string} url - Supabase project URL
 * @param {string} key - Supabase API key
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function createSupabaseClient(url, key) {
  return createClient(url, key);
}

// SD-LEO-FIX-CLIENT-FACTORY-FALLBACK-001: the default export used to eagerly call
// getSupabaseClient() at module load and export the result -- a default-import
// consumer named the local binding whatever they liked (e.g. createServiceClient),
// silently getting whichever client getSupabaseClient() happened to construct
// (previously anon-fallback-prone; see the fix above). Removed: a default import
// now fails LOUD at link time instead of silently succeeding. This file has
// in-directory importers (./index.js's `export *`, ./sd-operations.js) that use
// the NAMED exports only -- SECURITY review (EXEC-TO-PLAN) found and this SD fixed
// a real regression where index.js:19 re-exported the now-removed default under
// the name `supabase`; that re-export is deleted, index.js's `export *` already
// surfaces getSupabaseClient/createSupabaseClient by name. Callers needing a
// client must use the named getSupabaseClient() or createSupabaseClient(url, key)
// exports explicitly.
