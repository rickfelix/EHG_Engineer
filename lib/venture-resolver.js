/**
 * Venture Resolver — Registry-driven venture path and config resolution
 *
 * Reads from applications/registry.json (sync, legacy) and vw_venture_registry
 * DB view (async, preferred) to resolve venture paths and configs.
 *
 * Created by: SD-LEO-REFAC-ELIMINATE-HARD-CODED-001
 * Updated by: SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A (PA-3)
 *   - Added NFKC + alphanumeric-strip name normalization for sync path
 *   - Added getVentureConfigAsync() reading from vw_venture_registry view
 *   - Async path throws VentureRegistryCollisionError on >=2 normalized matches
 *     and VentureRegistryInvalidNameError on empty/too-short normalized input
 *
 * @module lib/venture-resolver
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  VentureRegistryCollisionError,
  VentureRegistryInvalidNameError,
  normalizeVentureName,
} from './eva/bridge/venture-routing-error.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// EHG_Engineer root (this repo)
const ENGINEER_ROOT = path.resolve(__dirname, '..');

// Registry path
const REGISTRY_PATH = path.resolve(ENGINEER_ROOT, 'applications/registry.json');

// Cached registry (loaded once per process)
let _registryCache = null;

/**
 * Load the application registry, with caching.
 * @returns {Object} The parsed registry object
 */
function loadRegistry() {
  if (_registryCache) return _registryCache;

  try {
    const content = readFileSync(REGISTRY_PATH, 'utf8');
    _registryCache = JSON.parse(content);
    return _registryCache;
  } catch {
    // Fallback: minimal registry for EHG_Engineer itself
    _registryCache = {
      applications: {
        APP_SELF: {
          id: 'APP_SELF',
          name: 'EHG_Engineer',
          local_path: ENGINEER_ROOT,
          status: 'active'
        }
      }
    };
    return _registryCache;
  }
}

/**
 * Resolve the local filesystem path for a venture/application by name.
 * Handles case-insensitive matching (e.g., 'EHG', 'ehg', 'EHG_Engineer').
 *
 * @param {string} targetApp - Application name (e.g., 'EHG', 'EHG_Engineer', 'ehg')
 * @returns {string|null} Absolute local path to the venture repository, or null if not found
 */
export function getVenturePath(targetApp) {
  if (!targetApp) return ENGINEER_ROOT;

  const registry = loadRegistry();
  const apps = registry.applications || {};
  const needle = targetApp.toLowerCase();

  // Search by name (case-insensitive)
  for (const app of Object.values(apps)) {
    if (app.name?.toLowerCase() === needle && app.local_path) {
      return path.resolve(app.local_path);
    }
  }

  // Special case: 'ehg_engineer' maps to this repo
  if (needle === 'ehg_engineer') {
    return ENGINEER_ROOT;
  }

  // SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Registry-only resolution.
  // Auto-discovery fallback removed per CRO risk assessment — unvalidated
  // filesystem guesses are unacceptable for multi-repo routing.
  return null;
}

/**
 * SD-LEO-INFRA-MULTI-REPO-ROUTING-001: Validate that a venture repo exists and is a git repository.
 *
 * @param {string} repoPath - Absolute path to validate
 * @returns {{ valid: boolean, reason?: string }} Validation result
 */
export function validateVentureRepo(repoPath) {
  if (!repoPath) return { valid: false, reason: 'No path provided' };
  if (!existsSync(repoPath)) return { valid: false, reason: `Path does not exist: ${repoPath}` };
  if (!existsSync(path.join(repoPath, '.git'))) return { valid: false, reason: `Not a git repo: ${repoPath}` };
  return { valid: true };
}

/**
 * Get the full configuration for a venture from the registry (sync, legacy).
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A: Now applies NFKC + alphanumeric-strip
 * normalization for matching, so 'CommitCraft AI' matches registry key
 * 'commitcraft-ai'. Existing ASCII-only callers see no behavior change.
 *
 * For new code, prefer getVentureConfigAsync({ name, supabase }) which queries
 * vw_venture_registry directly.
 *
 * @param {string} targetApp - Application name
 * @returns {Object|null} Registry entry for the venture, or null
 */
export function getVentureConfig(targetApp) {
  if (!targetApp) return null;

  const registry = loadRegistry();
  const apps = registry.applications || {};
  const needleNormalized = normalizeVentureName(targetApp);

  // Reject empty/too-short normalized inputs (e.g., emoji-only) — sync path
  // returns null rather than throwing to preserve backward compatibility.
  if (needleNormalized.length < 2) return null;

  for (const app of Object.values(apps)) {
    const appNormalized = normalizeVentureName(app.name || '');
    if (appNormalized === needleNormalized) {
      return { ...app, local_path: app.local_path ? path.resolve(app.local_path) : null };
    }
  }

  return null;
}

/**
 * Get the full configuration for a venture from the DB-derived registry view.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-A: PA-3. Replaces static
 * applications/registry.json lookup with vw_venture_registry view over
 * ventures table. Applies NFKC + alphanumeric-strip normalization. Throws
 * structured errors per validation conditions C5 (collision) and security-
 * agent C-SEC-2 (invalid name).
 *
 * @param {Object} args
 * @param {string} args.name - Venture name (any case, may contain Unicode/separators)
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase - Supabase client
 * @returns {Promise<Object|null>} Registry entry { id, name, normalized_name, local_path, repo_url, deployment_url, deployment_target, status, current_lifecycle_stage } or null
 * @throws {VentureRegistryInvalidNameError} when normalized input is empty or too short
 * @throws {VentureRegistryCollisionError} when 2+ active ventures normalize to the same key
 */
export async function getVentureConfigAsync({ name, supabase }) {
  if (!name) return null;
  if (!supabase) throw new Error('getVentureConfigAsync: supabase client is required');

  const normalized = normalizeVentureName(name);

  if (normalized.length === 0) {
    throw new VentureRegistryInvalidNameError({
      attemptedName: name,
      normalizedKey: normalized,
      reason: 'empty',
    });
  }
  if (normalized.length < 2) {
    throw new VentureRegistryInvalidNameError({
      attemptedName: name,
      normalizedKey: normalized,
      reason: 'too_short',
    });
  }

  const { data, error } = await supabase
    .from('vw_venture_registry')
    .select('id, name, normalized_name, local_path, repo_url, deployment_url, deployment_target, status, current_lifecycle_stage, created_at')
    .eq('normalized_name', normalized);

  if (error) {
    throw new Error(`[venture-resolver] vw_venture_registry query failed: ${error.message}`);
  }

  if (!data || data.length === 0) return null;

  if (data.length >= 2) {
    throw new VentureRegistryCollisionError({
      candidates: data,
      normalizedKey: normalized,
      attemptedName: name,
    });
  }

  return data[0];
}

/**
 * List all active ventures from the registry.
 *
 * @returns {Array<Object>} Array of active venture configurations
 */
export function listVentures() {
  const registry = loadRegistry();
  const apps = registry.applications || {};

  return Object.values(apps)
    .filter(app => app.status === 'active')
    .map(app => ({
      ...app,
      local_path: app.local_path ? path.resolve(app.local_path) : null
    }));
}

/**
 * Get the GitHub repo identifier (e.g., 'rickfelix/ehg') for a venture.
 *
 * @param {string} targetApp - Application name
 * @returns {string} GitHub repo identifier, or fallback
 */
export function getGitHubRepo(targetApp) {
  const config = getVentureConfig(targetApp);
  if (config?.github_repo) {
    return config.github_repo.replace(/\.git$/, '');
  }

  // Fallback: assume rickfelix/<name>
  return `rickfelix/${targetApp || 'EHG_Engineer'}`;
}

/**
 * Resolve the source_application value for the current repo context.
 * Uses process.cwd() to detect which venture we're running from.
 *
 * @returns {string} The venture name for the current working directory
 */
export function getCurrentVenture() {
  const cwd = process.cwd().replace(/\\/g, '/').toLowerCase();
  const registry = loadRegistry();
  const apps = registry.applications || {};

  // Sort by local_path length descending so more specific paths match first
  // (e.g., 'EHG_Engineer' before 'ehg' since 'ehg' is a substring)
  const sortedApps = Object.values(apps)
    .filter(app => app.local_path)
    .sort((a, b) => (b.local_path?.length || 0) - (a.local_path?.length || 0));

  for (const app of sortedApps) {
    const appPath = app.local_path.replace(/\\/g, '/').toLowerCase();
    // Use trailing separator to prevent 'ehg' matching 'ehg_engineer'
    if (cwd === appPath || cwd.startsWith(appPath + '/')) {
      return app.name;
    }
  }

  // Check if cwd is a worktree or subdirectory of EHG_Engineer
  const engineerRoot = ENGINEER_ROOT.replace(/\\/g, '/').toLowerCase();
  if (cwd.startsWith(engineerRoot) || cwd.includes('ehg_engineer')) {
    return 'EHG_Engineer';
  }

  // Default: EHG_Engineer (we're running from this repo)
  return 'EHG_Engineer';
}

/**
 * Clear the registry cache (useful for tests).
 */
export function clearRegistryCache() {
  _registryCache = null;
}

// Re-export normalizer and error classes for callers
export { normalizeVentureName, VentureRegistryCollisionError, VentureRegistryInvalidNameError };

export default {
  getVenturePath,
  getVentureConfig,
  getVentureConfigAsync,
  listVentures,
  getGitHubRepo,
  getCurrentVenture,
  clearRegistryCache,
  normalizeVentureName,
  ENGINEER_ROOT
};
