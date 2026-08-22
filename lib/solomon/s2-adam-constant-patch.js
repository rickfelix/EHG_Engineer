// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-4) -- S2 verbatim-source Adam-constant patch.
// Part B restore ceremony, incident ba330d67.
//
// PENDING CLARIFICATION (signal a54582d1-cb04-401c-a0d1-13e3e141f162, unanswered as of authoring):
// SD-ALTIFYAI-LEO-FIX-SOLOMON-ADVICE-LEDGER-001 (the dependency this patch was deferred behind)
// reached status=completed, but its decision_requested migration is unapplied live and it is
// unclear whether its decision_by identity-cleanup backfill already covers rows 922f8dfb and
// 0f9ffc05. This module's logic is built and unit-tested, but ENABLE_S2_PATCH defaults false --
// it is NEVER invoked against live data until the signal is answered and this default is
// deliberately flipped by a human reviewing the reply.
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
