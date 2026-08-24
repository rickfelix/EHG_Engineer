/**
 * Shared Repository Path Resolution API (CommonJS)
 *
 * CJS mirror of lib/repo-paths.js for use by hooks and CJS scripts.
 * Same logic: registry-driven resolution with hardcoded fallback.
 *
 * SD-LEO-INFRA-VENTURE-DEVWORKFLOW-AWARENESS-001 (gap remediation)
 *
 * @module lib/repo-paths
 */

const fs = require('fs');
const path = require('path');

const ENGINEER_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.resolve(ENGINEER_ROOT, 'applications', 'registry.json');

const PLATFORM_REPOS = new Set(['ehg', 'ehg_engineer']);

// ESM-parity note (SD-LEO-INFRA-REPO-HYGIENE-PATH-001): mirrors lib/repo-paths.js's
// stripWorktreeSuffix/getRepoRoot exactly. ENGINEER_ROOT is module-location-derived, so from
// inside a `.worktrees/<sd>` checkout it IS the worktree, not the main repo -- this strips that
// suffix to recover the canonical main root. No-op from main (byte-identical to ENGINEER_ROOT).
function stripWorktreeSuffix(p) {
  const root = String(p || '').replace(/\\/g, '/');
  const idx = root.indexOf('/.worktrees/');
  return idx === -1 ? p : path.resolve(root.slice(0, idx));
}
function getRepoRoot() {
  return stripWorktreeSuffix(ENGINEER_ROOT);
}

// ehg is a getter (not a pre-computed value) so it re-resolves against getRepoRoot() lazily.
const FALLBACK_REPOS = {
  EHG_Engineer: ENGINEER_ROOT,
  get ehg() {
    return path.resolve(getRepoRoot(), '..', 'ehg');
  },
};

let _cache = null;

// Relative local_path values resolve against `base` (default getRepoRoot(), NOT ENGINEER_ROOT
// -- see the ESM version's doc comment for the RCA writeup on why the ENGINEER_ROOT-based
// version was a real, shipped regression broken from every live worktree).
// SD-LEO-INFRA-REPO-HYGIENE-PATH-001
function resolveLocalPath(localPath, base = getRepoRoot()) {
  if (path.isAbsolute(localPath)) {
    return path.resolve(localPath);
  }
  return path.resolve(base, localPath);
}

function loadValidatedRegistry() {
  if (_cache) return _cache;

  try {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(content);

    if (!registry.applications || typeof registry.applications !== 'object') {
      throw new Error('Registry missing applications object');
    }

    const apps = Object.values(registry.applications)
      .filter((app) => app.status === 'active' && app.name && app.local_path)
      .map((app) => ({ ...app, local_path: resolveLocalPath(app.local_path) }));

    if (apps.length === 0) {
      throw new Error('Registry has no active applications with paths');
    }

    _cache = { apps, valid: true };
    return _cache;
  } catch {
    _cache = {
      apps: [
        { name: 'EHG_Engineer', local_path: ENGINEER_ROOT, github_repo: 'rickfelix/EHG_Engineer', status: 'active' },
        { name: 'ehg', local_path: path.resolve(getRepoRoot(), '..', 'ehg'), github_repo: 'rickfelix/ehg', status: 'active' },
      ],
      valid: false,
    };
    return _cache;
  }
}

function getRepoPaths() {
  const { apps } = loadValidatedRegistry();
  const result = {};
  for (const app of apps) {
    result[app.name] = path.resolve(app.local_path);
  }
  if (!result.EHG_Engineer) {
    result.EHG_Engineer = ENGINEER_ROOT;
  }
  return result;
}

function resolveRepoPath(targetApp) {
  if (!targetApp) return ENGINEER_ROOT;
  const { apps } = loadValidatedRegistry();
  const needle = targetApp.toLowerCase();
  for (const app of apps) {
    if (app.name.toLowerCase() === needle) {
      return path.resolve(app.local_path);
    }
  }
  if (needle === 'ehg_engineer') return ENGINEER_ROOT;
  return null;
}

function isVentureRepo(targetApp) {
  if (!targetApp) return false;
  return !PLATFORM_REPOS.has(targetApp.toLowerCase());
}

function clearCache() {
  _cache = null;
}

module.exports = {
  getRepoPaths,
  resolveRepoPath,
  resolveLocalPath,
  isVentureRepo,
  clearCache,
  ENGINEER_ROOT,
  FALLBACK_REPOS,
  getRepoRoot,
  stripWorktreeSuffix,
};
