/**
 * Venture repo-root resolution (pure, dependency-injected).
 *
 * SD-LEO-INFRA-VENTURE-BUILD-EXEC-001 / FR-6 (platform-regression net) + FR-3.
 *
 * Decides which repo root an SD's worktree should be created under, given the
 * SD's `target_application`. Extracted from `scripts/resolve-sd-workdir.js`
 * (the inline venture-override block) so the platform invariant can be tested
 * WITHOUT pulling in that file's heavy import graph (worktree-manager, quota,
 * supabase-client, …), which is prone to vitest collection-time load failures.
 *
 * Platform invariant (TS-2): when `target_application` is null/undefined or
 * 'EHG_Engineer', the default (EHG_Engineer) repoRoot is returned UNCHANGED,
 * source === 'platform', and NO `worktree.venture_repo_resolved` event is
 * produced. A venture repoRoot override happens only for a non-platform
 * `target_application` whose clone exists on disk with a `.git` entry.
 *
 * The function is side-effect free: it returns the structured `logs` it would
 * have emitted so the caller owns logging (and tests can assert on them).
 *
 * @module lib/venture-repo-root
 */

import path from 'path';
import fs from 'fs';

/**
 * @typedef {Object} VentureRepoRootResult
 * @property {string} repoRoot - resolved repo root (default for platform SDs)
 * @property {'platform'|'venture'|'venture_not_found'} source
 * @property {Array<Object>} logs - structured events the caller should emit
 *   (each WITHOUT sdKey/timestamp; caller enriches). Empty for the platform case.
 */

/**
 * @param {string|null|undefined} targetApp - SD's target_application
 * @param {string} defaultRepoRoot - the platform (EHG_Engineer) root to keep for platform SDs
 * @param {Object} [deps]
 * @param {(targetApp: string) => (string|null)} [deps.getVenturePath] - venture path resolver
 * @param {(p: string) => boolean} [deps.existsSync] - fs existence check (injectable for tests)
 * @returns {VentureRepoRootResult}
 */
export function resolveVentureRepoRoot(targetApp, defaultRepoRoot, deps = {}) {
  const existsSyncFn = deps.existsSync || fs.existsSync;
  const getVenturePathFn = deps.getVenturePath;
  const logs = [];

  // Platform SDs (null/undefined/EHG_Engineer) NEVER take a venture path.
  // Return BEFORE consulting any resolver so no extra work and no logs occur —
  // byte-identical to the original `if (targetApp && targetApp !== 'EHG_Engineer')`
  // guard skipping the block entirely.
  if (!targetApp || targetApp === 'EHG_Engineer') {
    return { repoRoot: defaultRepoRoot, source: 'platform', logs };
  }

  // Without a venture-path resolver we cannot route to a venture clone; stay on
  // the platform root rather than guessing (mirrors the registry-only,
  // no-auto-discovery posture of venture-resolver.getVenturePath).
  if (typeof getVenturePathFn !== 'function') {
    return { repoRoot: defaultRepoRoot, source: 'venture_not_found', logs };
  }

  const venturePath = getVenturePathFn(targetApp);
  if (venturePath && existsSyncFn(path.join(venturePath, '.git'))) {
    logs.push({ event: 'worktree.venture_repo_resolved', targetApp, repoRoot: venturePath });
    return { repoRoot: venturePath, source: 'venture', logs };
  }

  logs.push({ event: 'worktree.venture_repo_not_found', targetApp, resolvedPath: venturePath });
  return { repoRoot: defaultRepoRoot, source: 'venture_not_found', logs };
}

export default { resolveVentureRepoRoot };
