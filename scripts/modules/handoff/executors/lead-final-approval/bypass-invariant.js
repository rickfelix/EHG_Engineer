/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D4: the no-silent-bypass invariant.
 *
 * "No accepted LEAD-FINAL-APPROVAL row may carry a required gate reading passed:false without a
 * joinable bypass_ledger row explaining why it was accepted anyway."
 *
 * Measured live before this fix: this invariant already HELD (22/22 sampled accepted rows with a
 * failing required gate had a matching bypass_ledger row) -- but the join was only checkable by
 * sd_key (soft, renameable), never handoff_id (structural), because bypass_ledger.handoff_id was
 * 0/33 populated for this phase (see joinBypassLedgerToCanonicalHandoff in ./index.js, the fix for
 * that). This module makes the invariant CHECK itself structural: it matches strictly by
 * handoff_id, so a future regression in the join-back (or a new code path that forgets to call it)
 * fails loudly here instead of silently degrading back to a soft, unenforceable match.
 *
 * Pure and dependency-free -- takes already-fetched rows, does no DB I/O -- so it is directly unit
 * testable and reusable both as a CI-asserted test and as a standalone audit script.
 */

/**
 * @param {Array<{id: string, gate_results?: Array<{name: string, required?: boolean, passed?: boolean}>}>} acceptedHandoffRows
 *   Accepted LEAD-FINAL-APPROVAL sd_phase_handoffs rows, each with metadata.gate_results already
 *   extracted to the top-level `gate_results` key (an array, per projectGateResultsForPersistence's
 *   shape) by the caller.
 * @param {Array<{handoff_id: string|null}>} bypassLedgerRows - bypass_ledger rows for the same
 *   sample window.
 * @returns {Array<{handoff_id: string, failing_gates: string[]}>} violations -- accepted rows with
 *   at least one required, failing gate and NO joinable bypass_ledger row. Empty array = invariant
 *   holds.
 */
export function findUnjoinedRequiredGateFailures(acceptedHandoffRows, bypassLedgerRows) {
  const joinedHandoffIds = new Set(
    (bypassLedgerRows || [])
      .map((r) => r?.handoff_id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  );

  const violations = [];
  for (const row of acceptedHandoffRows || []) {
    const gateResults = Array.isArray(row?.gate_results) ? row.gate_results : [];
    const failingRequired = gateResults.filter((g) => g?.required === true && g?.passed === false);
    if (failingRequired.length === 0) continue;
    if (joinedHandoffIds.has(row.id)) continue;
    violations.push({ handoff_id: row.id, failing_gates: failingRequired.map((g) => g.name) });
  }
  return violations;
}
