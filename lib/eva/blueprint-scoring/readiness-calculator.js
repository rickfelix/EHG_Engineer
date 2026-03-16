/**
 * ReadinessScoreCalculator — Aggregates per-artifact scores and consistency penalties
 * into a composite Blueprint Readiness Score (0-100).
 *
 * @module lib/eva/blueprint-scoring/readiness-calculator
 */

import { ARTIFACT_TYPES } from './rubric-definitions.js';

/**
 * Calculate composite readiness score from artifact scores and consistency results.
 *
 * @param {Array<{artifactType: string, total: number}>} artifactScores
 * @param {{ totalPenalty: number, penalties: Array }} consistencyResult
 * @returns {{ readinessScore: number, artifactSubscores: Record<string, number>, missingArtifacts: string[], consistencyPenalty: number, breakdown: object }}
 */
export function calculateReadiness(artifactScores, consistencyResult) {
  const scoreMap = new Map(artifactScores.map((s) => [s.artifactType, s.total]));
  const present = [];
  const missingArtifacts = [];

  for (const type of ARTIFACT_TYPES) {
    if (scoreMap.has(type)) {
      present.push({ type, score: scoreMap.get(type) });
    } else {
      missingArtifacts.push(type);
    }
  }

  // Weighted average: each artifact contributes equally, missing = 0
  const totalWeight = ARTIFACT_TYPES.length;
  const rawScore = present.reduce((sum, a) => sum + a.score, 0) / totalWeight;
  const consistencyPenalty = consistencyResult?.totalPenalty || 0;
  const readinessScore = Math.max(0, Math.round((rawScore - consistencyPenalty) * 100) / 100);

  const artifactSubscores = Object.fromEntries(
    ARTIFACT_TYPES.map((t) => [t, scoreMap.get(t) ?? 0])
  );

  return {
    readinessScore,
    artifactSubscores,
    missingArtifacts,
    consistencyPenalty,
    breakdown: {
      presentCount: present.length,
      totalCount: ARTIFACT_TYPES.length,
      averageArtifactScore: present.length > 0
        ? Math.round((present.reduce((s, a) => s + a.score, 0) / present.length) * 100) / 100
        : 0,
      rawScoreBeforePenalty: Math.round(rawScore * 100) / 100,
    },
  };
}
