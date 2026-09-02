/**
 * Single canonical writer for quick_fixes.status transitions.
 * SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001.
 *
 * ROOT CAUSE THIS CLOSES: the Tier-3 keyword classifier wrote quick_fixes.status='escalated' at
 * mint time as a promise that an SD would follow, but nothing atomically fulfilled that promise —
 * 31 rows (measured 2026-09-02) sat status=escalated with escalated_to_sd_id NULL, invisible to
 * every belt reader that treats 'escalated' as terminal/off-belt.
 *
 * DESIGN: every code path that mutates quick_fixes.status must route through setQuickFixStatus()
 * instead of calling supabase.from('quick_fixes').update() directly. Three guards enforce the
 * invariant structurally rather than by convention:
 *   Guard A — refuses status='escalated' unless escalated_to_sd_id is present in the SAME call.
 *   Guard B — refuses a transition FROM 'escalated', or 'open'->'closed', or 'open'->'cancelled',
 *             unless disposition_reason_code + disposed_by + disposed_at are all supplied.
 *             'open'->'completed' is explicitly EXEMPT (the success path is already evidenced by
 *             the completed_requires_verification CHECK constraint + tests_passing/verified_by).
 *   Guard C — escalation_reason is append-only: an existing non-null value is never overwritten,
 *             only concatenated with new text (SEQUENTIAL calls only — see below).
 *
 * needs_sd is NOT a stored column. isNeedsSdRow() below is the single canonical derivation
 * (status='open' AND routing_tier===3 AND escalated_to_sd_id==null) — three independent downstream
 * consumers (the stale-sweep fence query, the SQL auto-cancel trigger's JS mirror, and the belt's
 * self-claim ranker) import and call this exact function rather than re-implementing the predicate,
 * closing the drift risk a hand-rolled copy in each site would otherwise carry.
 *
 * CONCURRENCY: the update is conditioned on `.eq('status', observedStatus)` (optimistic check); a
 * 0-row update result throws QF_STATUS_CONFLICT instead of silently no-op'ing. The escalation_reason
 * read-modify-write concatenation (Guard C) is proven only for SEQUENTIAL calls (see TS-4) — it is
 * NOT additionally serialized beyond the status-conflict check, so two genuinely CONCURRENT
 * appenders computing from the same pre-write snapshot can still have one reason silently lost.
 * Accepted given quick_fixes' actual concurrency profile (one coordinator sweep + occasional
 * CLI/human calls, not a hot path); a transactional RPC for this narrow case is out of scope.
 *
 * COULD-NOT-CHECK PATH: the initial fetch of the row's current status/escalation_reason is on the
 * guard's critical path, not advisory. If that fetch fails for any reason, the writer throws
 * QF_STATUS_LOOKUP_FAILED and performs NO write — there is no fail-open branch anywhere in this
 * function.
 */

'use strict';

/** Fields required by Guard B on a disposition-required transition. */
const REQUIRED_DISPOSITION_FIELDS = ['disposition_reason_code', 'disposed_by', 'disposed_at'];

/**
 * True iff a transition from `fromStatus` to `toStatus` requires disposition fields (Guard B).
 * 'open'->'completed' is explicitly exempt — the success path is already evidenced elsewhere.
 * @private
 */
function transitionRequiresDisposition(fromStatus, toStatus) {
  if (fromStatus === toStatus) return false;
  const leavingEscalated = fromStatus === 'escalated';
  const openToClosed = fromStatus === 'open' && toStatus === 'closed';
  const openToCancelled = fromStatus === 'open' && toStatus === 'cancelled';
  return leavingEscalated || openToClosed || openToCancelled;
}

/**
 * The ONE canonical needs_sd predicate. Pure, synchronous, no DB access — every downstream
 * consumer (stale-sweep fence, SQL-trigger JS mirror, belt self-claim ranker) must import and call
 * this exact function rather than re-implementing the condition.
 * @param {{status?: string, routing_tier?: number, escalated_to_sd_id?: string|null}} row
 * @returns {boolean}
 */
function isNeedsSdRow(row) {
  if (!row || typeof row !== 'object') return false;
  return row.status === 'open' && row.routing_tier === 3 && row.escalated_to_sd_id == null;
}

/**
 * Single canonical writer for quick_fixes.status transitions.
 * @param {object} supabase - Supabase client
 * @param {string} qfId - quick_fixes.id
 * @param {object} patch - fields to write; patch.status is required
 * @param {object} [opts]
 * @param {Console} [opts.logger=console]
 * @returns {Promise<{id: string, status: string}>}
 */
async function setQuickFixStatus(supabase, qfId, patch, opts = {}) {
  const logger = opts.logger || console;
  if (!qfId || typeof qfId !== 'string') {
    const e = new Error('[qf-status-writer] qfId (string) is required');
    e.code = 'QF_STATUS_BAD_ARGS';
    throw e;
  }
  if (!patch || typeof patch !== 'object' || !patch.status) {
    const e = new Error('[qf-status-writer] patch.status is required');
    e.code = 'QF_STATUS_BAD_ARGS';
    throw e;
  }

  // Could-not-check path: this fetch is on the critical path, not advisory. Any failure here
  // refuses the write outright — there is no fail-open branch in this function.
  let current;
  try {
    const { data, error } = await supabase
      .from('quick_fixes')
      .select('status, escalation_reason')
      .eq('id', qfId)
      .maybeSingle();
    if (error) {
      const e = new Error(`[qf-status-writer] lookup failed for ${qfId}: ${error.message}`);
      e.code = 'QF_STATUS_LOOKUP_FAILED';
      throw e;
    }
    if (!data) {
      const e = new Error(`[qf-status-writer] ${qfId} not found`);
      e.code = 'QF_STATUS_NOT_FOUND';
      throw e;
    }
    current = data;
  } catch (e) {
    if (e && (e.code === 'QF_STATUS_LOOKUP_FAILED' || e.code === 'QF_STATUS_NOT_FOUND')) throw e;
    const wrapped = new Error(`[qf-status-writer] lookup threw for ${qfId}: ${e && e.message}`);
    wrapped.code = 'QF_STATUS_LOOKUP_FAILED';
    throw wrapped;
  }

  const fromStatus = current.status;
  const toStatus = patch.status;

  // Guard A: no escalated write without escalated_to_sd_id in the SAME call.
  if (toStatus === 'escalated' && !patch.escalated_to_sd_id) {
    const e = new Error(
      `[qf-status-writer] REFUSED: cannot set status='escalated' on ${qfId} without escalated_to_sd_id `
      + `in the same call. Either supply escalated_to_sd_id, or write status='open', routing_tier=3 `
      + `instead (SD-LEO-INFRA-SINGLE-ESCALATION-WRITER-001).`
    );
    e.code = 'QF_STATUS_ESCALATION_REQUIRES_SD_ID';
    throw e;
  }

  // Guard B: disposition fields required on a disposition-required transition.
  if (transitionRequiresDisposition(fromStatus, toStatus)) {
    const missing = REQUIRED_DISPOSITION_FIELDS.filter((f) => patch[f] == null);
    if (missing.length) {
      const e = new Error(
        `[qf-status-writer] REFUSED: transition ${fromStatus}->${toStatus} on ${qfId} requires `
        + `${REQUIRED_DISPOSITION_FIELDS.join('+')} — missing: ${missing.join(', ')}.`
      );
      e.code = 'QF_STATUS_DISPOSITION_REQUIRED';
      throw e;
    }
  }

  // Guard C: escalation_reason is append-only (sequential calls only — see module docs).
  const finalPatch = { ...patch };
  if (patch.escalation_reason && current.escalation_reason
      && patch.escalation_reason !== current.escalation_reason) {
    finalPatch.escalation_reason = `${current.escalation_reason}\n---\n${patch.escalation_reason}`;
  }

  // Optimistic concurrency: condition the write on the status we just observed.
  const { data, error } = await supabase
    .from('quick_fixes')
    .update(finalPatch)
    .eq('id', qfId)
    .eq('status', fromStatus)
    .select('id, status')
    .maybeSingle();
  if (error) {
    const e = new Error(`[qf-status-writer] update failed for ${qfId}: ${error.message}`);
    e.code = 'QF_STATUS_UPDATE_FAILED';
    throw e;
  }
  if (!data) {
    const e = new Error(
      `[qf-status-writer] REFUSED: ${qfId}'s status changed since it was observed as '${fromStatus}' `
      + `— refusing to overwrite a concurrent change. Re-fetch and retry.`
    );
    e.code = 'QF_STATUS_CONFLICT';
    throw e;
  }
  logger && logger.log && logger.log(`[qf-status-writer] ${qfId}: ${fromStatus} -> ${data.status}`);
  return data;
}

module.exports = {
  setQuickFixStatus,
  isNeedsSdRow,
  transitionRequiresDisposition, // exported for unit fixtures
  REQUIRED_DISPOSITION_FIELDS, // exported for unit fixtures
};
