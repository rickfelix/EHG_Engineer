/**
 * Git-boundary-safe .env resolution for the shared Supabase env loader.
 * SD-FDBK-INFRA-WORKTREES-CARRY-SNAPSHOT-001.
 *
 * A feature worktree carries its own COPY of the root .env (propagateEnvFile,
 * lib/worktree-manager.js:1139-1152) so a rotated secret has two representations on
 * disk. The old loadEnvFromAncestors walk (still used as the fallback below) stops at
 * the FIRST .env found walking up from cwd -- inside a worktree that's always the
 * copy, so a rotation never reaches the main worktree's live .env until the next
 * claim/checkin re-attach (QF-20260901-296's refreshPropagatedEnv).
 *
 * resolveEnvPath() tries the MAIN worktree's .env first (via git's own
 * --git-common-dir, so it works from a linked worktree, not just the main one), and
 * only falls through to the ancestor walk when that path yields no .env -- which is
 * exactly the case for a repo with no .env anywhere (a genuinely .env-less venture
 * repo; confirmed live for altifyai: git resolves fine, but there is no .env in its own
 * tree or any ancestor up through the filesystem root). That fallthrough must stay a
 * silent no-op for such a repo, not a throw -- see TS-7.
 *
 * Pure and injectable (execGit/existsSync) so this is unit-testable without real git
 * operations and without the VITEST/NODE_ENV=test guard that gates the caller's own
 * module-level side effect (lib/supabase-client.js/.cjs never run this logic under
 * vitest at all -- resolveEnvPath itself has no such guard, so it can be exercised
 * directly in tests).
 *
 * Memoized per (startDir, execGit) pair so a process calling this repeatedly (e.g. a
 * long-running worker) does not re-spawn git on every call; GIT_DIR/GIT_COMMON_DIR can
 * be inherited from a git hook and would otherwise resolve to the wrong repo on a
 * second call from a different cwd within the same process if not cache-keyed by
 * startDir.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const memo = new Map();

/**
 * @param {string} startDir - directory to resolve from (typically process.cwd())
 * @param {{execGit?: Function, existsSync?: Function}} [deps]
 * @returns {{path: string|null, source: 'main-worktree'|'ancestor-walk'|'none', gitResolved: boolean}}
 */
function resolveEnvPath(startDir, deps = {}) {
  const execGit = deps.execGit || execFileSync;
  const existsSync = deps.existsSync || fs.existsSync;

  const cacheKey = `${startDir} ${execGit === execFileSync ? 'default' : 'injected'}`;
  if (memo.has(cacheKey)) return memo.get(cacheKey);

  let mainWorktreeRoot = null;
  let gitResolved = false;
  try {
    const commonDir = execGit(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd: startDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (commonDir) {
      mainWorktreeRoot = path.dirname(commonDir);
      gitResolved = true;
    }
  } catch {
    // Not a git repo, git absent from PATH, or a hook-inherited GIT_DIR pointing
    // somewhere unusable -- fall through to the ancestor walk below.
  }

  if (gitResolved && mainWorktreeRoot && existsSync(mainWorktreeRoot)) {
    const candidate = path.join(mainWorktreeRoot, '.env');
    if (existsSync(candidate)) {
      const result = { path: candidate, source: 'main-worktree', gitResolved };
      memo.set(cacheKey, result);
      return result;
    }
  }

  // Fallthrough: either git didn't resolve, or it resolved to a root with no .env
  // there (altifyai's exact shape -- TS-7). Walk ancestors exactly as the old
  // loadEnvFromAncestors did, so a genuinely .env-less repo's behavior is unchanged.
  let dir = startDir;
  for (;;) {
    const candidate = path.join(dir, '.env');
    if (existsSync(candidate)) {
      const result = { path: candidate, source: 'ancestor-walk', gitResolved };
      memo.set(cacheKey, result);
      return result;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  const result = { path: null, source: 'none', gitResolved };
  memo.set(cacheKey, result);
  return result;
}

/** Test-only: clear the memoization cache between test cases. */
function _clearMemoForTests() {
  memo.clear();
}

module.exports = { resolveEnvPath, _clearMemoForTests };
