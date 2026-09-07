'use strict';
// Expired-unread-missed gauge — SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D FR-4.
//
// A session_coordination row can expire (expires_at passes) before any consumer's check-in
// ever surfaces it (read_at stays NULL forever after that point) -- the row is not merely
// late, it is now UNREACHABLE by the normal read path (scripts/worker-checkin.cjs only
// surfaces/read_at-stamps rows it queries live; an already-expired row falls out of that
// query the same way an acked one does). This is a distinct failure class from FR-2's
// receipt gauge (which watches rows still inside their window) and from
// lib/coordinator/undelivered-escalation.cjs (which watches only sender_type='solomon'
// framing_class='pick' chairman-escalation rows via delivered_at, to hold quiet-tick
// cadence). This gauge is fleet-wide and message-type-agnostic: ANY row that expired unread.
//
// STAMPING IS IDEMPOTENT BY CONSTRUCTION: the detection query itself excludes rows already
// carrying payload.missed_surfaced_at, so a second run never re-reports or re-stamps a row
// this gauge already surfaced once (own concrete example, 2026-09-07: id=300841e5-...,
// a completion_nudge WORK_ASSIGNMENT that expired at 00:26:07Z with read_at still NULL).
//
// THREE EXCLUSIONS, ADDED AFTER A LIVE FALSE-POSITIVE MEASUREMENT (2026-09-07, same discipline
// as FR-1's backpressure_parked fix): the naive query (any expired row with read_at NULL)
// returned 682 rows against live data. Investigating the breakdown found 673 of them were NOT
// missed communication at all:
//   - 195 rows had target_session IS NULL (payload.kind='coordinator_reservation' bookkeeping
//     markers with no addressee -- read_at was never going to be set because nobody was ever
//     addressed; "unread" is meaningless for a row nobody was asked to read).
//   - 477 rows had payload.kind='roll_call' (workers announcing availability TO the coordinator,
//     per scripts/worker-checkin.cjs -- consumed by the coordinator's own aggregate sweep, not by
//     the read_at-stamping path, which only runs when a WORKER session's own check-in reads
//     messages addressed TO ITSELF; nothing stamps read_at for the coordinator's inbound
//     roll_calls by design).
//   - 1 further row (of the 10 remaining after the two exclusions above) had
//     target_session='broadcast-coordinator', one of dispatch.cjs's own SENTINEL_TARGETS
//     (broadcast / broadcast-coordinator / broadcast-solomon / broadcast-adam /
//     broadcast-michael) -- a role-broadcast marker, not a specific live session, so read_at is
//     never stamped for it either. Reused from dispatch.cjs rather than re-derived, per this
//     repo's own "a second independent copy of the exemption set is exactly how a write-side
//     guard and a read-side gauge drift" rule (see backpressure-breach-gauge.cjs's identical
//     citation).
// Excluding all three left 9 genuinely actionable expired-unread rows (completion_nudge x6,
// reaper_starvation_alert x1, and 2 rows with no payload.kind at all needing individual
// inspection) -- WITHOUT THIS FIX THE GAUGE WOULD HAVE BURIED THOSE 9 REAL MISSES UNDER 673
// FALSE ONES.

const { SENTINEL_TARGETS } = require('./dispatch.cjs');

/**
 * Pure detection query. Never writes.
 *
 * @param {object} supabase
 * @param {{ nowIso?: string }} [opts]
 * @returns {Promise<{ noData: true, reason: string } | { noData: false, missed: Array<object> }>}
 */
async function findExpiredUnreadMissed(supabase, { nowIso = new Date().toISOString() } = {}) {
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, message_type, expires_at, payload')
    .lt('expires_at', nowIso)
    .is('read_at', null)
    .is('payload->>missed_surfaced_at', null)
    .not('target_session', 'is', null)
    .not('target_session', 'in', `(${SENTINEL_TARGETS.join(',')})`)
    // NOT `.neq('payload->>kind', 'roll_call')`: SQL's NULL <> 'roll_call' evaluates to NULL,
    // not TRUE, which would silently drop every row with no payload.kind at all (the exact
    // nullable-JSON-column trap already hit once in this fleet -- see adam-identity.cjs's
    // identical .or() shape for the same reason).
    .or(`payload->>kind.is.null,payload->>kind.neq.roll_call`)
    .limit(2000);
  if (error) {
    return { noData: true, reason: `expired-unread-missed detection query failed: ${error.message}` };
  }
  return { noData: false, missed: data || [] };
}

/**
 * Stamps payload.missed_surfaced_at on each given row. Best-effort per row (one failing
 * update does not abort the batch); returns which ids actually got stamped.
 *
 * @param {object} supabase
 * @param {Array<{id:string, payload:object}>} rows
 * @param {{ nowIso?: string }} [opts]
 * @returns {Promise<{ stamped: string[], failed: Array<{id:string, reason:string}> }>}
 */
async function stampMissedSurfaced(supabase, rows, { nowIso = new Date().toISOString() } = {}) {
  const stamped = [];
  const failed = [];
  for (const row of rows) {
    const mergedPayload = { ...(row.payload && typeof row.payload === 'object' ? row.payload : {}), missed_surfaced_at: nowIso };
    const { error } = await supabase
      .from('session_coordination')
      .update({ payload: mergedPayload })
      .eq('id', row.id)
      // Re-assert the not-yet-stamped condition at write time so two concurrent gauge runs
      // cannot both "win" and double-count the same row as newly-missed.
      .is('payload->>missed_surfaced_at', null);
    if (error) {
      failed.push({ id: row.id, reason: error.message });
    } else {
      stamped.push(row.id);
    }
  }
  return { stamped, failed };
}

/**
 * Combined plan: detect, stamp, report. Matches the established gauge CLI shape.
 *
 * @param {object} supabase
 * @param {{ nowIso?: string }} [opts]
 * @returns {Promise<{ noData: true, reason: string } | { noData: false, missed: Array<object>, stamped: string[], failed: Array<object> }>}
 */
async function planExpiredUnreadMissedGauge(supabase, opts = {}) {
  const detection = await findExpiredUnreadMissed(supabase, opts);
  if (detection.noData) return detection;
  if (!detection.missed.length) {
    return { noData: false, missed: [], stamped: [], failed: [] };
  }
  const { stamped, failed } = await stampMissedSurfaced(supabase, detection.missed, opts);
  return { noData: false, missed: detection.missed, stamped, failed };
}

module.exports = { findExpiredUnreadMissed, stampMissedSurfaced, planExpiredUnreadMissedGauge };

if (require.main === module) {
  (async () => {
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config();
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const result = await planExpiredUnreadMissedGauge(supabase);
    if (result.noData) {
      console.error(`expired-unread-missed-gauge: NO_DATA — ${result.reason}`);
      process.exit(1);
    }
    if (!result.missed.length) {
      console.log('expired-unread-missed-gauge: 0 expired-unread-missed row(s).');
      process.exit(0);
    }
    console.error(`expired-unread-missed-gauge: ${result.missed.length} expired-unread-missed row(s), ${result.stamped.length} newly stamped, ${result.failed.length} failed to stamp:`);
    for (const m of result.missed) {
      console.error(`  ${m.id} target=${m.target_session} type=${m.message_type} expires_at=${m.expires_at}`);
    }
    process.exit(1);
  })();
}
