/**
 * Kill-gate deterministic recompute registry.
 * SD-LEO-INFRA-KILLGATE-DETERMINISM-ALL-GATES-001 (generalizes #5206 from S5-only)
 *
 * On a re-eval (run #2 re-traversing an already-decided kill gate), the orchestrator must recompute
 * the gate verdict from the stage's LOCKED persisted artifact with NO LLM — so the same persisted
 * inputs always yield the same decision. #5206 hardcoded this for S5; this registry generalizes it
 * to every authoritative kill gate that has an artifact-based evaluator: {3, 5, 13}.
 *
 * S24 is intentionally absent: it has no artifact evaluateKillGate — its verdict derives from S23's
 * persisted verdict (already gate-deterministic, no LLM), so it needs no artifact recompute. The
 * orchestrator's kill-gate PREDICATES still cover S24 via devils-advocate.js KILL_GATES; only the
 * artifact-recompute is scoped to {3,5,13}. A dedicated S24 recompute is a documented follow-on.
 *
 * Each entry is a PURE function (artifacts[]) -> verdict | null. It selects the relevant locked
 * artifact and calls that stage's existing evaluateKillGate via its reEvaluateKillGateFromArtifact
 * wrapper — the verdict logic itself is unchanged, only the artifact->args extraction is added.
 *
 * @module lib/eva/kill-gate-recompute
 */

import { reEvaluateKillGateFromArtifact as reEvalS3 } from './stage-templates/stage-03.js';
import { reEvaluateKillGateFromArtifact as reEvalS5 } from './stage-templates/stage-05.js';
import { reEvaluateKillGateFromArtifact as reEvalS13 } from './stage-templates/stage-13.js';

/** Pick a persisted artifact payload: prefer `preferType`, else the first (primary) artifact. */
function pickPayload(artifacts, preferType = null) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) return null;
  const sel = (preferType && artifacts.find((a) => a?.artifactType === preferType)) || artifacts[0];
  return sel?.payload || null;
}

/**
 * The recompute registry: kill stage -> pure re-eval over its locked persisted artifact(s).
 * Stage 5 selects its truth_financial_model artifact (matching the #5206 behavior); S3/S13 are
 * single-primary-artifact stages so they read the first persisted artifact.
 */
export const KILL_GATE_RECOMPUTE = Object.freeze({
  3: (artifacts) => { const p = pickPayload(artifacts); return p ? reEvalS3(p) : null; },
  5: (artifacts) => { const p = pickPayload(artifacts, 'truth_financial_model'); return p ? reEvalS5(p) : null; },
  13: (artifacts) => { const p = pickPayload(artifacts); return p ? reEvalS13(p) : null; },
});

/** True iff `stage` has a deterministic artifact recompute (3/5/13). */
export function hasKillGateRecompute(stage) {
  return Object.prototype.hasOwnProperty.call(KILL_GATE_RECOMPUTE, stage);
}

/**
 * Recompute a kill gate's verdict deterministically from its locked persisted artifacts.
 * @param {number} stage - resolved lifecycle stage
 * @param {Array<{artifactType?:string, payload?:Object}>} artifacts - loaded persisted artifacts
 * @returns {{decision:string, blockProgression:boolean, reasons:Object[], remediationRoute?:string|null}|null}
 *   null when the stage has no recompute or no usable artifact (caller keeps the merged verdict).
 */
export function recomputeKillGateVerdict(stage, artifacts) {
  const fn = KILL_GATE_RECOMPUTE[stage];
  return fn ? fn(artifacts) : null;
}
