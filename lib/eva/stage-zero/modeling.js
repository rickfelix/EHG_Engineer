/**
 * Stage 0 - Modeling Module (Horizontal Forecasting Infrastructure)
 *
 * Provides financial and growth projections for venture candidates
 * during Stage 0 evaluation. Uses synthesis data to generate:
 * - Revenue projections (monthly, by year for 3 years)
 * - Market size estimates (TAM, SAM, SOM)
 * - Unit economics (CAC, LTV, payback period)
 * - Growth trajectory (user adoption curves)
 *
 * All projections are ranges (optimistic/realistic/pessimistic)
 * to reflect early-stage uncertainty.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J
 */

import { getValidationClient } from '../../llm/client-factory.js';

/**
 * Generate a horizontal forecast for a venture brief.
 *
 * @param {Object} brief - Enriched venture brief from synthesis engine
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Forecast result
 */
export async function generateForecast(brief, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Generating venture forecast...');

  const buildCost = brief.metadata?.synthesis?.build_cost || {};
  const archetype = brief.metadata?.synthesis?.archetypes?.primary_archetype || 'unknown';
  const timeHorizon = brief.metadata?.synthesis?.time_horizon?.position || 'build_now';

  const prompt = `You are a financial modeling analyst for EHG ventures. Generate projections for this venture.

VENTURE:
Name: ${brief.name}
Problem: ${brief.problem_statement}
Solution: ${brief.solution}
Market: ${brief.target_market}
Archetype: ${archetype}
Time Horizon: ${timeHorizon}
Build Complexity: ${buildCost.complexity || 'moderate'}
Estimated Timeline: ${buildCost.timeline_weeks?.realistic || 8} weeks to MVP

EHG CONTEXT:
- AI-first development (lower build costs)
- Supabase infrastructure (low infra overhead)
- Portfolio synergies may reduce CAC
- Chairman requires 2-year positioning horizon

Generate 3-year projections with optimistic/realistic/pessimistic ranges:

Return JSON:
{
  "market_sizing": {
    "tam": {"value": 1000000000, "unit": "USD", "rationale": "string"},
    "sam": {"value": 100000000, "unit": "USD", "rationale": "string"},
    "som": {"value": 5000000, "unit": "USD", "rationale": "string"}
  },
  "revenue_projections": {
    "year_1": {"optimistic": 120000, "realistic": 60000, "pessimistic": 15000},
    "year_2": {"optimistic": 600000, "realistic": 250000, "pessimistic": 80000},
    "year_3": {"optimistic": 2000000, "realistic": 800000, "pessimistic": 200000}
  },
  "unit_economics": {
    "cac": {"optimistic": 15, "realistic": 40, "pessimistic": 80},
    "ltv": {"optimistic": 600, "realistic": 350, "pessimistic": 150},
    "ltv_cac_ratio": {"optimistic": 40, "realistic": 8.75, "pessimistic": 1.88},
    "payback_months": {"optimistic": 2, "realistic": 5, "pessimistic": 12}
  },
  "growth_trajectory": {
    "month_3_users": {"optimistic": 200, "realistic": 50, "pessimistic": 10},
    "month_6_users": {"optimistic": 1000, "realistic": 200, "pessimistic": 50},
    "month_12_users": {"optimistic": 5000, "realistic": 800, "pessimistic": 150},
    "growth_model": "string (e.g., 'viral', 'sales-led', 'content-led')"
  },
  "break_even": {
    "months_to_break_even": {"optimistic": 8, "realistic": 14, "pessimistic": 24},
    "monthly_burn_at_launch": 3000,
    "monthly_burn_at_scale": 8000
  },
  "confidence": 65,
  "key_assumptions": ["string"],
  "summary": "string (2-3 sentences)"
}`;

  try {
    const response = await client.complete('', prompt, { max_tokens: 2000, timeout: 120000 });
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const forecast = JSON.parse(jsonMatch[0]);
      return {
        component: 'forecast',
        market_sizing: forecast.market_sizing || defaultMarketSizing(),
        revenue_projections: forecast.revenue_projections || defaultRevenueProjections(),
        unit_economics: forecast.unit_economics || defaultUnitEconomics(),
        growth_trajectory: forecast.growth_trajectory || defaultGrowthTrajectory(),
        break_even: forecast.break_even || defaultBreakEven(),
        confidence: forecast.confidence || 30,
        key_assumptions: forecast.key_assumptions || [],
        summary: forecast.summary || '',
      };
    }
    return defaultForecastResult('Could not parse forecast');
  } catch (err) {
    logger.warn(`   Warning: Forecast generation failed: ${err.message}`);
    return defaultForecastResult(`Forecast failed: ${err.message}`);
  }
}

/**
 * Calculate a simple venture score from forecast data.
 * Used to compare ventures in the pipeline.
 *
 * @param {Object} forecast - Forecast result from generateForecast
 * @returns {number} Score 0-100
 */
export function calculateVentureScore(forecast) {
  if (!forecast || forecast.confidence === 0) return 0;

  const rev = forecast.revenue_projections?.year_2?.realistic || 0;
  const ltvCac = forecast.unit_economics?.ltv_cac_ratio?.realistic || 0;
  const breakEven = forecast.break_even?.months_to_break_even?.realistic || 36;

  // Revenue score (0-35): $250k realistic Y2 = 35
  const revScore = Math.min(35, Math.round((rev / 250000) * 35));

  // LTV/CAC score (0-30): 8.75x = 30
  const ltvScore = Math.min(30, Math.round((ltvCac / 8.75) * 30));

  // Break-even speed (0-20): 14 months = 20, 36+ = 0
  const beScore = breakEven >= 36 ? 0 : Math.round(((36 - breakEven) / 22) * 20);

  // Confidence bonus (0-15)
  const confScore = Math.round((forecast.confidence / 100) * 15);

  return Math.min(100, revScore + ltvScore + beScore + confScore);
}

// ── Default Structures ──────────────────────────────

function defaultMarketSizing() {
  return {
    tam: { value: 0, unit: 'USD', rationale: 'Unknown' },
    sam: { value: 0, unit: 'USD', rationale: 'Unknown' },
    som: { value: 0, unit: 'USD', rationale: 'Unknown' },
  };
}

function defaultRevenueProjections() {
  return {
    year_1: { optimistic: 0, realistic: 0, pessimistic: 0 },
    year_2: { optimistic: 0, realistic: 0, pessimistic: 0 },
    year_3: { optimistic: 0, realistic: 0, pessimistic: 0 },
  };
}

function defaultUnitEconomics() {
  return {
    cac: { optimistic: 0, realistic: 0, pessimistic: 0 },
    ltv: { optimistic: 0, realistic: 0, pessimistic: 0 },
    ltv_cac_ratio: { optimistic: 0, realistic: 0, pessimistic: 0 },
    payback_months: { optimistic: 0, realistic: 0, pessimistic: 0 },
  };
}

function defaultGrowthTrajectory() {
  return {
    month_3_users: { optimistic: 0, realistic: 0, pessimistic: 0 },
    month_6_users: { optimistic: 0, realistic: 0, pessimistic: 0 },
    month_12_users: { optimistic: 0, realistic: 0, pessimistic: 0 },
    growth_model: 'unknown',
  };
}

function defaultBreakEven() {
  return {
    months_to_break_even: { optimistic: 0, realistic: 0, pessimistic: 0 },
    monthly_burn_at_launch: 0,
    monthly_burn_at_scale: 0,
  };
}

function defaultForecastResult(summary) {
  return {
    component: 'forecast',
    market_sizing: defaultMarketSizing(),
    revenue_projections: defaultRevenueProjections(),
    unit_economics: defaultUnitEconomics(),
    growth_trajectory: defaultGrowthTrajectory(),
    break_even: defaultBreakEven(),
    confidence: 0,
    key_assumptions: [],
    summary,
  };
}
