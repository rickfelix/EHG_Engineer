/**
 * Sensemaking Enricher
 * SD: SD-LEO-FEAT-CONNECT-ASSIST-ENGINE-001
 *
 * Enriches feedback items with sensemaking disposition data.
 * - Filters out discarded items (FR-002)
 * - Annotates kept items with _sensemakingDisposition (FR-002)
 * - Applies half-band priority boost to kept items (FR-003)
 *
 * @module lib/quality/sensemaking-enricher
 */

/**
 * Enrich feedback items with sensemaking disposition data and filter discards.
 *
 * Expects items queried from v_feedback_with_sensemaking VIEW which includes:
 * - sensemaking_analysis_id
 * - sensemaking_disposition ('keep' | 'discard' | null)
 * - sensemaking_disposition_at
 * - sensemaking_confidence
 * - sensemaking_status
 *
 * @param {Object[]} items - Feedback items from v_feedback_with_sensemaking
 * @returns {{ enriched: Object[], discardedCount: number }}
 */
export function enrichWithSensemaking(items) {
  let discardedCount = 0;
  const enriched = [];

  for (const item of items) {
    // FR-002: Filter out discarded items
    if (item.sensemaking_disposition === 'discard') {
      discardedCount++;
      continue;
    }

    // FR-002: Annotate kept items
    if (item.sensemaking_disposition === 'keep') {
      item._sensemakingDisposition = 'keep';
      item._sensemakingAnalysisId = item.sensemaking_analysis_id;
      item._sensemakingDispositionAt = item.sensemaking_disposition_at;
    }

    enriched.push(item);
  }

  if (discardedCount > 0) {
    console.log(`[sensemaking-enricher] Filtered ${discardedCount} discarded item(s)`);
  }

  return { enriched, discardedCount };
}

/**
 * Apply half-band priority boost to kept sensemaking items (FR-003).
 *
 * Kept items get a fractional priority adjustment that sorts them before
 * non-kept items within the same P-band, but never overrides a higher band.
 *
 * Example: kept P2 sorts before non-kept P2, but after any P0 or P1.
 *
 * @param {Object[]} items - Items to sort (mutated in place with _sortPriority)
 * @returns {Object[]} Items with _sortPriority annotation
 */
export function applyPriorityBoost(items) {
  const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };

  for (const item of items) {
    const basePriority = priorityOrder[item.priority] ?? 2;
    // Half-band boost: kept items get -0.5 within their band
    // This places them before non-kept items in same band
    // but never crosses band boundaries (e.g., boosted P2 = 1.5, still > P1 = 1)
    item._sortPriority = item._sensemakingDisposition === 'keep'
      ? basePriority - 0.5
      : basePriority;
  }

  return items;
}

export default { enrichWithSensemaking, applyPriorityBoost };
