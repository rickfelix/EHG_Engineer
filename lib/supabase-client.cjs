/**
 * Supabase Client Factory (CommonJS wrapper)
 *
 * CJS-compatible re-export of lib/supabase-client.js for .cjs scripts.
 * Mirrors the ESM factory: createSupabaseClient() and createSupabaseServiceClient().
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function createSupabaseServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL is required');
  }
  if (!supabaseKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for service client');
  }

  return createClient(supabaseUrl, supabaseKey);
}

module.exports = { createSupabaseClient, createSupabaseServiceClient };
