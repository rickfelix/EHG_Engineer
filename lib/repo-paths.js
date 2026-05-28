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

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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
 * Canonical comparison key for application names: lowercase + strip ALL
 * non-alphanumeric characters. Bridges the separator/case drift between the
 * DB `target_application` ("CommitCraft AI"), the registry.json `name`
 * ("commitcraft-ai"), and the `normalized_name` form ("commitcraft_ai") — all
 * collapse to "commitcraftai" so a venture resolves regardless of which form a
 * caller passes. SD-LEO-INFRA-RECONCILE-VENTURE-BUILD-001 (discovered: an existing
 * venture clone was unresolvable because resolveRepoPath did an exact lowercase
 * compare, "commitcraft-ai" !== "commitcraft ai").
 *
 * @param {string} name
 * @returns {string} canonical key (may be '')
 */
export function normalizeAppName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Resolve a target_application string to its local filesystem path.
 *
 * @param {string} targetApp - Application name (e.g., 'EHG_Engineer', 'ehg', 'CommitCraft AI')
 * @returns {string|null} Absolute local path, or null if not found
 */
export function resolveRepoPath(targetApp) {
  if (!targetApp) return ENGINEER_ROOT;

  const { apps } = loadValidatedRegistry();
  const needle = normalizeAppName(targetApp);

  for (const app of apps) {
    if (normalizeAppName(app.name) === needle) {
      return path.resolve(app.local_path);
    }
  }

  // EHG_Engineer self-reference
  if (needle === 'ehgengineer') return ENGINEER_ROOT;

  return null;
}

/**
 * DB-first venture/application path resolver — SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-2.
 *
 * Prefers the authoritative DB column `applications.local_path`, falling back to
 * the synchronous registry.json resolver (`resolveRepoPath`) when the DB is
 * unavailable, has no matching row, or the row's `local_path` is NULL. This is the
 * single "DB-first, registry-fallback" resolver the venture-build loop reads.
 *
 * It is ADDITIVE: it does NOT change the synchronous `resolveRepoPath` relied on by
 * the ~40 sync callers. Those stay correct because the provisioner write-through
 * keeps registry.json in lockstep with the DB column (registry is the fallback
 * tier, not a divergent source). Name matching uses `normalizeAppName`, so a venture
 * resolves whether the caller passes "CronLinter", "cronlinter", or "cron-linter".
 *
 * Platform invariant (FR-6 / TS-2) preserved: null/EHG_Engineer return ENGINEER_ROOT
 * WITHOUT consulting the DB or registry venture path.
 *
 * @param {string} targetApp - Application name
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase] - service client; when omitted, registry-only
 * @returns {Promise<string|null>} Absolute local path, or null if unresolved
 */
export async function resolveRepoPathDbFirst(targetApp, supabase) {
  if (!targetApp) return ENGINEER_ROOT;
  const needle = normalizeAppName(targetApp);
  if (needle === 'ehgengineer') return ENGINEER_ROOT;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('name, local_path, status')
        .eq('status', 'active');
      if (!error && Array.isArray(data)) {
        const hit = data.find((a) => a.local_path && normalizeAppName(a.name) === needle);
        if (hit) return path.resolve(hit.local_path);
      }
    } catch {
      // DB unavailable is NOT an authoritative miss — fall through to the registry
      // mirror rather than returning null (which would route work to the fallback).
    }
  }

  // Registry fallback (sync; kept in lockstep with the DB column by provisioner write-through).
  return resolveRepoPath(targetApp);
}

/**
 * Resolve a target_application input to its CANONICAL registered name (the
 * `applications.name` form), so writers store a registry-consistent value.
 *
 * DB-first (applications table), registry.json fallback, matching is
 * case/separator-insensitive via normalizeAppName. Platform values pass through
 * unchanged. Returns the input UNCHANGED when no registered match is found — it
 * NEVER silently rewrites an unknown app to a platform default (the DB constraint
 * is the authority on validity).
 *
 * SD-LEO-INFRA-VENTURE-REPO-AWARE-001 (FR-3/TR-3): reuses the existing resolver;
 * no new resolver module. Pairs with the registry-aware retrospectives trigger.
 *
 * @param {string} targetApp - Application name (e.g. 'CronGenius', 'crongenius', 'EHG')
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase] - service client; when omitted, registry-only
 * @returns {Promise<string>} the canonical applications.name, or the input unchanged if unmatched
 */
export async function resolveCanonicalAppName(targetApp, supabase) {
  if (!targetApp) return 'EHG_Engineer';
  // Platform passthrough (canonical display forms) — never depends on the registry query.
  if (targetApp === 'EHG' || targetApp === 'EHG_Engineer') return targetApp;
  const needle = normalizeAppName(targetApp);
  if (needle === 'ehgengineer') return 'EHG_Engineer';
  if (needle === 'ehg') return 'EHG';

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('applications')
        .select('name, status')
        .eq('status', 'active');
      if (!error && Array.isArray(data)) {
        const hit = data.find((a) => a.name && normalizeAppName(a.name) === needle);
        if (hit) return hit.name;
      }
    } catch {
      // DB unavailable is NOT an authoritative miss — fall through to the registry mirror.
    }
  }

  // Registry (file) fallback.
  const { apps } = loadValidatedRegistry();
  const hit = apps.find((a) => normalizeAppName(a.name) === needle);
  if (hit) return hit.name;

  // No registered match: return the input unchanged; the DB constraint validates.
  return targetApp;
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
  const needle = normalizeAppName(targetApp);

  for (const app of apps) {
    if (normalizeAppName(app.name) === needle && app.github_repo) {
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
 * Check whether the target application has a usable git repository for
 * branch operations (GATE5/GATE6).
 *
 * A repo is "git-capable" when:
 *   1. `resolveRepoPath` returns a non-null path, AND
 *   2. A `.git` entry exists at that path, AND
 *   3. The HEAD is a symbolic ref (repo is on a branch, not in detached-HEAD mode).
 *
 * EHG is locked to detached HEAD (`origin/main`) so branch operations fail —
 * `git symbolic-ref HEAD` exits non-zero there. EHG_Engineer is on a normal
 * branch pointer, so it passes. This predicate is type-agnostic: it checks
 * the repo's actual capability, not the SD's sd_type.
 *
 * @param {string} targetApp - Application name (e.g. 'EHG', 'EHG_Engineer')
 * @returns {boolean}
 */
export function isGitCapableRepo(targetApp) {
  try {
    const repoPath = resolveRepoPath(targetApp);
    if (!repoPath || !existsSync(path.join(repoPath, '.git'))) return false;
    execSync('git symbolic-ref HEAD', { cwd: repoPath, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear the module-scope cache (for testing).
 */
export function clearCache() {
  _cache = null;
}

/**
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5): Resolve the canonical
 * main-repo root regardless of the caller's cwd (including from inside a
 * `.worktrees/` subtree).
 *
 * This is the replacement for raw `git rev-parse --show-toplevel` in
 * cwd-sensitive scripts such as `scripts/sd-start.js`. From within a
 * worktree, `--show-toplevel` returns the worktree path, not the main
 * repo; callers that expect "main repo" get silent breakage. This helper
 * always returns the EHG_Engineer root that repo-paths.js resolves from its own
 * module location (`__dirname/..`), with any trailing `/.worktrees/<sd>` suffix
 * stripped so it is the canonical main root whether called from main or a worktree.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Optional cwd for diagnostic detection. When
 *   provided and inside a `.worktrees/` subtree, this function does NOT
 *   throw by itself — use `isInsideWorktree()` for the guard at call sites
 *   that want to fail-fast with an actionable error.
 * @returns {string} absolute path of the canonical main repo root
 */
/**
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-3 (G-B): strip a trailing `/.worktrees/<name>` segment
 * from a repo path, yielding the canonical main repo root. Pure + exported for testing/reuse.
 * No-op when the path is not inside a `.worktrees/` subtree (returns the input unchanged).
 * @param {string} p
 * @returns {string}
 */
export function stripWorktreeSuffix(p) {
  const root = String(p || '').replace(/\\/g, '/');
  const idx = root.indexOf('/.worktrees/');
  return idx === -1 ? p : path.resolve(root.slice(0, idx));
}

export function getRepoRoot(options = {}) {
  // ENGINEER_ROOT is module-location-derived, so when repo-paths.js is loaded from a
  // `.worktrees/<sd>` checkout it IS the worktree, not the main repo — silently breaking
  // sibling/venture path derivation. stripWorktreeSuffix delivers the documented contract:
  // the canonical main root from main OR a worktree. No-op from main (byte-identical to ENGINEER_ROOT).
  return stripWorktreeSuffix(ENGINEER_ROOT);
}

/**
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR5 enhancement B):
 * Detect whether a given cwd is inside the main repo's `.worktrees/`
 * subtree. Call sites that must run from the main repo root (e.g.
 * `sd-start.js`'s worktree-creation path) should use this as an early
 * guard to emit an actionable error instead of silently creating a
 * nested `.worktrees/<sd>/.worktrees/<sd>` path and releasing the claim.
 *
 * @param {string} [cwd=process.cwd()] - cwd to check
 * @returns {{ inside: boolean, worktreesDir: string, repoRoot: string }}
 */
export function isInsideWorktree(cwd = process.cwd()) {
  const worktreesDir = path.resolve(ENGINEER_ROOT, '.worktrees');
  const normalizedCwd = path.resolve(cwd);
  const inside = normalizedCwd === worktreesDir
    || normalizedCwd.startsWith(worktreesDir + path.sep);
  return { inside, worktreesDir, repoRoot: ENGINEER_ROOT };
}

export { ENGINEER_ROOT, FALLBACK_REPOS };

export default {
  getRepoPaths,
  resolveRepoPath,
  resolveRepoPathDbFirst,
  resolveCanonicalAppName,
  resolveGitHubRepo,
  normalizeAppName,
  isVentureRepo,
  isGitCapableRepo,
  clearCache,
  getRepoRoot,
  stripWorktreeSuffix,
  isInsideWorktree,
  ENGINEER_ROOT,
  FALLBACK_REPOS,
};
