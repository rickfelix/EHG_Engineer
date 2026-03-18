/**
 * ClaimSwapper — Atomic release+acquire claim via single UPDATE
 *
 * Performs claim transfer on claude_sessions using a conditional UPDATE
 * that only succeeds if the session still holds the old claim. This prevents
 * double-claiming race conditions.
 *
 * Part of SD-LEO-INFRA-IMPLEMENT-STANDALONE-AUTO-001
 */

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
        sd_id: newSdKey,
        claimed_at: new Date().toISOString(),
        released_at: null,
        heartbeat_at: new Date().toISOString()
      })
      .eq('session_id', sessionId);

    if (oldSdKey) {
      query = query.eq('sd_id', oldSdKey);
    }

    const { data, error } = await query.select('session_id, sd_id');

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
    const { data, error } = await supabase
      .from('claude_sessions')
      .update({
        sd_id: null,
        released_at: new Date().toISOString()
      })
      .eq('session_id', sessionId)
      .eq('sd_id', sdKey)
      .select('session_id');

    if (error) {
      return { success: false, reason: `DB error: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { success: false, reason: `Session does not hold claim on ${sdKey}` };
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
