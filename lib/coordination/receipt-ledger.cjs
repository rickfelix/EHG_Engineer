/**
 * SD-LEO-INFRA-WORKER-ESCALATION-WRITE-001 (FR-2) — write receipts to the durable ledger.
 *
 * WHY A SEPARATE TABLE AT ALL. The answered-rate cannot be computed from session_coordination:
 * cleanup_expired_coordination() deletes ACKED rows at created+24h while UNACKED rows persist, so
 * the denominator is curated by the exact state being measured. Measured 2026-07-31: 0 of 31 acked
 * rows survived past 24h against 1,930 unacked that did; to DISPLAY 60% on the survivor table the
 * true rate would have to be 98.6%. Receipts written here outlive the row they describe, which is
 * the whole point — so a receipt MUST NOT be derived by reading session_coordination later.
 *
 * ONE RECEIPT CONTRACT ACROSS ALL LANES (binding coordinator directive). Friction signals,
 * WORK_ASSIGNMENT fulfilment, Adam advisories and resolution-by-work_assignment each half-
 * implemented their own notion of "handled" — acknowledged_at here, payload.actioned_at there,
 * nothing at all for a fulfilled assignment. LANES enumerates them so a remedy scoped to one lane
 * cannot silently leave the others open.
 *
 * CommonJS to match lib/coordinator/*.cjs and be require()-able from the CLI scripts that stamp.
 */

'use strict';

/** The lanes a receipt can belong to. One contract, not a signal-lane patch. */
const LANES = Object.freeze({
  SIGNAL: 'signal',                 // worker friction signal
  WORK_ASSIGNMENT: 'work_assignment', // coordinator -> worker assignment, incl. fulfilment
  ADVISORY: 'advisory',             // Adam advisory
  RESOLVES_FILES: 'resolves_files', // block resolved via a work_assignment carrying resolves_files
});

/**
 * The three states. They are DISTINCT and independently queryable on purpose: conflating delivery
 * with disposition is the root defect of this SD (read_at meant "rendered on a screen" and was read
 * as "answered").
 */
const STATES = Object.freeze({
  DELIVERED: 'delivered', // transport succeeded
  SEEN: 'seen',           // a consumer actually surfaced it to a decider
  DISPOSED: 'disposed',   // an outcome was recorded
});

/** Only meaningful when state === disposed. */
const DISPOSITIONS = Object.freeze({
  ACTIONED: 'actioned',
  DECLINED: 'declined',
  SUPERSEDED: 'superseded',
});

/**
 * PURE/TOTAL. Build the ledger row. Exported so the shape is testable without a database.
 *
 * source_age_ms is computed HERE, at transition time, because it cannot be recovered later — the
 * source row is deleted at 24h, so time-to-answer is unrecoverable unless captured now.
 *
 * @returns {object|null} the row, or null if required fields are missing (caller fails open)
 */
function buildReceipt(input = {}) {
  const { coordinationId, lane, state, disposition, actorSession, actorRole, isRetention, sourceCreatedAt, nowMs, metadata } = input;
  if (!coordinationId || !lane || !state) return null;
  if (!Object.values(STATES).includes(state)) return null;
  if (!Object.values(LANES).includes(lane)) return null;
  // A disposition without DISPOSED is incoherent; DISPOSED without one is merely unspecified.
  if (disposition && state !== STATES.DISPOSED) return null;
  if (disposition && !Object.values(DISPOSITIONS).includes(disposition)) return null;

  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const createdMs = sourceCreatedAt ? Date.parse(/Z$|[+-]\d{2}:?\d{2}$/.test(String(sourceCreatedAt)) ? sourceCreatedAt : sourceCreatedAt + 'Z') : NaN;
  const ageMs = Number.isFinite(createdMs) ? Math.max(0, now - createdMs) : null;

  return {
    coordination_id: coordinationId,
    lane,
    state,
    disposition: disposition || null,
    actor_session: actorSession || null,
    actor_role: actorRole || null,
    is_retention: isRetention === true,
    source_age_ms: ageMs,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };
}

/**
 * Write one receipt. FAIL-OPEN AND NON-FATAL BY DESIGN.
 *
 * Recording a receipt must never block, delay or fail the act it describes: if the ledger write
 * throws, the ack still happened and the caller must proceed. A measurement outage must not become
 * an operational outage — that is the same discipline the FR-4 instrumentation already follows.
 *
 * The tradeoff is stated rather than hidden: a failed write means that receipt is lost, so the
 * metric UNDER-counts answers. That is the safe direction. Over-counting would let a broken lane
 * read as healthy, which is the failure this SD exists to eliminate.
 *
 * @returns {Promise<{ok: boolean, skipped?: string, error?: string}>}
 */
async function recordReceipt(client, input = {}) {
  const row = buildReceipt(input);
  if (!row) return { ok: false, skipped: 'invalid_input' };
  if (!client) return { ok: false, skipped: 'no_client' };
  try {
    const { error } = await client.from('coordination_receipts').insert(row);
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { LANES, STATES, DISPOSITIONS, buildReceipt, recordReceipt };
