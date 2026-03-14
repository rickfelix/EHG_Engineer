/**
 * Health Config — loads DB-backed threshold configuration for each dimension
 * SD: SD-LEO-INFRA-DEAD-CODE-SCANNER-001
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Load configuration for a specific dimension or all enabled dimensions
 * @param {string} [dimension] - specific dimension name, or null for all enabled
 * @returns {Promise<Object|Object[]>}
 */
export async function loadConfig(dimension) {
  let query = supabase.from('codebase_health_config').select('*');

  if (dimension) {
    query = query.eq('dimension', dimension).single();
  } else {
    query = query.eq('enabled', true);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load health config: ${error.message}`);
  return data;
}

/**
 * Check if a score breaches thresholds
 * @param {number} score - the dimension score (0-100)
 * @param {Object} config - the dimension config
 * @returns {{ level: 'ok'|'warning'|'critical', breached: boolean }}
 */
export function evaluateThreshold(score, config) {
  if (score <= config.threshold_critical) {
    return { level: 'critical', breached: true };
  }
  if (score <= config.threshold_warning) {
    return { level: 'warning', breached: true };
  }
  return { level: 'ok', breached: false };
}

/**
 * Check consecutive breach count for a dimension
 * @param {string} dimension
 * @param {Object} config
 * @returns {Promise<number>} consecutive breach count
 */
export async function getConsecutiveBreaches(dimension, config) {
  const { data: snapshots } = await supabase
    .from('codebase_health_snapshots')
    .select('score')
    .eq('dimension', dimension)
    .order('scanned_at', { ascending: false })
    .limit(config.min_occurrences + 1);

  if (!snapshots || snapshots.length === 0) return 0;

  let count = 0;
  for (const snap of snapshots) {
    const { breached } = evaluateThreshold(snap.score, config);
    if (breached) count++;
    else break;
  }
  return count;
}

export { supabase };
