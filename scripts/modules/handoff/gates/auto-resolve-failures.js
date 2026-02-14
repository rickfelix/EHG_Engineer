/**
 * Auto-Resolve Previous Handoff Failures
 * SD-LEO-FIX-CLAIM-GUARD-SESSION-001
 *
 * Shared utility for all handoff executor gates.
 * When retrying a handoff, auto-resolves previous failed/rejected/blocked
 * attempts by setting resolved_at. This prevents dead-loops where a gate
 * blocks every retry because old failures still appear unresolved.
 *
 * Pattern extracted from transition-readiness.js (LEAD-TO-PLAN gate)
 * and extended to all handoff types.
 */

/**
 * Auto-resolve unresolved failed handoffs for a given SD and handoff type.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdUuid - The SD UUID (not sd_key)
 * @param {string} handoffType - The handoff type (e.g., 'PLAN-TO-EXEC')
 * @returns {{ resolved: number, error: string|null }}
 */
export async function autoResolveFailedHandoffs(supabase, sdUuid, handoffType) {
  try {
    const { data: previousHandoffs, error: queryError } = await supabase
      .from('sd_phase_handoffs')
      .select('id, status, created_at, rejection_reason, resolved_at')
      .eq('sd_id', sdUuid)
      .eq('handoff_type', handoffType)
      .in('status', ['rejected', 'failed', 'blocked'])
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(5);

    if (queryError) {
      return { resolved: 0, error: queryError.message };
    }

    if (!previousHandoffs || previousHandoffs.length === 0) {
      return { resolved: 0, error: null };
    }

    const idsToResolve = previousHandoffs.map(h => h.id);
    const { error: updateError } = await supabase
      .from('sd_phase_handoffs')
      .update({ resolved_at: new Date().toISOString() })
      .in('id', idsToResolve);

    if (updateError) {
      return { resolved: 0, error: updateError.message };
    }

    return { resolved: previousHandoffs.length, error: null };
  } catch (err) {
    return { resolved: 0, error: err.message };
  }
}
