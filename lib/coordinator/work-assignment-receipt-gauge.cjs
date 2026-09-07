'use strict';
// Work-assignment receipt gauge — SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D FR-2.
//
// PREMISE CORRECTION #1 (measured live 2026-09-07): session_coordination.message_type already
// distinguishes WORK_ASSIGNMENT rows -- lib/coordinator/dispatch.cjs uses
// row.message_type === 'WORK_ASSIGNMENT' pervasively (10+ call sites). No new column is
// needed.
//
// PREMISE CORRECTION #2 (measured live 2026-09-07): this gauge originally queried
// `delivered_at` as the receipt-into-awareness timestamp. Live measurement of all 104
// WORK_ASSIGNMENT rows showed 0 with delivered_at set -- that column is reserved for a
// narrower path (lib/coordinator/undelivered-escalation.cjs: only sender_type='solomon'
// framing_class='pick' chairman-escalation rows, per migration
// 20260710_session_coordination_delivered_at.sql). For WORK_ASSIGNMENT rows the real
// receipt signal is scripts/worker-checkin.cjs stamping `read_at` (86/104 set) then
// `acknowledged_at` (63/104 set) once a worker's check-in surfaces/acts on the row. A row
// is available for pull the moment it is inserted, so `created_at` -- not a separate
// delivery stamp -- is the correct "delivered" reference clock. Querying on
// `acknowledged_at IS NULL` alone (rather than a two-stage read/ack check) catches BOTH
// "never read" and "read but never acted on" in one condition; live measurement found 11
// WORK_ASSIGNMENT rows created >2h ago and still unacknowledged.
//
// Follows the established gauge pattern: pure plan<Name>(), injectable client, NO-DATA on
// query failure.

const RECEIPT_OVERDUE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2h, matching this repo's existing
// dispatch-delivery-integrity precedent for a "should have been acted on by now" window.

/**
 * @param {object} supabase
 * @param {{ nowMs?: number, thresholdMs?: number }} [opts]
 * @returns {Promise<{ noData: true, reason: string } | { noData: false, overdue: Array<{id:string, target_session:string, created_at:string, age_ms:number}> }>}
 */
async function planWorkAssignmentReceiptGauge(supabase, { nowMs = Date.now(), thresholdMs = RECEIPT_OVERDUE_THRESHOLD_MS } = {}) {
  const cutoffIso = new Date(nowMs - thresholdMs).toISOString();
  const { data, error } = await supabase
    .from('session_coordination')
    .select('id, target_session, created_at')
    .eq('message_type', 'WORK_ASSIGNMENT')
    .is('acknowledged_at', null)
    .lt('created_at', cutoffIso)
    .limit(2000);
  if (error) {
    return { noData: true, reason: `work-assignment-receipt gauge query failed: ${error.message}` };
  }

  const overdue = (data || []).map((row) => ({
    id: row.id,
    target_session: row.target_session,
    created_at: row.created_at,
    age_ms: nowMs - new Date(row.created_at).getTime(),
  }));

  return { noData: false, overdue };
}

module.exports = { RECEIPT_OVERDUE_THRESHOLD_MS, planWorkAssignmentReceiptGauge };

if (require.main === module) {
  (async () => {
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config();
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const result = await planWorkAssignmentReceiptGauge(supabase);
    if (result.noData) {
      console.error(`work-assignment-receipt-gauge: NO_DATA — ${result.reason}`);
      process.exit(1);
    }
    if (!result.overdue.length) {
      console.log('work-assignment-receipt-gauge: 0 overdue work-assignment receipt(s).');
      process.exit(0);
    }
    console.error(`work-assignment-receipt-gauge: ${result.overdue.length} overdue work-assignment receipt(s):`);
    for (const o of result.overdue) {
      console.error(`  ${o.id} target=${o.target_session} created_at=${o.created_at} age=${Math.round(o.age_ms / 60000)}min`);
    }
    process.exit(1);
  })();
}
