/**
 * Gate enforcement registry — SD-LEO-FIX-MAKE-VENTURE-STAGE-001.
 *
 * PURE module (no imports, no IO) so BOTH stage-gates.js (which imports the
 * persistence service) and artifact-persistence-service.js (whose advanceStage
 * enforces the gate-debt check) can consume it without an import cycle.
 *
 * Keyed by eva_stage_gate_results.gate_type — the DB CHECK-constraint values
 * ('kill' | 'exit' | 'entry') that recordGateResult() maps every code-level
 * gate family onto:
 *  - kill  → blocking  (termination checkpoints; S3/S5/S13/S24)
 *  - exit  → blocking  (stage exit gates incl. the EXISTING artifact gates and
 *                       the promotion family; NOTE: taste-gate rows also land
 *                       under 'exit' via recordGateResult's GATE_TYPE_MAP and
 *                       share the (venture,stage,gate_type) upsert key — the
 *                       LAST evaluation wins; documented pre-existing collision)
 *  - entry → advisory  (v1: entry preconditions are enforced upstream by the
 *                       stage executor; their rows are informational here)
 *
 * Consistent with stage_config.gate_type semantics in fn_advance_venture_stage
 * (kill/promotion additionally require approved chairman_decisions at the RPC).
 *
 * A FAILED blocking evaluation blocks advanceStage() until re-evaluated green
 * OR an approved chairman_decisions row exists for the venture+stage — incl.
 * decision='override', the first-class recording of deliberate chairman
 * build-out forcing (chairman context 2026-06-10: the override is the
 * RECORDING of the practice, not a guardrail against it).
 */
'use strict';

export const GATE_ENFORCEMENT = Object.freeze({
  kill: 'blocking',
  exit: 'blocking',
  entry: 'advisory',
});

/**
 * PURE: classify an eva_stage_gate_results row as 'blocking' | 'advisory'.
 * Unknown gate_types default to 'advisory' (fail-open for forward-compat: a
 * new informational gate type must not silently dam every venture).
 * @param {{gate_type?: string}} row
 * @returns {'blocking'|'advisory'}
 */
export function classifyGateRow(row) {
  return GATE_ENFORCEMENT[row?.gate_type] || 'advisory';
}
