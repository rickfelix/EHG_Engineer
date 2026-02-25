/**
 * Stage 03 Analysis Step - Hybrid Scoring (50% Deterministic + 50% AI)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Combines deterministic scores from Stage 2 persona pre-scores (50%)
 * with an independent AI assessment (50%) to produce the 7 kill-gate
 * metrics. Kill gate fires when overallScore < 40 OR any metric < 40.
 *
 * The SD specifies threshold above 40 (not 70 as in the original template).
 * This analysis step uses the updated threshold.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring
 */

import { getLLMClient } from '../../../llm/index.js';
import { METRICS } from '../stage-03.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const KILL_THRESHOLD = 40;

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

Rules:
- Score independently - do NOT just copy the persona pre-scores
- Be calibrated: 50 = average, not "passing"
- Provide specific reasoning for each score
- Ground scores in the venture data provided`;

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
  const deterministicScores = extractDeterministicScores(stage2Data.critiques);

  // Get independent AI scores
  const { scores: aiScores, fourBuckets, usage } = await getAIScores({ stage1Data, stage2Data, ventureName });

  // Blend 50/50
  const blended = {};
  for (const metric of METRICS) {
    const det = deterministicScores[metric] ?? 50;
    const ai = aiScores[metric] ?? 50;
    blended[metric] = Math.round((det + ai) / 2);
  }

  // Compute overall and kill gate
  const scores = METRICS.map(m => blended[m]);
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / METRICS.length);

  const reasons = [];
  if (overallScore < KILL_THRESHOLD) {
    reasons.push({
      type: 'overall_below_threshold',
      message: `Overall score ${overallScore} is below kill threshold ${KILL_THRESHOLD}`,
      threshold: KILL_THRESHOLD,
      actual: overallScore,
    });
  }
  for (const metric of METRICS) {
    if (blended[metric] < KILL_THRESHOLD) {
      reasons.push({
        type: 'metric_below_threshold',
        metric,
        message: `${metric} score ${blended[metric]} is below threshold ${KILL_THRESHOLD}`,
        threshold: KILL_THRESHOLD,
        actual: blended[metric],
      });
    }
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';

  logger.log('[Stage03] Analysis complete', { duration: Date.now() - startTime });
  return {
    ...blended,
    overallScore,
    decision,
    blockProgression: decision === 'kill',
    reasons,
    hybridBreakdown: {
      deterministic: deterministicScores,
      ai: aiScores,
      weights: { deterministic: 0.5, ai: 0.5 },
    },
    fourBuckets,
    usage,
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

function extractDeterministicScores(critiques) {
  const scores = {};
  for (const critique of critiques) {
    const metric = PERSONA_TO_METRIC[critique.model];
    if (metric) {
      scores[metric] = clampScore(critique.score);
    }
  }
  // Fill defaults for any missing
  for (const metric of METRICS) {
    if (scores[metric] === undefined) scores[metric] = 50;
  }
  return scores;
}

async function getAIScores({ stage1Data, stage2Data, ventureName }) {
  const client = getLLMClient({ purpose: 'content-generation' });

  const userPrompt = `Independently score this venture across 7 dimensions.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data?.description || 'N/A'}
Value Proposition: ${stage1Data?.valueProp || 'N/A'}
Target Market: ${stage1Data?.targetMarket || 'N/A'}
Problem: ${stage1Data?.problemStatement || 'N/A'}

Prior persona composite: ${stage2Data?.compositeScore ?? 'N/A'}/100

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed);

  const scores = {};
  for (const metric of METRICS) {
    scores[metric] = clampScore(parsed[metric]);
  }
  return { scores, fourBuckets, usage };
}

function clampScore(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}


export { KILL_THRESHOLD, PERSONA_TO_METRIC };
