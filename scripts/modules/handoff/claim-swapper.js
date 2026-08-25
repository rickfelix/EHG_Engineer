/**
 * ClaimSwapper — Atomic release+acquire claim via Postgres RPCs
 *
 * Performs claim transfer for a session by delegating to atomic Postgres RPCs
 * (switch_sd_claim / release_sd) that own both claim-surface tables
 * (claude_sessions and strategic_directives_v2) in one transaction, so a claim
 * is never left synced on one table but stale on the other.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 *
 * SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-2): worktree-state clears route
 * through lib/lifecycle/worktree-state-writer.mjs. Worktree columns are NOT
 * owned by the RPCs; clearWorktreeState is invoked after a successful
 * release/swap so the (sd_key, worktree_*) invariant holds.
 *
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 (FR-1): swapClaim() previously did a
 * raw claude_sessions-only UPDATE that never touched strategic_directives_v2's
 * claim columns on either the evicted or newly-claimed SD -- now delegates to
 * switch_sd_claim, mirroring releaseClaim()'s existing release_sd delegation.
 */

import { clearWorktreeState } from '../../../lib/lifecycle/worktree-state-writer.mjs';

/**
 * Atomically swap the claimed SD for a session.
 *
 * SD-LEO-INFRA-CLAIM-SURFACE-SYNC-001 (FR-1): delegates to the switch_sd_claim
 * RPC (migration 20260506000000_claim_dual_column_atomicity.sql) instead of a
 * raw claude_sessions-only UPDATE. The prior hand-rolled UPDATE touched only
 * claude_sessions.sd_key, leaving strategic_directives_v2's claiming_session_id/
 * active_session_id/is_working_on stale on BOTH the evicted SD (never cleared)
 * and the newly-claimed SD (never set) -- the exact stale-claim-on-switch defect
 * QF-20260824-154 measured live. switch_sd_claim clears/sets both SDs' claim
 * columns atomically in one transaction; this mirrors releaseClaim() below,
 * which already delegates to the release_sd RPC rather than hand-rolling.
 * switch_sd_claim does not own worktree_path/worktree_branch (a separate
 * concern per lib/lifecycle/worktree-state-writer.mjs), so clearWorktreeState
 * is still called here after a successful switch, unchanged from before.
 *
 * @param {object} supabase - Supabase client
 * @param {object} params
 * @param {string} params.sessionId - Current session ID
 * @param {string} params.oldSdKey - SD key being released (null for fresh claim)
 * @param {string} params.newSdKey - SD key being claimed
 * @param {string} [params.track] - Track to stamp on the new claim
 * @returns {Promise<{ success: boolean, reason: string }>}
 */
export async function swapClaim(supabase, { sessionId, oldSdKey, newSdKey, track }) {
  if (!sessionId || !newSdKey) {
    return { success: false, reason: 'Missing sessionId or newSdKey' };
  }

  try {
    const { data, error } = await supabase.rpc('switch_sd_claim', {
      p_session_id: sessionId,
      p_old_sd_id: oldSdKey || null,
      p_new_sd_id: newSdKey,
      p_new_track: track || null,
    });

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }

    if (data && data.success === false) {
      // switch_sd_claim's newer existence/terminal-status guards return a terse
      // code in `error` (e.g. 'sd_not_found') and the descriptive text in
      // `message`; prefer message so callers see the useful text, not the code.
      return { success: false, reason: data.message || data.error || 'switch_sd_claim RPC reported failure' };
    }

    // FR-2 (prior SD): when swapping FROM a prior SD, clear the prior worktree
    // state. The new SD's worktree (if any) will be written by sd-start.js
    // after createWorktree succeeds. Skipping the clear when oldSdKey is null
    // (fresh claim) avoids over-writing nothing.
    if (oldSdKey) {
      await clearWorktreeState(sessionId, { supabase, reason: 'claim_swap' });
    }

    return { success: true, reason: `Claimed ${newSdKey}` };
  } catch (err) {
    return { success: false, reason: `Exception: ${err.message}` };
  }
}

/**
 * Release a claim without acquiring a new one.
 *
 * @param {object} supabase - Supabase client
 * @param {string} sessionId - Session to release
 * @param {string} sdKey - SD key to release
 * @returns {Promise<{ success: boolean, reason: string }>}
 */
export async function releaseClaim(supabase, sessionId, sdKey) {
  try {
    // Pre-check holds caller-side safety: confirm session actually holds sdKey.
    // The atomic RPC below is session-scoped (releases whatever the session
    // holds) so this guards against caller-side bugs where the wrong sdKey is
    // passed.
    const { data: session, error: selectError } = await supabase
      .from('claude_sessions')
      .select('sd_key')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (selectError) {
      return { success: false, reason: `DB error: ${selectError.message}` };
    }
    if (!session) {
      return { success: false, reason: `Session ${sessionId} not found` };
    }
    if (session.sd_key !== sdKey) {
      return { success: false, reason: `Session does not hold claim on ${sdKey}` };
    }

    // Atomic release via release_sd RPC (migration 20260502_release_clear_worktree_state.sql):
    // single UPDATE NULLs sd_key, worktree_path, worktree_branch together so the
    // ck_claude_sessions_worktree_state_consistency invariant holds at every
    // observable row state. Also clears claiming_session_id / active_session_id
    // on the SD row, fixing the partial-cleanup class where releaseClaim only
    // touched claude_sessions.
    const { data, error } = await supabase.rpc('release_sd', {
      p_session_id: sessionId,
      p_reason: 'release_claim'
    });

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }
    if (data && data.success === false) {
      return { success: false, reason: data.error || data.message || 'release_sd RPC reported failure' };
    }

    return { success: true, reason: `Released ${sdKey}` };
  } catch (err) {
    return { success: false, reason: `Exception: ${err.message}` };
  }
}

/**
 * Refresh heartbeat for a session to prevent stale claim detection.
 *
 * @param {object} supabase - Supabase client
 * @param {string} sessionId - Session ID
 * @returns {Promise<void>}
 */
export async function refreshHeartbeat(supabase, sessionId) {
  try {
    await supabase
      .from('claude_sessions')
      .update({ heartbeat_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  } catch {
    // Non-fatal: heartbeat refresh failure doesn't block chaining
  }
}
