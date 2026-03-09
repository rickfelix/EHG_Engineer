import { createClient } from '@supabase/supabase-js';

/**
 * Create an authenticated Supabase client from environment variables.
 * Expects SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY).
 */
export function createVentureClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
    console.error('Set them in your environment or .env file.');
    process.exit(1);
  }

  return createClient(url, key);
}

/**
 * Get the base URL for Edge Functions from the Supabase URL.
 */
export function getEdgeFunctionUrl(supabaseUrl, functionName) {
  return `${supabaseUrl}/functions/v1/${functionName}`;
}
