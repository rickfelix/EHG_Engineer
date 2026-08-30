/**
 * SELF-WAKE-OVERDUE ESCALATION — SD-LEO-INFRA-ARMED-WAKEUP-NEVER-001.
 *
 * Trace (LEAD phase, five specimens: trail 04000011's three prior + Hotel-3 682m+/Hotel-2 557m+
 * frozen 2026-08-29/30): the coordinator's own ~40 consecutive ScheduleWakeup arms all fired the
 * same night, ruling out a blanket scheduler defect (lane discriminator, coordinator-measured).
 * The freeze is SEAT-SIDE: a seat arms a wakeup (post-tool-loop-state.cjs writes
 * metadata.expected_wake_at), the fire is lost or the seat's next turn dies, and NOTHING watches
 * that seat's own deadline — loop_state='awaiting_tick' is a one-way latch nothing clears on
 * resume (documented at post-tool-loop-state.cjs:96-97), so the seat looks parked forever to every
 * external observer keyed on heartbeat_at (which session-tick.cjs itself keeps fresh every 30s
 * regardless — the very reason heartbeat carries zero discriminating information here, per
 * lib/fleet/stuck-seat-predicate.cjs's six-specimen calibration).
 *
 * SELF-RECOVERY IS ESCALATION, NOT RESUMPTION. Nothing outside Claude Code's own harness can
 * inject a new turn into a frozen agent process -- session-tick.cjs is a SEPARATE node daemon (see
 * its header) that cannot resume the conversation it is ticking for. What it CAN do, and today does
 * not, is notice from the OUTSIDE that its own owning seat's armed deadline has passed with no
 * subsequent tool activity, and make that fact LOUD (a directed session_coordination row) instead
 * of silently patching heartbeat_at every 30s as if nothing were wrong. This is the "escalates"
 * half of the SD's success criterion ("re-arms or escalates instead of freezing silently") -- the
 * "re-arms" half is not achievable from a sidecar process and is explicitly not claimed here.
 *
 * REUSES lib/fleet/stuck-seat-predicate.cjs's classifySeat VERBATIM (required module path, per its
 * own header discipline) rather than re-deriving a seventh last_tool_at discriminant in this file --
 * that predicate is already calibrated (six-specimen, TOOL_SILENT + WAKE_OVERDUE) and this module
 * adds nothing to that verdict, only ACTS on it in the one case classifySeat itself stays
 * advisory-only for: a seat escalating about ITSELF, never about another seat.
 */
'use strict';

const { classifySeat, VERDICT } = require('./stuck-seat-predicate.cjs');

/**
 * Should this tick raise a self-escalation for the OWNING session's own row?
 *
 * PURE — no I/O, deterministic given the session row + clock, so it is directly unit-testable
 * against the same fixture shapes stuck-seat-predicate.test.js already uses.
 *
 * DEDUP KEY IS THE DEADLINE ITSELF, NOT A BOOLEAN. metadata.self_escalated_for_wake_at stores
 * the exact expected_wake_at value the last escalation fired for. A seat that recovers, re-arms a
 * NEW deadline, and THAT one also goes overdue must escalate again (a second real freeze) --
 * comparing against the CURRENT expected_wake_at (not a sticky flag) makes that automatic: once
 * the seat writes a fresh expected_wake_at, the old dedup key no longer matches and the guard
 * re-opens. A recovered seat (wake state flips to armed_pending or not_recorded) never re-escalates
 * for the same deadline it already reported.
 *
 * @param {object} session - a claude_sessions row (needs last_tool_at, loop_state, metadata)
 * @param {number} nowMs - current time in ms (injectable clock)
 * @param {number} cutMinutes - tool-silence cut point (see stuck-seat-predicate.cjs; no default,
 *   mirroring its own no-default discipline -- callers must pass a calibrated value)
 * @returns {{shouldEscalate: boolean, overdueMinutes: number|null, expectedWakeAt: string|null, toolSilentMinutes: number|null}}
 */
function shouldSelfEscalate(session, nowMs, cutMinutes) {
  const verdict = classifySeat(session, { cutPointMinutes: cutMinutes, now: nowMs });
  const expectedWakeAt = (session && session.metadata && session.metadata.expected_wake_at) || null;
  const alreadyEscalatedForThisDeadline =
    session && session.metadata && session.metadata.self_escalated_for_wake_at === expectedWakeAt && !!expectedWakeAt;

  const shouldEscalate =
    verdict.verdict === VERDICT.STUCK &&
    verdict.wake &&
    verdict.wake.state === 'armed_overdue' &&
    !alreadyEscalatedForThisDeadline;

  return {
    shouldEscalate,
    overdueMinutes: verdict.wake ? verdict.wake.overdueMinutes : null,
    expectedWakeAt,
    toolSilentMinutes: verdict.toolSilentMinutes,
  };
}

/** Build the session_coordination row body for a self-escalation. Pure, for direct pinning. */
function buildSelfEscalationRow({ sessionId, overdueMinutes, toolSilentMinutes, expectedWakeAt, fleetIdentity }) {
  const who = fleetIdentity ? `${fleetIdentity} (${sessionId.slice(0, 8)})` : sessionId.slice(0, 8);
  return {
    sender_session: sessionId,
    sender_type: 'worker',
    target_session: 'broadcast-coordinator',
    message_type: 'INFO',
    subject: `[SELF-ESCALATION] ${who} armed wakeup overdue ${overdueMinutes}min, tool-silent ${toolSilentMinutes}min`,
    body:
      `This seat's own session-tick daemon detected an unmet ScheduleWakeup deadline: ` +
      `expected_wake_at=${expectedWakeAt} is ${overdueMinutes} minute(s) overdue, and last_tool_at ` +
      `is ${toolSilentMinutes} minute(s) silent. This is a self-detected freeze (SD-LEO-INFRA-` +
      `ARMED-WAKEUP-NEVER-001) — the arm was placed but did not fire, or fired and the turn died. ` +
      `No human keyboard has touched this seat since the arm.`,
    payload: {
      kind: 'self_escalation',
      signal_type: 'stuck',
      severity: 'high',
      overdue_minutes: overdueMinutes,
      tool_silent_minutes: toolSilentMinutes,
      expected_wake_at: expectedWakeAt,
      source: 'session-tick-self-wake-check',
    },
  };
}

module.exports = { shouldSelfEscalate, buildSelfEscalationRow };
