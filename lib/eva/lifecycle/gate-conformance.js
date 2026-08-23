/**
 * Pure, DB-free comparison of venture_stages gate strings against the
 * exit-gate-verifiers.js registry.
 *
 * @wire-check-exempt: available infrastructure with no production runtime caller yet, by design
 * -- see the FR-4 disclosure in would-block-rate-precheck.js (its only current importer) for the
 * full rationale: no would-block-rate consumer exists anywhere in the codebase, and wiring one is
 * explicitly out of scope for this SD. This module IS exercised: unit-tested directly over a
 * committed fixture (tests/unit/eva/lifecycle/gate-conformance.test.js) and against the live DB
 * (tests/db-invariants/venture-stages-gate-verifier-conformance.test.js) -- it is unwired code,
 * not untested code.
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-2): extracted from the comparison
 * logic in tests/db-invariants/venture-stages-gate-verifier-conformance.test.js
 * (SD-MAN-INFRA-VENTURE-CRACK-GATE-001) so the SAME logic can run (a) as a
 * unit-tested pure function over a committed fixture, unskipped in normal CI,
 * and (b) as input to a live conformance report / the would-block-rate
 * precheck (FR-4) without either duplicating the comparison or requiring a
 * DB connection.
 *
 * SD-FDBK-FIX-EXIT-GATE-CONFORMANCE-001 (FR-5): venture-stage-advancement path coverage.
 * checkExitGates() (lib/eva/lifecycle/exit-gate-enforcer.js), and therefore this conformance
 * check, is actually invoked from these production call sites:
 *   - INSTRUMENTED: lib/eva/artifact-persistence-service.js:698 advanceStage() — THROWS on
 *     an unsatisfied binding gate.
 *   - INSTRUMENTED: lib/eva/stage-execution-engine.js:63 processLifecycleTerminal() — does
 *     NOT throw; returns {handled:true, completed:false, blockedBy} and logs a warning instead
 *     (asymmetric polarity vs the throwing call site — document both, never assume uniform).
 *   - SD-LEO-INFRA-MINUS-PATH-INTEGRITY-001 (FR-1, 2026-08-23): lib/eva/stage-execution-worker.js's
 *     internal _advanceStage() — the DOMINANT path (7+ call sites, used for most real stage
 *     advancement). checkExitGates/checkThesisKillGate/checkGateDebt are now composed there too,
 *     gated behind the PATH_INTEGRITY_EXIT_GATE_ENFORCE feature flag (default OFF: all 3 checks
 *     still run and a would-have-failed result is logged, but the advance is never blocked; ON:
 *     the failing result actually blocks). Returns _advanceStage()'s OWN local result shape
 *     ({advanced:false, blocked:true, reason}) rather than throwing — a THIRD, distinct polarity
 *     from the two call sites above, not uniform with either.
 * The following venture-stage-advancement paths STILL do NOT call checkExitGates and remain
 * explicitly OUT OF SCOPE (no conformance/precheck coverage applies to them):
 *   - The ehg-frontend advance_venture_stage DB RPC (src/lib/ventures/advanceStage.ts).
 *   - The EVA daemon's fn_advance_venture_stage RPC.
 *
 * @module lib/eva/lifecycle/gate-conformance
 */

import { resolveVerifier } from './exit-gate-verifiers.js';

/**
 * @typedef {Object} StageRow
 * @property {number} stage_number
 * @property {string} [stage_name]
 * @property {{gates?: {exit?: string[], exit_observe?: string[]}}} metadata
 */

/**
 * @typedef {Object} UnresolvableEntry
 * @property {number} stage
 * @property {string} [stageName]
 * @property {string} gateString
 */

/**
 * @typedef {Object} GateConformanceReport
 * @property {UnresolvableEntry[]} unresolvableBinding — unresolvable gates.exit strings
 * @property {UnresolvableEntry[]} unresolvableObserve — unresolvable gates.exit_observe strings
 * @property {number} unresolvableCount — unresolvableBinding.length (the count FR-4's precheck gates on)
 * @property {number} totalBindingCount
 * @property {number} totalObserveCount
 */

/**
 * Compare a set of venture_stages rows against the live GATE_VERIFIERS registry.
 * Pure — no DB calls, no side effects. Callers supply the stage rows (either a
 * live query result or a committed fixture).
 *
 * @param {StageRow[]} stages
 * @returns {GateConformanceReport}
 */
export function computeGateConformance(stages) {
  const unresolvableBinding = [];
  const unresolvableObserve = [];
  let totalBindingCount = 0;
  let totalObserveCount = 0;

  for (const stage of Array.isArray(stages) ? stages : []) {
    const exitGates = Array.isArray(stage.metadata?.gates?.exit) ? stage.metadata.gates.exit : [];
    const observeGates = Array.isArray(stage.metadata?.gates?.exit_observe) ? stage.metadata.gates.exit_observe : [];

    totalBindingCount += exitGates.length;
    totalObserveCount += observeGates.length;

    for (const gateString of exitGates) {
      if (!resolveVerifier(gateString)) {
        unresolvableBinding.push({ stage: stage.stage_number, stageName: stage.stage_name, gateString });
      }
    }
    for (const gateString of observeGates) {
      if (!resolveVerifier(gateString)) {
        unresolvableObserve.push({ stage: stage.stage_number, stageName: stage.stage_name, gateString });
      }
    }
  }

  return {
    unresolvableBinding,
    unresolvableObserve,
    unresolvableCount: unresolvableBinding.length,
    totalBindingCount,
    totalObserveCount,
  };
}
