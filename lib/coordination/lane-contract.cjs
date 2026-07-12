/**
 * session_coordination lane delivery contract — SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001.
 *
 * ONE module for SEND validation and canonical DRAIN reads, closing the architecture gap
 * behind nine first-hand defect instances (untyped rows silently skipped, dual body
 * locations splitting readers, courtesy-ACKs blocking canonical answers, re-target
 * provenance loss, mechanical rows rendered as authored messages).
 *
 * FR-1 — validateOnSend: typed payload.kind enforcement staged OFF/OBSERVE/ENFORCE,
 * reusing lib/claim/gates/dispatch-authorization.cjs's proven two-flag-ladder shape
 * VERBATIM. A universally-required validator would break the live fleet today (payload-less
 * rows are deliberate in places; ~34 raw insert sites bypass the existing partial choke
 * point at lib/coordinator/dispatch.cjs:587) -- OFF by default, ENFORCE only after an
 * observe-window confirms near-zero unexpected violations on the named seams.
 *
 * FR-2 — readCanonicalBody: dual-read (payload.body primary, body column fallback).
 * Three divergent read orders exist live today (payload-first, column-first,
 * subject-first); one reader never checks the body column at all (the coordinator_request
 * body-drop, instance 4). Canonical = payload.body; fallback preserves legacy rows written
 * before this SD with no historical backfill required.
 */
'use strict';

const BASE_FLAG = 'session_coordination_lane_contract_born_denied';
const ENFORCE_FLAG = 'session_coordination_lane_contract_enforce';

/**
 * Resolve the SEND-validation mode from the two-flag ladder. Any evaluator fault resolves
 * to 'off' -- a flag-infrastructure error must never change delivery behavior on live
 * fleet coordination.
 * @param {{isEnabledFn?: (flagKey: string) => Promise<boolean>}} [opts] test seam
 * @returns {Promise<'off'|'observe'|'enforce'>}
 */
async function resolveLaneContractMode({ isEnabledFn } = {}) {
  try {
    let isEnabled = isEnabledFn;
    if (typeof isEnabled !== 'function') {
      ({ isEnabled } = await import('../feature-flags/evaluator.js'));
    }
    if (!(await isEnabled(BASE_FLAG))) return 'off';
    return (await isEnabled(ENFORCE_FLAG)) ? 'enforce' : 'observe';
  } catch {
    return 'off'; // fail-soft, matches dispatch-authorization.cjs precedent
  }
}

/**
 * Validate a session_coordination row against the SEND contract (payload.kind required).
 * off     -> {valid:true, mode:'off'} with zero checks
 * observe -> valid row: {valid:true, mode}; invalid row: {valid:true, would_deny:true, reason}
 * enforce -> valid row: {valid:true, mode}; invalid row: {valid:false, reason}
 *
 * @param {object} row - the row about to be inserted (must have .payload)
 * @param {{mode: 'off'|'observe'|'enforce'}} opts - caller-resolved mode (see resolveLaneContractMode)
 * @returns {{valid: boolean, mode: string, would_deny?: boolean, reason?: string}}
 */
function validateOnSend(row, { mode = 'off' } = {}) {
  if (mode !== 'observe' && mode !== 'enforce') {
    return { valid: true, mode: 'off' };
  }
  const kind = row && row.payload && typeof row.payload === 'object' ? row.payload.kind : undefined;
  if (kind !== undefined && kind !== null && kind !== '') {
    return { valid: true, mode };
  }
  const reason = 'lane_contract_untyped_payload_kind';
  return mode === 'observe'
    ? { valid: true, mode, would_deny: true, reason }
    : { valid: false, mode, reason };
}

/** One consistent WOULD-DENY line for the observe-window evidence trail. */
function formatWouldDenyLine(row, verdict) {
  const id = (row && row.id) || '(pre-insert)';
  return `LANE_CONTRACT_WOULD_DENY row=${id} reason=${verdict.reason} (observe mode — send proceeds; SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001)`;
}

const WOULD_DENY_EVENT_TYPE = 'LANE_CONTRACT_WOULD_DENY';

/**
 * Durable observe-window evidence, fail-soft (a write failure never blocks or alters the
 * send that observe mode already guarantees never blocks). Mirrors
 * dispatch-authorization.cjs's recordWouldDenyEvidence exactly.
 * @param {object} supabase - service-role client
 * @param {object} row
 * @param {{reason?: string}} verdict
 * @returns {Promise<void>}
 */
async function recordWouldDenyEvidence(supabase, row, verdict) {
  try {
    await supabase.from('system_events').insert({
      event_type: WOULD_DENY_EVENT_TYPE,
      payload: { reason: verdict.reason, row_subject: row && row.subject, target_session: row && row.target_session },
    });
  } catch {
    // fail-soft by design
  }
}

/**
 * Canonical body read (FR-2). payload.body is the canonical location; the body column is
 * a fallback for legacy rows written before this SD (no backfill). Returns '' (never
 * null/undefined) when neither location has content, so callers doing string operations
 * never need a null-check.
 * @param {{ body?: string, payload?: { body?: string } }} row
 * @returns {string}
 */
function readCanonicalBody(row) {
  if (!row) return '';
  const payloadBody = row.payload && typeof row.payload === 'object' ? row.payload.body : undefined;
  if (typeof payloadBody === 'string' && payloadBody.length > 0) return payloadBody;
  if (typeof row.body === 'string') return row.body;
  return '';
}

module.exports = {
  resolveLaneContractMode,
  validateOnSend,
  formatWouldDenyLine,
  recordWouldDenyEvidence,
  readCanonicalBody,
  WOULD_DENY_EVENT_TYPE,
  BASE_FLAG,
  ENFORCE_FLAG,
};
