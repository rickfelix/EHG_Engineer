/**
 * Stage 07 Analysis Step - Pricing Strategy
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Consumes Stages 4-6 (competitive, financial, risk) and generates
 * a pricing strategy with pricingModel enum, competitive anchoring,
 * and unit economics seeding.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';

const PRICING_MODELS = [
  'freemium', 'subscription', 'usage_based', 'per_seat', 'marketplace_commission', 'one_time',
];

const POSITIONING_VALUES = ['premium', 'parity', 'discount'];

const SYSTEM_PROMPT = `You are EVA's Revenue Architecture Engine. Generate a pricing strategy for a venture.

You MUST output valid JSON with exactly this structure:
{
  "pricingModel": "freemium|subscription|usage_based|per_seat|marketplace_commission|one_time",
  "primaryValueMetric": "What the customer pays for (e.g., per user per month)",
  "priceAnchor": {
    "competitorAvg": number,
    "proposedPrice": number,
    "positioning": "premium|parity|discount"
  },
  "tiers": [
    {
      "name": "Tier name",
      "price": number (>= 0),
      "billing_period": "monthly|quarterly|annual",
      "target_segment": "Who this tier targets",
      "included_units": "What's included"
    }
  ],
  "unitEconomics": {
    "gross_margin_pct": number (0-100),
    "churn_rate_monthly": number (0-100),
    "cac": number (>= 0),
    "arpa": number (>= 0)
  },
  "rationale": "Why this pricing model and positioning"
}

Rules:
- Generate at least 2 pricing tiers
- pricingModel MUST be one of the 6 enum values
- positioning MUST be premium, parity, or discount
- Use competitive pricing data to set price anchors
- Use Stage 5 unit economics to seed unitEconomics
- If no competitive data, estimate based on market segment
- Be specific about what's included in each tier`;

/**
 * Generate a pricing strategy from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage4Data] - Stage 4 competitive landscape
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage6Data] - Stage 6 risk matrix
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Pricing strategy with tiers and unit economics
 */
export async function analyzeStage07({ stage1Data, stage4Data, stage5Data, stage6Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage07] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 07 pricing strategy requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const competitiveContext = stage4Data?.stage5Handoff
    ? `Competitive Pricing:
  Average market price: $${stage4Data.stage5Handoff.avgMarketPrice || 'N/A'}
  Price range: $${stage4Data.stage5Handoff.priceRange?.low || '?'}-$${stage4Data.stage5Handoff.priceRange?.high || '?'}/mo
  Pricing models: ${stage4Data.stage5Handoff.pricingModels?.join(', ') || 'N/A'}
  Competitive density: ${stage4Data.stage5Handoff.competitiveDensity || 'N/A'}`
    : 'No competitive pricing data available';

  const financialContext = stage5Data
    ? `Stage 5 Unit Economics:
  CAC: $${stage5Data.unitEconomics?.cac || 'N/A'}
  LTV: $${stage5Data.unitEconomics?.ltv || 'N/A'}
  Monthly Churn: ${stage5Data.unitEconomics?.monthlyChurn ? (stage5Data.unitEconomics.monthlyChurn * 100).toFixed(1) + '%' : 'N/A'}
  Gross Margin: ${stage5Data.grossProfitY1 && stage5Data.year1?.revenue ? ((stage5Data.grossProfitY1 / stage5Data.year1.revenue) * 100).toFixed(1) + '%' : 'N/A'}`
    : 'No financial model available';

  const riskContext = stage6Data?.highRiskCount
    ? `Risk Profile: ${stage6Data.totalRisks} risks, ${stage6Data.highRiskCount} high-risk (score >= 15)`
    : '';

  // Web-grounded search for pricing intelligence
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${stage1Data.targetMarket || ventureName} SaaS pricing models benchmarks 2024 2025`,
      `${stage1Data.description?.substring(0, 80)} pricing strategy competitive pricing`,
    ];
    logger.log('[Stage07] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'Pricing Intelligence Research');
  }

  const userPrompt = `Generate a pricing strategy for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Archetype: ${stage1Data.archetype || 'N/A'}

${competitiveContext}

${financialContext}

${riskContext}
${webContext}
Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize pricingModel
  const pricingModel = PRICING_MODELS.includes(parsed.pricingModel)
    ? parsed.pricingModel
    : 'subscription';

  // Normalize positioning
  const positioning = POSITIONING_VALUES.includes(parsed.priceAnchor?.positioning)
    ? parsed.priceAnchor.positioning
    : 'parity';

  // Normalize tiers
  const tiers = Array.isArray(parsed.tiers) ? parsed.tiers.map(t => ({
    name: String(t.name || 'Standard'),
    price: Math.max(0, Number(t.price) || 0),
    billing_period: ['monthly', 'quarterly', 'annual'].includes(t.billing_period) ? t.billing_period : 'monthly',
    target_segment: String(t.target_segment || 'General'),
    included_units: String(t.included_units || 'Standard features'),
  })) : [];

  // Seed unit economics from Stage 5 if available
  const s5GrossMargin = (stage5Data?.grossProfitY1 && stage5Data?.year1?.revenue)
    ? (stage5Data.grossProfitY1 / stage5Data.year1.revenue) * 100
    : 70;
  const s5Churn = stage5Data?.unitEconomics?.monthlyChurn
    ? stage5Data.unitEconomics.monthlyChurn * 100
    : 5;
  const unitEconomics = {
    gross_margin_pct: clamp(parsed.unitEconomics?.gross_margin_pct ?? s5GrossMargin, 0, 100),
    churn_rate_monthly: clamp(parsed.unitEconomics?.churn_rate_monthly ?? s5Churn, 0, 100),
    cac: Math.max(0, Number(parsed.unitEconomics?.cac ?? stage5Data?.unitEconomics?.cac ?? 100)),
    arpa: Math.max(0, Number(parsed.unitEconomics?.arpa ?? (tiers[0]?.price || 49))),
  };

  logger.log('[Stage07] Analysis complete', { duration: Date.now() - startTime });
  return {
    pricingModel,
    primaryValueMetric: String(parsed.primaryValueMetric || 'per user per month'),
    priceAnchor: {
      competitorAvg: Math.max(0, Number(parsed.priceAnchor?.competitorAvg) || 0),
      proposedPrice: Math.max(0, Number(parsed.priceAnchor?.proposedPrice) || tiers[0]?.price || 0),
      positioning,
    },
    tiers,
    unitEconomics,
    rationale: String(parsed.rationale || ''),
    fourBuckets,
  };
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}


export { PRICING_MODELS, POSITIONING_VALUES };
