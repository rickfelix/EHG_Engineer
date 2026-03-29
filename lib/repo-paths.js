/**
 * Shared Repository Path Resolution API
 *
 * Single import point for all modules that need to resolve repository paths.
 * Wraps venture-resolver.js and registry.json with validation and fallback.
 *
 * Created by: SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001-A
 *
 * @module lib/repo-paths
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINEER_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.resolve(ENGINEER_ROOT, 'applications/registry.json');

// Platform repos that are not ventures
const PLATFORM_REPOS = new Set(['ehg', 'ehg_engineer']);

// Hardcoded fallback for when registry is unavailable/corrupt
const FALLBACK_REPOS = {
  EHG_Engineer: ENGINEER_ROOT,
  ehg: path.resolve(ENGINEER_ROOT, '..', 'ehg'),
};

// Module-scope cache (loaded once per process)
let _cache = null;

/**
 * Load and validate the registry. Falls back to hardcoded repos on error.
 * @returns {{ apps: Object[], valid: boolean }}
 */
function loadValidatedRegistry() {
  if (_cache) return _cache;

  try {
    const content = readFileSync(REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(content);

    // Basic structural validation
    if (!registry.applications || typeof registry.applications !== 'object') {
      throw new Error('Registry missing applications object');
    }

    const apps = Object.values(registry.applications).filter(
      (app) => app.status === 'active' && app.name && app.local_path
    );

    if (apps.length === 0) {
      throw new Error('Registry has no active applications with paths');
    }

    _cache = { apps, valid: true };
    return _cache;
  } catch {
    // Graceful fallback to hardcoded platform repos
    _cache = {
      apps: [
        { name: 'EHG_Engineer', local_path: ENGINEER_ROOT, github_repo: 'rickfelix/EHG_Engineer', status: 'active' },
        { name: 'ehg', local_path: path.resolve(ENGINEER_ROOT, '..', 'ehg'), github_repo: 'rickfelix/ehg', status: 'active' },
      ],
      valid: false,
    };
    return _cache;
  }
}

/**
 * Get a map of all active repository names to their local filesystem paths.
 *
 * @returns {Record<string, string>} Map of repo name to absolute local path
 */
export function getRepoPaths() {
  const { apps } = loadValidatedRegistry();
  const result = {};

  for (const app of apps) {
    result[app.name] = path.resolve(app.local_path);
  }

  // Always include EHG_Engineer (this repo) even if not in registry
  if (!result.EHG_Engineer) {
    result.EHG_Engineer = ENGINEER_ROOT;
  }

  return result;
}

/**
 * Resolve a target_application string to its local filesystem path.
 *
 * @param {string} targetApp - Application name (e.g., 'EHG_Engineer', 'ehg', 'commitcraft-ai')
 * @returns {string|null} Absolute local path, or null if not found
 */
export function resolveRepoPath(targetApp) {
  if (!targetApp) return ENGINEER_ROOT;

  const { apps } = loadValidatedRegistry();
  const needle = targetApp.toLowerCase();

  for (const app of apps) {
    if (app.name.toLowerCase() === needle) {
      return path.resolve(app.local_path);
    }
  }

  // EHG_Engineer self-reference
  if (needle === 'ehg_engineer') return ENGINEER_ROOT;

  return null;
}

/**
 * Resolve a target_application to its GitHub org/repo string.
 *
 * @param {string} targetApp - Application name
 * @returns {string|null} GitHub repo in 'org/repo' format, or null if not found
 */
export function resolveGitHubRepo(targetApp) {
  if (!targetApp) return 'rickfelix/EHG_Engineer';

  const { apps } = loadValidatedRegistry();
  const needle = targetApp.toLowerCase();

  for (const app of apps) {
    if (app.name.toLowerCase() === needle && app.github_repo) {
      return app.github_repo.replace(/\.git$/, '');
    }
  }

  return null;
}

/**
 * Check if a target_application is a venture repo (vs. a platform repo).
 * Platform repos: ehg, EHG_Engineer. Everything else is a venture.
 *
 * @param {string} targetApp - Application name
 * @returns {boolean} true if venture, false if platform or unknown
 */
export function isVentureRepo(targetApp) {
  if (!targetApp) return false;
  return !PLATFORM_REPOS.has(targetApp.toLowerCase());
}

/**
 * Clear the module-scope cache (for testing).
 */
export function clearCache() {
  _cache = null;
}

export { ENGINEER_ROOT, FALLBACK_REPOS };

export default {
  getRepoPaths,
  resolveRepoPath,
  resolveGitHubRepo,
  isVentureRepo,
  clearCache,
  ENGINEER_ROOT,
  FALLBACK_REPOS,
};
