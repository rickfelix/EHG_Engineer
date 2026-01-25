/**
 * Repository Detection for Implementation Fidelity Validation
 * Part of SD-LEO-REFACTOR-IMPL-FIDELITY-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSDSearchTerms } from './git-helpers.js';

const execAsync = promisify(exec);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../../..');
export const EHG_ROOT = path.resolve(__dirname, '../../../../../ehg');

/**
 * Detect which repository contains the implementation for this SD
 * Returns the root path of the implementation repository
 *
 * Strategy:
 * 1. Check if SD has commits in EHG (application repo)
 * 2. If not found, default to EHG_Engineer (governance repo)
 *
 * @param {string} sd_id - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<string>} - Root path of implementation repository
 */
export async function detectImplementationRepo(sd_id, supabase) {
  const repos = [
    EHG_ROOT,           // Application repo (priority)
    EHG_ENGINEER_ROOT   // Governance repo (fallback)
  ];

  // SD-VENTURE-STAGE0-UI-001: Also search by sd_key (SD-XXX-001 format)
  // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Renamed legacy_id to sd_key (column dropped 2026-01-24)
  // since commits often use sd_key instead of UUID
  const searchTerms = await getSDSearchTerms(sd_id, supabase);
  if (searchTerms.length > 1) {
    console.log(`   📋 Also searching for sd_key: ${searchTerms[1]}`);
  }

  for (const repo of repos) {
    for (const term of searchTerms) {
      try {
        // Check if this repo has commits for this SD
        const { stdout } = await execAsync(`git -C "${repo}" log --all --grep="${term}" --format="%H" -n 1 2>/dev/null || echo ""`);
        if (stdout.trim()) {
          console.log(`   💡 Implementation detected in: ${repo} (matched: ${term})`);
          return repo;
        }
      } catch (_error) {
        // Repo might not exist or not accessible, continue to next
        continue;
      }
    }
  }

  // Default to current working directory if no commits found
  const cwd = process.cwd();
  console.log(`   ⚠️  No SD commits found in known repos, using current directory: ${cwd}`);
  return cwd;
}
