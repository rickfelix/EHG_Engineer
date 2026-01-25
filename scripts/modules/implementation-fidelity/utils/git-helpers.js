/**
 * Git Helper Functions for Implementation Fidelity Validation
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Cache for SD search terms to avoid repeated database queries
const searchTermsCache = new Map();

/**
 * Get search terms for an SD (UUID + sd_key)
 * SD-VENTURE-STAGE0-UI-001: Commits use sd_key (formerly legacy_id), not UUID
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id, use sd_key (column dropped 2026-01-24)
 *
 * @param {string} sd_id - Strategic Directive UUID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string[]>} - Array of search terms [uuid, sd_key]
 */
export async function getSDSearchTerms(sd_id, supabase) {
  // Check cache first
  if (searchTermsCache.has(sd_id)) {
    return searchTermsCache.get(sd_id);
  }

  const searchTerms = [sd_id];

  try {
    if (supabase) {
      // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id, use sd_key (column dropped 2026-01-24)
      const { data: sd } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key')
        .eq('id', sd_id)
        .single();
      if (sd?.sd_key) {
        searchTerms.push(sd.sd_key);
      }
    }
  } catch (_e) {
    // Continue with UUID only if can't get sd_key
  }

  // Cache the result
  searchTermsCache.set(sd_id, searchTerms);
  return searchTerms;
}

/**
 * Execute git log search for any of the SD search terms
 * Returns the combined results for UUID and sd_key
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id references (column dropped 2026-01-24)
 *
 * @param {string} cmdTemplate - Git command template with ${TERM} placeholder
 * @param {string[]} searchTerms - Array of search terms
 * @param {Object} options - execAsync options
 * @returns {Promise<string>} - Combined stdout from all searches
 */
export async function gitLogForSD(cmdTemplate, searchTerms, options = {}) {
  const results = [];

  for (const term of searchTerms) {
    try {
      const cmd = cmdTemplate.replace(/\$\{TERM\}/g, term);
      const { stdout } = await execAsync(cmd, options);
      if (stdout.trim()) {
        results.push(stdout.trim());
      }
    } catch (_e) {
      // Continue to next term
    }
  }

  // Return unique lines combined from all searches
  const allLines = results.join('\n').split('\n').filter(Boolean);
  return [...new Set(allLines)].join('\n');
}

/**
 * Clear search terms cache
 */
export function clearSearchTermsCache() {
  searchTermsCache.clear();
}
