/**
 * Utility functions for Traceability Validation
 * Part of SD-LEO-REFACTOR-TRACEABILITY-001
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

import { resolveRepoPath } from '../../../lib/repo-paths.js';
export const execAsync = promisify(exec);

// Cross-platform path resolution (SD-WIN-MIG-005 fix)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const EHG_ENGINEER_ROOT = path.resolve(__dirname, '../../..');
export const EHG_ROOT = resolveRepoPath('ehg');

/**
 * Resolve SD UUID and get SD metadata
 * SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
 * SD-LEO-FIX-GATE-QUERY-DEDUPLICATION-001: Accept optional pre-fetched SD data
 * @param {string} sd_id - SD ID (may be sd_key or UUID)
 * @param {Object} supabase - Supabase client
 * @param {Object} [prefetchedSd] - Pre-fetched SD data to avoid duplicate query
 * @returns {Promise<{sdUuid: string, sdKey: string, sdCategory: string|null, sdType: string|null, gitRepoPath: string}>}
 */
export async function resolveSDContext(sd_id, supabase, prefetchedSd = null) {
  let sdUuid = sd_id;
  let sdKey = sd_id;
  let sdCategory = null;
  let sdType = null;
  let gitRepoPath = process.cwd();

  const sdData = prefetchedSd || (await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, category, metadata, target_application, sd_type')
    .or(`sd_key.eq.${sd_id},id.eq.${sd_id}`)
    .single()).data;

  if (sdData) {
    sdUuid = sdData.id;
    sdKey = sdData.sd_key || sdData.id;
    sdCategory = sdData.category?.toLowerCase() || sdData.metadata?.category?.toLowerCase() || null;
    sdType = sdData.sd_type?.toLowerCase() || null;
    console.log(`   SD Category: ${sdCategory || 'unknown'} | Type: ${sdType || 'unknown'}`);

    const targetApp = sdData.target_application || sdData.metadata?.target_application;
    if (targetApp === 'EHG') {
      gitRepoPath = EHG_ROOT;
    } else if (targetApp === 'EHG_Engineer') {
      gitRepoPath = EHG_ENGINEER_ROOT;
    }
    console.log(`   Git Repo: ${gitRepoPath}`);
  }

  return { sdUuid, sdKey, sdCategory, sdType, gitRepoPath };
}
