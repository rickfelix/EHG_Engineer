/**
 * session_coordination lane-lint observability gauge — FR-6.
 *
 * SD-LEO-INFRA-COORDINATION-LANE-DELIVERY-CONTRACT-001.
 *
 * READ-ONLY: queries session_coordination directly, no new table, no new RLS surface (RLS on
 * session_coordination is currently permissive). Reports SEPARATE counts per violation class
 * (not one aggregate number) so a regression in any single class is individually visible, per
 * PLAN correction #6 (extend the existing 20260702_session_coordination_insert_lint.sql advisory
 * trigger's INTENT -- that trigger is NOTICE-only and not queryable/testable, so this gauge is a
 * separate module rather than parsing Postgres log output).
 *
 * Mirrors the pure-core + IO-loader + tick-entrypoint SHAPE of
 * lib/coordinator/relay-drop-gauge.cjs, with one structural delta: this gauge only reads and
 * counts -- it performs zero writes (relay-drop-gauge's gaugeEnabled/recordFlags write-side has
 * no equivalent here).
 *
 * Four violation classes (instances 2, 4, 1/6, 9 from this SD's evidence):
 *   untyped_row            — payload.kind missing/null/empty (instance 2: silently skipped)
 *   bodyless_row            — readCanonicalBody() returns '' on a non-mechanical, non-fence kind
 *                              (instance 4: coordinator_request body-drop class)
 *   empty_sender_row        — sender_session null/empty on a non-sweep-authored row
 *                              (instance 1/6: provenance-loss class)
 *   resurface_dedup_drift   — >1 concurrently-UNACKNOWLEDGED solomon_ledger_pending_resurface
 *                              rows for the same ledger_id (instance 9: the daily payload->>
 *                              dedup_key only prevents a SAME-DAY dupe, not a stale unacked
 *                              reminder from an earlier day coexisting with today's fresh one)
 *
 * @module lib/coordination/lane-lint-gauge
 */

'use strict';

const { ADAM_EXCLUDED_KINDS } = require('../fleet/worker-status.cjs');
const { readCanonicalBody } = require('./lane-contract.cjs');

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: both loaders declared
// .limit(2000) — but PostgREST clamps every response at max-rows (1000), so the intended
// 2000-row sample silently NEVER materialized (the gauge under-counted violations on busy
// days). Paginate to completion with the 2000-row DECLARED sampling cap actually delivered
// via maxRows; the fail-soft []-on-error policy of both loaders is preserved by their
// existing try/catch (fetchAllPaginated throws on a page error).
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}
const GAUGE_SAMPLE_MAX_ROWS = 2000; // the pre-existing declared window size, now real

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // untyped/bodyless/empty-sender lookback
const DEFAULT_RESURFACE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // drift needs a wider lookback — it's inherently a cross-day pattern

// Kinds that are LEGITIMATELY bodyless by design (fences/reservations/roll-call — the axis
// check or the row's mere existence IS the payload, per lib/fleet/worker-status.cjs's own
// documentation of these kinds). Union'd with ADAM_EXCLUDED_KINDS (mechanical/handler-owned
// rows) when deciding whether a bodyless row is a genuine contract violation.
const LEGITIMATELY_BODYLESS_KINDS = Object.freeze([
  'coordinator_reservation', 'seat_busy_reservation', 'fence_notice', 'roll_call',
]);

// sender_type values that legitimately omit sender_session (system/sweep-authored rows —
// e.g. resurfaceStalePending in scripts/solomon-ledger-pending-resurface.cjs deliberately
// writes sender_session:null). Without this exclusion the gauge would permanently over-count
// a KNOWN, intentional pattern rather than the actual provenance-loss defect class (instance
// 1/6: a re-target operation ERASING a previously-real sender_session).
const LEGITIMATE_EMPTY_SENDER_TYPES = Object.freeze(['sweep', 'system']);

const RESURFACE_KIND = 'solomon_ledger_pending_resurface';

/** Pure: is payload.kind missing/null/empty? */
function isUntypedRow(row) {
  const kind = row && row.payload && typeof row.payload === 'object' ? row.payload.kind : undefined;
  return kind === undefined || kind === null || kind === '';
}

/** Pure: does this row violate the canonical-body contract (non-mechanical, non-fence, no body)? */
function isBodylessRow(row) {
  if (isUntypedRow(row)) return false; // counted under untyped_row instead — no double-count
  const kind = row.payload.kind;
  if (ADAM_EXCLUDED_KINDS.includes(kind) || LEGITIMATELY_BODYLESS_KINDS.includes(kind)) return false;
  return readCanonicalBody(row) === '';
}

/** Pure: does this row have a missing sender_session with no legitimate reason? */
function isEmptySenderRow(row) {
  if (row && row.sender_session) return false;
  const senderType = row && row.sender_type;
  return !LEGITIMATE_EMPTY_SENDER_TYPES.includes(senderType);
}

/**
 * CORE — pure, zero IO. Counts the three row-level violation classes over an already-fetched
 * window. Callers supply the row window (see loadWindowRows for the live-DB loader).
 * @param {Array<object>} rows
 * @returns {{untyped_row:number, bodyless_row:number, empty_sender_row:number}}
 */
function computeRowViolationCounts(rows) {
  let untyped_row = 0;
  let bodyless_row = 0;
  let empty_sender_row = 0;
  for (const row of (rows || [])) {
    if (isUntypedRow(row)) untyped_row++;
    if (isBodylessRow(row)) bodyless_row++;
    if (isEmptySenderRow(row)) empty_sender_row++;
  }
  return { untyped_row, bodyless_row, empty_sender_row };
}

/**
 * CORE — pure, zero IO. Instance 9: counts ledger_ids that currently have MORE THAN ONE
 * concurrently-unacknowledged solomon_ledger_pending_resurface row — the daily dedup_key only
 * blocks a SAME-DAY repeat, so a stale unacked reminder from an earlier day plus today's fresh
 * one can coexist unacknowledged, which is exactly the "resurface duplicates when acked-state
 * drifts" defect this counts.
 * @param {Array<object>} resurfaceRows - rows already filtered/known to be resurface rows
 * @returns {number}
 */
function computeResurfaceDedupDrift(resurfaceRows) {
  const unackedCountByLedgerId = new Map();
  for (const row of (resurfaceRows || [])) {
    if (row && row.acknowledged_at) continue; // only concurrently-UNACKED rows count as drift
    const ledgerId = row && row.payload && row.payload.ledger_id;
    if (!ledgerId) continue;
    unackedCountByLedgerId.set(ledgerId, (unackedCountByLedgerId.get(ledgerId) || 0) + 1);
  }
  let drift = 0;
  for (const count of unackedCountByLedgerId.values()) {
    if (count > 1) drift++;
  }
  return drift;
}

/**
 * IO: load the row window for the 3 row-level classes. FAIL-SOFT: [] on error.
 * @param {object} supabase
 * @param {{windowMs?:number, now?:number}} [opts]
 * @returns {Promise<Array<object>>}
 */
async function loadWindowRows(supabase, opts = {}) {
  const windowMs = Number.isFinite(opts.windowMs) ? opts.windowMs : DEFAULT_WINDOW_MS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const since = new Date(now - windowMs).toISOString();
    const data = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, sender_session, sender_type, payload, body, acknowledged_at, created_at')
      .gte('created_at', since)
      .order('id', { ascending: true }), // unique tiebreaker: stable page boundaries (FR-6)
      { maxRows: GAUGE_SAMPLE_MAX_ROWS });
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * IO: load candidate resurface rows over the wider drift-detection window. FAIL-SOFT: [] on
 * error. Server-side kind filter — no need to fetch the whole table for this narrow class.
 * @param {object} supabase
 * @param {{resurfaceWindowMs?:number, now?:number}} [opts]
 * @returns {Promise<Array<object>>}
 */
async function loadResurfaceRows(supabase, opts = {}) {
  const windowMs = Number.isFinite(opts.resurfaceWindowMs) ? opts.resurfaceWindowMs : DEFAULT_RESURFACE_WINDOW_MS;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  try {
    const since = new Date(now - windowMs).toISOString();
    const data = await fapPaginate(() => supabase
      .from('session_coordination')
      .select('id, payload, acknowledged_at, created_at')
      .eq('payload->>kind', RESURFACE_KIND)
      .gte('created_at', since)
      .order('id', { ascending: true }), // unique tiebreaker: stable page boundaries (FR-6)
      { maxRows: GAUGE_SAMPLE_MAX_ROWS });
    return data || [];
  } catch (_) {
    return [];
  }
}

/**
 * Tick entry point. FAIL-OPEN end to end — never throws; read-only, no writes ever.
 * @param {object} supabase
 * @param {{windowMs?:number, resurfaceWindowMs?:number, now?:number}} [opts]
 * @returns {Promise<{untyped_row:number, bodyless_row:number, empty_sender_row:number, resurface_dedup_drift:number, windowRows:number, error?:string}>}
 */
async function runLaneLintGauge(supabase, opts = {}) {
  try {
    const [rows, resurfaceRows] = await Promise.all([
      loadWindowRows(supabase, opts),
      loadResurfaceRows(supabase, opts),
    ]);
    const rowCounts = computeRowViolationCounts(rows);
    const resurface_dedup_drift = computeResurfaceDedupDrift(resurfaceRows);
    return { ...rowCounts, resurface_dedup_drift, windowRows: rows.length };
  } catch (e) {
    return {
      untyped_row: 0, bodyless_row: 0, empty_sender_row: 0, resurface_dedup_drift: 0,
      windowRows: 0, error: String((e && e.message) || e),
    };
  }
}

module.exports = {
  isUntypedRow,
  isBodylessRow,
  isEmptySenderRow,
  computeRowViolationCounts,
  computeResurfaceDedupDrift,
  loadWindowRows,
  loadResurfaceRows,
  runLaneLintGauge,
  LEGITIMATELY_BODYLESS_KINDS,
  LEGITIMATE_EMPTY_SENDER_TYPES,
  RESURFACE_KIND,
  DEFAULT_WINDOW_MS,
  DEFAULT_RESURFACE_WINDOW_MS,
};
