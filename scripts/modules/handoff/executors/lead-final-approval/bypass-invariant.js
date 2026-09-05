/**
 * SD-LEO-ORCH-CAPA-GATE-EVIDENCE-001-D FR-D4: the no-silent-bypass invariant.
 *
 * "No accepted LEAD-FINAL-APPROVAL row may carry a required gate reading passed:false without a
 * joinable bypass_ledger row explaining why it was accepted anyway."
 *
 * PROVENANCE OF THE "22/22 HOLDS" CLAIM: this was LEAD-phase risk-agent research (2026-09-05),
 * measured directly against sd_phase_handoffs joined to bypass_ledger BY sd_key (the only join
 * available before this fix) -- not a reproduction of this module's own logic against
 * metadata.gate_results, which could not have produced that number: gate_results.required was
 * unconditionally false on 100% of historical rows before FR-D1 (this same SD) fixed it, so this
 * checker's predicate is vacuous on all pre-fix history by construction. This module exists to
 * make the invariant CHECKABLE, structurally, GOING FORWARD (once FR-D1's corrected `required`
 * values and FR-D4's handoff_id join-back are both live) -- it is not itself the source of the
 * historical 22/22 figure.
 *
 * TESTING finding (adversarial review, 2026-09-05): a required gate's `required_effective:false`
 * (a validator's own deliberate warn-only override, e.g. FR_DELIVERY_VERIFICATION with its
 * enforcement flag off -- see ValidationOrchestrator.js's merge logic) means the gate was NOT
 * actually blocking on that run, so a bypass_ledger row is not expected and its absence is not a
 * violation. Only a gate that was ACTUALLY enforced (no required_effective override, or
 * required_effective:true) and still failed needs an explaining bypass row.
 *
 * SCOPE NOTE: this is a unit-test-level CI assertion of the INVARIANT LOGIC against fixtures (see
 * bypass-invariant.test.js) -- it fails loudly if the PREDICATE regresses. It is not a live,
 * periodic auditor of production data (that would need its own DB-connected script and CI
 * schedule, a larger, separate scope than this SD measured or sized).
 *
 * Pure and dependency-free -- takes already-fetched rows, does no DB I/O -- so it is directly unit
 * testable and reusable both as a CI-asserted test and as a standalone audit script.
 */

/**
 * @param {Array<{id: string, gate_results?: Array<{name: string, required?: boolean, required_effective?: boolean, passed?: boolean}>}>} acceptedHandoffRows
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
    // A gate carrying required_effective:false was deliberately non-blocking on this specific run
    // (a validator's own dynamic override, e.g. an enforcement flag being off) -- it needed no
    // bypass to be accepted, so its failure is not a violation of this invariant.
    const failingRequired = gateResults.filter(
      (g) => g?.required === true && g?.passed === false && g?.required_effective !== false
    );
    if (failingRequired.length === 0) continue;
    if (joinedHandoffIds.has(row.id)) continue;
    violations.push({ handoff_id: row.id, failing_gates: failingRequired.map((g) => g.name) });
  }
  return violations;
}
