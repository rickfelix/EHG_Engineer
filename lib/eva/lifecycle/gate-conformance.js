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
 * check, is actually invoked from exactly 2 production call sites:
 *   - INSTRUMENTED: lib/eva/artifact-persistence-service.js:698 advanceStage() — THROWS on
 *     an unsatisfied binding gate.
 *   - INSTRUMENTED: lib/eva/stage-execution-engine.js:63 processLifecycleTerminal() — does
 *     NOT throw; returns {handled:true, completed:false, blockedBy} and logs a warning instead
 *     (asymmetric polarity vs the throwing call site — document both, never assume uniform).
 * The following venture-stage-advancement paths do NOT call checkExitGates and are explicitly
 * OUT OF SCOPE for this SD (no conformance/precheck coverage applies to them):
 *   - lib/eva/stage-execution-worker.js's internal _advanceStage() (the dominant path, used by
 *     7+ call sites for most real stage advancement).
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
