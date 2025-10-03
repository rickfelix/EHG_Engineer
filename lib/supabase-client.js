#!/usr/bin/env node

/**
 * Supabase Client Factory
 * Creates and configures Supabase client for EHG_Engineer applications
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables (main .env only, skip .env.uat to avoid expired keys)
dotenv.config({ path: '.env' });

/**
 * Create and return configured Supabase client
 */
export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required');
  }

  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Fetch a Strategic Directive by identifier
 * Handles both new (id column) and legacy (sd_key column) lookup patterns
 *
 * @param {string} identifier - SD identifier (e.g., 'SD-BACKEND-003')
 * @returns {Promise<{data: object|null, error: object|null}>}
 *
 * @example
 * const { data, error } = await fetchSD('SD-BACKEND-003');
 * if (data) console.log(data.title);
 */
export async function fetchSD(identifier) {
  const supabase = createSupabaseClient();

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

// Default export for convenience
export default createSupabaseClient;