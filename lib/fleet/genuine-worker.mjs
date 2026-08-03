// SD-FDBK-FIX-COORDINATOR-AUDIT-MJS-001 — single source of truth for "is this
// claude_sessions row a GENUINE fleet worker", so the coordinator audit, the
// executive email, and the dashboard never disagree on the worker count.
//
// Extracted verbatim from coordinator-email-summary.mjs (QF-20260607-608), which
// itself mirrors fleet-dashboard.cjs's worker-set QA. The bug this closes: each
// consumer had its own inline copy and they drifted — coordinator-audit.mjs counted
// every session heartbeating <15m regardless of role/status/claim-history, so its
// FLOW/LIVENESS gauges over-counted Adam, non_fleet, released, and never-claimed
// (ghost) sessions.
//
// A genuine worker is:
//   1. NOT the coordinator, NOT Adam (metadata.role==='adam'), NOT non_fleet;
//      The coordinator is excluded BOTH by the caller-supplied coordinatorId (session_id)
//      AND intrinsically by metadata.is_coordinator — the latter matters because consumers
//      that run OUTSIDE the live coordinator session (e.g. the GitHub Actions worker-pulse
//      and exec-email crons) have no CLAUDE_SESSION_ID to pass, so the session_id match is a
//      no-op there; the intrinsic flag keeps the coordinator out regardless of caller.
//   2. live by status — only 'active'/'idle' (released/exited/stale are warm ghosts);
//   3. has EVER held a claim (everClaimed) — drops transient sessions that registered
//      but never claimed.

// SD-LEO-INFRA-FLEET-DOWN-PAGER-001 — a FROZEN seat used to count as a LIVE one, which made the
// fleet-down pager unreachable by the outage it exists for. scripts/fleet-down-alert.mjs:120 pages
// only when active_count hits 0; that count comes from liveFleetWorkers() below, which tested
// heartbeat freshness alone. heartbeat_at is stamped by a SEPARATE daemon (scripts/session-tick.cjs
// :342), so it stays fresh on a wedged seat — active_count could only reach 0 by sessions VANISHING,
// never by them FREEZING. If every seat froze at once the pulse recorded a full fleet and nobody
// was paged.
//
// THE VERDICT IS NOT COMPUTED HERE. lib/fleet/stuck-seat-predicate.cjs already ships the
// tool-advancement discriminator, and the charter-audit fleet_health axis already consumes it. Five
// other last_tool_at discriminants exist in this tree (console-reaper, release-work-item,
// graceful-kill, resolve.cjs isGhostSessionRow, stuck-seat-predicate); a sixth would be the drift
// this SD was filed to avoid. Required by module PATH, never by bare symbol — scripts/reconcile-
// seats.cjs:62 exports a DIFFERENT classifySeat that actuates via markReleased.
import { createRequire } from 'module';
const { classifySeat, VERDICT } = createRequire(import.meta.url)('./stuck-seat-predicate.cjs');

/**
 * Tool-silence cut point for the freeze term, in minutes.
 *
 * NOT A NEW CALIBRATION. 120 is the number already stated by the two production consumers of the
 * same predicate — lib/governance/drive-state/axes/fleet-health.cjs:26 (TOOL_SILENCE_CUT_MINUTES)
 * and scripts/fleet-dashboard.cjs:1675 (STUCK_SEAT_CUT_POINT_MINUTES). classifySeat deliberately
 * ships no default and throws without one, so the number has to live at a call site; this is that
 * call site for the pager path. Deliberately NOT imported from fleet-health.cjs: governance already
 * depends on lib/fleet, and importing back would close a dependency cycle.
 * (Do not confuse with claim-boundary-probe.cjs:45 DEFAULT_BOUNDARY_GRACE_SECONDS — same number,
 * different unit.)
 */
export const FREEZE_CUT_MINUTES = Number(process.env.FLEET_FREEZE_CUT_MINUTES) > 0
  ? Number(process.env.FLEET_FREEZE_CUT_MINUTES)
  : 120;

/**
 * The columns a caller MUST select for the freeze term to mean anything.
 *
 * Exported because the term is FAIL-OPEN: a caller that does not select these gets the old
 * heartbeat-only behaviour silently, which is safe but blind. Spreading this into a select list is
 * the one-line way to opt in. (fleet-worker-pulse.mjs is the caller that must.)
 */
export const FREEZE_TERM_COLUMNS = Object.freeze(['last_tool_at', 'loop_state']);

/**
 * Is this seat POSITIVELY known to be wedged mid-iteration?
 *
 * FAIL-OPEN IS THE WHOLE DESIGN, and it is measured rather than stylistic. Fed the pulse's real
 * (pre-widening) select list, classifySeat returns UNKNOWN for every seat, because last_tool_at is
 * simply absent. Treating UNKNOWN as not-live would drive active_count to 0 on EVERY pulse forever
 * — the pager would fire ~45 minutes after deploy and again after every recovery, turning a silent
 * false negative into a permanent false positive. So ONLY a positive STUCK verdict may exclude a
 * seat; HEALTHY, UNKNOWN, an absent column and a thrown error all leave it live.
 *
 * THE PAIR DISCRIMINATES; NEITHER FIELD ALONE DOES. loop_state='active' means mid-iteration, so
 * active + tool-silent = WEDGED. A seat parked between iterations on a long wakeup reads
 * 'awaiting_tick' and is legitimately silent — paging on that is the false positive that makes
 * silence-based alarms untrustworthy and gets them switched off. Measured separation at the time of
 * filing: 4 of 4 frozen seats carried 'active', 2 of 2 live-but-parked carried 'awaiting_tick'.
 *
 * KNOWN RESIDUAL, deliberately not closed here: a fleet that dies LATCHED in 'awaiting_tick' still
 * cannot page. scripts/hooks/post-tool-loop-state.cjs:96-97 documents that latch as one-way with
 * nothing clearing it on resume. classifySeat already computes wake.state='armed_overdue'
 * (stuck-seat-predicate.cjs:73-75) and this function discards it — that is the natural follow-on.
 */
export const isKnownWedged = (s, nowMs, cutMinutes = FREEZE_CUT_MINUTES) => {
  if (!s || s.loop_state !== 'active') return false;
  try {
    return classifySeat(s, { cutPointMinutes: cutMinutes, now: nowMs }).verdict === VERDICT.STUCK;
  } catch {
    // A throw here (e.g. the CJS interop yielding undefined) would otherwise propagate out of
    // liveFleetWorkers and crash all nine callers — fail-CLOSED-by-crash, in a pager that runs
    // unattended in GitHub Actions. Swallowing it preserves the fail-open contract above.
    return false;
  }
};

/** Ghost-filter: has this session ever held a claim? */
export const everClaimed = (s) =>
  !!(s.sd_key || s.claimed_at || s.worktree_path || (s.continuous_sds_completed > 0));

/**
 * Is this claude_sessions row a genuine fleet worker (excluding the coordinator)?
 * @param {object} s - claude_sessions row (needs session_id, status, metadata, and the everClaimed columns)
 * @param {string} coordinatorId - the active coordinator's session_id (excluded)
 */
export const isFleetWorker = (s, coordinatorId) =>
  s.session_id !== coordinatorId &&
  s.metadata?.role !== 'adam' &&
  s.metadata?.is_coordinator !== true &&
  String(s.metadata?.is_coordinator) !== 'true' &&  // stored as JSON string 'true' in claude_sessions.metadata
  !s.metadata?.non_fleet &&
  ['active', 'idle'].includes(s.status) &&
  everClaimed(s);

/**
 * Filter a list of sessions to the LIVE genuine workers (genuine + heartbeat within window).
 * @param {Array<object>} sessions
 * @param {string} coordinatorId
 * @param {number} nowMs - current time in ms
 * @param {number} [windowMs=900000] - liveness window (default 15 min, matches the sweep)
 *
 * The freeze term is ADDITIVE: the heartbeat window still applies exactly as before, so a seat with
 * a stale heartbeat is excluded for the same reason it always was. The new conjunct only removes
 * seats that are heartbeat-fresh AND positively known-wedged — the class that was previously
 * indistinguishable from healthy. See isKnownWedged above for why it fails open.
 */
export const liveFleetWorkers = (sessions, coordinatorId, nowMs, windowMs = 900000) =>
  (sessions || []).filter(
    (s) =>
      isFleetWorker(s, coordinatorId) &&
      s.heartbeat_at &&
      nowMs - new Date(s.heartbeat_at).getTime() < windowMs &&
      !isKnownWedged(s, nowMs)
  );
