/**
 * Per-lane dead-letter rate gauge — SD-LEO-INFRA-COMMS-LANE-TTLS-001 FR-4/FR-5.
 *
 * Sourced from LIVE session_coordination, filtered on lib/coordination/lane-contract.cjs's
 * FR-2 payload-only expired-unread marker semantics (isExpiredUnread). Deliberately NOT
 * coordination_receipts -- TESTING evidence 79b9f70c found that table's lane enum frozen to
 * {signal, advisory, work_assignment} (excludes this SD's 4 lanes entirely) and its
 * single-valued state column cannot represent dead-letter state at all, making any rate
 * sourced from it 0/N by construction.
 *
 * This works BECAUSE FR-2's marker is designed to survive cleanup_expired_coordination() --
 * once FR-2 ships, a live-table query is not survivorship-biased the way a query against
 * unmarked pre-fix data would have been.
 *
 * DENOMINATOR EXTENT: live-extent-only. Live session_coordination is ~10.1% of all-time row
 * volume (delivered/answered rows are archived to retention_archive by the retention job,
 * STORIES evidence 414186aa) -- this gauge intentionally does NOT query retention_archive
 * (that would require a UNION and a different completed-row semantic entirely), so its
 * output is a live-extent-only rate/backlog, named explicitly in every result so FR-5's
 * day-0-vs-30-day comparison stays apples-to-apples (same code path, same extent).
 *
 * LANE BUCKETS reuse lib/fleet/worker-status.cjs's classifyCoordinationRow -- the SAME
 * actionable/unrecognized/informational taxonomy lib/coordination/lane-pending-gauge.cjs
 * already uses -- rather than inventing a parallel scheme. A lane's expired-unread rows
 * that classify as anything other than 'actionable' (chiefly dispatch_suggestion/
 * dispatch_override, which classify 'unrecognized' -- no role DRAIN_SET ever owns them, so
 * read_at was never going to be stamped by design) are counted separately as
 * structurally_artifact_prone, never blended into the reported rate's numerator.
 */
'use strict';

const { resolveLaneForKind, LANES, isExpiredUnread } = require('./lane-contract.cjs');
const { classifyCoordinationRow } = require('../fleet/worker-status.cjs');

const DENOMINATOR_EXTENT = 'live-extent-only';
const BASELINE_EVENT_TYPE = 'COMMS_LANE_TTLS_DEAD_LETTER_BASELINE';

/**
 * The SD's originally-stated pre-fix figures, disproven per VALIDATION (measured 45.8% live,
 * not 62%) and per TESTING's BLOCKER-2 (a precise pre-fix number is not reliably
 * reconstructible from any source -- session_coordination is survivorship-biased for pre-fix
 * data since unread rows were deleted by cleanup before any marker existed, and
 * coordination_receipts cannot represent dead-letter state at all). Kept here, documented
 * rather than silently dropped, per FR-5's acceptance criteria.
 */
const DISPROVEN_ORIGINAL_BASELINE = Object.freeze({
  coordinator_directive_pct: 62,
  dispatch_suggestion_pct: 100,
  disproof: 'VALIDATION measured 45.8% live (not 62%); TESTING BLOCKER-2: not reliably reconstructible from any available source (session_coordination survivorship-biased pre-marker; coordination_receipts cannot represent dead-letter state)',
});

/**
 * Summarize the per-lane dead-letter rate from an ALREADY-FETCHED full row population.
 * Pure function -- no DB access -- so it is trivially unit-testable against a synthetic
 * population without a live database.
 * @param {Array<{payload?:object, created_at?:string, read_at?:string|null}>} rows
 * @param {{nowMs?:number}} [opts]
 * @returns {{denominator_extent:string, computed_at:string, lanes:Object}}
 */
function summarizeLaneDeadLetterRates(rows, { nowMs = Date.now() } = {}) {
  const lanes = {};
  for (const lane of LANES) {
    lanes[lane] = { total: 0, expired_unread: 0, structurally_artifact_prone: 0, rate: 0 };
  }

  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row) continue;
      const kind = row.payload && typeof row.payload === 'object' ? row.payload.kind : undefined;
      const lane = resolveLaneForKind(kind);
      const bucket = lanes[lane];
      if (!bucket) continue; // 'untracked' -- outside this gauge's scope, by design
      bucket.total += 1;
      if (!isExpiredUnread(row, { nowMs })) continue;
      const { classification } = classifyCoordinationRow(row);
      if (classification === 'actionable') {
        bucket.expired_unread += 1;
      } else {
        // 'unrecognized'/'informational': no DRAIN_SET ever owns this kind, so read_at was
        // structurally never going to be stamped -- not a real delivery failure (TS-6).
        bucket.structurally_artifact_prone += 1;
      }
    }
  }

  for (const lane of LANES) {
    const b = lanes[lane];
    b.rate = b.total > 0 ? b.expired_unread / b.total : 0;
  }

  return { denominator_extent: DENOMINATOR_EXTENT, computed_at: new Date(nowMs).toISOString(), lanes };
}

/**
 * Fetch the FULL live session_coordination population via id-ordered range pagination --
 * never a single capped .limit() page grouped in memory, which measures the cap, not the
 * population (this session independently reproduced that exact defect live during PLAN
 * against coordination_receipts with a .limit(2000) query).
 * @param {object} supabase - service-role client
 * @param {{pageSize?: number}} [opts]
 * @returns {Promise<Array<object>>}
 */
async function fetchAllLiveCoordinationRows(supabase, { pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('session_coordination')
      .select('payload, created_at, read_at')
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    // SEC-TTL-03: terminate ONLY on a genuinely empty page, never on `data.length < pageSize`.
    // PostgREST/Supabase caps a single response at its own server-side max-rows setting
    // (observed 1000 live) regardless of the requested pageSize -- a caller passing
    // pageSize > that cap would always see `data.length < pageSize` on the very first page
    // and stop early, silently under-reporting the population (measuring the server cap,
    // not the table). Requesting more than the row landed here is a caller error worth
    // surfacing, not silently swallowing.
    if (data.length > pageSize) throw new Error(`fetchAllLiveCoordinationRows: got ${data.length} rows for a requested page of ${pageSize} -- pagination invariant violated`);
    from += data.length;
  }
  return rows;
}

/**
 * Compute the live gauge end-to-end: fetch the full population, then summarize.
 * @param {object} supabase
 * @param {{nowMs?: number, pageSize?: number}} [opts]
 */
async function computeLaneDeadLetterGauge(supabase, { nowMs = Date.now(), pageSize } = {}) {
  const rows = await fetchAllLiveCoordinationRows(supabase, { pageSize });
  return summarizeLaneDeadLetterRates(rows, { nowMs });
}

/**
 * Build the durable baseline record for FR-5. `label` must be 'day-0-post-fix' for the
 * first recording (immediately after FR-2 ships) or '30-day-remeasurement' for the
 * comparison point -- both travel through this SAME function/gauge so the comparison is
 * apples-to-apples, per FR-5's acceptance criteria.
 * @param {{denominator_extent:string, computed_at:string, lanes:Object}} gaugeResult
 * @param {{label: 'day-0-post-fix'|'30-day-remeasurement'}} opts
 */
function buildBaselineRecord(gaugeResult, { label }) {
  if (label !== 'day-0-post-fix' && label !== '30-day-remeasurement') {
    throw new Error(`buildBaselineRecord: unrecognized label "${label}"`);
  }
  const record = {
    label,
    gauge: gaugeResult,
    sd: 'SD-LEO-INFRA-COMMS-LANE-TTLS-001',
  };
  if (label === 'day-0-post-fix') {
    record.disproven_original_baseline = DISPROVEN_ORIGINAL_BASELINE;
  }
  return record;
}

/**
 * Fail-soft durable write of a baseline record to system_events, mirroring
 * lane-contract.cjs's recordWouldDenyEvidence exactly (a write failure never blocks the
 * measurement that already happened).
 * @param {object} supabase
 * @param {object} record - from buildBaselineRecord
 */
async function recordDeadLetterBaseline(supabase, record) {
  try {
    await supabase.from('system_events').insert({
      event_type: BASELINE_EVENT_TYPE,
      payload: record,
    });
  } catch {
    // fail-soft by design
  }
}

module.exports = {
  DENOMINATOR_EXTENT,
  BASELINE_EVENT_TYPE,
  DISPROVEN_ORIGINAL_BASELINE,
  summarizeLaneDeadLetterRates,
  fetchAllLiveCoordinationRows,
  computeLaneDeadLetterGauge,
  buildBaselineRecord,
  recordDeadLetterBaseline,
};
