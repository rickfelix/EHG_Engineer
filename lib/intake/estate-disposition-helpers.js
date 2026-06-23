// SD-LEO-INFRA-ESTATE-DISPOSITION-001 — PURE estate-disposition helpers (no IO), shared by
// scripts/intake/drain-intake.mjs and unit-tested directly. Keeping the load-bearing logic
// (idempotency marker, per-table mark-off payload, FR-2 classification, trace-reader suppression)
// pure makes it testable without a live DB.

/**
 * A source estate row is ALREADY drained iff its raw_data carries our ledger back-pointer. This — NOT
 * the table's own status='processed' (set by the enrichment pipeline, not this drain) — is the
 * authoritative idempotency marker, so a re-run / the recurring trigger never re-disposes a row.
 */
export function estateAlreadyDrained(row) {
  const rd = row && row.raw_data;
  return !!(rd && typeof rd === 'object' && rd.conversion_ledger_id);
}

/**
 * SD-REFILL-00SLQCLH: an eva_claude_code_intake row that carries a github_release_id is a Claude Code
 * RELEASE CHANGELOG (titles like v2.1.123 with 'What changed' notes), NOT an idea. The estate drain
 * routed these into the idea estate (conversion_ledger source_pool=estate_corpus), polluting the
 * gauge/estate-driven backlog with 20 tool-changelog rows. Exclude them from the drain. PURE/total.
 */
export function isToolChangelogIntakeRow(row) {
  return row != null && row.github_release_id != null;
}

/** Todoist priority (4=urgent … 1=normal) → normalized_priority text. */
export function todoistPriorityToText(p) {
  const n = Number(p);
  if (n >= 4) return 'critical';
  if (n === 3) return 'high';
  if (n === 2) return 'medium';
  return 'low';
}

/**
 * FR-2 classification vocabulary derived from the reused triage verdict:
 *   improvement-candidate (would-be promote) / drop (declined) / already-covered (dup/covered) / needs-human.
 */
export function classifyEstateItem(verdict = {}) {
  if (verdict.promote) return 'improvement-candidate';
  if (verdict.disposition === 'declined') return 'drop';
  if (['duplicate', 'already_covered', 'merged_duplicate'].includes(verdict.disposition)) return 'already-covered';
  return 'needs-human';
}

/**
 * FR-3 MARK-OFF payload (pure). Writes ONLY raw_data: the ledger back-pointer (our authoritative
 * idempotency marker — see estateAlreadyDrained), the 0-3 compounding score, and the FR-2
 * classification. It deliberately does NOT touch `status`/`processed_at`: those columns are owned by
 * each table's enrichment pipeline (release-analyzer, youtube post-processor, todoist), which gate on
 * status='pending' — writing status='processed' here would silently starve them. Idempotent.
 * @returns {{ raw_data:object }}
 */
export function buildEstateMarkOff(item = {}, ledgerRowId, score, classification) {
  const raw_data = {
    ...(item._rawData || {}),
    conversion_ledger_id: ledgerRowId,
    compounding_score: score,
    disposition_classification: classification ?? null,
  };
  return { raw_data };
}

/**
 * Trace-reader suppression (FR-5): an estate idea has ALREADY shipped — and must not be re-proposed —
 * iff its v_estate_traceback row resolves a linked SD that is completed. Pure predicate mirroring the
 * consumer query (WHERE linked_sd_status = 'completed').
 */
export function isEstateIdeaShipped(traceRow) {
  return !!traceRow && traceRow.linked_sd_status === 'completed';
}
