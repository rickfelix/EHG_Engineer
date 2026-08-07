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

  const cleared = await clearOverdueOnStamp(supabase, processKey);
  return { stamped: true, ...(cleared ? { cleared_overdue: true } : {}) };
}

/**
 * QF-20260727-131 — clear a stale OVERDUE at the moment the process proves it is alive.
 *
 * ── THE DEFECT THIS CLOSES ────────────────────────────────────────────────────────────────
 * `last_state` has ONE writer: periodic-liveness-watcher.mjs, invoked by a GHA cron declared at a
 * fifteen-minute cadence. GitHub actually delivers that schedule at a MEASURED median of 83 minutes
 * (p90 186m, max 647m; 43 of 59 observed intervals exceeded 45m). The thresholds it renders are
 * 6/15/30/45m — so THE REFRESH PERIOD IS COARSER THAN THE THRESHOLDS, and a recovery stays
 * invisible for longer than the outage that raised the alarm. Live: standard_loop:inbox rendered
 * OVERDUE from a verdict 4h50m old while the watcher's own evaluateRow() returned OK for it.
 *
 * The recovery is ALREADY OBSERVED HERE, synchronously — this function is the process's own
 * stamp. The system held proof of life and threw it away, deferring the clear to a poll. So the
 * fix is not a new signal or a faster poll; it is using the one we already have.
 *
 * ── WHY EVERY GUARD IS A FILTER, NOT AN `if` ──────────────────────────────────────────────
 * The tempting version is "we just stamped, so it must be OK". MEASURED FALSE at the boundary
 * against the real evaluator: with expected_interval_seconds=0 or a NULL grace_multiplier the
 * threshold is 0 (Number(null) === 0) and a FRESH stamp still evaluates OVERDUE; with
 * currently_expected_active=false it evaluates INTENTIONALLY_DOWN, not OK. Expressing each
 * condition as a declarative filter makes this write STRUCTURALLY UNABLE to disagree with
 * evaluateRow, rather than agreeing with it by an assumption that a later edit can break.
 * (`.gt()` also excludes NULLs: `NULL > 0` IS NULL, verified live.)
 *
 * `.eq('last_state','OVERDUE')` makes it TRANSITION-ONLY, preserving the per-episode dedup
 * discipline that last_state_changed_at exists to enforce — a row already OK is never rewritten.
 *
 * NEVER-FALSE-OVERDUE IS UNTOUCHED: this moves OVERDUE->OK only, never the reverse, and only for
 * a row whose own producer just stamped it. It introduces no new false-OK, because the watcher
 * would compute the same OK from the same last_fired_at on its next run — the OK simply arrives
 * on time instead of up to 10.8h late.
 *
 * FAIL-SOFT: a failure here must never break the caller's stamp. The stamp is the durable
 * signal; this is a courtesy clear on top of it, and a process that cannot clear its banner must
 * still be recorded as having run.
 *
 * SCOPE: self_stamped only. stampFromGithubActionsRun() has the same shape but stamps a PAST
 * timestamp, so age != 0 there and a clear would have to re-derive the threshold; today's
 * gha_cron OVERDUE rows are all genuinely overdue, so that path is deliberately left alone.
 *
 * @returns {Promise<boolean>} true iff a stale OVERDUE was actually cleared
 */
async function clearOverdueOnStamp(supabase, processKey) {
  try {
    const { data, error } = await supabase
      .from('periodic_process_registry')
      .update({ last_state: 'OK', last_state_changed_at: new Date().toISOString() })
      .eq('process_key', processKey)
      .eq('liveness_source', 'self_stamped')
      .eq('currently_expected_active', true)
      .eq('last_state', 'OVERDUE')
      .gt('expected_interval_seconds', 0)
      .gt('grace_multiplier', 0)
      .select('process_key');
    if (error) {
      console.warn(`[stamp-last-fired] '${processKey}' stamped, but clearing its stale OVERDUE failed (non-fatal): ${error.message}`);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.warn(`[stamp-last-fired] '${processKey}' stamped, but clearing its stale OVERDUE threw (non-fatal): ${e?.message || e}`);
    return false;
  }
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
