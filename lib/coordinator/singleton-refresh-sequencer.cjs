// @wire-check-exempt: Child C of a 3-way sequenced decomposition (parent
// SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001, TR-3: children build
// bottom-up, later children wire earlier ones together). This is a real, tested library
// with no standalone CLI mode (its functions take live sessionId/worktreePath args, not
// sensible CLI defaults) — it is intentionally unconsumed until Child B's relaunch
// orchestrator (not yet built) calls sequenceSingletonRefresh() as its final step.
/**
 * Singleton refresh register-then-retire sequencer.
 *
 * SD-LEO-INFRA-COORDINATOR-ORCHESTRATED-SINGLETON-REFRESH-001-C
 *
 * Child C of the coordinator-orchestrated singleton refresh pipeline: after Child B
 * relaunches a long-lived singleton (coordinator / Adam / Solomon) onto a fresh checkout,
 * this module resolves the register-vs-retire ordering so there is never a window where
 * BOTH the new and old session are simultaneously the "live" holder of the role (double
 * registration) nor a window where NEITHER is (zero-singleton). The rule is strict:
 * verify the new session's registration is healthy FIRST; only then retire the old one.
 *
 * This mirrors the decision-function shape already proven for coordinator/Adam role
 * handoff (lib/coordinator/adam-identity.cjs decideSingleAdamGuard) rather than
 * inventing a new pattern, and reuses the EXISTING guarded worktree-removal path
 * (lib/worktree-manager.js removeWorktreeViaGit) instead of a raw `git worktree
 * remove --force` / `rm -rf` — a raw removal is confirmed able to wipe a node_modules
 * junction TARGET in the main working tree, not just the removed worktree.
 *
 * Retirement reuses the EXISTING claude_sessions.released_at / released_reason columns
 * (the same chokepoint scripts/stale-session-sweep.cjs already writes through) rather
 * than adding a new "retired" column.
 */

const LOOP_STATE_EXITED = 'exited';
const VALID_LOOP_STATES = Object.freeze(['active', 'awaiting_tick', 'exited', 'unknown']);

const DEFAULT_FRESH_MS = 5 * 60 * 1000; // 5 minutes, matches the sweep's heartbeat-freshness convention
const RETIRED_REASON = 'ROLE_TRANSFER_RETIRED';

/**
 * @param {string|null|undefined} heartbeatAt
 * @param {number} nowMs
 * @param {number} freshMs
 */
function isFreshHeartbeat(heartbeatAt, nowMs, freshMs) {
  if (!heartbeatAt) return false;
  const t = new Date(heartbeatAt).getTime();
  if (Number.isNaN(t)) return false;
  return (nowMs - t) <= freshMs;
}

/**
 * PURE health check for a newly-registered session. Healthy requires BOTH a fresh
 * heartbeat AND a loop_state that is reachable/queryable (not 'exited', not missing).
 * @param {{ heartbeat_at?: string|null, loop_state?: string|null }} session
 * @param {{ nowMs?: number, freshMs?: number }} [opts]
 * @returns {{ healthy: boolean, reason: string }}
 */
function checkNewSessionHealth(session, { nowMs = Date.now(), freshMs = DEFAULT_FRESH_MS } = {}) {
  if (!session) {
    return { healthy: false, reason: 'new session not found in claude_sessions' };
  }
  if (!isFreshHeartbeat(session.heartbeat_at, nowMs, freshMs)) {
    return { healthy: false, reason: 'new session heartbeat is stale or missing' };
  }
  const loopState = session.loop_state;
  if (!loopState || !VALID_LOOP_STATES.includes(loopState)) {
    return { healthy: false, reason: `new session loop_state is not queryable (got: ${String(loopState)})` };
  }
  if (loopState === LOOP_STATE_EXITED) {
    return { healthy: false, reason: 'new session loop_state is exited' };
  }
  return { healthy: true, reason: 'fresh heartbeat and reachable loop_state' };
}

/**
 * PURE sequencing decision. This is the mutex: retirement of the old session is NEVER
 * decided except as a function of a positive new-session health check. Structurally,
 * callers must call this before retireOldSession — there is no path that retires first.
 * @param {{ newSessionHealthy: boolean }} p
 * @returns {{ action: 'retire_old' | 'hold_old', reason: string }}
 */
function decideRefreshSequencing({ newSessionHealthy }) {
  if (newSessionHealthy) {
    return { action: 'retire_old', reason: 'new session verified healthy — safe to retire old session' };
  }
  return { action: 'hold_old', reason: 'new session not yet healthy — old session held active, not retired' };
}

/**
 * Fetch the minimal fields needed for a health check.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} sessionId
 */
async function fetchSessionForHealthCheck(supabase, sessionId) {
  const { data, error } = await supabase
    .from('claude_sessions')
    .select('session_id, heartbeat_at, loop_state')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (error) throw new Error(`fetchSessionForHealthCheck(${sessionId}): ${error.message}`);
  return data;
}

/**
 * Retire the old session: mark it released via the EXISTING released_at/released_reason
 * chokepoint (same columns scripts/stale-session-sweep.cjs already writes), then remove
 * its worktree via the EXISTING guarded removal path. Never call this without first
 * confirming decideRefreshSequencing({newSessionHealthy}).action === 'retire_old'.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ oldSessionId: string, oldWorktreePath?: string|null, repoRoot?: string, reason?: string }} p
 * @returns {Promise<{ ok: boolean, sessionUpdateError: string|null, worktreeResult: object|null }>}
 */
async function retireOldSession(supabase, { oldSessionId, oldWorktreePath = null, repoRoot = null, reason = RETIRED_REASON } = {}) {
  if (!oldSessionId) throw new Error('retireOldSession: oldSessionId is required');

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('claude_sessions')
    .update({
      status: 'released',
      released_at: nowIso,
      released_reason: reason,
      sd_key: null,
      worktree_path: null,
      worktree_branch: null,
      has_uncommitted_changes: false,
      current_branch: null,
    })
    .eq('session_id', oldSessionId);

  // SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001: the retired session may still hold the SD-side
  // claim (strategic_directives_v2.claiming_session_id). The session-side clear above alone
  // would leave that SD looking CLAIMED by a now-released session. Resolve the held SD and
  // co-clear the SD-side through the unified helper (holder-pinned CAS; the helper's own
  // session-side clear no-ops since sd_key was already nulled above). Fail-soft — the retire
  // itself already succeeded.
  let sdClaimError = null;
  try {
    const { data: heldSd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('claiming_session_id', oldSessionId)
      .maybeSingle();
    if (heldSd && heldSd.sd_key) {
      const { releaseClaimBothSurfaces } = await import('../claim/release-claim-both-surfaces.mjs');
      const r = await releaseClaimBothSurfaces(supabase, {
        sdKey: heldSd.sd_key, holderSessionId: oldSessionId, reason, sessionStatus: 'released', readback: false,
      });
      sdClaimError = r.error;
    }
  } catch (e) { sdClaimError = e && e.message ? e.message : String(e); }
  if (sdClaimError) console.warn(`[singleton-refresh] SD-side co-clear for retired ${oldSessionId} failed: ${sdClaimError}`);

  let worktreeResult = null;
  if (oldWorktreePath) {
    // Dynamic import: lib/worktree-manager.js is ESM, this module is CJS.
    const { removeWorktreeViaGit, getRepoRoot } = await import('../worktree-manager.js');
    const root = repoRoot || getRepoRoot();
    worktreeResult = removeWorktreeViaGit(oldWorktreePath, root, {
      guard: true, // re-verifies the worktree is not owned by another live session before removing
      allowFail: true,
      logger: console.warn.bind(console), // removeWorktreeViaGit calls logger(...) as a function
    });
  }

  return {
    ok: !updateError && (worktreeResult ? worktreeResult.ok !== false || Boolean(worktreeResult.skipped) : true),
    sessionUpdateError: updateError ? updateError.message : null,
    sdClaimError,
    worktreeResult,
  };
}

/**
 * Full orchestration: verify new session health, decide, and only retire the old
 * session if the decision says so. This is the single entry point callers should use.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ newSessionId: string, oldSessionId: string, oldWorktreePath?: string|null, repoRoot?: string, freshMs?: number, reason?: string }} p
 */
async function sequenceSingletonRefresh(supabase, {
  newSessionId,
  oldSessionId,
  oldWorktreePath = null,
  repoRoot = null,
  freshMs = DEFAULT_FRESH_MS,
  reason = RETIRED_REASON,
} = {}) {
  if (!newSessionId) throw new Error('sequenceSingletonRefresh: newSessionId is required');
  if (!oldSessionId) throw new Error('sequenceSingletonRefresh: oldSessionId is required');

  const newSession = await fetchSessionForHealthCheck(supabase, newSessionId);
  const health = checkNewSessionHealth(newSession, { freshMs });
  const decision = decideRefreshSequencing({ newSessionHealthy: health.healthy });

  if (decision.action === 'hold_old') {
    return {
      action: 'hold_old',
      retired: false,
      healthReason: health.reason,
      decisionReason: decision.reason,
    };
  }

  const retireResult = await retireOldSession(supabase, { oldSessionId, oldWorktreePath, repoRoot, reason });
  return {
    action: 'retire_old',
    retired: retireResult.ok,
    healthReason: health.reason,
    decisionReason: decision.reason,
    ...retireResult,
  };
}

module.exports = {
  DEFAULT_FRESH_MS,
  RETIRED_REASON,
  isFreshHeartbeat,
  checkNewSessionHealth,
  decideRefreshSequencing,
  fetchSessionForHealthCheck,
  retireOldSession,
  sequenceSingletonRefresh,
};
