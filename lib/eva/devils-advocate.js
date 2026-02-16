/**
 * Devil's Advocate - Model-Isolated Adversarial Review
 *
 * SD-LEO-FEAT-DEVILS-ADVOCATE-001
 * Uses GPT-4o via LLM client factory OpenAI adapter to provide
 * adversarial counter-arguments at kill/promotion gates.
 *
 * Chairman Decision D04: Model isolation ensures a different AI
 * perspective challenges Eva's analysis to prevent confirmation bias.
 *
 * Integration points:
 *   - Kill gates: stages 3, 5, 13, 23
 *   - Promotion gates: stages 16, 17, 22
 *
 * @module lib/eva/devils-advocate
 */

import { OpenAIAdapter } from '../sub-agents/vetting/provider-adapters.js';
import { createLogger } from '../logger.js';

const log = createLogger('DevilsAdvocate');

// Gates where Devil's Advocate is invoked
const KILL_GATES = [3, 5, 13, 23];
const PROMOTION_GATES = [16, 17, 22];
const ALL_GATES = [...KILL_GATES, ...PROMOTION_GATES];

// Max content length sent to GPT-4o (prevents token waste)
const MAX_ANALYSIS_CHARS = 8000;

/**
 * Check if a stage has a Devil's Advocate gate.
 * @param {number} stageId
 * @returns {{ isGate: boolean, gateType: 'kill'|'promotion'|null }}
 */
export function isDevilsAdvocateGate(stageId) {
  if (KILL_GATES.includes(stageId)) return { isGate: true, gateType: 'kill' };
  if (PROMOTION_GATES.includes(stageId)) return { isGate: true, gateType: 'promotion' };
  return { isGate: false, gateType: null };
}

/**
 * Get adversarial review from Devil's Advocate (GPT-4o).
 *
 * @param {Object} params
 * @param {number} params.stageId - Current stage number
 * @param {string} params.gateType - 'kill' or 'promotion'
 * @param {Object} params.gateResult - Result from the gate evaluation
 * @param {Object} params.ventureContext - Venture metadata
 * @param {Object} [params.stageOutput] - Merged artifact outputs from stage
 * @param {Object} [deps]
 * @param {Object} [deps.adapter] - OpenAI adapter override (for testing)
 * @param {Object} [deps.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} Devil's Advocate review result
 */
export async function getDevilsAdvocateReview(params, deps = {}) {
  const { stageId, gateType, gateResult, ventureContext, stageOutput } = params;
  const { logger = console } = deps;
  const startedAt = new Date().toISOString();

  // Build adapter (allow injection for testing)
  let adapter = deps.adapter;
  if (!adapter) {
    try {
      adapter = new OpenAIAdapter();
      if (!adapter.apiKey) {
        logger.warn('[DevilsAdvocate] OPENAI_API_KEY not set - returning fallback');
        return buildFallbackResult({ stageId, gateType, startedAt, reason: 'OPENAI_API_KEY not configured' });
      }
    } catch (err) {
      logger.warn(`[DevilsAdvocate] Adapter init failed: ${err.message}`);
      return buildFallbackResult({ stageId, gateType, startedAt, reason: err.message });
    }
  }

  // Build prompt
  const systemPrompt = buildSystemPrompt(gateType);
  const userPrompt = buildUserPrompt({ stageId, gateType, gateResult, ventureContext, stageOutput });

  try {
    const response = await adapter.complete(systemPrompt, userPrompt, {
      maxTokens: 1500,
      model: 'gpt-4o',
    });

    // Parse structured response
    const review = parseReviewResponse(response.content);

    logger.log(`[DevilsAdvocate] Stage ${stageId} (${gateType}): ${review.overallAssessment} [${response.durationMs}ms]`);

    return {
      stageId,
      gateType,
      gateId: `${gateType}_gate_${stageId}`,
      generatedAt: startedAt,
      completedAt: new Date().toISOString(),
      proceeded: true,
      model: response.model,
      durationMs: response.durationMs,
      usage: response.usage,
      ...review,
    };
  } catch (err) {
    logger.error(`[DevilsAdvocate] GPT-4o call failed for stage ${stageId}: ${err.message}`);
    return buildFallbackResult({ stageId, gateType, startedAt, reason: err.message });
  }
}

/**
 * Build a venture_artifacts record from a Devil's Advocate review.
 *
 * @param {string} ventureId - Venture UUID
 * @param {Object} review - Devil's Advocate review result
 * @returns {Object} Row ready for venture_artifacts insert
 */
export function buildArtifactRecord(ventureId, review) {
  return {
    venture_id: ventureId,
    lifecycle_stage: review.stageId,
    artifact_type: 'devils_advocate_review',
    title: `Devil's Advocate - Stage ${review.stageId} ${review.gateType} gate`,
    content: JSON.stringify({
      gateId: review.gateId,
      gateType: review.gateType,
      generatedAt: review.generatedAt,
      proceeded: review.proceeded,
      overallAssessment: review.overallAssessment,
      counterArguments: review.counterArguments,
      risks: review.risks,
      alternatives: review.alternatives,
      model: review.model,
      isFallback: review.isFallback || false,
    }),
    metadata: {
      model: review.model || 'fallback',
      durationMs: review.durationMs,
      usage: review.usage,
      isFallback: review.isFallback || false,
    },
    quality_score: review.isFallback ? 0 : estimateQualityScore(review),
    validation_status: review.isFallback ? 'pending' : 'validated',
    validated_by: 'devils_advocate',
    is_current: true,
    source: 'devils-advocate',
  };
}

// ── Internal Helpers ────────────────────────────────────────────

function buildSystemPrompt(gateType) {
  const role = gateType === 'kill'
    ? 'You are a rigorous venture evaluator acting as Devil\'s Advocate at a kill gate. Your job is to find reasons why this venture should be KILLED - look for fatal flaws, unrealistic assumptions, and market risks that the primary analysis may have overlooked.'
    : 'You are a critical venture reviewer acting as Devil\'s Advocate at a promotion gate. Your job is to challenge whether this venture truly deserves to advance - look for weaknesses in the evidence, gaps in preparation, and risks that could derail progress.';

  return `${role}

You MUST respond in valid JSON with this exact structure:
{
  "overallAssessment": "challenge" | "concern" | "support",
  "counterArguments": ["string - specific counter-argument 1", "string - counter-argument 2"],
  "risks": [{"risk": "description", "severity": "high"|"medium"|"low", "likelihood": "likely"|"possible"|"unlikely"}],
  "alternatives": ["string - alternative approach 1"],
  "summary": "One-paragraph summary of your adversarial position"
}

Rules:
- Always find at least 2 counter-arguments (even if the venture looks strong)
- Be specific, not generic. Reference actual data from the analysis.
- "support" means you tried to find flaws but the evidence is genuinely strong
- "challenge" means you found serious issues that warrant reconsideration
- "concern" means there are noteworthy risks but they may be manageable`;
}

function buildUserPrompt({ stageId, gateType, gateResult, ventureContext, stageOutput }) {
  const gateDecision = gateType === 'kill'
    ? `Gate decision: ${gateResult?.decision || 'unknown'}, Block progression: ${gateResult?.blockProgression ?? 'unknown'}`
    : `Gate decision: ${gateResult?.pass ? 'pass' : 'fail'}, Blockers: ${gateResult?.blockers?.length || 0}`;

  const analysisText = JSON.stringify(stageOutput || {}).substring(0, MAX_ANALYSIS_CHARS);

  return `VENTURE: ${ventureContext?.name || 'Unknown'} (Stage ${stageId})
GATE TYPE: ${gateType} gate
${gateDecision}
${gateResult?.reasons?.length ? `Reasons: ${JSON.stringify(gateResult.reasons)}` : ''}
${gateResult?.rationale ? `Rationale: ${gateResult.rationale}` : ''}
${gateResult?.blockers?.length ? `Blockers: ${JSON.stringify(gateResult.blockers)}` : ''}

STAGE ANALYSIS DATA:
${analysisText}

Provide your Devil's Advocate review as JSON.`;
}

function parseReviewResponse(content) {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      overallAssessment: parsed.overallAssessment || 'concern',
      counterArguments: Array.isArray(parsed.counterArguments) ? parsed.counterArguments : [],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [],
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      summary: parsed.summary || '',
    };
  } catch (err) {
    // If JSON parsing fails, treat the raw text as a single counter-argument
    log.warn('JSON parse failed for review response', { error: err.message });
    return {
      overallAssessment: 'concern',
      counterArguments: [content.substring(0, 500)],
      risks: [],
      alternatives: [],
      summary: `Raw response (JSON parse failed): ${content.substring(0, 200)}`,
    };
  }
}

function buildFallbackResult({ stageId, gateType, startedAt, reason }) {
  return {
    stageId,
    gateType,
    gateId: `${gateType}_gate_${stageId}`,
    generatedAt: startedAt,
    completedAt: new Date().toISOString(),
    proceeded: true,
    isFallback: true,
    fallbackReason: reason,
    model: null,
    durationMs: 0,
    usage: null,
    overallAssessment: 'unavailable',
    counterArguments: [],
    risks: [],
    alternatives: [],
    summary: `Devil's Advocate unavailable: ${reason}. Gate proceeded without adversarial review.`,
  };
}

function estimateQualityScore(review) {
  let score = 50; // Base score
  if (review.counterArguments?.length >= 2) score += 20;
  if (review.risks?.length >= 1) score += 15;
  if (review.alternatives?.length >= 1) score += 10;
  if (review.summary?.length >= 50) score += 5;
  return Math.min(score, 100);
}

// ── Exports for testing ─────────────────────────────────────────

export const _internal = {
  buildSystemPrompt,
  buildUserPrompt,
  parseReviewResponse,
  buildFallbackResult,
  estimateQualityScore,
  ALL_GATES,
  KILL_GATES,
  PROMOTION_GATES,
  MAX_ANALYSIS_CHARS,
};
