/**
 * Pure backlog-item disposition classifier (no IO).
 * SD-LEO-INFRA-BACKLOG-DISPOSITION-COLUMN-WORKFLOW-001 (FR-2 / FR-3).
 *
 * Distils an sd_backlog_map item into a first-class disposition
 * (BUILD | RESEARCH | REFERENCE | CANCEL), or NULL when genuinely undecided.
 * completion_status is the AUTHORITATIVE signal (it is the item's real lifecycle
 * state); the conversion_ledger feeder only fills items completion_status leaves
 * undecided, so a converted-from-intake origin never overrides a CANCELLED/etc state.
 */

export const VALID_DISPOSITIONS = ['BUILD', 'RESEARCH', 'REFERENCE', 'CANCEL'];

// completion_status → disposition. Statuses not listed (NOT_STARTED, IN_PROGRESS,
// DEFERRED) are genuinely undecided → NULL (still count in the gauge denominator).
export const DISPOSITION_BY_COMPLETION = {
  COMPLETED: 'BUILD',            // it was built/shipped
  CANCELLED: 'CANCEL',           // explicitly killed
  UTILIZED_ELSEWHERE: 'REFERENCE', // absorbed/used elsewhere → reference, not net-new build
};

/**
 * @param {{completion_status?:string, sd_id?:string}} item
 * @param {Set<string>} convertedSdKeys - sd_id values that are the linked_sd_key of a
 *   conversion_ledger row with disposition='converted' (the integrated intake feeder).
 * @returns {('BUILD'|'RESEARCH'|'REFERENCE'|'CANCEL'|null)}
 */
export function classifyDisposition(item, convertedSdKeys = new Set()) {
  const byStatus = DISPOSITION_BY_COMPLETION[item && item.completion_status] || null;
  if (byStatus) return byStatus;
  // Feeder ONLY fills genuinely-undecided items: a backlog item whose SD was converted
  // from an intake-pool item is real, sourced work → BUILD.
  if (item && item.sd_id && convertedSdKeys instanceof Set && convertedSdKeys.has(item.sd_id)) {
    return 'BUILD';
  }
  return null; // undecided — leave NULL (counts in denominator, not numerator)
}

/**
 * Build the converted-SD-key set from conversion_ledger rows (the integrated feeder).
 * A row feeds a disposition only when it was 'converted' AND carries a linked_sd_key.
 * @param {Array<{disposition?:string, linked_sd_key?:string}>} ledgerRows
 * @returns {Set<string>}
 */
export function convertedSdKeySet(ledgerRows) {
  const set = new Set();
  for (const r of ledgerRows || []) {
    if (r && r.disposition === 'converted' && r.linked_sd_key) set.add(r.linked_sd_key);
  }
  return set;
}
