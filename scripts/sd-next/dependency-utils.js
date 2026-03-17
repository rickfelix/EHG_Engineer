/**
 * Dependency utilities for SD-next
 * Handles parsing and checking of SD dependencies
 */

import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

/**
 * Parse dependencies from various formats
 * @param {string|Array|Object} dependencies - Raw dependencies
 * @returns {Array<{sd_id: string, resolved: boolean}>}
 */
export function parseDependencies(dependencies) {
  if (!dependencies) return [];

  let deps = [];
  if (typeof dependencies === 'string') {
    try {
      deps = JSON.parse(dependencies);
    } catch {
      return [];
    }
  } else if (Array.isArray(dependencies)) {
    deps = dependencies;
  }

  // Only return entries that are actual SD references (SD-XXX format)
  return deps
    .map(dep => {
      if (typeof dep === 'string') {
        const match = dep.match(/^(SD-[A-Z0-9-]+)/);
        if (match) {
          return { sd_id: match[1], resolved: false };
        }
        return null;
      }
      if (dep.sd_id && dep.sd_id.match(/^SD-[A-Z0-9-]+/)) {
        return { sd_id: dep.sd_id, resolved: false };
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Check if all dependencies are resolved (async)
 * @param {string|Array|Object} dependencies - Raw dependencies
 * @returns {Promise<boolean>}
 */
export async function checkDependenciesResolved(dependencies) {
  if (!dependencies) return true;

  const deps = parseDependencies(dependencies);
  if (deps.length === 0) return true;

  for (const dep of deps) {
    // Use sd_key with fallback to id (for UUID lookups)
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .or(`sd_key.eq.${dep.sd_id},id.eq.${dep.sd_id}`)
      .single();

    if (!sd || sd.status !== 'completed') {
      return false;
    }
  }

  return true;
}

/**
 * Sync version for display (placeholder - actual check happens async)
 */
export function checkDependenciesResolvedSync(_dependencies) {
  return true;
}
