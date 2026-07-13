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

/**
 * Sibling to stampLastFired(), for gha_cron entries (liveness_source='github_actions_api')
 * (SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001, FR-2).
 *
 * PRE-EXEC CORRECTION (TESTING sub-agent FINDING-A, HIGH): stampLastFired() above hard-filters
 * .eq('liveness_source','self_stamped') by design (see its docstring) -- calling it for gha_cron
 * rows would be a silent no-op. This function mirrors the same additive-registry-membership
 * semantics (a no-op with a logged warning for an unregistered process_key, never auto-creating
 * a row) but filters on 'github_actions_api' instead, and accepts an explicit ranAtIso timestamp
 * (the GitHub Actions run's own completion time) rather than always stamping "now" -- the
 * resolver in periodic-liveness-watcher.mjs polls runs after the fact, so the fired time is the
 * run's timestamp, not the poll time.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} processKey
 * @param {string} ranAtIso
 * @returns {Promise<{stamped: boolean, reason?: string}>}
 */
export async function stampFromGithubActionsRun(supabase, processKey, ranAtIso) {
  if (!processKey) {
    throw new Error('[stamp-last-fired] stampFromGithubActionsRun requires a processKey');
  }
  if (!ranAtIso) {
    throw new Error('[stamp-last-fired] stampFromGithubActionsRun requires ranAtIso');
  }

  const { data, error } = await supabase
    .from('periodic_process_registry')
    .update({ last_fired_at: ranAtIso, updated_at: new Date().toISOString() })
    .eq('process_key', processKey)
    .eq('liveness_source', 'github_actions_api')
    .select('process_key');

  if (error) {
    throw new Error(`[stamp-last-fired] github_actions_api update failed for ${processKey}: ${error.message}`);
  }

  if (!data || data.length === 0) {
    console.warn(`[stamp-last-fired] '${processKey}' is not a registered github_actions_api process -- no-op. Register it in periodic_process_registry first.`);
    return { stamped: false, reason: 'not_registered_as_github_actions_api' };
  }

  return { stamped: true };
}

export default { stampLastFired, stampFromGithubActionsRun };
