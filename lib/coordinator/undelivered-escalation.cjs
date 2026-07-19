'use strict';
/**
 * undelivered-escalation.cjs — SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-H (FR-3).
 *
 * Detector for the FW-3 §6d hard-park precondition: "no undelivered
 * chairman-escalation outstanding". A pick-class framing (payload.framing_class
 * = 'pick' on the Solomon wire leg, per the FW-3 Child A contract-fixed
 * discriminator) that has been escalated toward the chairman but never received
 * by any consumer process (delivered_at IS NULL — the transport-receipt column
 * from 20260710_session_coordination_delivered_at.sql, distinct from the
 * read_at/acknowledged_at two-stage ACK) must hold the quiet-tick aggregators
 * OUT of the long quiescent park: a tier that escalated a pick then hibernated
 * strands the exception (govern-by-exception with an undeliverable exception).
 *
 * Shared by BOTH aggregators (scripts/coordinator-quiet-tick.mjs and
 * scripts/adam-quiet-tick.mjs) so there is exactly one predicate — never a
 * second hand-rolled copy per aggregator.
 *
 * FAIL-SOFT: any query error, missing rows, or a throwing client returns false
 * — the pre-Child-A world (zero framing_class rows anywhere) leaves cadence
 * byte-identical to today. Staleness bound: rows older than 14 days no longer
 * pin the fleet awake (an abandoned ancient escalation surfaces through the
 * ledger/gauge lane, not through cadence).
 */

const ESCALATION_WINDOW_DAYS = 14;
const ESCALATION_WINDOW_MS = ESCALATION_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * True iff at least one pick-class chairman-escalation row is still undelivered
 * within the staleness window. Never throws.
 *
 * @param {object} sb - injected supabase client (service-role)
 * @param {{nowMs?: number}} [opts] - nowMs test seam for a deterministic cutoff
 * @returns {Promise<boolean>}
 */
async function hasUndeliveredChairmanEscalation(sb, opts = {}) {
  try {
    const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
    const cutoffIso = new Date(nowMs - ESCALATION_WINDOW_MS).toISOString();
    const { data, error } = await sb
      .from('session_coordination')
      .select('id')
      .eq('sender_type', 'solomon')
      .eq('payload->>framing_class', 'pick')
      .is('delivered_at', null)
      .gte('created_at', cutoffIso)
      .limit(1);
    if (error) return false; // fail-soft: never block/hold the tick on a query error
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false; // fail-soft: a throwing client must not break cadence
  }
}

module.exports = { hasUndeliveredChairmanEscalation, ESCALATION_WINDOW_DAYS, ESCALATION_WINDOW_MS };
