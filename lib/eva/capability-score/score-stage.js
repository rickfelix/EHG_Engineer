/**
 * Capability Contribution Score — Per-Stage Scoring Engine
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-E: FR-002, TR-003
 *
 * Computes a 5-dimension capability score for a stage artifact using an LLM.
 * Called as a post-analysis hook in executeStage() after validateOutput() succeeds.
 *
 * Design:
 *   - Uses getValidationClient() (smaller/faster model) for scoring
 *   - 30s timeout — non-blocking (failure does not block stage progression)
 *   - Idempotent: re-running replaces previous scores via UPSERT
 *   - Dependency injection for LLM client and Supabase (testable with mocks)
 */

import { getValidationClient } from '../../llm/client-factory.js';
import { parseJSON, extractUsage } from '../utils/parse-json.js';
import {
  DIMENSIONS,
  STAGE_DIMENSION_WEIGHTS,
  DIMENSION_RUBRICS,
} from './stage-capability-weights.js';

const SCORING_TIMEOUT_MS = 30_000;

/**
 * Compute capability scores for a stage artifact.
 *
 * @param {number} stageNumber - Stage number (1-26)
 * @param {Object} artifact - Stage output artifact data
 * @param {Object} deps - Injected dependencies
 * @param {string} deps.ventureId - Venture UUID
 * @param {string} [deps.artifactId] - Artifact UUID (for FK reference)
 * @param {Object} [deps.supabase] - Supabase client (required for persistence)
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @param {Object} [deps.logger] - Logger override
 * @returns {Promise<Object|null>} Scoring result or null on failure
 */
export async function computeCapabilityScore(stageNumber, artifact, deps = {}) {
  const {
    ventureId,
    artifactId = null,
    supabase,
    llmClient,
    logger = console,
  } = deps;

  if (!artifact || typeof artifact !== 'object') {
    logger.warn('   CCS: No artifact to score');
    return null;
  }

  const stageWeights = STAGE_DIMENSION_WEIGHTS[stageNumber];
  if (!stageWeights) {
    logger.warn(`   CCS: No weight config for stage ${stageNumber}`);
    return null;
  }

  const client = llmClient || getValidationClient();

  // Build scoring prompt
  const artifactSummary = JSON.stringify(artifact).substring(0, 3000);
  const dimensionInstructions = DIMENSIONS.map(dim => {
    const weight = stageWeights[dim];
    return `- **${dim}** (weight: ${weight}): ${DIMENSION_RUBRICS[dim]}`;
  }).join('\n');

  const prompt = `You are an EHG venture capability evaluator. Score this Stage ${stageNumber} artifact across 5 capability dimensions.

STAGE ARTIFACT (truncated):
${artifactSummary}

SCORING DIMENSIONS (each 0-100):
${dimensionInstructions}

INSTRUCTIONS:
- Score each dimension 0-100 based on the artifact content
- Provide a brief rationale for each score (max 200 characters)
- Be calibrated: 50 = adequate, 70 = good, 90+ = exceptional
- If the artifact has minimal content for a dimension, score lower but don't score 0 unless truly absent

Respond with ONLY valid JSON in this exact format:
{
  "scores": {
    "technical_depth": { "score": <0-100>, "rationale": "<max 200 chars>" },
    "market_validation": { "score": <0-100>, "rationale": "<max 200 chars>" },
    "financial_rigor": { "score": <0-100>, "rationale": "<max 200 chars>" },
    "operational_readiness": { "score": <0-100>, "rationale": "<max 200 chars>" },
    "strategic_alignment": { "score": <0-100>, "rationale": "<max 200 chars>" }
  }
}`;

  // Execute with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCORING_TIMEOUT_MS);

  try {
    const response = await client.complete(prompt, {
      maxTokens: 1024,
      temperature: 0.2,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const parsed = parseJSON(response);
    const usage = extractUsage(response);

    if (!parsed?.scores) {
      logger.warn('   CCS: LLM response missing scores object');
      return null;
    }

    // Validate and normalize scores
    const scores = {};
    for (const dim of DIMENSIONS) {
      const entry = parsed.scores[dim];
      if (!entry || typeof entry.score !== 'number') {
        logger.warn(`   CCS: Missing or invalid score for ${dim}`);
        scores[dim] = { score: null, rationale: null };
        continue;
      }
      scores[dim] = {
        score: Math.max(0, Math.min(100, Math.round(entry.score * 100) / 100)),
        rationale: String(entry.rationale || '').substring(0, 200),
      };
    }

    // Persist to database if supabase is available
    if (supabase && ventureId) {
      await persistScores(supabase, ventureId, stageNumber, scores, artifactId, logger);
    }

    logger.log(`   CCS: Stage ${stageNumber} scored — ${DIMENSIONS.map(d => `${d.substring(0, 2).toUpperCase()}:${scores[d]?.score ?? '?'}`).join(' ')}`);

    return {
      stageNumber,
      ventureId,
      scores,
      usage,
      scoredAt: new Date().toISOString(),
    };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      logger.warn(`   CCS: Scoring timed out after ${SCORING_TIMEOUT_MS}ms for stage ${stageNumber}`);
    } else {
      logger.warn(`   CCS: Scoring failed for stage ${stageNumber}: ${err.message}`);
    }
    return null;
  }
}

/**
 * Persist dimension scores to venture_capability_scores via UPSERT.
 * Idempotent — re-scoring replaces previous scores.
 */
async function persistScores(supabase, ventureId, stageNumber, scores, artifactId, logger) {
  const rows = DIMENSIONS
    .filter(dim => scores[dim]?.score !== null && scores[dim]?.score !== undefined)
    .map(dim => ({
      venture_id: ventureId,
      stage_number: stageNumber,
      dimension: dim,
      score: scores[dim].score,
      rationale: scores[dim].rationale,
      artifact_id: artifactId,
      scored_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  // Phantom table 'venture_capability_scores' removed — UPSERT was always silent no-op
  logger.warn(`   CCS: Skipping persist (phantom table removed), ${rows.length} scores computed in-memory only`);
}
