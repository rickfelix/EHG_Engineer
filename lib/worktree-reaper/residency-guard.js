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

export default { cwdResidencyBlocks, heartbeatResidencyBlocksRemoval, REAP_BLOCKED_RESIDENT, REAP_RESIDENCY_UNKNOWN };
