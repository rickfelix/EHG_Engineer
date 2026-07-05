/**
 * Mode-matched gate evidence — SD-LEO-INFRA-LAUNCH-MODE-POLICY-002 (FR-3/FR-4).
 *
 * ONE declaration of what each launch_mode accepts as gate evidence, consumed
 * by S23 launch-readiness and S24 go-live (and future ship/deploy/revenue-rail
 * gates) — per-gate copies are exactly how sim work masquerades as real.
 *
 *   simulated — launch-evidence artifacts MUST carry the explicit sim label
 *               (payload.labeled_simulation === true). Unlabeled launch
 *               evidence FAILS the gate (-001 stamped the label; -002 adds
 *               the rejection).
 *   live      — external observations ONLY, via -001's fail-closed
 *               verifyExternalObservation. Internal artifacts can never pass.
 */

import { verifyExternalObservation } from './external-observation.js';
import { LIVE } from './launch-mode.js';

/** Artifact types that constitute launch evidence (subject to the sim-label law). */
export const LAUNCH_EVIDENCE_TYPES = Object.freeze(['launch_metrics']);

/**
 * Pure (FR-3): in simulated mode, every current launch-evidence artifact must
 * carry labeled_simulation === true. Accepts BOTH shapes: persisted DB rows
 * (venture_artifacts.artifact_data JSONB — the column the persistence service
 * dual-writes payloads into) and in-memory emitter artifacts (payload key).
 * @param {Array<{ artifact_type?: string, artifact_data?: object, payload?: object }>} artifacts
 * @returns {{ pass: boolean, unlabeled: string[] }}
 */
export function evaluateSimArtifacts(artifacts = []) {
  const unlabeled = (artifacts || [])
    .filter((a) => a && LAUNCH_EVIDENCE_TYPES.includes(a.artifact_type))
    .filter((a) => {
      const data = a.artifact_data || a.payload;
      return !(data && data.labeled_simulation === true);
    })
    .map((a) => a.artifact_type);
  return { pass: unlabeled.length === 0, unlabeled };
}

/**
 * Pure (FR-3/FR-4): evaluate mode-matched evidence for a gate.
 * @param {{ mode: string, artifacts?: Array<object>, observations?: object|null }} params
 * @returns {{ mode: string, pass: boolean, reason: string, checks?: Array<object>, unlabeled?: string[] }}
 */
export function evaluateModeEvidence({ mode, artifacts = [], observations = null } = {}) {
  if (mode === LIVE) {
    // Fail-closed: null observations means NO external grounding was collected.
    const result = verifyExternalObservation(observations || {});
    return {
      mode,
      pass: result.verified,
      reason: result.verified ? 'external observations verified' : 'external observations unverified (fail-closed)',
      checks: result.checks,
    };
  }
  const sim = evaluateSimArtifacts(artifacts);
  return {
    mode,
    pass: sim.pass,
    reason: sim.pass
      ? 'all launch evidence carries the sim label'
      : `unlabeled launch evidence in simulated mode: ${sim.unlabeled.join(', ')} (sim work must never masquerade as real)`,
    unlabeled: sim.unlabeled,
  };
}
