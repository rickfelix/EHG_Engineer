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

  const prompt = `You are a venture evaluator for an AI-first venture studio. Evaluate this venture fairly using the full 1-5 scale. Score based on the venture's POTENTIAL given its concept, target market, and business model — not on whether it has already been validated.

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
- AI-first development (lower build costs, faster iteration)
- Supabase infrastructure (low infra overhead)
- Portfolio synergies may reduce CAC
- Chairman requires 2-year positioning horizon

EVALUATION RUBRIC — Score each dimension 1-5. Use the FULL range. Aim for a bell curve: some 1s, some 5s, most in 2-4. Each dimension is independent — a venture can score high on market but low on defensibility.

DIMENSION 1: MARKET OPPORTUNITY (weight: 25%)
  1 = No identifiable market; problem is unclear or affects almost no one
  2 = Niche market; problem exists for a small group; limited growth potential
  3 = Real market with identifiable customers; reasonable demand; room to grow
  4 = Large market with clear demand; growing segment with tailwinds
  5 = Massive established market with urgent unmet need

DIMENSION 2: REVENUE VIABILITY (weight: 25%)
  1 = No monetization path; unclear who would pay or why
  2 = Possible monetization but model is weak or unproven in this space
  3 = Plausible revenue model; similar businesses charge successfully for comparable offerings
  4 = Strong revenue model with multiple paths; clear willingness-to-pay indicators
  5 = Proven high-value model; strong pricing power and retention mechanics

DIMENSION 3: UNIT ECONOMICS (weight: 20%)
  1 = Fundamentally broken — costs will always exceed revenue per customer
  2 = Marginal — might work at scale but thin margins and long payback
  3 = Reasonable — standard SaaS/marketplace economics; sustainable with growth
  4 = Strong — low CAC channels exist, good retention, clear path to profitability
  5 = Exceptional — viral/organic acquisition, high margins, fast payback

DIMENSION 4: EXECUTION FEASIBILITY (weight: 15%)
  1 = Requires breakthrough technology or massive team; 24+ months to anything useful
  2 = Significant technical challenges; needs specialized skills beyond current team
  3 = Buildable with standard technology; moderate complexity; 3-6 months to MVP
  4 = Straightforward build with AI acceleration; clear technical path; 1-3 months
  5 = Can leverage existing infrastructure; minimal custom development needed

DIMENSION 5: COMPETITIVE DEFENSIBILITY (weight: 15%)
  1 = No moat; trivially replicable; large incumbents already dominate
  2 = Weak differentiation; easy to copy; relies mainly on speed-to-market
  3 = Moderate defensibility via specialization, data advantages, or integrations
  4 = Strong moat via network effects, proprietary data, or high switching costs
  5 = Deep structural advantages; defensible IP or ecosystem lock-in

SCORING GUIDELINES:
- Use the FULL 1-5 range across dimensions. Not every dimension should get the same score.
- Score 3 means "solid, reasonable" — this is a GOOD score for an early concept.
- Score 2 means "weak but not fatal" — the venture has challenges here.
- Score 4 means "genuinely strong" — clear advantages in this area.
- A typical well-conceived venture should average around 3.0 across dimensions (60/100).
- Poorly conceived ventures should average 1.5-2.0. Excellent ones 3.5-4.5.
- Evaluate POTENTIAL, not proof. An unvalidated market with strong signals should score 3, not 1.

Return JSON (use actual numbers based on YOUR analysis, not placeholder values):
{
  "rubric_scores": {
    "market_opportunity": {"score": <1-5>, "rationale": "string"},
    "revenue_viability": {"score": <1-5>, "rationale": "string"},
    "unit_economics": {"score": <1-5>, "rationale": "string"},
    "execution_feasibility": {"score": <1-5>, "rationale": "string"},
    "competitive_defensibility": {"score": <1-5>, "rationale": "string"}
  },
  "market_sizing": {
    "tam": {"value": <number>, "unit": "USD", "rationale": "string"},
    "sam": {"value": <number>, "unit": "USD", "rationale": "string"},
    "som": {"value": <number>, "unit": "USD", "rationale": "string"}
  },
  "revenue_projections": {
    "year_1": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "year_2": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "year_3": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>}
  },
  "unit_economics": {
    "cac": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "ltv": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "ltv_cac_ratio": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "payback_months": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>}
  },
  "growth_trajectory": {
    "month_3_users": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "month_6_users": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "month_12_users": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "growth_model": "string"
  },
  "break_even": {
    "months_to_break_even": {"optimistic": <number>, "realistic": <number>, "pessimistic": <number>},
    "monthly_burn_at_launch": <number>,
    "monthly_burn_at_scale": <number>
  },
  "confidence": <0-100>,
  "key_assumptions": ["string"],
  "risk_factors": ["string"],
  "summary": "string (2-3 sentences, be honest about weaknesses)"
}`;

  try {
    // 8192 minimum: Gemini 2.5 Pro uses ~3000 thinking tokens from the output budget
    const response = await client.complete('', prompt, { max_tokens: 8192, timeout: 120000 });
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const forecast = JSON.parse(jsonMatch[0]);
      return {
        component: 'forecast',
        rubric_scores: forecast.rubric_scores || defaultRubricScores(),
        market_sizing: forecast.market_sizing || defaultMarketSizing(),
        revenue_projections: forecast.revenue_projections || defaultRevenueProjections(),
        unit_economics: forecast.unit_economics || defaultUnitEconomics(),
        growth_trajectory: forecast.growth_trajectory || defaultGrowthTrajectory(),
        break_even: forecast.break_even || defaultBreakEven(),
        confidence: forecast.confidence || 30,
        key_assumptions: forecast.key_assumptions || [],
        risk_factors: forecast.risk_factors || [],
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
 * Calculate venture score from rubric-based evaluation.
 *
 * Uses weighted rubric dimensions (1-5 scale each) with a pessimistic
 * confidence discount. Falls back to legacy financial scoring if no
 * rubric scores are present (backward compatibility).
 *
 * Dimension weights:
 *   market_opportunity: 25%, revenue_viability: 25%, unit_economics: 20%,
 *   execution_feasibility: 15%, competitive_defensibility: 15%
 *
 * @param {Object} forecast - Forecast result from generateForecast
 * @returns {number} Score 0-100
 */
export function calculateVentureScore(forecast) {
  if (!forecast || forecast.confidence === 0) return 0;

  const rubric = forecast.rubric_scores;
  if (rubric) {
    return calculateRubricScore(rubric, forecast.confidence || 30);
  }

  // Legacy fallback for forecasts without rubric scores
  return calculateLegacyScore(forecast);
}

const RUBRIC_WEIGHTS = {
  market_opportunity: 0.25,
  revenue_viability: 0.25,
  unit_economics: 0.20,
  execution_feasibility: 0.15,
  competitive_defensibility: 0.15,
};

/**
 * Stage-specific rubric weight profiles.
 * Stage 3 (Market Viability) uses default weights.
 * Stage 5 (Financial Viability) emphasizes financial dimensions.
 */
const STAGE_RUBRIC_WEIGHTS = {
  '3': RUBRIC_WEIGHTS, // default — "does the market exist?"
  '5': {               // financial emphasis — "can this make money?"
    market_opportunity: 0.10,
    revenue_viability: 0.30,
    unit_economics: 0.30,
    execution_feasibility: 0.15,
    competitive_defensibility: 0.15,
  },
};

function calculateRubricScore(rubric, confidence, weights = RUBRIC_WEIGHTS) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [dim, weight] of Object.entries(weights)) {
    const entry = rubric[dim];
    const score = typeof entry === 'object' ? entry?.score : entry;
    if (typeof score === 'number' && score >= 1 && score <= 5) {
      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return 0;

  // Normalize to 0-100: rubric 1-5 → 0-100
  // Score of 1 = 0, Score of 5 = 100
  const normalizedRubric = ((weightedSum / totalWeight) - 1) / 4 * 100;

  // Confidence discount: low confidence pulls score down (max 15% penalty)
  const confidenceFactor = 0.85 + (Math.min(confidence, 100) / 100) * 0.15;

  return Math.round(Math.min(100, normalizedRubric * confidenceFactor));
}

/**
 * Calculate a stage-weighted venture score from rubric scores.
 *
 * Different stages emphasize different dimensions:
 * - Stage 3 (Market Viability): equal market/revenue weight (default)
 * - Stage 5 (Financial Viability): heavy financial emphasis (revenue + unit economics = 60%)
 *
 * @param {Object} rubricScores - Rubric scores object (dimension → {score, rationale} or number)
 * @param {number} confidence - Confidence level 0-100
 * @param {number|string} stage - Stage number
 * @returns {number} Score 0-100
 */
export function calculateStageWeightedScore(rubricScores, confidence, stage) {
  const weights = STAGE_RUBRIC_WEIGHTS[String(stage)] || RUBRIC_WEIGHTS;
  return calculateRubricScore(rubricScores, confidence, weights);
}

function calculateLegacyScore(forecast) {
  const rev = forecast.revenue_projections?.year_2?.realistic || 0;
  const ltvCac = forecast.unit_economics?.ltv_cac_ratio?.realistic || 0;
  const breakEven = forecast.break_even?.months_to_break_even?.realistic || 36;

  const revScore = Math.min(35, Math.round((rev / 250000) * 35));
  const ltvScore = Math.min(30, Math.round((ltvCac / 8.75) * 30));
  const beScore = breakEven >= 36 ? 0 : Math.round(((36 - breakEven) / 22) * 20);
  const confScore = Math.round((forecast.confidence / 100) * 15);

  return Math.min(100, revScore + ltvScore + beScore + confScore);
}

// ── Default Structures ──────────────────────────────

function defaultRubricScores() {
  return {
    market_opportunity: { score: 1, rationale: 'Not evaluated' },
    revenue_viability: { score: 1, rationale: 'Not evaluated' },
    unit_economics: { score: 1, rationale: 'Not evaluated' },
    execution_feasibility: { score: 1, rationale: 'Not evaluated' },
    competitive_defensibility: { score: 1, rationale: 'Not evaluated' },
  };
}

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
    rubric_scores: defaultRubricScores(),
    market_sizing: defaultMarketSizing(),
    revenue_projections: defaultRevenueProjections(),
    unit_economics: defaultUnitEconomics(),
    growth_trajectory: defaultGrowthTrajectory(),
    break_even: defaultBreakEven(),
    confidence: 0,
    key_assumptions: [],
    risk_factors: [],
    summary,
  };
}
