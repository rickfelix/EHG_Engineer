/**
 * JS wrapper for fn_check_sd_claim RPC.
 * SD-LEO-INFRA-CLAIM-CHECK-HARDENING-001
 *
 * Multi-signal claim detection: checks SD ownership via claiming_session_id,
 * session heartbeat freshness, handoff activity, and session existence.
 *
 * @module check-sd-claim
 */

/**
 * Check the claim status of an SD using the fn_check_sd_claim RPC.
 *
 * @param {object} supabase - Supabase client
 * @param {string} sdKey - The SD key to check (e.g., 'SD-XXX-001')
 * @param {string} [sessionId] - Optional session ID for self-ownership check
 * @returns {Promise<{
 *   is_claimed: boolean,
 *   claimer_session_id?: string,
 *   claimer_exists?: boolean,
 *   claimer_status?: string,
 *   heartbeat_age_seconds?: number,
 *   is_stale?: boolean,
 *   has_recent_handoff?: boolean,
 *   is_working_on?: boolean,
 *   current_phase?: string,
 *   sd_key: string,
 *   is_self?: boolean,
 *   recommendation: string,
 *   error?: string
 * }>}
 */
export async function checkSdClaim(supabase, sdKey, sessionId = null) {
  const { data, error } = await supabase.rpc('fn_check_sd_claim', {
    p_sd_key: sdKey,
    p_session_id: sessionId,
  });

  if (error) {
    return {
      is_claimed: false,
      sd_key: sdKey,
      error: error.message,
      recommendation: 'error',
    };
  }

  return data;
}

/**
 * Check if an SD is available for claiming.
 *
 * @param {object} supabase - Supabase client
 * @param {string} sdKey - The SD key to check
 * @param {string} sessionId - The session that wants to claim
 * @returns {Promise<{available: boolean, reason: string, detail: object}>}
 */
export async function isClaimAvailable(supabase, sdKey, sessionId) {
  const result = await checkSdClaim(supabase, sdKey, sessionId);

  if (result.error === 'sd_not_found') {
    return { available: false, reason: 'sd_not_found', detail: result };
  }

  if (!result.is_claimed) {
    return { available: true, reason: 'unclaimed', detail: result };
  }

  if (result.is_self) {
    return { available: true, reason: 'self_owned', detail: result };
  }

  if (result.recommendation === 'release_stale' || result.recommendation === 'release_orphaned') {
    return { available: false, reason: 'stale_claim', detail: result };
  }

  return { available: false, reason: 'claimed_by_other', detail: result };
}

export default { checkSdClaim, isClaimAvailable };
