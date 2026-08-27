/**
 * STUCK-SEAT CONDITION PREDICATE — SD-FDBK-INFRA-STUCK-SEAT-DETECTION-001, FR-1/FR-2.
 *
 * A worker can freeze while every liveness instrument reports it healthy. Delta (session_id
 * ab29dc41) sat frozen 888 minutes with heartbeat_at 0 minutes old, status=active, loop_state=active
 * and a live process tick. Measured across the six specimens 2026-08-01T09:25:44Z:
 *
 *   label     truth    last_tool_at   heartbeat_at   everClaimed
 *   ALPHA-3   healthy         0 min          0 min   true
 *   ALPHA-2   healthy         0 min          0 min   true
 *   CHARLIE   stuck         249 min          0 min   false
 *   BRAVO     stuck         499 min          0 min   false
 *   ALPHA     stuck         694 min          0 min   false
 *   DELTA     stuck         888 min          0 min   true
 *
 * heartbeat_at takes a SINGLE distinct value across all six and carries zero information.
 * last_tool_at separates them 6/6 with no overlap.
 *
 * WHY has_live_claim IS ABSENT, AND WHY THAT IS THE POINT.
 * The sourced FR-5 predicate was `has_live_claim AND last_outbound_was_an_escalation AND
 * no_wakeup_armed`. Measured against those same six rows, has_live_claim as `sd_key IS NOT NULL`
 * agrees with ground truth 0/6 — TRUE for both healthy controls and FALSE for all four stuck seats.
 * everClaimed (the OR of sd_key/claimed_at/worktree_path/continuous_sds_completed) agrees 1/6.
 * That is not a weak conjunct, it is perfect anti-correlation, and the cause is structural:
 * stale-session-sweep RELEASES a stuck seat's claim, so gating detection on holding one gates it on
 * not-yet-having-been-swept — the detector goes blind exactly as the condition matures.
 * NO CLAIM-DERIVED FIELD MAY ENTER THIS FILE. tests/unit/fleet/stuck-seat-predicate.test.js pins
 * that behaviourally: mutating all four claim fields must leave every verdict byte-identical.
 *
 * NOT A REPLACEMENT FOR lib/fleet/claim-boundary-probe.cjs — a SIBLING. See PRECEDENCE below.
 *
 * THIS IS A LIVENESS GAUGE, NOT A TAMPER-EVIDENT CONTROL. Both columns it reads (last_tool_at and
 * metadata.expected_wake_at) are worker-written, so any seat holding the service-role key can write
 * its own or another's. CORRECTED AFTER REVIEW: an earlier version of this paragraph also claimed
 * the public ANON key could write them, because claude_sessions carries an "Allow all for anon" RLS
 * policy a later remediation dropped only for the `authenticated` twin. PROBED: anon SELECT is
 * allowed, but anon UPDATE and DELETE return "permission denied for table claude_sessions" — the
 * policy is permissive while the table GRANT is absent, and RLS only filters rows a role already has
 * privilege to touch. The stale policy is hygiene, not an exposure; it is routed separately.
 * The direction that does matter: the threat model here is an ACCIDENT (a worker wedged on an
 * interactive prompt), and a wedged worker is by definition not writing — so evading detection would
 * require a stuck seat to keep writing, i.e. to not be stuck. Forging a VICTIM's clock is the real
 * direction, which is why this module stays advisory-only and drives no actuation.
 */

'use strict';

/** Closed verdict set. UNKNOWN is a first-class outcome, never folded into HEALTHY. */
const VERDICT = Object.freeze({ STUCK: 'STUCK', HEALTHY: 'HEALTHY', UNKNOWN: 'UNKNOWN' });

/** Exact reason tokens. Tests pin these strings, not their truthiness — a truthy-reason assertion
 *  cannot tell "returned UNKNOWN from the branch under test" from "returned UNKNOWN from an earlier
 *  guard", which is how a predicate passes its own test without reaching the code it claims to. */
const REASON = Object.freeze({
  NO_TOOL_CLOCK: 'last_tool_at_never_written',
  TOOL_SILENT: 'tool_silent_past_cut_point',
  TOOL_RECENT: 'tool_activity_within_cut_point',
  WAKE_NOT_RECORDED: 'wake_not_recorded',
  WAKE_OVERDUE: 'wake_armed_and_overdue',
  WAKE_PENDING: 'wake_armed_and_pending'
});

/** Three-valued wakeup state. ABSENT IS NOT PROOF NO WAKEUP WAS ARMED: the write at
 *  scripts/hooks/post-tool-loop-state.cjs:113 is conditional on a prior metadata read succeeding and
 *  on a finite positive delay, so a read failure costs the deadline. expected_silence_until is NOT a
 *  substitute — its own writer calls it a clamped do-not-sweep-me PERMISSION, useless as a deadline. */
function classifyWakeState(session, nowMs) {
  const raw = session && session.metadata && session.metadata.expected_wake_at;
  if (!raw) return { state: 'not_recorded', reason: REASON.WAKE_NOT_RECORDED, overdueMinutes: null };
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return { state: 'not_recorded', reason: REASON.WAKE_NOT_RECORDED, overdueMinutes: null };
  const overdueMinutes = Math.round((nowMs - t) / 60000);
  return overdueMinutes > 0
    ? { state: 'armed_overdue', reason: REASON.WAKE_OVERDUE, overdueMinutes }
    : { state: 'armed_pending', reason: REASON.WAKE_PENDING, overdueMinutes };
}

/**
 * Classify ONE session row.
 *
 * @param {object} session - a claude_sessions row. Identified by session_id (TEXT), NEVER id (uuid):
 *   the two differ on every live seat and querying the wrong one returns zero rows WITH NO ERROR,
 *   which reads as "no stuck seats found" — the exact false negative this SD exists to remove.
 * @param {object} opts
 * @param {number} opts.cutPointMinutes - REQUIRED, no default. See the throw below.
 * @param {number|Date} [opts.now] - injected clock for deterministic tests.
 * @returns {{verdict: string, reason: string, session_id: string|null, toolSilentMinutes: number|null, wake: object, window_handle: string|null, fleet_identity: string|null}}
 */
function classifySeat(session, opts) {
  const cut = opts && opts.cutPointMinutes;
  // NO DEFAULT, DELIBERATELY. The false-negative side is n=1 PER CLASS and healthy-latency data is
  // right-censored (a live observation window structurally excludes the slowest healthy seats; both
  // controls above read 0 min only because they were mid-work at measurement). The ORDERING is
  // established 6/6; the CUT POINT is not. A default here would be an uncalibrated number in the one
  // place nobody would look at again, so the module refuses to run instead.
  if (!Number.isFinite(cut) || cut <= 0) {
    throw new Error(
      'stuck-seat-predicate: cutPointMinutes is REQUIRED and must be a positive finite number. ' +
      'There is deliberately no default — see TR-4, the calibration constraint.'
    );
  }

  const nowMs = opts.now instanceof Date ? opts.now.getTime()
    : Number.isFinite(opts.now) ? opts.now
    : Date.now();

  const sessionId = (session && session.session_id) || null;
  const wake = classifyWakeState(session, nowMs);
  // SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 FR-4: pure IDENTITY passthrough, not a
  // classification input — window_handle/fleet_identity never participate in the verdict
  // decision below (same discipline as session_id above), so this does not reintroduce the
  // claim-derived-field defect this module exists to avoid. Needed so a human-rescue surface
  // downstream can name WHICH window/terminal a STUCK seat is in, without a second query.
  const windowHandle = (session && session.metadata && session.metadata.window_handle) || null;
  const fleetIdentity = (session && session.metadata && session.metadata.fleet_identity) || null;

  // NULL IS UNKNOWN, NEVER HEALTHY. last_tool_at has documented silent-loss paths: its sole writer
  // swallows failures with an empty catch (scripts/hooks/post-tool-clear-telemetry.cjs), exits with
  // no write when the session id will not resolve, and runs from the SESSION'S OWN CHECKOUT — so a
  // seat on an older checkout may never persist the column at all. Treating that absence as health
  // would let the blindest seats score cleanest. Discipline copied from
  // lib/fleet/claim-boundary-probe.cjs, which returns UNKNOWN/last_tool_at_never_written.
  const lastToolAt = session && session.last_tool_at;
  const lastToolMs = lastToolAt instanceof Date ? lastToolAt.getTime()
    : typeof lastToolAt === 'string' ? Date.parse(lastToolAt)
    : NaN;
  if (!Number.isFinite(lastToolMs)) {
    return { verdict: VERDICT.UNKNOWN, reason: REASON.NO_TOOL_CLOCK, session_id: sessionId, toolSilentMinutes: null, wake, window_handle: windowHandle, fleet_identity: fleetIdentity };
  }

  const toolSilentMinutes = Math.round((nowMs - lastToolMs) / 60000);
  return toolSilentMinutes >= cut
    ? { verdict: VERDICT.STUCK, reason: REASON.TOOL_SILENT, session_id: sessionId, toolSilentMinutes, wake, window_handle: windowHandle, fleet_identity: fleetIdentity }
    : { verdict: VERDICT.HEALTHY, reason: REASON.TOOL_RECENT, session_id: sessionId, toolSilentMinutes, wake, window_handle: windowHandle, fleet_identity: fleetIdentity };
}

/**
 * PRECEDENCE against lib/fleet/claim-boundary-probe.cjs, which is a shipped stuck-seat detector on
 * the same column and WILL disagree with this one on real rows.
 *
 * Run in-process against the live Delta row it returns PASS / progressed_past_boundary (its guard at
 * :129: last_tool_at is 47 minutes past the claim anchor against a 120-second grace). Its other
 * blinding guard, :152 outbound_comms_since_anchor, reads outbound coordination rows as PROOF OF
 * LIFE — the exact inverse of this SD, where a final outbound escalation is EVIDENCE of stuckness.
 * On Delta that branch is unreachable (zero outbound since the anchor), so BOTH guards matter and
 * progressed_past_boundary is the more dangerous: it PASSes ANY seat that did work and then froze,
 * which is the entire failure class.
 *
 * RULE: on disagreement, STUCK WINS FOR REPORTING and the incumbent wins for ACTUATION. This module
 * is advisory-only — it is deliberately not wired into runDetectors and drives no release,
 * quarantine or handback. A false positive here costs a line of dashboard text; a false positive in
 * the incumbent costs a live worker its claim. Report loudly, actuate conservatively.
 */
const PRECEDENCE = Object.freeze({
  onDisagreement: 'stuck_wins_for_reporting_incumbent_wins_for_actuation',
  thisModuleIsAdvisoryOnly: true,
  incumbent: 'lib/fleet/claim-boundary-probe.cjs'
});

module.exports = { classifySeat, classifyWakeState, VERDICT, REASON, PRECEDENCE };
