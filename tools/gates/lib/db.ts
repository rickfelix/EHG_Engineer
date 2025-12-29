/**
 * Database connection utility for gate scripts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let dbClient: SupabaseClient | null = null;

/**
 * Get or create Supabase client
 */
export async function getDb(): Promise<SupabaseClient> {
  if (dbClient) return dbClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('❌ Missing Supabase credentials');
    console.error('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(2);
  }

  dbClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  // Test connection
  const { error } = await dbClient.from('leo_validation_rules').select('count').limit(1);
  if (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(2);
  }

  return dbClient;
}

/**
 * Execute a query and handle errors consistently
 */
export async function query<T = unknown>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null; count?: number }>,
): Promise<T> {
  const { data, error } = await queryFn();
  if (error) {
    console.error('❌ Query failed:', error.message);
    throw error;
  }
  return data as T;
}