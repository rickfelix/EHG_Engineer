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
import { deriveUnitEconomics } from '../unit-economics.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';
import { PRICING_MODELS } from '../stage-07.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

const POSITIONING_VALUES = ['premium', 'parity', 'discount'];

// ── Acquisition-tier rubric (SD-LEO-INFRA-S7-ACQUISITION-TIER-RUBRIC-001) ──────────────
// DERIVE the top-of-funnel (free/teaser vs trial) decision from the venture's segment + GTM
// motion instead of leaving it to LLM discretion. ADD-only: competitor-anchoring is untouched.
const SELF_SERVE_PATTERNS = /\b(self[\s-]?serve|plg|product[\s-]?led|freemium|free[\s-]?trial|bottoms?[\s-]?up|prosumer|individuals?|smb|small[\s-]?business|developers?|indie|volume|consumer|d2c|b2c)\b/i;
const HIGH_ACV_PATTERNS = /\b(enterprise|sales[\s-]?led|high[\s-]?acv|high[\s-]?touch|fortune[\s-]?\d*|mid[\s-]?market|account[\s-]?based|abm|complex[\s-]?sale|procurement|rfp|top[\s-]?down|large[\s-]?organi[sz]ations?)\b/i;

function classifyMotion(text) {
  const t = String(text || '');
  return { selfServe: SELF_SERVE_PATTERNS.test(t), highAcv: HIGH_ACV_PATTERNS.test(t) };
}

function segmentText(sz) {
  if (!sz) return '';
  if (typeof sz === 'string') return sz;
  if (typeof sz === 'object') {
    const parts = [sz.segment, sz.name, sz.motion, sz.gtm, sz.gtm_motion, sz.description].filter(Boolean);
    return parts.length ? parts.join(' ') : JSON.stringify(sz);
  }
  return String(sz);
}

/**
 * FR-2 — derive normalized segment/GTM signals from inputs already available to analyzeStage07.
 * Pure (no I/O). A ratified stage_zero segment is authoritative and overrides weaker keyword signals.
 * @param {{stage1Data?:Object, stage4Data?:Object, stageZeroSegment?:(string|Object|null)}} params
 * @returns {{selfServe:boolean, highAcv:boolean, dual:boolean, source:string}}
 */
export function extractSegmentGtmSignals({ stage1Data = {}, stage4Data = {}, stageZeroSegment = null } = {}) {
  // Ratified stage_zero segment is the highest-trust signal — overrides conflicting weaker hits.
  if (stageZeroSegment) {
    const sz = classifyMotion(segmentText(stageZeroSegment));
    if (sz.selfServe || sz.highAcv) {
      return { selfServe: sz.selfServe, highAcv: sz.highAcv, dual: sz.selfServe && sz.highAcv, source: 'stage_zero' };
    }
  }
  // Fall back to weaker keyword signals from Stage-1 concept + Stage-4 competitive GTM patterns.
  const pm = stage4Data?.stage5Handoff?.pricingModels;
  const texts = [
    stage1Data?.targetMarket,
    stage1Data?.archetype,
    stage1Data?.description,
    Array.isArray(pm) && pm.length ? pm.join(' ') : null,
  ].filter(Boolean).map(String);
  let selfServe = false, highAcv = false;
  for (const t of texts) {
    const c = classifyMotion(t);
    selfServe = selfServe || c.selfServe;
    highAcv = highAcv || c.highAcv;
  }
  return { selfServe, highAcv, dual: selfServe && highAcv, source: (selfServe || highAcv) ? 'stage1' : 'none' };
}

/**
 * FR-1 — map segment/GTM signals to an acquisition-tier recommendation. Pure.
 * @param {{selfServe?:boolean, highAcv?:boolean, dual?:boolean}} signals
 * @returns {{recommendation:string, tierType:string, permanentFree:boolean, rationale:string}}
 */
export function deriveAcquisitionTier(signals = {}) {
  const selfServe = !!signals.selfServe;
  const highAcv = !!signals.highAcv;
  const dual = signals.dual ?? (selfServe && highAcv);
  if (dual) {
    return { recommendation: 'dual', tierType: 'freemium', permanentFree: true,
      rationale: 'Dual-segment: free/freemium teaser for the self-serve segment + paid tiers for the high-ACV segment.' };
  }
  if (selfServe) {
    return { recommendation: 'free_teaser', tierType: 'freemium', permanentFree: true,
      rationale: 'Self-serve/PLG/volume segment: include a free/freemium acquisition (teaser) tier.' };
  }
  if (highAcv) {
    return { recommendation: 'trial_demo', tierType: 'trial', permanentFree: false,
      rationale: 'High-ACV/enterprise/sales-led segment: time-limited trial or demo, no permanent free tier.' };
  }
  // Conservative default: with no self-serve signal, never auto-grant a permanent free tier.
  return { recommendation: 'trial_demo', tierType: 'trial', permanentFree: false,
    rationale: 'Insufficient segment signal: conservative default (time-limited trial, no permanent free tier).' };
}

/**
 * FR-3 — apply the acquisition-tier recommendation to a normalized tiers array. Pure (returns a
 * NEW array). Additive: never removes or reprices the competitor-anchored paid tiers.
 * @returns {{tiers:Array, added:boolean, converted:boolean}}
 */
export function applyAcquisitionTier(tiers, rec, { selfServeSegment = 'Self-serve' } = {}) {
  const out = Array.isArray(tiers) ? tiers.map(t => ({ ...t })) : [];
  let added = false, converted = false;
  const hasFreeTier = out.some(t => Number(t.price) === 0);

  if (rec && rec.permanentFree) {
    // self-serve / dual: ensure a free/freemium teaser exists (additive; paid tiers untouched).
    if (!hasFreeTier) {
      out.unshift({
        name: rec.tierType === 'free' ? 'Free' : 'Freemium',
        price: 0,
        billing_period: 'monthly',
        target_segment: selfServeSegment,
        included_units: 'Free acquisition (teaser) tier',
        acquisition_tier: true,
      });
      added = true;
    }
  } else {
    // enterprise-only / conservative: NO permanent free tier — convert any permanent price-0 tier
    // into a time-limited trial flag rather than keeping a permanent free tier.
    for (const t of out) {
      if (Number(t.price) === 0) {
        t.trial = true;
        t.trial_days = 14;
        t.included_units = `Time-limited ${rec && rec.tierType ? rec.tierType : 'trial'} (no permanent free tier)`;
        converted = true;
      }
    }
  }
  return { tiers: out, added, converted };
}

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
export async function analyzeStage07({ stage1Data, stage4Data, stage5Data, stage6Data, stageZeroSegment = null, ventureName, ventureId, supabase, logger = console }) {
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

  // Acquisition-tier rubric (SD-LEO-INFRA-S7-ACQUISITION-TIER-RUBRIC-001): DERIVE the top-of-funnel
  // motion from segment/GTM signals. FR-4 nudges the LLM; FR-3 post-processing is authoritative.
  const acqSignals = extractSegmentGtmSignals({ stage1Data, stage4Data, stageZeroSegment });
  const acqRec = deriveAcquisitionTier(acqSignals);
  const acquisitionMotionLine = acqRec.permanentFree
    ? `Acquisition motion: INCLUDE a free/freemium teaser tier for the self-serve segment (${acqRec.recommendation}).`
    : `Acquisition motion: time-limited trial/demo only, NO permanent free tier (${acqRec.recommendation}).`;

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
${acquisitionMotionLine}
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

  // FR-3: capture the competitor-anchored paid price BEFORE adding any acquisition teaser, so
  // unit-economics (arpa) and priceAnchor stay anchored to the paid tier, not a price-0 teaser.
  const paidAnchorPrice = tiers.find(t => Number(t.price) > 0)?.price || tiers[0]?.price || 0;

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
  const arpa = Math.max(0, Number(rawArpa ?? (paidAnchorPrice || 49)));

  if (llmFallbackCount > 0) {
    logger.warn('[Stage07] LLM fallback fields detected', { llmFallbackCount });
  }

  // FR-3: apply the derived acquisition-tier recommendation (additive; competitor-anchored paid
  // tiers untouched). Mutates `tiers` in place to the post-processed array.
  const acqApplied = applyAcquisitionTier(tiers, acqRec, { selfServeSegment: stage1Data?.targetMarket || 'Self-serve' });
  tiers.length = 0;
  tiers.push(...acqApplied.tiers);
  logger.log('[Stage07] Acquisition tier applied', { recommendation: acqRec.recommendation, added: acqApplied.added, converted: acqApplied.converted });

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
            proposedPrice: Math.max(0, Number(parsed.priceAnchor?.proposedPrice) || paidAnchorPrice || 0),
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

  // SD-LEO-INFRA-S7-DERIVED-UNIT-ECON-PERSIST-001 (FR-1): compute + PERSIST the schema-declared
  // derived unit-economics (ltv, cac_ltv_ratio, payback_months) into the engine_pricing_model
  // artifact. Previously these were never computed (template computeDerived was dead), so the S9
  // reality gate false-blocked Phase-2 on their absence. Pure + idempotent; zero-churn yields
  // null-with-warning (true negative). Persisted as null (never omitted) for field-presence consumers.
  const derived = deriveUnitEconomics({ arpa, gross_margin_pct, churn_rate_monthly, cac });
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
    acquisitionTier: { ...acqRec, signals: acqSignals, teaserAdded: acqApplied.added, permanentFreeConverted: acqApplied.converted },
    gross_margin_pct,
    churn_rate_monthly,
    cac,
    arpa,
    ltv: derived.ltv,
    cac_ltv_ratio: derived.cac_ltv_ratio,
    payback_months: derived.payback_months,
    warnings: derived.warnings,
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
