/**
 * safe-root-resync.mjs — SD-LEO-INFRA-SHARED-ROOT-RESYNC-SAFETY-001
 *
 * Safe shared-root git-resync helper.
 *
 * ABSOLUTE DATA-SAFETY CONTRACT:
 *   - NEVER runs `git clean -fdx` — the -x flag deletes gitignored runtime state
 *     (node_modules, .claude/active-coordinator.json). 3 confirmed prod incidents.
 *   - All clean args are built as explicit arrays: ['clean','-fdn'] / ['clean','-fd'].
 *     There is NO code branch that appends 'x'. Ever.
 *   - Worktree guard fires BEFORE any clean: aborts if cwd is a worktree (.git is FILE).
 *   - HONEST SAFETY NOTE: `git clean -fd` (no -x) still PERMANENTLY DELETES every
 *     untracked, NON-gitignored file — e.g. uncommitted .prd-payloads/*.json, new
 *     scratch files, any in-progress work that was never `git add`ed. It does NOT
 *     touch gitignored runtime state. Because that is genuinely destructive, the
 *     real clean requires BOTH `--clean-untracked` AND a second explicit
 *     `--confirm-clean` flag. `--clean-untracked` alone only prints the `-fdn`
 *     dry-run preview (deletes nothing) so the operator can review first.
 *
 * Usage:
 *   node scripts/safe-root-resync.mjs                                     # fetch + ff-only merge, no clean
 *   node scripts/safe-root-resync.mjs --clean-untracked                   # + dry-run preview ONLY (no delete)
 *   node scripts/safe-root-resync.mjs --clean-untracked --confirm-clean   # + ACTUAL git clean -fd
 *   npm run resync:safe [-- --clean-untracked [--confirm-clean]]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── npm-install timeout MUST stay inside the lock's exclusivity window ───────
// The cross-session npm mutex (lib/npm-install-lock.cjs) auto-EXPIRES any lock
// older than LOCK_TTL_MS. If a repair `npm install` ran LONGER than the TTL, a
// second waiting session would expire our still-held lock and start a CONCURRENT
// install on the shared node_modules — the exact racing double-install the mutex
// exists to prevent (the TTL-expiry-mid-install path). So we bound the default
// install timeout strictly BELOW the TTL; the margin covers acquire/release
// latency and the waitForLock 5s poll granularity. If a real install can't finish
// in that window it is killed → repair_failed (loud, non-zero) → the operator
// re-runs `npm install` manually, serialized, OUTSIDE the race. We read LOCK_TTL_MS
// from the lock module so the two can never silently drift apart.
const { LOCK_TTL_MS } = require('../lib/npm-install-lock.cjs');
const NPM_INSTALL_TIMEOUT_MS = Math.max(30_000, LOCK_TTL_MS - 20_000);
export { LOCK_TTL_MS, NPM_INSTALL_TIMEOUT_MS };

// ─── Seam-injectable defaults ────────────────────────────────────────────────

/**
 * Default async git runner. Runs `git <args>` in cwd.
 * Returns { stdout: string, code: 0 } on success; throws on non-zero exit.
 */
function makeDefaultExec(cwd) {
  return async function execGit(args) {
    const stdout = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    return { stdout: stdout || '', code: 0 };
  };
}

/**
 * Default npm install runner. Timeout is bounded to NPM_INSTALL_TIMEOUT_MS
 * (strictly below the npm-mutex LOCK_TTL_MS) so the install can never outlive the
 * lock and overlap a second session's install. A timeout kills npm → throws →
 * caught as repair_failed (loud, non-zero), never a silent racing double-install.
 */
function makeDefaultNpmInstall(cwd) {
  return async function npmInstall() {
    execFileSync('npm', ['install'], { cwd, encoding: 'utf8', timeout: NPM_INSTALL_TIMEOUT_MS, stdio: 'inherit' });
  };
}

// ─── Shared-root discriminator ───────────────────────────────────────────────

/**
 * isSharedRoot — returns true when `${base}/.git` is a DIRECTORY (main repo root),
 * false when it is a FILE (worktree gitdir pointer). Mirrors the discriminator
 * pattern used in lib/npm-ci-junction-guard.cjs.
 *
 * @param {string} base
 * @param {object} fsMod  injectable fs module
 * @returns {'directory'|'file'|'missing'}
 */
function dotGitKind(base, fsMod) {
  try {
    const stat = fsMod.lstatSync(path.join(base, '.git'));
    if (stat.isDirectory()) return 'directory';
    if (stat.isFile()) return 'file';
    return 'missing';
  } catch {
    return 'missing';
  }
}

// ─── FR-2: restoreAfterResync ────────────────────────────────────────────────

/**
 * restoreAfterResync — fail-open tail that runs after a successful sync.
 * (a) Restores the coordinator pointer if this session is DB-confirmed as coordinator.
 * (b) Probes node_modules health; if broken, runs bounded `npm install` (NOT npm ci)
 *     under the cross-session npm mutex.
 *
 * NEVER throws to the caller — all errors are caught and logged.
 *
 * @param {object} opts
 * @param {object}   opts.supabase       - Supabase client (may be null)
 * @param {string}   opts.cwd            - repo root
 * @param {object}   opts.fs             - injectable fs
 * @param {Function} [opts.npmInstall]   - injectable npm install runner
 * @param {Function} [opts.checkNodeModulesFn]  - injectable health probe (for tests)
 * @param {Function} [opts.acquireLockFn]       - injectable lock acquire
 * @param {Function} [opts.waitForLockFn]       - injectable lock wait
 * @param {Function} [opts.releaseLockFn]       - injectable lock release
 * @param {string}   [opts.sessionId]    - override session id (for tests)
 * @returns {Promise<object>} restore result
 */
async function restoreAfterResync(opts = {}) {
  const {
    supabase = null,
    cwd,
    fs: fsMod = fs,
    npmInstall,
    checkNodeModulesFn,
    acquireLockFn,
    waitForLockFn,
    releaseLockFn,
    sessionId: injectedSessionId,
    writePointerFileFn,
  } = opts;

  const result = { coordinatorPointer: null, nodeModules: 'ok' };

  try {
    // ── (a) Coordinator pointer restore ──────────────────────────────────────
    try {
      // Resolve session id
      const { resolveOwnSessionId } = await import('../lib/coordinator-mutation-guard.mjs');
      const sessionId = injectedSessionId !== undefined
        ? injectedSessionId
        : resolveOwnSessionId();

      // Dynamic CJS imports so the hook can be dependency-injected in tests.
      // writePointerFile is injectable (writePointerFileFn) so unit tests never
      // write the real .claude/active-coordinator.json pointer file.
      const { restoreCoordinatorPointer } = require('./hooks/post-checkout-role-restore.cjs');
      const writePointerFile = writePointerFileFn
        || require('../lib/coordinator/resolve.cjs').writePointerFile;

      const pointerResult = await restoreCoordinatorPointer(supabase, sessionId, writePointerFile, os);
      result.coordinatorPointer = pointerResult;
    } catch (e) {
      process.stderr.write(`[safe-root-resync] coordinator-pointer restore WARN: ${e && e.message || e} (non-fatal)\n`);
      result.coordinatorPointer = { restored: false, reason: 'error' };
    }

    // ── (b) node_modules health + optional repair ─────────────────────────
    try {
      // Allow injection for tests
      let checkFn = checkNodeModulesFn;
      if (!checkFn) {
        const mod = await import('../lib/execute/execute-preflight.mjs');
        checkFn = mod.checkNodeModules;
      }

      const health = await checkFn();
      if (!health.ok) {
        process.stderr.write(
          `[safe-root-resync] node_modules probe FAILED: ${health.error}. ${health.hint}\n`
        );

        // Acquire cross-session npm mutex
        let lockMod;
        const acquireLock = acquireLockFn || (() => { lockMod = require('../lib/npm-install-lock.cjs'); return lockMod.acquireLock; })();
        const waitForLock = waitForLockFn || (() => { lockMod = lockMod || require('../lib/npm-install-lock.cjs'); return lockMod.waitForLock; })();
        const releaseLock = releaseLockFn || (() => { lockMod = lockMod || require('../lib/npm-install-lock.cjs'); return lockMod.releaseLock; })();

        // Resolve session id for the lock
        let lockSessionId;
        try {
          const { resolveOwnSessionId } = await import('../lib/coordinator-mutation-guard.mjs');
          lockSessionId = injectedSessionId !== undefined ? injectedSessionId : resolveOwnSessionId();
        } catch { lockSessionId = 'unknown'; }

        // We install ONLY when THIS session OWNS the lock (acquired===true). Running
        // npm install while another session holds the lock is a racing double-install
        // that corrupts the shared node_modules — the exact failure the mutex exists to
        // prevent. So a held lock means: wait, re-check, then try ONCE to own it.
        let lock = await acquireLock(supabase, lockSessionId);
        if (lock && lock.held) {
          process.stderr.write(`[safe-root-resync] npm lock held by ${lock.holder}, waiting...\n`);
          await waitForLock(supabase, { timeout: 120_000 });
          // The holder may have repaired node_modules for us while we waited.
          const recheck = await checkFn();
          if (recheck.ok) {
            result.nodeModules = 'repaired_by_other_session';
            return result;
          }
          // Still broken — try to claim the now-released/expired lock for ourselves.
          lock = await acquireLock(supabase, lockSessionId);
        }

        if (!lock || lock.acquired !== true) {
          // We never owned the lock (still held by another session, or the claim
          // INSERT errored). Do NOT run a racing install. Bail LOUD + non-zero so the
          // operator re-runs once contention clears — never silently skip the repair.
          const why = lock && lock.held
            ? `lock still held by ${lock.holder} after waiting`
            : `could not acquire npm lock (${(lock && lock.error) || 'unknown'})`;
          const hint = `[safe-root-resync] LOUD: node_modules is broken but ${why}. NOT running a racing install. Re-run \`npm run resync:safe\` once the other session finishes, or run \`npm install\` manually.`;
          process.stderr.write(hint + '\n');
          result.nodeModules = 'repair_deferred_lock_contended';
          result.hint = hint;
          return result;
        }

        // We OWN the lock (lock.acquired === true) — safe to install, release in finally.
        try {
          // Gate: refuse npm ci (would wipe shared store). We always use npm install.
          // The guard is here as belt-and-suspenders — our default already uses 'npm install'.
          const { npmCiWouldWipeSharedStore } = require('../lib/npm-ci-junction-guard.cjs');
          const wipeCheck = npmCiWouldWipeSharedStore({ command: 'npm install', cwd, fs: fsMod });
          if (wipeCheck.wipes) {
            const hint = `[safe-root-resync] LOUD: npm install would wipe shared store (${wipeCheck.reason}). NOT installing. Run npm install manually from an isolated worktree.`;
            process.stderr.write(hint + '\n');
            result.nodeModules = 'repair_aborted_wipe_risk';
            result.hint = hint;
            return result;
          }

          // Run bounded npm install (NOT npm ci)
          const installFn = npmInstall || makeDefaultNpmInstall(cwd);
          await installFn();
          result.nodeModules = 'repaired';
        } finally {
          try { await releaseLock(supabase, lockSessionId); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      process.stderr.write(`[safe-root-resync] node_modules repair WARN: ${e && e.message || e} (non-fatal)\n`);
      result.nodeModules = 'repair_failed';
      result.hint = e && e.message;
    }
  } catch (e) {
    // Outer catch: the entire tail must never propagate up and roll back the sync
    process.stderr.write(`[safe-root-resync] restoreAfterResync WARN: ${e && e.message || e} (non-fatal)\n`);
  }

  return result;
}

// ─── FR-1: safeRootResync ────────────────────────────────────────────────────

/**
 * safeRootResync — safe shared-root git resync.
 *
 * @param {object} opts
 * @param {Function}  [opts.exec]           - async git runner: (args: string[]) => {stdout, code}.
 *                                            NOTE: an injected exec is responsible for its OWN cwd —
 *                                            opts.cwd is applied only to the DEFAULT exec (and to the
 *                                            fs/guard/restore steps). If you inject exec, bind it to the
 *                                            same directory you pass as opts.cwd, or the worktree guard
 *                                            and the git commands can disagree about which tree they act on.
 * @param {object}    [opts.fs]             - injectable fs module
 * @param {object}    [opts.supabase]       - Supabase client
 * @param {string}    [opts.cwd]            - working directory (defaults to process.cwd())
 * @param {Function}  [opts.npmInstall]     - injectable npm install runner
 * @param {boolean}   [opts.cleanUntracked] - true = run the git clean -fdn DRY-RUN preview (no -x, ever)
 * @param {boolean}   [opts.confirmClean]   - true (WITH cleanUntracked) = run the ACTUAL git clean -fd.
 *                                            Without it, cleanUntracked is preview-only (deletes nothing).
 * @param {Function}  [opts.writePointerFileFn] - injectable coordinator-pointer writer (tests inject a
 *                                            mock so the real .claude/active-coordinator.json is untouched)
 * @param {Function}  [opts.checkNodeModulesFn]  - injectable health probe
 * @param {Function}  [opts.acquireLockFn]
 * @param {Function}  [opts.waitForLockFn]
 * @param {Function}  [opts.releaseLockFn]
 * @param {string}    [opts.sessionId]      - override session id
 *
 * @returns {Promise<{ok: boolean, synced?: boolean, cleaned?: boolean,
 *                    cleanPreviewOnly?: boolean, skipped?: string, conflict?: boolean,
 *                    aborted?: string, restore?: object}>}
 */
export async function safeRootResync(opts = {}) {
  const {
    fs: fsMod = fs,
    supabase = null,
    cwd = process.cwd(),
    npmInstall,
    cleanUntracked = false,
    confirmClean = false,
    checkNodeModulesFn,
    acquireLockFn,
    waitForLockFn,
    releaseLockFn,
    sessionId,
    writePointerFileFn,
  } = opts;

  // Build exec from cwd if not injected
  const exec = opts.exec || makeDefaultExec(cwd);

  // ── STEP 1: Worktree guard ────────────────────────────────────────────────
  // .git is a FILE in a worktree (points at the gitdir via "gitdir: ...").
  // .git is a DIRECTORY in the shared main repo root.
  // We ONLY resync the shared root. If we're in a worktree: HARD ABORT.
  const gitKind = dotGitKind(cwd, fsMod);
  if (gitKind === 'file') {
    // This is a worktree — HARD ABORT, never clean from here
    return { ok: false, aborted: 'worktree_cwd' };
  }
  if (gitKind === 'missing') {
    return { ok: false, aborted: 'not_a_git_repo' };
  }
  // gitKind === 'directory' → shared root → proceed

  // ── STEP 2: Fetch origin/main ─────────────────────────────────────────────
  try {
    await exec(['fetch', 'origin', 'main', '--quiet']);
  } catch (e) {
    // fetch failure is non-fatal for dirty-check; best-effort
    process.stderr.write(`[safe-root-resync] fetch warn: ${e && e.message || e}\n`);
  }

  // ── STEP 3: Dirty-tree check (mirroring leo-stack.sh sync_repo guards) ────
  // Skip if the tree has uncommitted tracked changes (beyond .protocol-sync auto-churn).
  let dirtyFiles = '';
  try {
    const { stdout } = await exec(['status', '--porcelain', '--untracked-files=no']);
    dirtyFiles = (stdout || '').split('\n')
      .filter(l => l.trim() && !l.includes('.claude/.protocol-sync'))
      .join('\n');
  } catch { /* ignore — fail open */ }

  if (dirtyFiles.trim()) {
    return { ok: true, skipped: 'dirty' };
  }

  // ── STEP 4: Check if already current ─────────────────────────────────────
  let behind = 0;
  try {
    const { stdout } = await exec(['rev-list', '--count', 'HEAD..origin/main']);
    behind = parseInt((stdout || '').trim(), 10) || 0;
  } catch { /* ignore */ }

  if (behind === 0 && !cleanUntracked) {
    // Already current and no clean requested — nothing to do (still run restore)
    const restore = await restoreAfterResync({
      supabase, cwd, fs: fsMod, npmInstall,
      checkNodeModulesFn, acquireLockFn, waitForLockFn, releaseLockFn, sessionId,
      writePointerFileFn,
    });
    return { ok: true, synced: false, cleaned: false, skipped: 'already_current', restore };
  }

  // ── STEP 5: ff-only merge ─────────────────────────────────────────────────
  let synced = false;
  if (behind > 0) {
    try {
      await exec(['merge', '--ff-only', 'origin/main', '--quiet']);
      synced = true;
    } catch (e) {
      // Non-ff conflict
      return { ok: false, conflict: true, behind };
    }
  }

  // ── STEP 6: Optional clean-untracked (DOUBLE opt-in, explicit, never -x) ──
  // `git clean -fd` permanently deletes ALL untracked, non-gitignored files —
  // including uncommitted work-in-progress (.prd-payloads/*.json, new scratch).
  // Because that is genuinely destructive, the ACTUAL clean requires BOTH flags:
  //   --clean-untracked                    → run the -fdn dry-run preview and STOP
  //   --clean-untracked + --confirm-clean  → run the real -fd
  let cleaned = false;
  let cleanPreviewOnly = false;
  if (cleanUntracked) {
    // DRY-RUN preview first — print what WOULD be deleted. Args: ['clean','-fdn'].
    let dryRunOut = '';
    try {
      const { stdout } = await exec(['clean', '-fdn']);
      dryRunOut = stdout || '';
      process.stdout.write('[safe-root-resync] dry-run preview (git clean -fdn — would delete):\n');
      process.stdout.write(dryRunOut.trim() ? dryRunOut : '  (nothing)\n');
    } catch (e) {
      process.stderr.write(`[safe-root-resync] clean dry-run warn: ${e && e.message || e}\n`);
    }

    if (!confirmClean) {
      // Preview-only: refuse to delete without the explicit second confirmation.
      cleanPreviewOnly = true;
      process.stdout.write(
        '[safe-root-resync] PREVIEW ONLY — no files deleted. The untracked files above ' +
        'will be PERMANENTLY removed if you re-run with --confirm-clean. Review them first.\n'
      );
    } else {
      // Confirmed — actual clean. Args: ['clean','-fd'] — no 'x', no gitignored deletion.
      try {
        await exec(['clean', '-fd']);
        cleaned = true;
      } catch (e) {
        process.stderr.write(`[safe-root-resync] clean warn: ${e && e.message || e}\n`);
      }
    }
  }

  // ── STEP 7: Restore tail (coordinator pointer + node_modules) ─────────────
  const restore = await restoreAfterResync({
    supabase, cwd, fs: fsMod, npmInstall,
    checkNodeModulesFn, acquireLockFn, waitForLockFn, releaseLockFn, sessionId,
    writePointerFileFn,
  });

  return { ok: true, synced, cleaned, cleanPreviewOnly, restore };
}

// ─── CLI entry point ─────────────────────────────────────────────────────────

const isMain = process.argv[1] &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
   process.argv[1].endsWith('safe-root-resync.mjs'));

if (isMain) {
  const cleanUntracked = process.argv.includes('--clean-untracked');
  const confirmClean = process.argv.includes('--confirm-clean');

  // Load supabase from env (best-effort; restoreAfterResync is fail-open if null)
  let supabase = null;
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '../.env') });
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const { createClient } = require('@supabase/supabase-js');
      supabase = createClient(supabaseUrl, supabaseKey);
    }
  } catch { /* supabase unavailable — restore steps fail-open */ }

  safeRootResync({ supabase, cleanUntracked, confirmClean, cwd: process.cwd() })
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (!result.ok && result.aborted) {
        process.stderr.write(`[safe-root-resync] ABORTED: ${result.aborted}\n`);
        process.exit(1);
      }
      if (!result.ok && result.conflict) {
        process.stderr.write('[safe-root-resync] CONFLICT: ff-only merge declined. Resolve divergence manually.\n');
        process.exit(1);
      }
      // Loud NON-ZERO for any node_modules repair that did not complete and left the
      // tree unhealthy: repair_failed, wipe-risk abort, and lock-contention deferral.
      const nm = result.restore && result.restore.nodeModules;
      if (nm === 'repair_failed' || nm === 'repair_aborted_wipe_risk' || nm === 'repair_deferred_lock_contended') {
        process.stderr.write(`[safe-root-resync] LOUD: node_modules repair did not complete (${nm}). Resolve manually — run \`npm install\`.\n`);
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(e => {
      process.stderr.write(`[safe-root-resync] FATAL: ${e && e.message || e}\n`);
      process.exit(1);
    });
}
