/**
 * One tiny shared stamp helper for self_stamped periodic-process registry entries
 * (SD-LEO-INFRA-PERIODIC-PROCESS-LIVENESS-001, FR-2).
 *
 * ONLY for standalone_cron entries with liveness_source='self_stamped' -- role_session and
 * scheduler_round entries derive their last-fired timestamp by READING their existing signal
 * (claude_sessions.heartbeat_at / eva_scheduler_heartbeat.metadata) at watch-time; they must
 * NEVER call this helper, per the binding constraint against new heartbeat machinery for
 * signals that already exist.
 *
 * Registry membership is additive, not auto-creating: calling this for an unregistered
 * process_key is a no-op with a logged warning (a hand-only registry list becomes its own
 * fossil, per the SD's own design note -- but this helper does not silently grow the registry
 * either; a new standalone process must be registered explicitly first).
 *
 * @module lib/periodic-liveness/stamp-last-fired
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} processKey
 * @returns {Promise<{stamped: boolean, reason?: string}>}
 */
export async function stampLastFired(supabase, processKey) {
  if (!processKey) {
    throw new Error('[stamp-last-fired] stampLastFired requires a processKey');
  }

  const { data, error } = await supabase
    .from('periodic_process_registry')
    .update({ last_fired_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('process_key', processKey)
    .eq('liveness_source', 'self_stamped')
    .select('process_key');

  if (error) {
    throw new Error(`[stamp-last-fired] update failed for ${processKey}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.warn(`[stamp-last-fired] '${processKey}' is not a registered self_stamped process -- no-op. Register it in periodic_process_registry first.`);
    return { stamped: false, reason: 'not_registered_as_self_stamped' };
  }

  return { stamped: true };
}

export default { stampLastFired };
