/**
 * Worktree residency guard (SD-LEO-INFRA-WORKTREE-REAPER-RESIDENT-001).
 *
 * A worktree is RESIDENT when a live session is standing in it:
 *   (a) the acting process cwd is inside the target path (pure path math), or
 *   (b) any claude_sessions row with a FRESH heartbeat has worktree_path
 *       equal to / containing the target (one indexed read).
 * Deleting a resident worktree corrupts the resident session's shell and
 * loses in-flight work — the twice-recurred self-reap class (Charlie ~16:05Z
 * and Golf-4 20:09Z on 2026-07-11; prior P0 PAT-LEO-INFRA-WRITER-CONSUMER-
 * ASYMMETRY-001, PRs #3670-#3674, recurred via #4316/#4657/#4669/#5853).
 *
 * Polarity: FAIL-CLOSED. An error answering the residency question blocks the
 * reap (REAP_RESIDENCY_UNKNOWN) — mirrors liveClaimBlocksRemoval's contract.
 * Freshness reuses the session-liveness SSOT (hasFreshHeartbeat, 300s); no
 * second liveness predicate.
 *
 * Kill-switch: WORKTREE_RESIDENCY_GUARD=off restores pre-guard behavior
 * (loudly) for emergency rollback without a revert — the guard sits on every
 * delete path, so a false-positive storm must be operationally recoverable.
 */
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8 (GUARD): this scans EVERY session with a
// worktree_path to block reaping a resident worktree. claude_sessions grows, so a silent 1000-row cap
// could hide a live resident session in the truncated tail — the guard would return blocked:false and
// the reaper would DESTROY a live worktree (the twice-recurred self-reap class). Paginate; the existing
// try/catch keeps the FAIL-CLOSED contract (fetchAllPaginated throws -> caught -> REAP_RESIDENCY_UNKNOWN).
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

const require = createRequire(import.meta.url);
const { hasFreshHeartbeat } = require('../fleet/session-liveness.cjs');

export const REAP_BLOCKED_RESIDENT = 'REAP_BLOCKED_RESIDENT';
export const REAP_RESIDENCY_UNKNOWN = 'REAP_RESIDENCY_UNKNOWN';

function killSwitchOff() {
  const v = String(process.env.WORKTREE_RESIDENCY_GUARD || '').toLowerCase();
  return v === 'off' || v === '0' || v === 'false';
}

function norm(p) {
  return path.resolve(String(p)).replace(/[\\/]+$/, '');
}

/** Is `inner` the same directory as `outer`, or contained inside it? */
function pathInside(inner, outer) {
  const a = norm(inner);
  const b = norm(outer);
  if (process.platform === 'win32') {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al === bl || al.startsWith(bl + path.sep);
  }
  return a === b || a.startsWith(b + path.sep);
}

/**
 * SYNC residency check: is the acting process standing inside the target?
 * This is the exact in-process self-reap vector (post-merge cleanup running
 * from inside the worktree it deletes) and needs no I/O, so it binds inside
 * the synchronous delete chokepoint (removeWorktreeViaGit).
 *
 * @param {string} wtPath - worktree path targeted for deletion
 * @param {{ cwd?: string, logger?: function }} [options] - cwd override for tests
 * @returns {{ blocked: boolean, reason: string|null, bypassed?: boolean }}
 */
export function cwdResidencyBlocks(wtPath, options = {}) {
  const { cwd = process.cwd(), logger = console.warn } = options;
  if (killSwitchOff()) {
    logger(`[residency-guard] WORKTREE_RESIDENCY_GUARD=off — BYPASSING cwd residency check for ${wtPath}`);
    return { blocked: false, reason: null, bypassed: true };
  }
  try {
    if (pathInside(cwd, wtPath)) {
      return { blocked: true, reason: REAP_BLOCKED_RESIDENT };
    }
    return { blocked: false, reason: null };
  } catch (e) {
    // Path math should never throw, but the contract is fail-closed.
    logger(`[residency-guard] cwd residency check failed (${e?.message}) — failing CLOSED`);
    return { blocked: true, reason: REAP_RESIDENCY_UNKNOWN };
  }
}

/**
 * ASYNC residency check: does any FRESH-heartbeat session's worktree_path
 * reference the target? Queries claude_sessions directly — v_active_sessions
 * does not project worktree_path (QF-20260510-WT-CLAIM-PROTECT-001).
 * For async removers only (scheduled reaper, cleanup-pending sweep); the sync
 * chokepoint cannot await this.
 *
 * @param {object} supabase - service-role client
 * @param {string} wtPath - worktree path targeted for deletion
 * @param {{ nowMs?: number, logger?: function }} [options]
 * @returns {Promise<{ blocked: boolean, reason: string|null, detail?: string }>}
 */
export async function heartbeatResidencyBlocksRemoval(supabase, wtPath, options = {}) {
  const { nowMs = Date.now(), logger = console.warn } = options;
  if (killSwitchOff()) {
    logger(`[residency-guard] WORKTREE_RESIDENCY_GUARD=off — BYPASSING heartbeat residency check for ${wtPath}`);
    return { blocked: false, reason: null };
  }
  try {
    const data = await fetchAllPaginated(() => supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, worktree_path')
      .not('worktree_path', 'is', null)
      .order('session_id', { ascending: true })); // unique tiebreaker (FR-6): claude_sessions keyed by session_id
    for (const row of data || []) {
      if (!row.worktree_path) continue;
      // Resident when the session's registered worktree IS the target, or sits
      // inside it (nested fixture worktrees) — either way deletion is unsafe.
      const references = pathInside(row.worktree_path, wtPath) || pathInside(wtPath, row.worktree_path);
      if (references && hasFreshHeartbeat(row, nowMs)) {
        return {
          blocked: true,
          reason: REAP_BLOCKED_RESIDENT,
          detail: `fresh-heartbeat session ${row.session_id} resident at ${row.worktree_path}`,
        };
      }
    }
    return { blocked: false, reason: null };
  } catch (e) {
    logger(`[residency-guard] heartbeat residency check failed for ${wtPath} (${e?.message}) — failing CLOSED`);
    return { blocked: true, reason: REAP_RESIDENCY_UNKNOWN, detail: e?.message };
  }
}

/**
 * TREE residency (SD-FDBK-INFRA-ORPHAN-WORKTREE-STRANDING-001-B, FR-2).
 *
 * WHY A THIRD RESIDENCY PREDICATE. The two above answer "is a session standing here?" by
 * ADDRESS — cwd, or claude_sessions.worktree_path. That column holds ONE path per session,
 * so a worker occupying a SECONDARY ad-hoc worktree while its session row still points at
 * its primary venue is STRUCTURALLY INVISIBLE to both. On 2026-07-31 two ceremony trees were
 * reaped through exactly that hole. And for a tree whose basename resolves to no work key,
 * NO addressing scheme can answer at all: keyFromWorktree (worktree-reaper.mjs:379-383) reads
 * the branch but only for feat|qf|fix|chore|hotfix, so `scribe/rls-receipts-20260731` resolves
 * under neither branch nor basename. Occupancy is therefore not one predicate among several —
 * it is the ONLY one available to that class, which is why this asks the filesystem directly
 * and needs no DB row to agree with reality.
 *
 * This is fix option (3) from the QF-20260725-821 incident report, whose own note in
 * reap-protected-marker.js called residency "the general operator fix" and deferred it.
 *
 * SEPARATE FUNCTION, NOT FOLDED INTO heartbeatResidencyBlocksRemoval, for two reasons: folding
 * would break three existing assertions that build mkdtemp fixtures whose mtime is NOW, and it
 * would merge two refusal reasons that must stay separately greppable.
 *
 * TWO MEASURED TRAPS, both of which produce a WRONG answer rather than a noisy one:
 *
 *  (1) WALK-UP. `git log -1 --format=%ct` run with cwd set to a .git-LESS directory returns the
 *      PARENT repo's HEAD time — git repo discovery walks up and .gitignore does not stop it.
 *      Unguarded, every orphan reads as "resident because the parent just committed" and is
 *      blocked FOREVER, which would cement precisely the stranding class this SD family exists
 *      to unstick. So the HEAD probe runs ONLY after --show-toplevel confirms wtPath IS the
 *      worktree root. mtime needs no such guard: fs.statSync cannot walk up.
 *
 *  (2) PATH SHAPE. On Windows `--show-toplevel` returns FORWARD slashes while path.resolve
 *      returns BACKslashes, so a naive `toplevel === wtPath` is FALSE for a GENUINE worktree.
 *      That failure is the mirror image of the first: the guard would silently degenerate to
 *      ALWAYS-CLEAR and pass any suite that only tested the orphan case. Hence sameDir(), built
 *      on the norm() this module already uses for exactly this reason.
 *
 * Polarity note: unlike its siblings this predicate does NOT fail closed on a git error. A git
 * failure here means "no HEAD signal", not "unknown residency" — mtime still answers, and
 * treating a pruned or corrupt gitdir as permanently resident would re-create trap (1) by
 * another route. A THROW (not a non-zero exit) is still fail-closed.
 */
export const REAP_BLOCKED_TREE_RESIDENT = 'REAP_BLOCKED_TREE_RESIDENT';
export const DEFAULT_RESIDENCY_WINDOW_MIN = 30;

/** Same directory, tolerant of separator direction and Windows case. */
function sameDir(a, b) {
  return pathInside(a, b) && pathInside(b, a);
}

function defaultGitRunner(args, cwd) {
  try {
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { code: 0, stdout: out };
  } catch (e) {
    return { code: typeof e?.status === 'number' ? e.status : 1, stdout: '' };
  }
}

function resolveWindowMin(explicit) {
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const env = Number(process.env.WORKTREE_RESIDENCY_WINDOW_MIN);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_RESIDENCY_WINDOW_MIN;
}

/**
 * Has this tree been touched recently enough to count as occupied?
 *
 * @param {string} wtPath
 * @param {{ nowMs?: number, windowMin?: number, statFn?: function, gitRunner?: function, logger?: function }} [options]
 * @returns {{ blocked: boolean, reason: string|null, detail?: object }}
 */
export function treeResidencyBlocksRemoval(wtPath, options = {}) {
  const {
    nowMs = Date.now(),
    windowMin,
    statFn = fs.statSync,
    gitRunner = defaultGitRunner,
    logger = console.warn,
  } = options;

  if (killSwitchOff()) {
    logger(`[residency-guard] WORKTREE_RESIDENCY_GUARD=off — BYPASSING tree residency check for ${wtPath}`);
    return { blocked: false, reason: null, bypassed: true };
  }

  const windowMs = resolveWindowMin(windowMin) * 60 * 1000;

  try {
    // mtime: immune to walk-up by construction.
    //
    // SEC-03: a stat FAILURE is not evidence of absence. This previously swallowed every
    // error to mtimeMs=0, which reads as "ancient" and clears the guard. The sharp edge is
    // Windows-specific and points the wrong way: a directory held open by a live process
    // yields EPERM/EBUSY, so the error most CORRELATED WITH OCCUPANCY was converted into
    // evidence that nobody was there. ENOENT is different — an absent directory is a real
    // answer, and nothing is occupying a path that does not exist.
    let mtimeMs = 0;
    try {
      mtimeMs = Number(statFn(wtPath)?.mtimeMs) || 0;
    } catch (e) {
      if (e?.code !== 'ENOENT') {
        logger(`[residency-guard] stat failed for ${wtPath} (${e?.code || e?.message}) — failing CLOSED`);
        return { blocked: true, reason: REAP_RESIDENCY_UNKNOWN, detail: { stat_error: e?.code || String(e?.message) } };
      }
      mtimeMs = 0;
    }

    // HEAD: only meaningful when wtPath IS the worktree root (trap 1), and only
    // detectable as such with separator/case-tolerant comparison (trap 2).
    let headMs = 0;
    let isWorktreeRoot = false;
    const top = gitRunner(['rev-parse', '--show-toplevel'], wtPath);
    if (top?.code === 0) {
      const toplevel = String(top.stdout || '').trim();
      if (toplevel && sameDir(toplevel, wtPath)) {
        isWorktreeRoot = true;
        const head = gitRunner(['log', '-1', '--format=%ct'], wtPath);
        if (head?.code === 0) {
          const secs = Number(String(head.stdout || '').trim());
          if (Number.isFinite(secs) && secs > 0) headMs = secs * 1000;
        }
      }
    }

    // SEC-05: clamp FUTURE timestamps to "now" rather than letting them produce a negative
    // age. A tree stamped in 2030 — by a skewed clock, a crafted GIT_COMMITTER_DATE, or a
    // restored archive — otherwise reads as resident FOREVER and can never be reaped. That
    // is the permanent-backlog failure this SD's own FR-1b argues against, reachable by
    // anyone who can set a file mtime. Clamping keeps it resident for one window, which is
    // the conservative reading of "we cannot tell when this was last touched", and then
    // lets it age out normally.
    const rawActivityMs = Math.max(mtimeMs, headMs);
    const lastActivityMs = rawActivityMs > nowMs ? nowMs : rawActivityMs;
    const ageMs = lastActivityMs > 0 ? nowMs - lastActivityMs : Infinity;
    if (ageMs <= windowMs) {
      return {
        blocked: true,
        reason: REAP_BLOCKED_TREE_RESIDENT,
        detail: { age_ms: ageMs, window_ms: windowMs, mtime_ms: mtimeMs, head_ms: headMs, is_worktree_root: isWorktreeRoot },
      };
    }
    return { blocked: false, reason: null, detail: { age_ms: ageMs, window_ms: windowMs, is_worktree_root: isWorktreeRoot } };
  } catch (e) {
    logger(`[residency-guard] tree residency check failed for ${wtPath} (${e?.message}) — failing CLOSED`);
    return { blocked: true, reason: REAP_RESIDENCY_UNKNOWN, detail: { error: e?.message } };
  }
}

export default {
  cwdResidencyBlocks,
  heartbeatResidencyBlocksRemoval,
  treeResidencyBlocksRemoval,
  REAP_BLOCKED_RESIDENT,
  REAP_RESIDENCY_UNKNOWN,
  REAP_BLOCKED_TREE_RESIDENT,
  DEFAULT_RESIDENCY_WINDOW_MIN,
};
