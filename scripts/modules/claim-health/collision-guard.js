/**
 * Collision Guard Module
 * SD-LEO-INFRA-INTELLIGENT-CLAIM-HEALTH-001
 *
 * Prevents session reuse from clobbering existing claims.
 * When a new session registers with a terminal_id that matches an existing
 * session which has an active SD claim, a NEW session row should be created
 * instead of reusing the existing one.
 */

/**
 * Check if a new session should be created instead of reusing an existing one.
 *
 * @param {object} existingSession - The existing session data from findExistingSession()
 *   Must have: { session_id, sd_id, status }
 * @returns {{shouldCreateNew: boolean, reason: string}}
 */
export function shouldCreateNewSession(existingSession) {
  if (!existingSession) {
    return { shouldCreateNew: false, reason: 'no_existing_session' };
  }

  // If existing session has an active SD claim, don't reuse — create new
  if (existingSession.sd_id && ['active', 'idle'].includes(existingSession.status)) {
    return {
      shouldCreateNew: true,
      reason: `existing_session_has_claim`,
      claimedSd: existingSession.sd_id,
      existingSessionId: existingSession.session_id
    };
  }

  // No active claim — safe to reuse
  return { shouldCreateNew: false, reason: 'no_active_claim' };
}
