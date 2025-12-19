#!/usr/bin/env node

/**
 * Supabase Client Factory
 * Creates and configures Supabase clients for EHG_Engineer applications
 *
 * SECURITY: Separate client patterns for browser vs server contexts
 * - createSupabaseClient(): Uses anon key ONLY (safe for client-side)
 * - createSupabaseServiceClient(): Uses service_role key (server-side ONLY)
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (main .env only, skip .env.uat to avoid expired keys)
dotenv.config({ path: '.env' });

/**
 * Create Supabase client with ANON key only
 *
 * SECURITY: This client uses ONLY the anon key and is safe for client-side usage.
 * Never use this for operations requiring elevated permissions.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client with anon permissions
 * @throws {Error} If required environment variables are missing
 */
export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Create Supabase client with SERVICE_ROLE key for server-side operations
 *
 * SECURITY WARNING: This client bypasses Row Level Security (RLS).
 * Use ONLY in server-side scripts, NEVER expose to client bundles.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient} Supabase client with admin permissions
 * @throws {Error} If required environment variables are missing
 */
export function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fetch a Strategic Directive by identifier
 * Handles both new (id column) and legacy (sd_key column) lookup patterns
 *
 * NOTE: Uses service client as this is a server-side operation
 *
 * @param {string} identifier - SD identifier (e.g., 'SD-BACKEND-003')
 * @returns {Promise<{data: object|null, error: object|null}>}
 *
 * @example
 * const { data, error } = await fetchSD('SD-BACKEND-003');
 * if (data) console.log(data.title);
 */
export async function fetchSD(identifier) {
  const supabase = createSupabaseServiceClient();

  // Try id column first (newer SDs like SD-BACKEND-003, SD-RECONNECT-008)
  let { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('id', identifier)
    .maybeSingle();

  // If found, return immediately
  if (data || error) {
    return { data, error };
  }

  // Fallback to sd_key column for legacy SDs
  return await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', identifier)
    .maybeSingle();
}

// Default export for convenience (anon client - safe for general use)
export default createSupabaseClient;
