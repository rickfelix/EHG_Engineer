/**
 * Venture Resolver — Registry-driven venture path and config resolution
 *
 * Reads from applications/registry.json to resolve venture paths dynamically
 * instead of hard-coding 'ehg', 'EHG_Engineer', or absolute Windows paths.
 *
 * Created by: SD-LEO-REFAC-ELIMINATE-HARD-CODED-001
 *
 * @module lib/venture-resolver
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
 * Get the full configuration for a venture from the registry.
 *
 * @param {string} targetApp - Application name
 * @returns {Object|null} Registry entry for the venture, or null
 */
export function getVentureConfig(targetApp) {
  if (!targetApp) return null;

  const registry = loadRegistry();
  const apps = registry.applications || {};
  const needle = targetApp.toLowerCase();

  for (const app of Object.values(apps)) {
    if (app.name?.toLowerCase() === needle) {
      return { ...app, local_path: app.local_path ? path.resolve(app.local_path) : null };
    }
  }

  return null;
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

export default {
  getVenturePath,
  getVentureConfig,
  listVentures,
  getGitHubRepo,
  getCurrentVenture,
  clearRegistryCache,
  ENGINEER_ROOT
};
