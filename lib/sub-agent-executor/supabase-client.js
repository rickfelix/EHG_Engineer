/**
 * Supabase Client Management
 * Singleton pattern for service role client
 *
 * Extracted from sub-agent-executor.js for modularity
 * SD-LEO-REFACTOR-SUBAGENT-EXEC-001
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

// Initialize Supabase client with SERVICE ROLE KEY
// This is required because automation scripts need to bypass RLS policies
let supabaseClient = null;

/**
 * Get or create Supabase service client
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getSupabaseClient() {
  if (!supabaseClient) {
    supabaseClient = await createSupabaseServiceClient('engineer', {
      verbose: false
    });
  }
  return supabaseClient;
}
