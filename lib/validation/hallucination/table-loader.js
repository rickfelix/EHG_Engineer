/**
 * Hallucination Detection - Database Table Loading
 * Load known tables from Supabase for DB validation level
 */

import {
  knownTablesCache,
  knownTablesCacheTime,
  CACHE_TTL_MS,
  setKnownTablesCache
} from './constants.js';

/**
 * Load known database tables from Supabase
 * Results are cached for 5 minutes
 */
export async function loadKnownTables(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && knownTablesCache && knownTablesCacheTime && (now - knownTablesCacheTime) < CACHE_TTL_MS) {
    return knownTablesCache;
  }

  try {
    const { createSupabaseServiceClient } = await import('../../../scripts/lib/supabase-connection.js');
    const supabase = await createSupabaseServiceClient('engineer', { verbose: false });

    // Query schema_doc_tables (populated by schema documentation) as a lightweight alternative
    // to exec_sql RPC which does not exist in Supabase
    const { data, error } = await supabase
      .from('schema_doc_tables')
      .select('table_name')
      .order('table_name');

    if (error) {
      // Fallback: try information_schema via a known view if available
      console.warn('Failed to load known tables from schema_doc_tables:', error.message);
      return knownTablesCache || [];
    }

    const tables = (data || []).map(row => row.table_name?.toLowerCase()).filter(Boolean);
    setKnownTablesCache(tables, now);

    return tables;
  } catch (err) {
    console.warn('Error loading known tables:', err.message);
    return knownTablesCache || [];
  }
}
