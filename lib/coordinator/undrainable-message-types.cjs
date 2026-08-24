/**
 * QF-20260729-716: coordination_message_type values that are structurally UNDRAINABLE by a
 * worker session -- accepted by the coordination_message_type enum and by
 * lib/coordinator/dispatch.cjs's insert choke, but never surfaced by scripts/worker-checkin.cjs's
 * isCoordinatorPush(), which is the ONLY path that ever sets acknowledged_at. A row sent on one
 * of these types can be read (the coordination-inbox.cjs PostToolUse hook does render it) but can
 * never be acked -- it becomes permanent residue in every operational report built on
 * "acknowledged_at IS NULL" (the unacked-signal backlog, coordinator-hourly-review's undelivered-
 * outbound section), because /checkin -- the only ack path -- never sees it to act on it.
 *
 * NARROWLY SCOPED to the two values this QF measured and confirmed, both added by the SAME
 * migration (supabase/ehg_engineer/migrations/20260309_coordination_message_types.sql) with the
 * SAME intended semantic (a claim/staleness nudge to an idle worker) and the SAME confirmed defect
 * (zero occurrences in scripts/worker-checkin.cjs). This is deliberately a denylist of two
 * measured values, NOT a broad "anything not in the worker-surfaced set" check -- several other
 * enum members (CLAIM_RELEASED, SD_BLOCKED, SD_COMPLETED_NEARBY, PRIORITY_CHANGE,
 * IDENTITY_COLLISION, STOP_REQUESTED, SAVE_WARNING, SPAWN_REQUEST) are consumed by OTHER paths
 * (the PostToolUse hook, dedicated scripts) that this QF did not audit -- refusing them
 * unaudited would risk breaking currently-working sends. That audit is an explicit follow-on, not
 * this QF's scope.
 *
 * The correct carrier for a coordinator->worker request/reminder is message_type='INFO' with
 * payload.kind='coordinator_request' (or 'coordinator_reminder') -- both ARE surfaced by
 * isCoordinatorPush() and consumed via /checkin.
 */
const UNDRAINABLE_WORKER_MESSAGE_TYPES = Object.freeze(['CLAIM_REMINDER', 'STALE_WARNING']);

module.exports = { UNDRAINABLE_WORKER_MESSAGE_TYPES };
