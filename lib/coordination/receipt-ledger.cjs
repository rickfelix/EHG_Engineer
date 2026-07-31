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

/**
 * The lanes a receipt can belong to. One contract, not a signal-lane patch.
 *
 * *** A FOURTH LANE, RESOLVES_FILES, WAS REMOVED — IT NAMED A MECHANISM THAT DOES NOT EXIST. ***
 * It was specified as "a block resolved via a work_assignment carrying resolves_files". Verified
 * independently by the implementer and the coordinator who wrote it: `resolves_files` appeared
 * exactly TWICE in the repo — this constant and one test comment — with ZERO production occurrences
 * in lib, scripts, tests or SQL, and ZERO rows carrying `payload.resolves_files` in the live table.
 * No work_assignment has ever carried such a field.
 *
 * So FR-1's four-lane acceptance was unsatisfiable from the moment it was written, and the constant
 * was worse than useless: an enum entry reads as a SUPPORTED lane, so the next reader either wires a
 * writer for an event that never fires — a lane that reports as covered while measuring nothing,
 * which is precisely the defect this ledger exists to prevent — or spends a pass rediscovering that
 * it cannot be wired. Removed rather than left as a marker, because a marker in an enum is
 * indistinguishable from a capability.
 *
 * TO REINSTATE IT: supply the real field name a work_assignment carries when it resolves a block,
 * and the transition where that resolution happens. Both are needed; the lane was never blocked on
 * effort, only on the mechanism not existing. Coordinator ruling 2026-07-31: FR-1 acceptance is
 * three lanes.
 */
const LANES = Object.freeze({
  SIGNAL: 'signal',                   // worker friction signal
  WORK_ASSIGNMENT: 'work_assignment', // coordinator -> worker assignment, incl. fulfilment
  ADVISORY: 'advisory',               // Adam advisory
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

/**
 * Ceiling on a single receipt write. The ledger sits on the advisory-retire and worker-claim paths,
 * both of which must never be delayed by bookkeeping — see the race in recordReceipt.
 */
const RECEIPT_WRITE_TIMEOUT_MS = 2000;

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
  // buildReceipt is documented PURE/TOTAL and demonstrably is not: a null-prototype object, a
  // throwing toString, or a Symbol in sourceCreatedAt dies inside String(...) / + 'Z'. Not reachable
  // from either call site today (both pass row.created_at from PostgREST, always string-or-null),
  // but the whole design leans on this function not throwing, and that guarantee was asserted rather
  // than enforced. Inside the try it is enforced.
  // NARROW TRY, deliberately. Wrapping the whole body put the `{ok, skipped}` guard returns
  // lexically after the .insert() chain, and schema-reference-lint reads object literals following
  // an insert as its COLUMN LIST — so it flagged coordination_receipts.ok / .skipped as missing
  // columns. The lint was right about what it saw; the shape was misleading. Scoping the try to the
  // one call that can throw fixes the false positive and is better anyway: a try should cover the
  // hazard, not the function.
  let row;
  try {
    row = buildReceipt(input);
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
  if (!row) return { ok: false, skipped: 'invalid_input' };
  if (!client) return { ok: false, skipped: 'no_client' };

  try {
    // *** THE DOCBLOCK PROMISED "never block, DELAY or fail" AND ONLY TWO OF THE THREE WERE TRUE. ***
    // Errors were handled; latency was not. SECURITY measured an insert that never settles leaving
    // the check-in step unreturned at 1202 ms WITH THE CLAIM ALREADY MADE, and undici's default
    // headersTimeout is 300 s — so a black-holed connection stalls a worker's claim path for
    // minutes. lib/checkin/pipeline.cjs states the runner has NO try/catch by design, so the blast
    // radius is the whole check-in. A measurement outage becoming an operational one is the exact
    // thing this function's contract forbids.
    // NOT unref'd, and that was a real bug in the first cut of this fix: an unref'd timer cannot
    // hold the loop, so in a draining process it never fires and the race never settles — the exact
    // hang it was added to bound. It is instead ALWAYS cleared in the finally, so it holds the loop
    // for at most RECEIPT_WRITE_TIMEOUT_MS and is released the instant the insert wins.
    let timer = null;
    try {
      const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve({ __timedOut: true }), RECEIPT_WRITE_TIMEOUT_MS); });
      const res = await Promise.race([client.from('coordination_receipts').insert(row), timeout]);
      // schema-lint-disable-line — `{ok, skipped}` here is this function's RETURN SHAPE, not an
      // insert payload. The linter associates object literals following a .insert() with that
      // insert's column list, which is a sound heuristic that this one line genuinely violates.
      // Narrowing the try already removed the other three false positives; only the timeout return
      // is unavoidably downstream of the insert, because it describes the insert's outcome.
      if (res && res.__timedOut) return { ok: false, skipped: 'timeout' };
      const { error } = res || {};
      return error ? { ok: false, error: error.message } : { ok: true };
    } finally {
      if (timer) clearTimeout(timer);
    }
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { LANES, STATES, DISPOSITIONS, buildReceipt, recordReceipt };
