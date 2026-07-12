/* collision-check.cjs — distinguish a live dual-claim from a benign release-then-reclaim
 * (QF-20260712-008, RCA on QF-20260712-254).
 *
 * strategic_directives_v2.metadata.claim_history records claims but never releases, so
 * reading it in isolation cannot tell a simultaneous double-claim (real collision) apart
 * from a sequential release-then-reclaim (benign). session_lifecycle_events IS the SSOT
 * for release/stale transitions (claim_cleared_irrevocable / claim_cleared_recoverable) —
 * this module cross-references it before a caller declares a live collision.
 *
 * Contract: FAIL-OPEN toward "assume collision" — a lookup error must never suppress a
 * real alert, only a confirmed release can downgrade one.
 */

/**
 * @param {object} supabase
 * @param {string} earlierSessionId - the session_id of the earlier claim_history entry
 * @param {string} sdKey - the sd_key both claims were made against (scopes the release lookup —
 *   a session can have many claim/release cycles across unrelated SDs the same day)
 * @param {string} laterClaimedAt - ISO timestamp of the later claim_history entry
 * @returns {Promise<{ isLiveCollision: boolean, releasedAt: string|null, reason: string }>}
 */
async function checkClaimCollision(supabase, earlierSessionId, sdKey, laterClaimedAt) {
  if (!supabase || !earlierSessionId || !sdKey || !laterClaimedAt) {
    return { isLiveCollision: true, releasedAt: null, reason: 'missing_args_fail_open' };
  }
  try {
    const { data, error } = await supabase
      .from('session_lifecycle_events')
      .select('reason, created_at')
      .eq('session_id', earlierSessionId)
      .ilike('reason', `claim_cleared%sd_key=${sdKey}%`)
      .order('created_at', { ascending: true });
    if (error) return { isLiveCollision: true, releasedAt: null, reason: `lookup_error_fail_open: ${error.message}` };

    const releasedBeforeLaterClaim = (data || []).find((row) => row.created_at < laterClaimedAt);
    if (releasedBeforeLaterClaim) {
      return { isLiveCollision: false, releasedAt: releasedBeforeLaterClaim.created_at, reason: 'released_before_later_claim' };
    }
    return { isLiveCollision: true, releasedAt: null, reason: 'no_release_found_before_later_claim' };
  } catch (e) {
    return { isLiveCollision: true, releasedAt: null, reason: `exception_fail_open: ${e?.message || e}` };
  }
}

module.exports = { checkClaimCollision };
