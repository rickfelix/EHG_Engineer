/**
 * Proxy Metric Engine — Generates deterministic synthetic scores
 * for the Bayesian analyzer when real telemetry is insufficient.
 *
 * Uses SHA-256 hash of venture UUID + component name as seed
 * for reproducible numeric scores (0-100). Each score is flagged
 * with provenance metadata (source=proxy).
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-C
 *
 * @module lib/eva/experiments/proxy-metric-engine
 */

import { createHash } from 'crypto';

/**
 * The 14 synthesis components used in Stage 0 evaluation.
 */
export const SYNTHESIS_COMPONENTS = [
  'cross-reference-intellectual-capital',
  'portfolio-evaluation',
  'problem-reframing',
  'moat-architecture',
  'chairman-constraints',
  'time-horizon',
  'archetypes',
  'build-cost-estimation',
  'virality',
  'design-evaluation',
  'narrative-risk',
  'tech-trajectory',
  'attention-capital',
  'mental-model-analysis',
];

/**
 * Generate a deterministic score (0-100) from a seed string.
 * Uses SHA-256 hash, takes first 4 bytes as uint32, then modulo 101.
 *
 * @param {string} seed - Seed string (venture UUID + component name)
 * @returns {number} Score between 0 and 100 inclusive
 */
function seededScore(seed) {
  const hash = createHash('sha256').update(seed).digest();
  // Read first 4 bytes as unsigned 32-bit integer
  const value = hash.readUInt32BE(0);
  return value % 101;
}

/**
 * Generate proxy scores for all synthesis components for a venture.
 *
 * @param {string} ventureId - Venture UUID
 * @param {string[]} [components] - Component names (defaults to all 14)
 * @returns {Array<{component: string, score: number, provenance: string}>}
 */
export function generateProxyScores(ventureId, components = SYNTHESIS_COMPONENTS) {
  if (!ventureId) {
    throw new Error('ventureId is required');
  }

  return components.map(component => ({
    component,
    score: seededScore(`${ventureId}:${component}`),
    provenance: 'proxy',
  }));
}

/**
 * Generate proxy scores for multiple ventures.
 *
 * @param {string[]} ventureIds - Array of venture UUIDs
 * @param {string[]} [components] - Component names (defaults to all 14)
 * @returns {Map<string, Array<{component: string, score: number, provenance: string}>>}
 */
export function generateBatchProxyScores(ventureIds, components = SYNTHESIS_COMPONENTS) {
  const results = new Map();
  for (const ventureId of ventureIds) {
    results.set(ventureId, generateProxyScores(ventureId, components));
  }
  return results;
}
