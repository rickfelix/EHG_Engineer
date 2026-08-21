/**
 * SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-001 FR-2 — age out advice whose adoption judgment never came.
 *
 * The ledger could say "accepted", "rejected" and "still waiting", but had no way to say NOBODY EVER
 * ANSWERED. Every unanswered row sat at `pending` forever, so the backlog looked like work in
 * progress rather than a question that had gone unanswered — and 566 of 1100 rows were in that
 * state.
 *
 * THE THRESHOLD IS PINNED HERE, ON PURPOSE. Left to a fixture, any test passes for whatever value
 * the fixture chose. Measured on live data 2026-07-29: ZERO pending rows exceed 5 days, 176 exceed
 * 72h, and the oldest is 4.8 days. So a >=5d threshold is unsatisfiable at ship time, while a <=4d
 * threshold is satisfiable only by stamping rows the history says were about to be judged. 7d is
 * chosen to be clear of both: it expires nothing today, and what it eventually expires is genuinely
 * abandoned rather than merely recent.
 *
 * SHIPS DISABLED. The first real run must be a decision, not a side effect of merging — see
 * ENABLED_BY_DEFAULT. Aging is not reversible in any meaningful sense: once a row is stamped, the
 * fact that a human never answered is recorded forever, and re-judging it later cannot un-record it.
 */

/** Days a pending judgment may go unanswered before it is recorded as expired. */
export const EXPIRY_DAYS = 7;

/** Identifier stamped into judgment_expired_by. The DB CHECK requires it to be non-null. */
export const EXPIRY_ACTOR = 'solomon-judgment-expiry';

/**
 * Off until switched on deliberately. A scheduler entry that exists but is disabled still satisfies
 * "a scheduler references it", which is why the test asserts this flag rather than the entry.
 */
export const ENABLED_BY_DEFAULT = false;

/**
 * PURE — decide which rows have aged out. Extracted so the rule is testable with no DB, no clock
 * injection games, and no credentials. The db vitest project is DISABLED in this repo, so anything
 * gated on real credentials would skip silently and green.
 *
 * @param {Array<{id:string, decision:string, created_at:string, judgment_expired_at?:string|null}>} rows
 * @param {{nowMs:number, expiryDays?:number}} opts
 * @returns {Array<{id:string, ageDays:number}>} rows to stamp, oldest first
 */
export function selectExpiredJudgments(rows = [], { nowMs, expiryDays = EXPIRY_DAYS } = {}) {
  if (!Number.isFinite(nowMs)) return [];            // no usable clock -> stamp nothing
  const cutoffMs = expiryDays * 24 * 60 * 60 * 1000;
  const out = [];
  for (const r of rows) {
    if (!r || r.judgment_expired_at) continue;       // already stamped — never re-stamp
    // ONLY unanswered judgments expire. An accepted/rejected/partial/deferred row HAS an answer,
    // and stamping it would assert something false about a question that was actually resolved.
    if (r.decision !== 'pending') continue;
    const createdMs = r.created_at ? new Date(r.created_at).getTime() : NaN;
    if (!Number.isFinite(createdMs)) continue;       // unusable timestamp -> skip, never guess
    const ageMs = nowMs - createdMs;
    if (ageMs <= cutoffMs) continue;                 // strictly past the threshold, not at it
    out.push({ id: r.id, ageDays: ageMs / 86_400_000 });
  }
  return out.sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * The patch written for an expired row. NOTE WHAT IS ABSENT: `decision` is untouched.
 *
 * Routing expiry through `decision` was the original design and would have moved
 * drain-inventory.mjs:88 and :91 together while inflating the accuracy denominator at
 * fleet-dashboard.cjs:1959 — breaking the very instruments that justified the SD. Expiry and
 * adoption are independent facts and stay in independent columns.
 */
export function expiryPatch({ nowIso, actor = EXPIRY_ACTOR } = {}) {
  return { judgment_expired_at: nowIso, judgment_expired_by: actor };
}

/**
 * SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (ship-gate adversarial review, round 2): that SD's
 * decision_by CHECK constraint is added NOT VALID, which grandfathers existing violating rows from
 * the initial bulk scan ONLY -- Postgres still re-evaluates the CHECK on ANY subsequent UPDATE to a
 * grandfathered row, including this file's expiry stamp, which never touches decision_by at all. A
 * violating row that is still `decision='pending'` when it ages out would 23514 on this loop's
 * update forever, and the catch-and-continue below already silently degrades stamped=N/M for any
 * error -- exactly the failure class this table has shipped five times already (see this file's own
 * header). Pure classifier so the runner's retry decision is unit-testable without a DB.
 * @param {{code?: string, message?: string}|null|undefined} error
 * @returns {boolean}
 */
export function isDecisionByIdentityCheckViolation(error) {
  return !!error && error.code === '23514' && /decision_by_identity_check/.test(error.message || '');
}
