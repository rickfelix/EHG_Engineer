/**
 * lib/handoff-reexec.mjs
 *
 * SD-FDBK-INFRA-WORKTREE-AUTO-REMOVED-001 (FR-1): pure planner for the
 * STALE_CWD re-exec recovery decision used by scripts/handoff.js.
 *
 * Why a separate, pure module:
 *   - handoff.js must decide "am I in an orphaned worktree → re-exec from the
 *     main repo root" BEFORE importing its heavy graph (which pulls
 *     @supabase/* through node_modules and fails at module-RESOLUTION time when
 *     the orphaned worktree's node_modules junction is dangling).
 *   - process.chdir() is INEFFECTIVE: ESM resolves the whole static-import graph
 *     before any in-body statement runs, so the fix MUST be a re-exec, not chdir.
 *   - Extracting the decision into an injectable pure function makes it
 *     unit-testable (TS-1..TS-5) without spawning a child or mocking process.
 *
 * Builtin-only deps (node:fs, node:path) so this resolves even when cwd is an
 * orphaned worktree with a dangling node_modules junction.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Decide whether handoff.js should re-execute itself from the main repo root.
 *
 * @param {object} deps
 * @param {boolean} deps.sentinelSet     - true when LEO_HANDOFF_REEXEC is set (loop-guard:
 *                                          the re-exec child must NOT recover again).
 * @param {() => void} deps.assertCwdValid - throws when cwd is an orphaned worktree.
 * @param {(err:any) => boolean} deps.isStaleCwd - classifies a thrown error as STALE_CWD.
 * @param {() => (string|null)} deps.getRepoRoot - resolves the main repo root.
 * @param {string} deps.cwd             - current working directory.
 * @param {(p:string) => boolean} [deps.existsSync] - fs.existsSync (injectable for tests).
 * @returns {{reexec:boolean, reason:string, mainRoot?:string, mainScript?:string}}
 *   reexec=true  → caller should spawn `node <mainScript> <args>` with cwd=mainRoot.
 *   reexec=false → caller proceeds normally; `reason` explains why no recovery:
 *     'sentinel_set' | 'cwd_valid' | 'no_valid_main_root'.
 *
 * Non-STALE_CWD errors from assertCwdValid are re-thrown (never swallowed).
 */
export function planHandoffReexec(deps) {
  const {
    sentinelSet,
    assertCwdValid,
    isStaleCwd,
    getRepoRoot,
    cwd,
    existsSync = fs.existsSync,
  } = deps;

  // Loop-guard: the re-exec child carries the sentinel and must never recover again.
  if (sentinelSet) return { reexec: false, reason: 'sentinel_set' };

  let orphaned = false;
  try {
    assertCwdValid();
  } catch (err) {
    if (isStaleCwd(err)) orphaned = true;
    else throw err; // genuine, non-STALE_CWD failure — never swallow
  }
  if (!orphaned) return { reexec: false, reason: 'cwd_valid' };

  let mainRoot = null;
  try { mainRoot = getRepoRoot(); } catch { mainRoot = null; }

  // Only recover to a verified main repo root that is NOT the (broken) cwd.
  // Guards against silently swallowing a genuinely-broken main root.
  const mainValid =
    !!mainRoot &&
    existsSync(path.join(mainRoot, '.git')) &&
    path.resolve(mainRoot) !== path.resolve(cwd);
  if (!mainValid) return { reexec: false, reason: 'no_valid_main_root' };

  return {
    reexec: true,
    reason: 'orphaned_worktree',
    mainRoot,
    // Run the MAIN repo's handoff.js, NOT process.argv[1] (which points at the
    // orphaned worktree's copy whose node_modules junction is dangling).
    mainScript: path.join(mainRoot, 'scripts', 'handoff.js'),
  };
}
