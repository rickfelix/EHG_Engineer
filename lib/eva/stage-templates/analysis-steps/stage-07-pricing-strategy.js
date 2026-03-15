/**
 * Stage 07 Analysis Step - Pricing Strategy
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Consumes Stages 4-6 (competitive, financial, risk) and generates
 * a pricing strategy with pricing_model enum, competitive anchoring,
 * and unit economics seeding.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';
import { PRICING_MODELS } from '../stage-07.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const POSITIONING_VALUES = ['premium', 'parity', 'discount'];

const SYSTEM_PROMPT = `You are EVA's Revenue Architecture Engine. Generate a pricing strategy for a venture.

You MUST output valid JSON with exactly this structure:
{
  "pricing_model": "subscription|usage_based|tiered|freemium|enterprise|marketplace",
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
- pricing_model MUST be one of the 6 enum values
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
export async function analyzeStage07({ stage1Data, stage4Data, stage5Data, stage6Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage07] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 07 pricing strategy requires Stage 1 data with description');
  }

  // Read Stage 5 financial model from structured storage (fallback to stage5Data)
  let financialModelRecord = null;
  let financialModelId = null;
  if (supabase && ventureId) {
    try {
      const { data: fmData } = await supabase
        .from('financial_models')
        .select('id, model_data, template_type')
        .eq('venture_id', ventureId)
        .limit(1)
        .maybeSingle();
      if (fmData) {
        financialModelRecord = fmData;
        financialModelId = fmData.id;
        logger.log('[Stage07] Read financial model from financial_models:', { id: financialModelId, template_type: fmData.template_type });
      }
    } catch (err) {
      logger.warn('[Stage07] financial_models read failed (using stage5Data):', err.message);
    }
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
  Monthly Churn: ${stage5Data.unitEconomics?.churnRate ? (stage5Data.unitEconomics.churnRate * 100).toFixed(1) + '%' : 'N/A'}
  Gross Margin: ${stage5Data.grossProfitY1 && stage5Data.year1?.revenue ? ((stage5Data.grossProfitY1 / stage5Data.year1.revenue) * 100).toFixed(1) + '%' : 'N/A'}`
    : 'No financial model available';

  const riskContext = stage6Data?.highRiskCount
    ? `Risk Profile: ${stage6Data.totalRisks} risks, ${stage6Data.highRiskCount} high-risk (score >= 15)`
    : '';

  // Web-grounded search for pricing intelligence
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${sanitizeForPrompt(stage1Data.targetMarket || ventureName)} SaaS pricing models benchmarks ${new Date().getFullYear()}`,
      `${sanitizeForPrompt(stage1Data.description?.substring(0, 80))} pricing strategy competitive pricing`,
    ];
    logger.log('[Stage07] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'Pricing Intelligence Research');
  }

  const userPrompt = `Generate a pricing strategy for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Archetype: ${sanitizeForPrompt(stage1Data.archetype || 'N/A')}

${competitiveContext}

${financialContext}

${riskContext}
${webContext}
Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize pricing_model — accept both camelCase and snake_case from LLM
  let llmFallbackCount = 0;
  const rawModel = parsed.pricing_model ?? parsed.pricingModel;
  const pricing_model = PRICING_MODELS.includes(rawModel) ? rawModel : 'subscription';
  if (!PRICING_MODELS.includes(rawModel)) llmFallbackCount++;

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
  const s5Churn = stage5Data?.unitEconomics?.churnRate
    ? stage5Data.unitEconomics.churnRate * 100
    : 5;

  const rawGrossMargin = parsed.unitEconomics?.gross_margin_pct;
  const rawChurnMonthly = parsed.unitEconomics?.churn_rate_monthly;
  const rawCac = parsed.unitEconomics?.cac;
  const rawArpa = parsed.unitEconomics?.arpa;

  if (rawGrossMargin === undefined) llmFallbackCount++;
  if (rawChurnMonthly === undefined) llmFallbackCount++;
  if (rawCac === undefined) llmFallbackCount++;
  if (rawArpa === undefined) llmFallbackCount++;

  // Flat unit economics fields matching template schema
  const gross_margin_pct = clamp(rawGrossMargin ?? s5GrossMargin, 0, 100, logger, 'unitEconomics.gross_margin_pct');
  const churn_rate_monthly = clamp(rawChurnMonthly ?? s5Churn, 0, 100, logger, 'unitEconomics.churn_rate_monthly');
  const cac = Math.max(0, Number(rawCac ?? stage5Data?.unitEconomics?.cac ?? 100));
  const arpa = Math.max(0, Number(rawArpa ?? (tiers[0]?.price || 49)));

  if (llmFallbackCount > 0) {
    logger.warn('[Stage07] LLM fallback fields detected', { llmFallbackCount });
  }

  // Enrich financial_models with pricing data (dual-write: advisory_data preserved by engine)
  if (supabase && financialModelId && financialModelRecord) {
    try {
      const enrichedModelData = {
        ...financialModelRecord.model_data,
        pricing: {
          pricing_model,
          tiers,
          priceAnchor: {
            competitorAvg: Math.max(0, Number(parsed.priceAnchor?.competitorAvg) || 0),
            proposedPrice: Math.max(0, Number(parsed.priceAnchor?.proposedPrice) || tiers[0]?.price || 0),
            positioning,
          },
          gross_margin_pct,
          churn_rate_monthly,
          cac,
          arpa,
        },
        source_stage: 7,
      };
      await supabase
        .from('financial_models')
        .update({ model_data: enrichedModelData, model_name: `Financial Model - ${ventureName || 'Unknown'}` })
        .eq('id', financialModelId);
      logger.log('[Stage07] Financial model enriched with pricing data:', { id: financialModelId });
    } catch (err) {
      logger.warn('[Stage07] financial_models update failed (non-blocking):', err.message);
    }
  }

  logger.log('[Stage07] Analysis complete', { duration: Date.now() - startTime });
  return {
    pricing_model,
    currency: 'USD',
    primaryValueMetric: String(parsed.primaryValueMetric || 'per user per month'),
    priceAnchor: {
      competitorAvg: Math.max(0, Number(parsed.priceAnchor?.competitorAvg) || 0),
      proposedPrice: Math.max(0, Number(parsed.priceAnchor?.proposedPrice) || tiers[0]?.price || 0),
      positioning,
    },
    tiers,
    gross_margin_pct,
    churn_rate_monthly,
    cac,
    arpa,
    rationale: String(parsed.rationale || ''),
    fourBuckets, usage, llmFallbackCount,
    financialModelId,
  };
}

function clamp(val, min, max, logger, fieldName) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN coerced to ${min}`, { original: val });
    return min;
  }
  if (n < min) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: ${n} clamped to min ${min}`, { original: val });
    return min;
  }
  if (n > max) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: ${n} clamped to max ${max}`, { original: val });
    return max;
  }
  return n;
}


export { POSITIONING_VALUES };
