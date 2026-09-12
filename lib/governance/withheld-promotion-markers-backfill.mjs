/**
 * FR-8/FR-9 (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-A): pure logic for the one-off backfill of
 * feedback.metadata withheld-promotion bookkeeping into the new withheld_promotion_markers table
 * (FR-7's migration, step 1 of FR-9's sequencing). The DB I/O shell lives in
 * scripts/one-off/backfill-withheld-promotion-markers.mjs; everything here takes rows as plain
 * arrays so it is unit-testable with zero live DB.
 *
 * TWO SOURCE SETS, NEVER OVERLAPPING:
 *   A. rows carrying metadata.withheld_pending (measured live: 136, 110 still pending) -- was
 *      gated by the demand gate at least once; may since have been promoted or disposed. The
 *      marker sub-object already carries its own promoted_at/promoted_fingerprint stamps when
 *      that happened, because withheld-registry.mjs's promoter call site
 *      (scripts/feedback-fingerprint-promoter.mjs) merges the promotion stamp INTO the existing
 *      marker rather than replacing it -- so set A's rows map field-for-field.
 *   B. rows with metadata.promoted_to_qf=true but NO withheld_pending sub-object (measured live:
 *      91) -- promoted directly, first time through, never suppressed by the demand gate, so no
 *      withhold history exists to backfill. withheld_run_count=0 marks this explicitly: the
 *      schema has no other way to say "this row's marker is a synthesized promotion-only record,
 *      never a real withhold" versus "gated and later promoted" (set A, withheld_run_count>=1).
 * Live counts cross-check: 136 (set A) has 26 already-promoted + 110 pending; set B is 91;
 * 26 + 91 = 117 total promoted_to_qf=true rows, matching the independently-measured live count.
 */
import { MARKER_KEY, isPending } from './withheld-registry.mjs';

/** Builds a withheld_promotion_markers row from a set-A (withheld_pending marker) source row. */
export function buildMarkerRowFromWithheldPending(row) {
  const m = row?.metadata?.[MARKER_KEY];
  if (!m) return null;
  return {
    feedback_id: row.id,
    fingerprint: m.fingerprint,
    member_feedback_ids: m.member_feedback_ids ?? [],
    max_severity: m.max_severity ?? null,
    admission_path: m.admission_path ?? null,
    gauge_value: m.gauge_value ?? null,
    floor: m.floor ?? null,
    engine: m.engine ?? null,
    decision: m.decision ?? null,
    first_withheld_at: m.first_withheld_at,
    last_withheld_at: m.last_withheld_at,
    first_withheld_run: m.first_withheld_run ?? null,
    last_withheld_run: m.last_withheld_run ?? null,
    withheld_run_count: m.withheld_run_count ?? 1,
    promoted_at: m.promoted_at ?? null,
    promoted_qf_id: m.promoted_qf_id ?? null,
    promoted_fingerprint: m.promoted_fingerprint ?? null,
    disposed_by: m.disposed_by ?? null,
    disposed_reason: m.disposed_reason ?? null,
    disposed_at: m.disposed_at ?? null,
  };
}

/** Builds a synthesized, promotion-only withheld_promotion_markers row from a set-B source row. */
export function buildMarkerRowFromPromotedOnly(row) {
  const meta = row?.metadata || {};
  if (meta.promoted_to_qf !== true) return null;
  if (meta[MARKER_KEY]) return null; // set A owns this row
  const promotedAt = meta.promoted_at ?? null;
  return {
    feedback_id: row.id,
    fingerprint: meta.promoted_fingerprint ?? null,
    member_feedback_ids: [row.id],
    max_severity: null,
    admission_path: null,
    gauge_value: null,
    floor: null,
    engine: null,
    decision: null,
    first_withheld_at: promotedAt,
    last_withheld_at: promotedAt,
    first_withheld_run: null,
    last_withheld_run: null,
    withheld_run_count: 0,
    promoted_at: promotedAt,
    promoted_qf_id: meta.promoted_qf_id ?? null,
    promoted_fingerprint: meta.promoted_fingerprint ?? null,
    disposed_by: null,
    disposed_reason: null,
    disposed_at: null,
  };
}

/**
 * Builds every withheld_promotion_markers row to upsert from the two source sets.
 * @param {Array<{id:string, metadata:object}>} setA rows carrying metadata.withheld_pending
 * @param {Array<{id:string, metadata:object}>} setB rows with promoted_to_qf=true, no marker
 * @returns {Array<object>}
 */
export function buildBackfillRows(setA, setB) {
  return [
    ...(setA || []).map(buildMarkerRowFromWithheldPending),
    ...(setB || []).map(buildMarkerRowFromPromotedOnly),
  ].filter(Boolean);
}

/**
 * The BEFORE measurement, read directly from feedback.metadata (FR-8's own acceptance
 * criterion: the backfill's output states this explicitly, never inferred from "ran clean").
 * @param {Array<{id:string, metadata:object}>} setA
 * @param {Array<{id:string, metadata:object}>} setB
 */
export function computeBeforeCounts(setA, setB) {
  const a = setA || [];
  const b = setB || [];
  const pending = a.filter((r) => isPending(r?.metadata?.[MARKER_KEY])).length;
  const promotedInA = a.filter((r) => r?.metadata?.promoted_to_qf === true).length;
  return {
    withheldPendingRows: a.length,
    pendingRows: pending,
    promotedRows: promotedInA + b.length,
    totalMarkerRows: a.length + b.length,
  };
}

/**
 * The AFTER measurement, read from withheld_promotion_markers rows (post-write).
 * @param {Array<{promoted_at:string|null, disposed_at:string|null}>} writtenRows
 */
export function computeAfterCounts(writtenRows) {
  const rows = writtenRows || [];
  const pending = rows.filter((r) => !r.promoted_at && !r.disposed_at).length;
  const promoted = rows.filter((r) => !!r.promoted_at).length;
  return {
    totalMarkerRows: rows.length,
    pendingRows: pending,
    promotedRows: promoted,
  };
}

/**
 * FR-9's cutover gate: the producer cutover (step 3) may only proceed once this returns
 * matched=true. Compares BEFORE (feedback.metadata) against AFTER (withheld_promotion_markers)
 * on the three counts that matter for correctness -- never merely "the script exited 0".
 * @param {ReturnType<typeof computeBeforeCounts>} before
 * @param {ReturnType<typeof computeAfterCounts>} after
 */
export function verifyBackfillCounts(before, after) {
  const mismatches = [];
  if (before.totalMarkerRows !== after.totalMarkerRows) {
    mismatches.push(`totalMarkerRows: before=${before.totalMarkerRows} after=${after.totalMarkerRows}`);
  }
  if (before.pendingRows !== after.pendingRows) {
    mismatches.push(`pendingRows: before=${before.pendingRows} after=${after.pendingRows}`);
  }
  if (before.promotedRows !== after.promotedRows) {
    mismatches.push(`promotedRows: before=${before.promotedRows} after=${after.promotedRows}`);
  }
  return { matched: mismatches.length === 0, mismatches };
}
