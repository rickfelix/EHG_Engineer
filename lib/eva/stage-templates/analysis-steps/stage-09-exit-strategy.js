/**
 * Stage 09 Analysis Step - Exit Strategy with Reality Gate
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Generates exit strategy with type enum, buyer type, lightweight
 * valuation (revenue multiples), and Reality Gate evaluation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-09-exit-strategy
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { evaluateRealityGate } from '../stage-09.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const EXIT_TYPES = ['acquisition', 'ipo', 'merger', 'mbo', 'liquidation'];

const SYSTEM_PROMPT = `You are EVA's Exit Strategy Engine. Generate an exit strategy with valuation estimates.

You MUST output valid JSON with exactly this structure:
{
  "exit_thesis": "Why this venture is acquirable/IPO-able (min 20 chars)",
  "exit_horizon_months": number (1-120),
  "exit_paths": [
    {
      "type": "acquisition|ipo|merger|mbo|liquidation",
      "description": "Detailed path description",
      "probability_pct": number (0-100)
    }
  ],
  "target_acquirers": [
    {
      "name": "Company name",
      "rationale": "Why they would acquire",
      "fit_score": 1-5
    }
  ],
  "valuationEstimate": {
    "method": "revenue_multiple",
    "revenueBase": number (annual revenue),
    "multipleLow": number,
    "multipleBase": number,
    "multipleHigh": number
  },
  "milestones": [
    {
      "date": "YYYY-MM-DD or relative (e.g., Month 6)",
      "success_criteria": "What must be true"
    }
  ]
}

Rules:
- At least 1 exit path, preferably 2-3
- probability_pct across all paths should roughly sum to 100
- At least 3 target acquirers with rationale
- multipleLow < multipleBase < multipleHigh
- Use Stage 5 revenue projections for revenueBase
- Milestones should be concrete and time-bound
- exit_thesis must be specific to this venture, not generic`;

/**
 * Generate exit strategy with valuation and Reality Gate.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage6Data] - Stage 6 risk matrix
 * @param {Object} [params.stage7Data] - Stage 7 pricing strategy
 * @param {Object} [params.stage8Data] - Stage 8 BMC
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Exit strategy with valuation and reality gate
 */
export async function analyzeStage09({ stage1Data, stage5Data, stage6Data, stage7Data, stage8Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage09] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 09 exit strategy requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const revenueBase = stage5Data?.year3?.revenue || stage5Data?.year1?.revenue || 0;

  const financialContext = stage5Data
    ? `Financial Profile:
  Year 1 Revenue: $${stage5Data.year1?.revenue || 0}
  Year 3 Revenue: $${stage5Data.year3?.revenue || 0}
  ROI (3yr): ${stage5Data.roi3y ? (stage5Data.roi3y * 100).toFixed(1) + '%' : 'N/A'}
  LTV:CAC Ratio: ${stage5Data.unitEconomics?.ltvCacRatio || 'N/A'}`
    : 'No financial data';

  const pricingContext = stage7Data
    ? `Pricing: ${stage7Data.pricing_model}, ARPA $${stage7Data.arpa || 'N/A'}`
    : '';

  const riskContext = stage6Data
    ? `Risk Profile: ${stage6Data.totalRisks || 0} risks, ${stage6Data.highRiskCount || 0} high-risk`
    : '';

  const bmcContext = stage8Data
    ? `BMC: ${Object.keys(stage8Data).filter(k => stage8Data[k]?.items?.length > 0).length}/9 blocks populated`
    : '';

  const userPrompt = `Generate an exit strategy for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Archetype: ${sanitizeForPrompt(stage1Data.archetype || 'N/A')}

${financialContext}
${pricingContext}
${riskContext}
${bmcContext}

Revenue base for valuation: $${revenueBase}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Track LLM fallback fields
  let llmFallbackCount = 0;

  // Normalize exit paths
  if (!Array.isArray(parsed.exit_paths) || parsed.exit_paths.length === 0) llmFallbackCount++;
  const exit_paths = Array.isArray(parsed.exit_paths) ? parsed.exit_paths.map(p => ({
    type: EXIT_TYPES.includes(p.type) ? p.type : 'acquisition',
    description: String(p.description || ''),
    probability_pct: clamp(p.probability_pct, 0, 100, logger, 'exit_path.probability_pct'),
  })) : [{ type: 'acquisition', description: 'Default acquisition path', probability_pct: 70 }];

  // Normalize target acquirers
  if (!Array.isArray(parsed.target_acquirers) || parsed.target_acquirers.length === 0) llmFallbackCount++;
  const target_acquirers = Array.isArray(parsed.target_acquirers) ? parsed.target_acquirers.map(a => ({
    name: String(a.name || 'Unknown'),
    rationale: String(a.rationale || ''),
    fit_score: clamp(a.fit_score, 1, 5, logger, 'target_acquirer.fit_score'),
  })) : [];

  // Normalize valuation
  const val = parsed.valuationEstimate || {};
  const multipleLow = Math.max(1, Number(val.multipleLow) || 3);
  const multipleBase = Math.max(multipleLow + 0.5, Number(val.multipleBase) || 5);
  const multipleHigh = Math.max(multipleBase + 0.5, Number(val.multipleHigh) || 8);

  const valuationEstimate = {
    method: 'revenue_multiple',
    revenueBase: Math.max(0, Number(val.revenueBase) || revenueBase),
    multipleLow,
    multipleBase,
    multipleHigh,
    estimatedRange: {
      low: (Number(val.revenueBase) || revenueBase) * multipleLow,
      base: (Number(val.revenueBase) || revenueBase) * multipleBase,
      high: (Number(val.revenueBase) || revenueBase) * multipleHigh,
    },
  };

  // Normalize milestones
  if (!Array.isArray(parsed.milestones) || parsed.milestones.length === 0) llmFallbackCount++;
  if (!parsed.exit_thesis) llmFallbackCount++;
  if (!parsed.valuationEstimate) llmFallbackCount++;
  const milestones = Array.isArray(parsed.milestones) ? parsed.milestones.map(m => ({
    date: String(m.date || 'TBD'),
    success_criteria: String(m.success_criteria || ''),
  })) : [{ date: 'Month 12', success_criteria: 'Achieve product-market fit' }];

  if (llmFallbackCount > 0) {
    logger.warn('[Stage09] LLM fallback fields detected', { llmFallbackCount });
  }

  // Evaluate Reality Gate (Phase 2→3 gate) using upstream data
  const reality_gate = evaluateRealityGate({ stage06: stage6Data, stage07: stage7Data, stage08: stage8Data });

  // NOTE: This is the LOCAL Phase 2→3 data-completeness gate (computed from
  // stages 6/7/8 input quality), NOT the worker's Stage 9→10 transition
  // Reality Gate from lib/eva/reality-gates.js. The two are independent —
  // both can fire on the same venture with different verdicts. The Phase2/Phase3
  // disambiguation already exists in lib/eva/stage-templates/index.js.
  logger.log('[Stage09] Analysis complete', { duration: Date.now() - startTime, phase2GatePass: reality_gate.pass });
  return {
    exit_thesis: String(parsed.exit_thesis || ''),
    exit_horizon_months: clamp(parsed.exit_horizon_months, 1, 120, logger, 'exit_horizon_months'),
    exit_paths,
    target_acquirers,
    valuationEstimate,
    milestones,
    reality_gate,
    fourBuckets, usage, llmFallbackCount,
  };
}

function clamp(val, min, max, logger, fieldName) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN coerced to ${min}`, { original: val });
    return min;
  }
  const clamped = Math.max(min, Math.min(max, Math.round(n)));
  if (clamped !== Math.round(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: ${n} clamped to [${min},${max}] → ${clamped}`, { original: val });
  }
  return clamped;
}


export { EXIT_TYPES };
