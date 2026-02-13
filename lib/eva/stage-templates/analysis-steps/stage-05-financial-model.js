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
    "monthlyChurn": number (0-1, e.g. 0.05 = 5%)
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
export async function analyzeStage05({ stage1Data, stage3Data, stage4Data, ventureName }) {
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

  const userPrompt = `Generate a 3-year financial model for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket}
Problem: ${stage1Data.problemStatement || 'N/A'}
${stage3Data?.overallScore ? `Validation Score: ${stage3Data.overallScore}/100` : ''}

${pricingContext}

${stage4Data?.competitors ? `Number of competitors: ${stage4Data.competitors.length}` : ''}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  // Extract and validate core financials
  const model = {
    initialInvestment: ensurePositive(parsed.initialInvestment, 10000),
    year1: normalizeYear(parsed.year1),
    year2: normalizeYear(parsed.year2),
    year3: normalizeYear(parsed.year3),
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

  const monthlyNetProfit = netProfitY1 / 12;
  const breakEvenMonth = monthlyNetProfit > 0
    ? Math.ceil(model.initialInvestment / monthlyNetProfit)
    : null;

  // Unit economics from LLM
  const unitEconomics = parsed.unitEconomics || {};
  const cac = ensurePositive(unitEconomics.cac, 100);
  const ltv = ensurePositive(unitEconomics.ltv, 500);
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const paybackMonths = ensurePositive(unitEconomics.paybackMonths, breakEvenMonth || 12);
  const monthlyChurn = Math.max(0, Math.min(1, unitEconomics.monthlyChurn || 0.05));

  // ROI bands
  const roiBands = {
    pessimistic: roi3y * 0.8,
    base: roi3y,
    optimistic: roi3y * 1.3,
  };

  // Kill gate evaluation (SD specifies ROI 25%)
  const reasons = [];
  if (roi3y < ROI_THRESHOLD) {
    reasons.push({
      type: 'roi_below_threshold',
      message: `3-year ROI of ${(roi3y * 100).toFixed(1)}% is below threshold ${ROI_THRESHOLD * 100}%`,
      threshold: ROI_THRESHOLD,
      actual: roi3y,
    });
  }
  if (breakEvenMonth === null) {
    reasons.push({
      type: 'no_break_even_year1',
      message: 'Year 1 net profit is non-positive; break-even cannot be calculated',
    });
  } else if (breakEvenMonth > MAX_PAYBACK_MONTHS) {
    reasons.push({
      type: 'break_even_too_late',
      message: `Break-even at month ${breakEvenMonth} exceeds maximum ${MAX_PAYBACK_MONTHS} months`,
      threshold: MAX_PAYBACK_MONTHS,
      actual: breakEvenMonth,
    });
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';

  return {
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
    blockProgression: decision === 'kill',
    reasons,
    unitEconomics: {
      cac,
      ltv,
      ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
      paybackMonths,
      monthlyChurn,
    },
    roiBands,
    assumptions: Array.isArray(parsed.assumptions) ? parsed.assumptions : [],
  };
}

function normalizeYear(year) {
  return {
    revenue: ensureNonNegative(year?.revenue, 0),
    cogs: ensureNonNegative(year?.cogs, 0),
    opex: ensureNonNegative(year?.opex, 0),
  };
}

function ensurePositive(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function ensureNonNegative(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse financial model response: ${cleaned.substring(0, 200)}`);
  }
}

export { ROI_THRESHOLD, MAX_PAYBACK_MONTHS };
