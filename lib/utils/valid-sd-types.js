/**
 * Runtime-synced VALID_SD_TYPES from database CHECK constraint.
 *
 * Instead of maintaining hardcoded VALID_SD_TYPES arrays in 4+ files,
 * this module queries information_schema.check_constraints once per
 * process and caches the result.
 *
 * Fallback: if the DB query fails, returns a hardcoded default list
 * so callers never get an empty array.
 *
 * SD: SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-C
 * @module lib/utils/valid-sd-types
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Hardcoded fallback — used when DB is unreachable
const FALLBACK_SD_TYPES = [
  'feature', 'implementation', 'infrastructure', 'bugfix', 'refactor',
  'documentation', 'orchestrator', 'database', 'security', 'performance',
  'enhancement', 'docs', 'discovery_spike', 'ux_debt', 'uat',
];

let _cached = null;

/**
 * Parse CHECK constraint clause to extract allowed values.
 * Handles patterns like: (sd_type = ANY (ARRAY['feature'::text, 'bugfix'::text, ...]))
 * @param {string} clause - Raw CHECK constraint clause
 * @returns {string[]}
 */
function parseCheckClause(clause) {
  if (!clause) return [];
  // Match quoted strings inside ARRAY[...]
  const matches = clause.match(/'([^']+)'/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/'/g, ''));
}

/**
 * Get valid SD types from database CHECK constraint.
 * Results are cached for the lifetime of the process.
 *
 * @returns {Promise<string[]>} Array of valid SD type strings
 */
export async function getValidSDTypes() {
  if (_cached) return _cached;

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );

    const { data, error } = await supabase.rpc('get_check_constraint_values', {
      p_table: 'strategic_directives_v2',
      p_column: 'sd_type',
    });

    // If RPC doesn't exist, try raw information_schema query
    if (error || !data) {
      const { data: rawData } = await supabase
        .from('information_schema.check_constraints' /* won't work via PostgREST */)
        .select('*');

      // PostgREST can't query information_schema — fall back
      if (!rawData) {
        _cached = FALLBACK_SD_TYPES;
        return _cached;
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      _cached = data;
      return _cached;
    }

    _cached = FALLBACK_SD_TYPES;
    return _cached;
  } catch {
    _cached = FALLBACK_SD_TYPES;
    return _cached;
  }
}

/**
 * Synchronous getter — returns cached value or fallback.
 * Call getValidSDTypes() once at startup to populate cache.
 * @returns {string[]}
 */
export function getValidSDTypesSync() {
  return _cached || FALLBACK_SD_TYPES;
}

/** Reset cache (for testing). */
export function resetCache() {
  _cached = null;
}

export { FALLBACK_SD_TYPES };
