/**
 * fleet-quiescence.cjs — shared "is the fleet doing meaningful work?" gate.
 *
 * Lets recurring coordinator/Adam loops CYCLE DOWN (self-suppress) when the fleet
 * is idle/stopped, instead of churning reminders + model turns while nothing is
 * happening. Chairman request (2026-06-09): "no need to constantly remind the
 * coordinator or Adam of their roles if everything is suddenly slowed down and
 * stopped." This is the reusable element that can gate ANY repeating item.
 *
 * Liveness source = v_active_sessions (heartbeat_age_seconds + computed_status) PLUS
 * CC-PID aliveness from the SessionStart markers — the SAME two signals
 * scripts/fleet-dashboard.cjs uses (SD-REFILL-00IO6NQJ). Heartbeat alone is BLIND to a
 * parked /loop worker (stale DB heartbeat but a live CC process), which produced false
 * "quiescent / 0 workers" reports while 3-4 workers were live; OR-ing in PID-aliveness
 * makes this gate AGREE with the dashboard's worker count.
 *
 * QUIESCENT (cycle down) iff ALL of:
 *   - no live worker (heartbeat < FRESH_S OR CC PID alive) with computed_status='active' holding a claim
 *   - no in_progress SD (a build mid-flight, even if between heartbeats)
 *   - no SD reached completed/pending_approval in the last RECENT_MIN minutes (hysteresis)
 *
 * BIAS: when ANY signal is uncertain or a query errors, report ACTIVE (do NOT cycle
 * down). A missed cycle-down just runs one cheap reminder; a WRONG cycle-down silences
 * the fleet mid-build. Fail-open to ACTIVE is the safe direction.
 *
 * @module lib/coordinator/fleet-quiescence
 */

const { getAliveCcPids } = require('../fleet/cc-pid-liveness.cjs');
const { liveActiveSessionsView } = require('../fleet/live-fleet-sessions.cjs');

const FRESH_S = Number(process.env.QUIESCENCE_FRESH_SECONDS || 300);

/**
 * SD-LEO-INFRA-LOOP-RESUME-DELAY-SHORTEN-001: resolve the quiescence "recent transitions"
 * window (minutes). Shortened from 20 to a 5m default so the coordinator's 'active' hysteresis
 * matches the shorter worker resume cadence (DEFAULT_IDLE_WAKEUP_SECONDS 600s) — but FLOORED at
 * 3m, even via the QUIESCENCE_RECENT_MINUTES env override, so the fleet does not flash
 * idle/active when workers complete in bursts. Pure + exported for unit testing.
 * @param {string|number|undefined} envVal raw QUIESCENCE_RECENT_MINUTES value (or undefined)
 * @returns {number} minutes, >= 3
 */
function resolveRecentMin(envVal) {
  return Math.max(3, Number(envVal || 5));
}

const RECENT_MIN = resolveRecentMin(process.env.QUIESCENCE_RECENT_MINUTES);

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
    // ROWCAP-CANONICAL-001: bounded via the canonical view helper (.order(heartbeat_age_seconds
    // asc).limit) so the freshest live sessions are always in the page — an unfiltered
    // v_active_sessions select is PostgREST-capped at the oldest 1000 of >5.9k rows and dropped
    // the newest live workers (a candidate cause of false quiescence). The helper THROWS on a
    // query error, which the catch below turns into fail-OPEN-to-ACTIVE (the safe direction).
    const sessions = await liveActiveSessionsView(sb, {
      columns: 'session_id, sd_key, heartbeat_age_seconds, computed_status, terminal_id',
    });
    // SD-REFILL-00IO6NQJ: PID-aliveness from the SessionStart markers, OR'd onto the
    // heartbeat window so a parked /loop worker (stale heartbeat, live CC process) still
    // counts. opts.aliveCcPids lets unit tests inject the set; otherwise read the markers.
    // Off-box (no local markers) → empty set → degrades to heartbeat-only behavior, never worse.
    const aliveCcPids = (opts && opts.aliveCcPids) || getAliveCcPids();
    const ccPidAlive = function (s) {
      if (!s.terminal_id) return false;
      const parts = String(s.terminal_id).split('-');
      return aliveCcPids.has(parts[parts.length - 1]);
    };
    signals.liveActiveWorkers = (sessions || []).filter(function (s) {
      return s.computed_status === 'active' &&
        s.sd_key && // holding a claim, not idle-between-tasks
        ((s.heartbeat_age_seconds != null && s.heartbeat_age_seconds < FRESH_S) || ccPidAlive(s));
    }).length;

    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6: exact head-count gauge (never
    // rows.length — a PostgREST-capped read could under-count builds and falsely report
    // quiescence). A failed measurement (error OR non-numeric count) throws → the catch
    // below fails OPEN to ACTIVE, the safe direction.
    const { count: buildCount, error: bErr } = await sb
      .from('strategic_directives_v2')
      .select('sd_key', { count: 'exact', head: true })
      .eq('status', 'in_progress');
    if (bErr) throw bErr;
    if (!Number.isFinite(buildCount)) throw new Error('in_progress build count unavailable (count=null)');
    signals.inProgressBuilds = buildCount;

    // SD-REFILL-00C7I5BY: anchor "recent transition" on the IMMUTABLE sd_phase_handoffs.created_at
    // (a real status-change event), NOT strategic_directives_v2.updated_at. updated_at is bumped by
    // ANY sweep that re-touches a row, so a parked/stale near-terminal SD read as a fresh transition
    // (witnessed 2026-06-14: a parked pending_approval SD re-touched at 14:54 inflated belt burn 2 vs 1
    // and flipped quiescence idle->active). Query the small window-bounded handoff set FIRST (bounded by
    // RECENT_MIN, never the full completed corpus), then intersect with SDs CURRENTLY near-terminal.
    const since = new Date(now - RECENT_MIN * 60 * 1000).toISOString();
    const { data: recentHandoffs, error: hErr } = await sb
      .from('sd_phase_handoffs')
      .select('sd_id')
      .gte('created_at', since);
    if (hErr) throw hErr;
    const recentSdIds = Array.from(new Set((recentHandoffs || []).map(function (h) { return h.sd_id; }).filter(Boolean)));
    if (recentSdIds.length > 0) {
      const { data: nearTerminal, error: rErr } = await sb
        .from('strategic_directives_v2')
        .select('id')
        .in('id', recentSdIds)
        .in('status', ['completed', 'pending_approval']);
      if (rErr) throw rErr;
      signals.recentTransitions = (nearTerminal || []).length;
    } else {
      signals.recentTransitions = 0;
    }
  } catch (e) {
    // Fail OPEN to ACTIVE: never silence the fleet on a query error.
    signals.error = e.message;
    return { quiescent: false, reason: 'assessment_error_fail_active: ' + e.message, signals: signals };
  }

  const verdict = decideQuiescence(signals);
  return { quiescent: verdict.quiescent, reason: verdict.reason, signals: signals };
}

module.exports = { assessFleetActivity: assessFleetActivity, decideQuiescence: decideQuiescence, resolveRecentMin: resolveRecentMin, FRESH_S: FRESH_S, RECENT_MIN: RECENT_MIN };
