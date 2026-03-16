/**
 * QualityGateDecisionEngine — Produces pass/fail/retry gate decisions
 * with actionable remediation feedback.
 *
 * @module lib/eva/blueprint-scoring/gate-engine
 */

import { RUBRIC_DEFINITIONS } from './rubric-definitions.js';

const THRESHOLDS = { pass: 70, retry: 50 };

/**
 * @typedef {Object} RemediationItem
 * @property {string} artifactType
 * @property {string} dimension
 * @property {number} currentScore
 * @property {number} minRequired
 * @property {string} suggestion
 */

/**
 * Evaluate gate decision from readiness result and artifact scores.
 *
 * @param {{ readinessScore: number, artifactSubscores: Record<string, number>, missingArtifacts: string[] }} readinessResult
 * @param {Array<{artifactType: string, dimensions: Array<{name: string, score: number, weight: number}>}>} artifactDetails
 * @returns {{ decision: 'pass'|'fail'|'retry', score: number, remediationItems: RemediationItem[] }}
 */
export function evaluateGate(readinessResult, artifactDetails = []) {
  const { readinessScore, missingArtifacts } = readinessResult;
  const remediationItems = [];

  // Missing artifacts are always remediation items
  for (const type of missingArtifacts) {
    remediationItems.push({
      artifactType: type,
      dimension: 'presence',
      currentScore: 0,
      minRequired: RUBRIC_DEFINITIONS[type]?.min_pass_score ?? 60,
      suggestion: `Generate ${type} artifact — currently missing from blueprint`,
    });
  }

  // Low-scoring dimensions from present artifacts
  for (const artifact of artifactDetails) {
    const rubric = RUBRIC_DEFINITIONS[artifact.artifactType];
    if (!rubric) continue;
    for (const dim of artifact.dimensions) {
      if (dim.score < 50) {
        remediationItems.push({
          artifactType: artifact.artifactType,
          dimension: dim.name,
          currentScore: dim.score,
          minRequired: 50,
          suggestion: `Improve ${dim.name} in ${artifact.artifactType} (currently ${dim.score}/100)`,
        });
      }
    }
  }

  let decision;
  if (readinessScore >= THRESHOLDS.pass) {
    decision = 'pass';
  } else if (readinessScore >= THRESHOLDS.retry) {
    decision = 'retry';
  } else {
    decision = 'fail';
  }

  return { decision, score: readinessScore, remediationItems };
}
