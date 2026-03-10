/**
 * Stage 03 Analysis Step - Hybrid Scoring (50% Deterministic + 50% AI)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Combines deterministic scores from Stage 2 persona pre-scores (50%)
 * with an independent AI assessment (50%) to produce the 7 kill-gate
 * metrics. Uses the canonical 3-way gate from stage-03.js template:
 *   PASS:   overallScore ≥ 70 AND all metrics ≥ 50
 *   REVISE: overallScore ≥ 50 AND < 70 AND no metric < 50
 *   KILL:   overallScore < 50 OR any metric < 50
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring
 */

import { getLLMClient } from '../../../llm/index.js';
import { METRICS, evaluateKillGate } from '../stage-03.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const SYSTEM_PROMPT = `You are EVA's independent validation engine for venture scoring. You will assess a venture across 7 dimensions, independent of prior persona scores.

You MUST output valid JSON with exactly these fields:
- marketFit (integer 0-100)
- customerNeed (integer 0-100)
- momentum (integer 0-100)
- revenuePotential (integer 0-100)
- competitiveBarrier (integer 0-100)
- executionFeasibility (integer 0-100)
- designQuality (integer 0-100)
- reasoning (object with one string per metric explaining your score)
- risk_factors (array of strings: 3-5 specific risks that could prevent this venture from succeeding)
- go_conditions (array of strings: 3-5 conditions that must be true for this venture to proceed)
- market_fit_assessment (string: 2-3 sentence narrative assessing the venture's market fit)
- rationale (string: 2-3 sentence narrative explaining your overall gate recommendation)

Rules:
- Score independently - do NOT just copy the persona pre-scores
- Be calibrated: 50 = average, not "passing"
- Provide specific reasoning for each score
- Ground scores in the venture data provided
- risk_factors should identify concrete threats, not generic platitudes
- go_conditions should be actionable and verifiable`;

/**
 * Run hybrid scoring: 50% deterministic (Stage 2 persona scores) + 50% AI.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 output
 * @param {Object} params.stage2Data - Stage 2 output (critiques with scores)
 * @param {string} [params.ventureName] - Venture name
 * @returns {Promise<{marketFit: number, customerNeed: number, momentum: number, revenuePotential: number, competitiveBarrier: number, executionFeasibility: number, overallScore: number, decision: string, blockProgression: boolean, reasons: Array, hybridBreakdown: Object}>}
 */
export async function analyzeStage03({ stage1Data, stage2Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage03] Starting analysis', { ventureName });
  if (!stage2Data?.critiques || !Array.isArray(stage2Data.critiques)) {
    throw new Error('Stage 03 requires Stage 2 data with critiques array');
  }

  // Extract deterministic scores from Stage 2 personas
  const deterministicScores = extractDeterministicScores(stage2Data.critiques, logger);

  // Get independent AI scores + narrative fields
  const { scores: aiScores, fourBuckets, usage, llmFallbackCount, narrativeFields } = await getAIScores({ stage1Data, stage2Data, ventureName, logger });

  // Blend 50/50
  const blended = {};
  for (const metric of METRICS) {
    const det = deterministicScores[metric] ?? 50;
    const ai = aiScores[metric] ?? 50;
    blended[metric] = Math.round((det + ai) / 2);
  }

  // Compute overall score and apply canonical 3-way kill gate
  const scores = METRICS.map(m => blended[m]);
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / METRICS.length);
  const metricsMap = Object.fromEntries(METRICS.map(m => [m, blended[m]]));
  const { decision, blockProgression: gateBlock, reasons } = evaluateKillGate({ overallScore, metrics: metricsMap });

  logger.log('[Stage03] Analysis complete', { duration: Date.now() - startTime });
  return {
    ...blended,
    overallScore,
    decision,
    blockProgression: gateBlock,
    reasons,
    risk_factors: narrativeFields.risk_factors,
    go_conditions: narrativeFields.go_conditions,
    market_fit_assessment: narrativeFields.market_fit_assessment,
    rationale: narrativeFields.rationale,
    hybridBreakdown: {
      deterministic: deterministicScores,
      ai: aiScores,
      weights: { deterministic: 0.5, ai: 0.5 },
    },
    fourBuckets,
    usage,
    llmFallbackCount,
  };
}

/**
 * Map Stage 2 persona critiques to Stage 3 metric names.
 * Persona IDs align 1:1 with metrics via the PERSONAS mapping.
 */
const PERSONA_TO_METRIC = {
  'market-strategist': 'marketFit',
  'customer-advocate': 'customerNeed',
  'growth-hacker': 'momentum',
  'revenue-analyst': 'revenuePotential',
  'moat-architect': 'competitiveBarrier',
  'ops-realist': 'executionFeasibility',
  'product-designer': 'designQuality',
};

function extractDeterministicScores(critiques, logger) {
  const scores = {};
  for (const critique of critiques) {
    const metric = PERSONA_TO_METRIC[critique.model];
    if (metric) {
      scores[metric] = clampScore(critique.score, logger, `deterministic.${metric}`);
    }
  }
  // Fill defaults for any missing
  for (const metric of METRICS) {
    if (scores[metric] === undefined) scores[metric] = 50;
  }
  return scores;
}

async function getAIScores({ stage1Data, stage2Data, ventureName, logger = console }) {
  const client = getLLMClient({ purpose: 'content-generation' });

  const userPrompt = `Independently score this venture across 7 dimensions.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data?.description || 'N/A')}
Value Proposition: ${sanitizeForPrompt(stage1Data?.valueProp || 'N/A')}
Target Market: ${sanitizeForPrompt(stage1Data?.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data?.problemStatement || 'N/A')}

Prior persona composite: ${stage2Data?.compositeScore ?? 'N/A'}/100

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // LLM fallback detection: warn when expected fields are missing/non-numeric
  let llmFallbackCount = 0;
  const scores = {};
  for (const metric of METRICS) {
    const raw = parsed[metric];
    if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) {
      llmFallbackCount++;
    }
    scores[metric] = clampScore(raw, logger, `ai.${metric}`);
  }
  if (llmFallbackCount > 0) {
    logger.warn('[Stage03] AI score LLM fallback', { llmFallbackCount, total: METRICS.length });
  }

  // Extract narrative fields with safe fallbacks
  const narrativeFields = {
    risk_factors: Array.isArray(parsed.risk_factors) ? parsed.risk_factors : [],
    go_conditions: Array.isArray(parsed.go_conditions) ? parsed.go_conditions : [],
    market_fit_assessment: typeof parsed.market_fit_assessment === 'string' ? parsed.market_fit_assessment : '',
    rationale: typeof parsed.rationale === 'string' ? parsed.rationale : '',
  };

  return { scores, fourBuckets, usage, llmFallbackCount, narrativeFields };
}

function clampScore(score, logger, fieldName) {
  const n = Number(score);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN score coerced to 50`, { original: score });
    return 50;
  }
  const clamped = Math.max(0, Math.min(100, Math.round(n)));
  if (clamped !== Math.round(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: score ${n} clamped to [0,100] → ${clamped}`, { original: score });
  }
  return clamped;
}


export { PERSONA_TO_METRIC };
