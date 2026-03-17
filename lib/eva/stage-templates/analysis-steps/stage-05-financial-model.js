/**
 * Stage 05 Analysis Step - Financial Model with Unit Economics
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Generates a 3-year financial model with unit economics:
 * CAC, LTV, LTV:CAC ratio, payback period, and ROI with bands.
 * Kill gate fires when ROI < 25% (SD-specified) OR payback > 24 months.
 *
 * Consumes Stage 4 competitive pricing data (stage5Handoff) and
 * Stage 3 validation scores for revenue assumptions.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-05-financial-model
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';
import { evaluateKillGate } from '../stage-05.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { setContract } from '../../contracts/financial-contract.js';

const ROI_THRESHOLD = 0.25;
const MAX_PAYBACK_MONTHS = 24;

const SYSTEM_PROMPT = `You are EVA's financial modeling engine. Generate a 3-year financial projection with unit economics.

You MUST output valid JSON with exactly this structure:
{
  "initialInvestment": number (> 0),
  "year1": { "revenue": number, "cogs": number, "opex": number },
  "year2": { "revenue": number, "cogs": number, "opex": number },
  "year3": { "revenue": number, "cogs": number, "opex": number },
  "unitEconomics": {
    "cac": number (Customer Acquisition Cost),
    "ltv": number (Lifetime Value),
    "ltvCacRatio": number (LTV / CAC),
    "paybackMonths": number (months to recover CAC),
    "churnRate": number (0-1, e.g. 0.05 = 5% monthly churn),
    "grossMargin": number (0-1, e.g. 0.7 = 70% gross margin)
  },
  "roiBands": {
    "pessimistic": number (decimal, e.g. 0.15 = 15%),
    "base": number,
    "optimistic": number
  },
  "assumptions": [
    "Key assumption 1",
    "Key assumption 2"
  ]
}

Rules:
- All monetary values in USD
- Use competitive pricing data to calibrate revenue assumptions
- Unit economics must be internally consistent (LTV = monthly revenue per customer / churn * margin)
- ROI bands: pessimistic = -20% of base, optimistic = +30% of base
- CAC should reflect the target market and acquisition channels
- Be conservative - do not inflate projections
- Include at least 3 assumptions`;

/**
 * Generate a financial model with unit economics.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 output
 * @param {Object} params.stage3Data - Stage 3 validation scores
 * @param {Object} params.stage4Data - Stage 4 output (competitors, stage5Handoff)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Financial model with kill gate evaluation
 */
export async function analyzeStage05({ stage1Data, stage3Data, stage4Data, ventureName, ventureId, supabase, logger = console }) {
  const _startTime = Date.now();
  logger.log('[Stage05] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 05 requires Stage 1 data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const pricingContext = stage4Data?.stage5Handoff
    ? `Competitive Pricing:
  Average market price: ${stage4Data.stage5Handoff.avgMarketPrice}
  Price range: $${stage4Data.stage5Handoff.priceRange?.low}-$${stage4Data.stage5Handoff.priceRange?.high}/mo
  Pricing models in market: ${stage4Data.stage5Handoff.pricingModels?.join(', ') || 'N/A'}
  Competitive density: ${stage4Data.stage5Handoff.competitiveDensity}`
    : 'No competitive pricing data available';

  // Web-grounded search for financial benchmarks
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${sanitizeForPrompt(stage1Data.targetMarket || ventureName)} industry benchmarks revenue growth ${new Date().getFullYear()}`,
      `${sanitizeForPrompt(stage1Data.targetMarket || 'SaaS')} unit economics CAC LTV benchmarks`,
    ];
    logger.log('[Stage05] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'Financial Benchmark Research');
  }

  const userPrompt = `Generate a 3-year financial model for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket)}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}
${stage3Data?.overallScore ? `Validation Score: ${stage3Data.overallScore}/100` : ''}

${pricingContext}

${stage4Data?.competitors ? `Number of competitors: ${stage4Data.competitors.length}` : ''}
${webContext}
Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Extract and validate core financials
  const model = {
    initialInvestment: ensurePositive(parsed.initialInvestment, 10000, logger, 'initialInvestment'),
    year1: normalizeYear(parsed.year1, logger, 'year1'),
    year2: normalizeYear(parsed.year2, logger, 'year2'),
    year3: normalizeYear(parsed.year3, logger, 'year3'),
  };

  // Compute derived fields (same as stage-05 template)
  const grossProfitY1 = model.year1.revenue - model.year1.cogs;
  const grossProfitY2 = model.year2.revenue - model.year2.cogs;
  const grossProfitY3 = model.year3.revenue - model.year3.cogs;
  const netProfitY1 = grossProfitY1 - model.year1.opex;
  const netProfitY2 = grossProfitY2 - model.year2.opex;
  const netProfitY3 = grossProfitY3 - model.year3.opex;
  const totalNetProfit = netProfitY1 + netProfitY2 + netProfitY3;
  const roi3y = (totalNetProfit - model.initialInvestment) / model.initialInvestment;

  // Break-even: accumulate monthly net profit across years 1-3
  // to find the month where cumulative profit covers initial investment.
  const monthlyProfits = [
    netProfitY1 / 12,  // months 1-12
    netProfitY2 / 12,  // months 13-24
    netProfitY3 / 12,  // months 25-36
  ];
  let breakEvenMonth = null;
  let cumulative = 0;
  for (let yr = 0; yr < 3; yr++) {
    for (let m = 1; m <= 12; m++) {
      cumulative += monthlyProfits[yr];
      if (cumulative >= model.initialInvestment) {
        breakEvenMonth = yr * 12 + m;
        break;
      }
    }
    if (breakEvenMonth !== null) break;
  }

  // Unit economics from LLM
  const rawUE = parsed.unitEconomics || {};
  let llmFallbackCount = 0;
  const cac = ensurePositive(rawUE.cac, 100, logger, 'unitEconomics.cac');
  if (!Number.isFinite(Number(rawUE.cac)) || Number(rawUE.cac) <= 0) llmFallbackCount++;
  const ltv = ensurePositive(rawUE.ltv, 500, logger, 'unitEconomics.ltv');
  if (!Number.isFinite(Number(rawUE.ltv)) || Number(rawUE.ltv) <= 0) llmFallbackCount++;
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const paybackMonths = ensurePositive(rawUE.paybackMonths, breakEvenMonth || 12, logger, 'unitEconomics.paybackMonths');
  if (!Number.isFinite(Number(rawUE.paybackMonths)) || Number(rawUE.paybackMonths) <= 0) llmFallbackCount++;
  // Template schema uses churnRate (0-1); LLM may return monthlyChurn
  const rawChurn = rawUE.churnRate ?? rawUE.monthlyChurn ?? 0.05;
  const churnRate = Math.max(0, Math.min(1, Number(rawChurn) || 0.05));
  if (rawUE.churnRate === undefined && rawUE.monthlyChurn === undefined) llmFallbackCount++;
  // grossMargin: required by template schema
  const rawMargin = rawUE.grossMargin ?? null;
  const grossMargin = rawMargin !== null && Number.isFinite(Number(rawMargin))
    ? Math.max(0, Math.min(1, Number(rawMargin)))
    : (model.year1.revenue > 0 ? grossProfitY1 / model.year1.revenue : 0);
  if (rawMargin === null) llmFallbackCount++;

  if (llmFallbackCount > 0) {
    logger.warn('[Stage05] LLM fallback fields detected', { llmFallbackCount });
  }

  // ROI bands — compute raw values then sort to guarantee optimistic > base > pessimistic.
  // When roi3y is negative, multiplying by 1.3 produces a MORE negative number,
  // so the raw order would be inverted without this sort step.
  const rawBands = [roi3y * 0.8, roi3y, roi3y * 1.3].sort((a, b) => a - b);
  const roiBands = {
    pessimistic: rawBands[0],
    base: rawBands[1],
    optimistic: rawBands[2],
  };

  // Canonical 3-way kill gate (pass / conditional_pass / kill)
  const { decision, blockProgression, reasons, remediationRoute } = evaluateKillGate({
    roi3y,
    breakEvenMonth,
    ltvCacRatio,
    paybackMonths,
  });

  // Set canonical financial contract for downstream validation
  if (ventureId || ventureName) {
    try {
      await setContract(ventureId || ventureName, 5, {
        capitalRequired: model.initialInvestment,
        cac,
        ltv,
        unitEconomics: { cac, ltv, ltvCacRatio, paybackMonths, churnRate, grossMargin },
        pricingModel: stage4Data?.stage5Handoff?.pricingModels?.[0] || null,
        pricePoints: stage4Data?.stage5Handoff?.priceRange || null,
        revenueProjection: { year1: model.year1, year2: model.year2, year3: model.year3 },
      });
      logger.log('[Stage05] Financial contract set successfully');
    } catch (err) {
      logger.warn('[Stage05] Failed to set financial contract (non-blocking):', err.message);
    }
  }

  // Persist to financial_models table (dual-write: advisory_data preserved by engine)
  let financialModelId = null;
  if (supabase && ventureId) {
    try {
      const templateType = archetypeToTemplateType(stage1Data?.archetype);
      const { data: fmData, error: fmError } = await supabase
        .from('financial_models')
        .upsert({
          venture_id: ventureId,
          template_type: templateType,
          model_name: `Stage 5 Profitability Model - ${ventureName || 'Unknown'}`,
          model_data: {
            source_stage: 5,
            initialInvestment: model.initialInvestment,
            year1: model.year1, year2: model.year2, year3: model.year3,
            unitEconomics: { cac, ltv, ltvCacRatio, paybackMonths, churnRate, grossMargin },
            roiBands,
            breakEvenMonth,
            roi3y,
            decision,
            assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
          },
        }, { onConflict: 'venture_id,template_type' })
        .select('id')
        .single();

      if (fmError) {
        logger.warn('[Stage05] financial_models write failed (non-blocking):', fmError.message);
      } else {
        financialModelId = fmData.id;
        logger.log('[Stage05] Financial model persisted to financial_models:', { id: financialModelId });
      }
    } catch (err) {
      logger.warn('[Stage05] financial_models write failed (non-blocking):', err.message);
    }
  }

  const result = {
    ...model,
    grossProfitY1,
    grossProfitY2,
    grossProfitY3,
    netProfitY1,
    netProfitY2,
    netProfitY3,
    breakEvenMonth,
    roi3y,
    decision,
    blockProgression,
    reasons,
    remediationRoute,
    unitEconomics: {
      cac,
      ltv,
      ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
      paybackMonths,
      churnRate,
      grossMargin: Math.round(grossMargin * 1000) / 1000,
    },
    roiBands,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
    fourBuckets, usage, llmFallbackCount,
  };

  // Only include financialModelId in advisory_data when it was actually persisted
  if (financialModelId != null) {
    result.financialModelId = financialModelId;
  }

  return result;
}

function archetypeToTemplateType(archetype) {
  const map = {
    saas: 'saas',
    marketplace: 'marketplace',
    hardware: 'hardware',
    services: 'services',
    ecommerce: 'ecommerce',
    subscription: 'subscription',
    'e-commerce': 'ecommerce',
    software: 'saas',
    platform: 'marketplace',
  };
  return map[String(archetype || '').toLowerCase()] || 'custom';
}

function normalizeYear(year, logger, yearName) {
  return {
    revenue: ensureNonNegative(year?.revenue, 0, logger, `${yearName}.revenue`),
    cogs: ensureNonNegative(year?.cogs, 0, logger, `${yearName}.cogs`),
    opex: ensureNonNegative(year?.opex, 0, logger, `${yearName}.opex`),
  };
}

function ensurePositive(val, fallback, logger, fieldName) {
  const n = Number(val);
  if (Number.isFinite(n) && n > 0) return n;
  if (logger) logger.warn(`[Fallback] ${fieldName}: ${val} replaced with ${fallback}`, { original: val, fallback });
  return fallback;
}

function ensureNonNegative(val, fallback, logger, fieldName) {
  const n = Number(val);
  if (Number.isFinite(n) && n >= 0) return n;
  if (logger) logger.warn(`[Fallback] ${fieldName}: ${val} replaced with ${fallback}`, { original: val, fallback });
  return fallback;
}


export { ROI_THRESHOLD, MAX_PAYBACK_MONTHS };
