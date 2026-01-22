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

    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: `
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `
    });

    if (error) {
      console.warn('Failed to load known tables:', error.message);
      return knownTablesCache || [];
    }

    const tables = (data || []).map(row => row.table_name.toLowerCase());
    setKnownTablesCache(tables, now);

    return tables;
  } catch (err) {
    console.warn('Error loading known tables:', err.message);
    return knownTablesCache || [];
  }
}
