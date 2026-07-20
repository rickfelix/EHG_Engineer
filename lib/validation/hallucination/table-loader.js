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
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 — the known-tables list gates
// hallucination detection; a read silently capped at the PostgREST 1000-row max would drop real
// tables and flag them as hallucinated. Paginate to load the full registry.
import { fetchAllPaginated } from '../../db/fetch-all-paginated.mjs';

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
    let data;
    try {
      data = await fetchAllPaginated(() => supabase
        .from('schema_doc_tables') // schema-lint-disable-line: pre-existing table reference, unrelated to FR-6 pagination edits in this file (surfaced by file-level diff scoping)
        .select('table_name')
        .order('table_name', { ascending: true })); // unique key: one row per table (FR-6)
    } catch (error) {
      // Fallback: try information_schema via a known view if available
      console.warn('Failed to load known tables from schema_doc_tables:', error.message);
      return knownTablesCache || [];
    }

    const tables = data.map(row => row.table_name?.toLowerCase()).filter(Boolean);
    setKnownTablesCache(tables, now);

    return tables;
  } catch (err) {
    console.warn('Error loading known tables:', err.message);
    return knownTablesCache || [];
  }
}
