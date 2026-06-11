/**
 * Coordinator comms receipts — FR-2 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001).
 *
 * Uniform receipt contract for coordination directives (both directions):
 *   read_at              = DELIVERED  — any render/poll that surfaced the row to the target
 *   payload.actioned_at /
 *   acknowledged_at      = ACTIONED   — only the agent that genuinely processed the row
 *
 * This module closes the SENDER-side gap: live evidence (2026-06-10) showed
 * coordinator->Adam GO messages (payload.kind=coordinator_request) sitting UNREAD
 * 24-29 minutes — and one reply 4.4h — while the target was heartbeat-alive, with
 * nothing surfacing it to the sender. findUndelivered() is the pure selector behind
 * the 'UNDELIVERED OUTBOUND' section in scripts/fleet-dashboard.cjs and the hourly
 * check in scripts/coordinator-hourly-review.cjs.
 *
 * PURE — zero IO. Callers fetch the candidate rows + sessions and inject them
 * (mocked-client testable; template: lib/coordinator/adam-action-ack.cjs).
 *
 * @module lib/coordinator/receipts
 */

'use strict';

/** A target is "live" when its heartbeat is fresher than this (mirrors
 *  lib/fleet/worker-status.cjs FLEET_ACTIVE_WINDOW_MS). */
const DEFAULT_HEARTBEAT_FRESH_MS = 15 * 60 * 1000;

/** An unread outbound row older than this counts as UNDELIVERED (10 min ≈ 2
 *  coordinator cron cycles — same rationale as adam-action-ack DEFAULT_SLA_MS). */
const DEFAULT_UNDELIVERED_AGE_MS = 10 * 60 * 1000;

/** Dead-letter surfacing window for the dashboard section. */
const DEFAULT_DEAD_LETTER_WINDOW_MS = 24 * 60 * 60 * 1000;

function toMs(ts) {
  const ms = ts ? Date.parse(ts) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Pure: select the caller's outbound rows that are UNDELIVERED at a LIVE target —
 * i.e. read_at IS NULL, older than ageMs, and the target session has a fresh
 * heartbeat (a dead/gone target is the dead-letter sweep's lane, not this one).
 *
 * @param {Array<object>} rows      session_coordination rows (sender = caller; any read state — filtered here)
 * @param {Array<object>} sessions  claude_sessions rows ({ session_id, heartbeat_at })
 * @param {object}        [opts]    { now=Date.now(), ageMs, heartbeatFreshMs }
 * @returns {Array<object>} the undelivered rows, oldest first, each annotated with ageMs
 */
function findUndelivered(rows, sessions, opts = {}) {
  const {
    now = Date.now(),
    ageMs = DEFAULT_UNDELIVERED_AGE_MS,
    heartbeatFreshMs = DEFAULT_HEARTBEAT_FRESH_MS,
  } = opts;

  const liveIds = new Set(
    (sessions || [])
      .filter((s) => s && s.session_id && (now - toMs(s.heartbeat_at)) < heartbeatFreshMs)
      .map((s) => s.session_id)
  );

  return (rows || [])
    .filter((r) => r && !r.read_at)
    .filter((r) => !(r.payload && r.payload.dead_letter === true)) // dead-lettered rows have their own section
    .filter((r) => liveIds.has(r.target_session))
    .filter((r) => (now - toMs(r.created_at)) >= ageMs)
    .map((r) => ({ ...r, ageMs: now - toMs(r.created_at) }))
    .sort((a, b) => b.ageMs - a.ageMs);
}

/**
 * Pure: select rows dead-lettered (FR-4 sweep: payload.dead_letter=true) within
 * the window — the 'DEAD-LETTERED (24h)' dashboard section.
 */
function selectRecentDeadLetters(rows, opts = {}) {
  const { now = Date.now(), windowMs = DEFAULT_DEAD_LETTER_WINDOW_MS } = opts;
  return (rows || [])
    .filter((r) => r && r.payload && r.payload.dead_letter === true)
    .filter((r) => (now - toMs(r.payload.dead_letter_at)) <= windowMs)
    .sort((a, b) => toMs(b.payload.dead_letter_at) - toMs(a.payload.dead_letter_at));
}

module.exports = {
  findUndelivered,
  selectRecentDeadLetters,
  DEFAULT_UNDELIVERED_AGE_MS,
  DEFAULT_HEARTBEAT_FRESH_MS,
  DEFAULT_DEAD_LETTER_WINDOW_MS,
};
