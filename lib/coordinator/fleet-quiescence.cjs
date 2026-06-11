/**
 * fleet-quiescence.cjs — shared "is the fleet doing meaningful work?" gate.
 *
 * Lets recurring coordinator/Adam loops CYCLE DOWN (self-suppress) when the fleet
 * is idle/stopped, instead of churning reminders + model turns while nothing is
 * happening. Chairman request (2026-06-09): "no need to constantly remind the
 * coordinator or Adam of their roles if everything is suddenly slowed down and
 * stopped." This is the reusable element that can gate ANY repeating item.
 *
 * Liveness source = v_active_sessions (heartbeat_age_seconds + computed_status),
 * the SAME view scripts/fleet-dashboard.cjs uses — NOT claude_sessions.last_heartbeat
 * (that column does not exist; the real column is heartbeat_at). Using the dashboard's
 * own signal guarantees this gate AGREES with what the operator sees on screen.
 *
 * QUIESCENT (cycle down) iff ALL of:
 *   - no live worker (heartbeat < FRESH_S) with computed_status='active' holding a claim
 *   - no in_progress SD (a build mid-flight, even if between heartbeats)
 *   - no SD reached completed/pending_approval in the last RECENT_MIN minutes (hysteresis)
 *
 * BIAS: when ANY signal is uncertain or a query errors, report ACTIVE (do NOT cycle
 * down). A missed cycle-down just runs one cheap reminder; a WRONG cycle-down silences
 * the fleet mid-build. Fail-open to ACTIVE is the safe direction.
 *
 * @module lib/coordinator/fleet-quiescence
 */

const FRESH_S = Number(process.env.QUIESCENCE_FRESH_SECONDS || 300);
const RECENT_MIN = Number(process.env.QUIESCENCE_RECENT_MINUTES || 20);

/**
 * Pure verdict from already-fetched signal counts. Exported for unit testing without a DB.
 * @param {{liveActiveWorkers:number, inProgressBuilds:number, recentTransitions:number}} s
 * @returns {{quiescent:boolean, reason:string}}
 */
function decideQuiescence(s) {
  const quiescent =
    (s.liveActiveWorkers | 0) === 0 &&
    (s.inProgressBuilds | 0) === 0 &&
    (s.recentTransitions | 0) === 0;
  const reason = quiescent
    ? 'quiescent — 0 active workers, 0 in_progress builds, 0 transitions in ' + RECENT_MIN + 'm'
    : 'active — ' + s.liveActiveWorkers + ' active worker(s), ' + s.inProgressBuilds + ' build(s), ' + s.recentTransitions + ' transition(s)/' + RECENT_MIN + 'm';
  return { quiescent, reason };
}

/**
 * Assess current fleet activity against the canonical dashboard liveness view.
 * @param {object} sb - Supabase client
 * @param {{now?:number}} [opts]
 * @returns {Promise<{quiescent:boolean, reason:string, signals:object}>}
 */
async function assessFleetActivity(sb, opts) {
  const now = (opts && opts.now) || Date.now();
  const signals = { liveActiveWorkers: 0, inProgressBuilds: 0, recentTransitions: 0, error: null };
  try {
    const { data: sessions, error: sErr } = await sb
      .from('v_active_sessions')
      .select('session_id, sd_key, heartbeat_age_seconds, computed_status');
    if (sErr) throw sErr;
    signals.liveActiveWorkers = (sessions || []).filter(function (s) {
      return s.heartbeat_age_seconds != null &&
        s.heartbeat_age_seconds < FRESH_S &&
        s.computed_status === 'active' &&
        s.sd_key; // holding a claim, not idle-between-tasks
    }).length;

    const { data: builds, error: bErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key')
      .eq('status', 'in_progress');
    if (bErr) throw bErr;
    signals.inProgressBuilds = (builds || []).length;

    const since = new Date(now - RECENT_MIN * 60 * 1000).toISOString();
    const { data: recent, error: rErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key')
      .gte('updated_at', since)
      .in('status', ['completed', 'pending_approval']);
    if (rErr) throw rErr;
    signals.recentTransitions = (recent || []).length;
  } catch (e) {
    // Fail OPEN to ACTIVE: never silence the fleet on a query error.
    signals.error = e.message;
    return { quiescent: false, reason: 'assessment_error_fail_active: ' + e.message, signals: signals };
  }

  const verdict = decideQuiescence(signals);
  return { quiescent: verdict.quiescent, reason: verdict.reason, signals: signals };
}

module.exports = { assessFleetActivity: assessFleetActivity, decideQuiescence: decideQuiescence, FRESH_S: FRESH_S, RECENT_MIN: RECENT_MIN };
