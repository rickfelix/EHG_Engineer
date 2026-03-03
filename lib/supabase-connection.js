/**
 * Supabase Connection — Compatibility Re-export
 *
 * This module re-exports from the canonical scripts/lib/supabase-connection.js.
 * All new code should import directly from 'scripts/lib/supabase-connection.js'.
 *
 * @deprecated Import from '../scripts/lib/supabase-connection.js' instead
 */

export {
  createDatabaseClient,
  createSupabaseServiceClient,
  createSupabaseAnonClient,
  getSupabaseUrl,
  getServiceRoleKey,
  getAnonKey,
  buildConnectionString,
  splitPostgreSQLStatements
} from '../scripts/lib/supabase-connection.js';

export { createDatabaseClient as default } from '../scripts/lib/supabase-connection.js';
