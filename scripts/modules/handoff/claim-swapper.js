/**
 * ClaimSwapper — Atomic release+acquire claim via single UPDATE
 *
 * Performs claim transfer on claude_sessions using a conditional UPDATE
 * that only succeeds if the session still holds the old claim. This prevents
 * double-claiming race conditions.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 *
 * SD-LEO-INFRA-LEO-INFRA-SESSION-001 (FR-2): worktree-state clears now route
 * through lib/lifecycle/worktree-state-writer.mjs. Worktree columns are NOT
 * touched in the sd_key UPDATEs here; clearWorktreeState is invoked after a
 * successful release/swap so the (sd_key, worktree_*) invariant holds.
 */

import { clearWorktreeState } from '../../../lib/lifecycle/worktree-state-writer.mjs';

/**
 * Atomically swap the claimed SD for a session.
 *
 * Uses UPDATE ... WHERE sd_id=<old> AND session_id=<current> to ensure
 * atomicity. If 0 rows affected, another session stole the claim.
 *
 * @param {object} supabase - Supabase client
 * @param {object} params
 * @param {string} params.sessionId - Current session ID
 * @param {string} params.oldSdKey - SD key being released (null for fresh claim)
 * @param {string} params.newSdKey - SD key being claimed
 * @returns {Promise<{ success: boolean, reason: string }>}
 */
export async function swapClaim(supabase, { sessionId, oldSdKey, newSdKey }) {
  if (!sessionId || !newSdKey) {
    return { success: false, reason: 'Missing sessionId or newSdKey' };
  }

  try {
    // Build conditional UPDATE: only swap if session still holds oldSdKey
    let query = supabase
      .from('claude_sessions')
      .update({
        sd_key: newSdKey,
        claimed_at: new Date().toISOString(),
        released_at: null,
        heartbeat_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    if (oldSdKey) {
      query = query.eq('sd_key', oldSdKey);
    }

    const { data, error } = await query.select('session_id, sd_key');

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return {
        success: false,
        reason: oldSdKey
          ? `Claim swap failed: session no longer holds ${oldSdKey}`
          : `Session ${sessionId} not found`
      };
    }

    // FR-2: When swapping FROM a prior SD, clear the prior worktree state.
    // The new SD's worktree (if any) will be written by sd-start.js after
    // createWorktree succeeds. Skipping the clear when oldSdKey is null
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
