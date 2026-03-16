/**
 * BlueprintQualityScorer — Per-artifact scoring engine.
 * Evaluates a single artifact against its type-specific rubric.
 *
 * @module lib/eva/blueprint-scoring/quality-scorer
 */

import { RUBRIC_DEFINITIONS } from './rubric-definitions.js';

/**
 * Score an artifact against its type-specific rubric.
 *
 * @param {string} artifactType - One of the 11 artifact types
 * @param {object} artifactContent - The artifact's content (parsed JSONB)
 * @returns {{ artifactType: string, rubricVersion: number, dimensions: Array<{name: string, score: number, max: number, weight: number, feedback: string}>, total: number }}
 */
export function scoreArtifact(artifactType, artifactContent) {
  const rubric = RUBRIC_DEFINITIONS[artifactType];
  if (!rubric) {
    throw new Error(`No quality rubric defined for artifact type: ${artifactType}`);
  }

  const dimensions = rubric.dimensions.map((dim) => {
    const score = evaluateDimension(dim, artifactContent);
    return {
      name: dim.name,
      score,
      max: 100,
      weight: dim.weight,
      feedback: generateFeedback(dim, score),
    };
  });

  const total = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);

  return {
    artifactType,
    rubricVersion: rubric.version,
    dimensions,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Evaluate a single rubric dimension for an artifact.
 * Uses content heuristics: presence, depth, and structure.
 */
function evaluateDimension(dimension, content) {
  if (!content || typeof content !== 'object') return 0;

  const contentStr = JSON.stringify(content);
  const len = contentStr.length;

  // Empty or trivial content
  if (len < 10) return 0;
  if (len < 50) return 25;

  // Check for dimension-relevant keys in content
  const dimKey = dimension.name.toLowerCase();
  const relevantKeys = Object.keys(content).filter(
    (k) => k.toLowerCase().includes(dimKey) || dimKey.includes(k.toLowerCase())
  );

  // Score based on content depth
  const hasRelevantContent = relevantKeys.length > 0;
  const contentDepth = countDepth(content);
  const arrayItems = countArrayItems(content);

  if (len > 500 && contentDepth > 2 && arrayItems > 3) return 100;
  if (len > 200 && (hasRelevantContent || contentDepth > 1)) return 75;
  if (len > 100) return 50;
  return 25;
}

function countDepth(obj, depth = 0) {
  if (typeof obj !== 'object' || obj === null) return depth;
  const values = Array.isArray(obj) ? obj : Object.values(obj);
  return Math.max(depth, ...values.map((v) => countDepth(v, depth + 1)));
}

function countArrayItems(obj) {
  if (Array.isArray(obj)) return obj.length;
  if (typeof obj !== 'object' || obj === null) return 0;
  return Object.values(obj).reduce((sum, v) => sum + countArrayItems(v), 0);
}

function generateFeedback(dimension, score) {
  const level = dimension.scoring_levels
    .slice()
    .reverse()
    .find((l) => score >= l.score);
  return level
    ? `${dimension.name}: ${level.label} — ${level.description}`
    : `${dimension.name}: Not evaluated`;
}
