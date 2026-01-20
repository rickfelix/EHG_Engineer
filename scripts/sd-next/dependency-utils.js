/**
 * Dependency utilities for SD-next
 * Handles parsing and checking of SD dependencies
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('status')
      .eq('legacy_id', dep.sd_id)
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
