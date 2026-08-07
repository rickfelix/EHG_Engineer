/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-7) — tell a RETENTION stamp apart from a real answer.
 *
 * THE DEFECT. Two paths stamp acknowledged_at with no answer behind them:
 *   - convergeAckTTL (lib/retention/session-coordination-ack-convergence.js) sets
 *     payload.auto_acked = true, so its stamps ARE identifiable.
 *   - the STUCK-signal drain in scripts/stale-session-sweep.cjs mass-stamps in batches of 50 and
 *     set NO marker at all — making a retention stamp permanently indistinguishable from a genuine
 *     coordinator ack. Once written, no later reader can undo that ambiguity.
 *
 * WHY IT MATTERS BEYOND TIDINESS. acknowledged_at is the substrate of the answered-rate metric this
 * SD exists to fix. An unmarked retention stamp does not merely lose information — it INFLATES the
 * very number used to judge whether the escalation lane is healthy, in the direction that makes a
 * broken lane look answered.
 *
 * THE PRIOR ART IS ALREADY IN THE REPO: lib/adam/inbound-backlog.js:225-233 deliberately queries
 * `.or('acknowledged_at.is.null,payload->>auto_acked.eq.true')` rather than a bare null-filter,
 * precisely so retention convergence cannot silently retire Adam's backlog. The WORKER lane had no
 * equivalent protection. This module is that protection, shared so the two lanes cannot drift.
 *
 * CommonJS to match lib/coordinator/*.cjs and be require()-able from scripts/stale-session-sweep.cjs.
 */

'use strict';

/** Marks a stamp as written by retention/flood-control rather than by an answering agent. */
const RETENTION_ACK_SOURCE = 'stale_session_sweep_stuck_drain';

/**
 * PURE. Build the payload to write alongside a retention acknowledged_at stamp.
 *
 * Preserves every existing key — the payload carries signal_type, severity and sender_callsign that
 * downstream readers depend on, so this MERGES rather than replaces. Records WHY the row was
 * drained (dead_sender vs aged_out), which the sweep already reports separately in its log line
 * (QF-20260727-190) but never persisted.
 *
 * @param {object|null} payload existing row payload
 * @param {'dead_sender'|'aged_out'} reason
 * @returns {object} merged payload carrying the retention marker
 */
function buildRetentionAckPayload(payload, reason) {
  return {
    ...(payload && typeof payload === 'object' ? payload : {}),
    auto_acked: true,
    auto_ack_source: RETENTION_ACK_SOURCE,
    auto_ack_reason: reason,
  };
}

/**
 * PURE/TOTAL. Was this row's acknowledged_at written by retention rather than by an answer?
 *
 * Keyed on payload.auto_acked, the convention convergeAckTTL already established, so a row retired
 * by EITHER retention path is recognised by one predicate. Total on junk input: anything that is
 * not explicitly marked is treated as a genuine ack, which is the conservative direction — a real
 * answer must never be discarded because its payload was malformed.
 *
 * @param {object|null} row a session_coordination row
 * @returns {boolean}
 */
function isRetentionAck(row) {
  return !!(row && row.payload && row.payload.auto_acked === true);
}

/**
 * PURE/TOTAL. Does this row count as ANSWERED for metric purposes?
 *
 * An acknowledged_at that carries a retention marker is NOT an answer. This is the load-bearing
 * half of FR-7: adding a marker that no consumer reads would leave the metric exactly as wrong as
 * before, and would be an inert mechanism of precisely the kind this SD exists to eliminate.
 *
 * @param {object|null} row
 * @returns {boolean}
 */
function isGenuinelyAcknowledged(row) {
  return !!(row && row.acknowledged_at) && !isRetentionAck(row);
}

module.exports = {
  RETENTION_ACK_SOURCE,
  buildRetentionAckPayload,
  isRetentionAck,
  isGenuinelyAcknowledged,
};
