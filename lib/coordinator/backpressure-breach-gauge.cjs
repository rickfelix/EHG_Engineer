'use strict';
// Backpressure-breach gauge — SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D FR-1.
//
// lib/coordinator/dispatch.cjs::assertSendBackpressure already runs BEFORE the
// session_coordination insert at the shared choke point (refuse-before-insert is
// correct today). This gauge does not re-fix that ordering — it PROVES it holds, so a
// future regression (a new insert path bypassing the choke point, or a reordering) is
// caught structurally instead of silently.
//
// Mirrors assertSendBackpressure's own counted-population logic (imported, never
// re-derived — a second independent copy of the exemption set is exactly how a write-side
// guard and a read-side gauge drift): per target_session, count unacknowledged+unexpired
// rows whose payload.kind is not in BACKPRESSURE_EXEMPT_KINDS and whose payload.message_kind
// is not in CORRECTION_KIND_SET. Any target exceeding BACKPRESSURE_UNANSWERED_LIMIT proves
// some insert path bypassed the guard.
//
// Follows the established gauge pattern (drain-gauge.cjs): a pure plan<Name>() computing
// fresh from live data every call, NO-DATA on query failure (never reports a stale/zero
// count as if it were live), no import-time DB client construction.

const { BACKPRESSURE_EXEMPT_KINDS, BACKPRESSURE_UNANSWERED_LIMIT } = require('./dispatch.cjs');
const { CORRECTION_KIND_SET } = require('./message-kinds.cjs');

/**
 * @param {object} supabase - an already-constructed client (never a factory call here)
 * @param {{ nowIso?: string }} [opts]
 * @returns {Promise<{ noData: true, reason: string } | { noData: false, breaching: Array<{target_session:string, count:number}> }>}
 */
async function planBackpressureBreachGauge(supabase, { nowIso = new Date().toISOString() } = {}) {
  const { data: rows, error } = await supabase
    .from('session_coordination')
    .select('target_session, payload')
    .is('acknowledged_at', null)
    .gt('expires_at', nowIso)
    .not('target_session', 'is', null)
    .limit(5000);
  if (error) {
    return { noData: true, reason: `backpressure-breach gauge query failed: ${error.message}` };
  }

  const isCounted = (row) => {
    const p = row && row.payload;
    const kind = p && typeof p === 'object' ? p.kind : null;
    if (kind && BACKPRESSURE_EXEMPT_KINDS.has(kind)) return false;
    const messageKind = p && typeof p === 'object' ? p.message_kind : null;
    if (messageKind && CORRECTION_KIND_SET.has(messageKind)) return false;
    // Mirrors assertSendBackpressure's own signal_type carve-out: a friction report must
    // never itself count toward the cap that could throttle the mechanism meant to bypass it.
    const signalType = p && typeof p === 'object' ? p.signal_type : null;
    if (signalType) return false;
    // Mirrors assertSendBackpressure's own reply carve-out (QF-20260831-769): a reply IS an
    // answer, not a fresh unanswered ask.
    if (p && typeof p === 'object' && (kind === 'coordinator_reply' || (p.reply_to != null && p.reply_to !== ''))) return false;
    // Mirrors assertSendBackpressure's own parked-row carve-out (QF-20260901-023): a parked
    // row is a courtesy copy the guard already refused and preserved -- it is queued-for-later,
    // not live pressure. WITHOUT THIS, THE GAUGE FALSELY REPORTS EVERY TARGET THE GUARD HAS EVER
    // THROTTLED AS A "BREACH" (measured live 2026-09-07: 45 of 46 unanswered roll_call rows
    // against the coordinator's own session were backpressure_parked markers proving the guard
    // WORKED, not that it was bypassed -- the guard is doing exactly what it was built to do).
    if (p && typeof p === 'object' && p.backpressure_parked === true) return false;
    return true;
  };

  const perTarget = new Map();
  for (const row of rows || []) {
    if (!isCounted(row)) continue;
    perTarget.set(row.target_session, (perTarget.get(row.target_session) || 0) + 1);
  }

  const breaching = [...perTarget.entries()]
    .filter(([, count]) => count > BACKPRESSURE_UNANSWERED_LIMIT)
    .map(([target_session, count]) => ({ target_session, count }));

  return { noData: false, breaching };
}

module.exports = { planBackpressureBreachGauge };

if (require.main === module) {
  (async () => {
    const { createClient } = require('@supabase/supabase-js');
    require('dotenv').config();
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const result = await planBackpressureBreachGauge(supabase);
    if (result.noData) {
      console.error(`backpressure-breach-gauge: NO_DATA — ${result.reason}`);
      process.exit(1);
    }
    if (!result.breaching.length) {
      console.log('backpressure-breach-gauge: 0 breaching target(s) — the insert-side guard holds.');
      process.exit(0);
    }
    console.error(`backpressure-breach-gauge: ${result.breaching.length} breaching target(s):`);
    for (const b of result.breaching) console.error(`  ${b.target_session}: ${b.count} unanswered (limit ${BACKPRESSURE_UNANSWERED_LIMIT})`);
    process.exit(1);
  })();
}
