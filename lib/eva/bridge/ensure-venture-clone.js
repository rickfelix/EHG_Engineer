/**
 * ensure-venture-clone.js — SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 FR-3.
 *
 * Ensure a venture's persistent local clone exists and is current at its registered
 * `applications.local_path`, so the leo_bridge EXEC loop creates the per-SD worktree
 * INSIDE the venture clone (off the venture's origin/main) rather than EHG_Engineer.
 *
 * Behavior:
 *   - clone-if-missing : no `.git` at localPath  -> `git clone <repoUrl> <localPath>`
 *   - refresh-if-present: `.git` present         -> fetch + checkout main + ff-only pull
 *   - NEVER delete the persistent clone (refresh failures are non-fatal; the stale
 *     clone is kept rather than removed — preserves uncommitted work + avoids churn).
 *
 * The clone URL MUST pass SAFE_GITHUB_HTTPS (the same guard the seeder uses) because
 * it flows into `git clone`; anything else returns `skipped` rather than handing an
 * unvalidated string to git. Side effects are injected (`run`, `existsSync`) so the
 * clone/refresh decision is unit-testable without touching the network or disk
 * (TS-3 happy path, TS-7 cleanup-safety).
 *
 * @module lib/eva/bridge/ensure-venture-clone
 */

import { existsSync as fsExistsSync } from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { normalizeRepoUrl, SAFE_GITHUB_HTTPS } from './resolve-venture-repo.js';

/**
 * @typedef {Object} EnsureCloneResult
 * @property {boolean} ok
 * @property {'cloned'|'refreshed'|'present'|'skipped'} action
 * @property {string} path - the (intended) clone path
 * @property {string} [reason] - why skipped / why refresh degraded to 'present'
 */

/**
 * @param {string} repoUrl - venture GitHub https URL (may end with .git)
 * @param {string} localPath - registered clone path (applications.local_path)
 * @param {Object} [deps]
 * @param {(cmd: string, args: string[]) => string} [deps.run] - command runner (default execFileSync)
 * @param {(p: string) => boolean} [deps.existsSync] - fs existence check
 * @param {(msg: string) => void} [deps.log]
 * @returns {EnsureCloneResult}
 */
export function ensureVentureClone(repoUrl, localPath, deps = {}) {
  const existsSync = deps.existsSync || fsExistsSync;
  const run =
    deps.run || ((cmd, args) => execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf8', timeout: 120000 }));
  const log = deps.log || (() => {});

  if (!localPath) {
    return { ok: false, action: 'skipped', path: localPath, reason: 'no_local_path' };
  }

  const url = normalizeRepoUrl(repoUrl);
  if (!url || !SAFE_GITHUB_HTTPS.test(url)) {
    return { ok: false, action: 'skipped', path: localPath, reason: 'no_safe_repo_url' };
  }

  if (!existsSync(path.join(localPath, '.git'))) {
    // clone-if-missing
    run('git', ['clone', url, localPath]);
    log(`cloned ${url} -> ${localPath}`);
    return { ok: true, action: 'cloned', path: localPath };
  }

  // refresh-if-present — best-effort; NEVER delete the persistent clone.
  try {
    run('git', ['-C', localPath, 'fetch', 'origin', '--prune']);
    run('git', ['-C', localPath, 'checkout', 'main']);
    run('git', ['-C', localPath, 'pull', '--ff-only', 'origin', 'main']);
    log(`refreshed ${localPath}`);
    return { ok: true, action: 'refreshed', path: localPath };
  } catch (err) {
    // Keep the existing clone as-is (e.g. dirty tree, diverged main, offline).
    log(`refresh non-fatal failure, keeping existing clone: ${err.message}`);
    return { ok: true, action: 'present', path: localPath, reason: 'refresh_failed' };
  }
}

export default ensureVentureClone;
