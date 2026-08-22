// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-4) -- S2 verbatim-source Adam-constant patch.
// Part B restore ceremony, incident ba330d67.
//
// RESOLVED, SUPERSEDED (Solomon's binding S2 ruling, signal a54582d1 resolution): decision_by on
// rows 922f8dfb/0f9ffc05 was already correctly 'adam-08049808' via an earlier write path --
// patching it further is writer-illegal (not a value normalizeDecisionBy could have produced).
// The real gap was a NULL decision_at, backfilled instead by QF-20260822-805
// (lib/solomon/s2-decision-at-backfill.js). ENABLE_S2_PATCH stays false permanently: this
// module's decision_by patch must never be invoked against live data.
export const ADAM_CONSTANT = 'adam-08049808';
export const S2_TARGET_IDS = Object.freeze(['922f8dfb', '0f9ffc05']); // short-prefix ids, per the coordinator's spec
export const ENABLE_S2_PATCH = false;

/**
 * Pure: build the staged patch set for the S2 rows, IF enabled.
 * @param {{id: string, decision_by: string|null}[]} liveRows - the live rows matching S2_TARGET_IDS (full UUIDs)
 * @param {boolean} [enabled] - defaults to the module-level ENABLE_S2_PATCH; a caller may override
 *   ONLY in a test harness -- production code must never pass true here without a human having
 *   flipped ENABLE_S2_PATCH itself first.
 * @returns {{applied: object[], skipped: object[], reason: string}}
 */
export function buildS2Patch(liveRows, enabled = ENABLE_S2_PATCH) {
  if (!enabled) {
    return {
      applied: [],
      skipped: liveRows.map((r) => ({ id: r.id, currentDecisionBy: r.decision_by })),
      reason: 'ENABLE_S2_PATCH is false -- S2 stays PENDING CLARIFICATION, no patch staged for any row.',
    };
  }
  const applied = [];
  const skipped = [];
  for (const row of liveRows) {
    const shortId = row.id.split('-')[0];
    if (!S2_TARGET_IDS.includes(shortId)) {
      skipped.push({ id: row.id, currentDecisionBy: row.decision_by, reason: 'Not one of the 2 named S2 target rows.' });
      continue;
    }
    applied.push({ id: row.id, patchedDecisionBy: ADAM_CONSTANT, previousDecisionBy: row.decision_by });
  }
  return { applied, skipped, reason: `ENABLE_S2_PATCH is true -- staged ${applied.length} row(s) exactly matching S2_TARGET_IDS.` };
}
