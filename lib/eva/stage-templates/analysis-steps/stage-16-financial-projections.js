/**
 * Stage 16 Analysis Step - Financial Projections Generation
 * Part of SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P4-001
 *
 * Consumes Stages 1, 13-15 data and generates financial projections
 * with revenue/cost data, structured cost breakdowns, burn rate,
 * and funding rounds.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-16-financial-projections
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
// evaluatePromotionGate is a hoisted function declaration, safe for circular dependency import.
import { evaluatePromotionGate } from '../stage-16.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

// NOTE: MIN_PROJECTION_MONTHS intentionally duplicated from stage-16.js
// to avoid circular dependency — stage-16.js imports analyzeStage16 from this file,
// and SYSTEM_PROMPT uses this constant at module-level evaluation.
const MIN_PROJECTION_MONTHS = 6;

const SYSTEM_PROMPT = `You are EVA's Financial Projections Engine. Generate structured financial projections for a venture.

You MUST output valid JSON with exactly this structure:
{
  "initial_capital": 50000,
  "monthly_burn_rate": 8000,
  "revenue_projections": [
    {
      "month": 1,
      "revenue": 0,
      "costs": 8000,
      "cost_breakdown": {
        "personnel": 5000,
        "infrastructure": 1500,
        "marketing": 1000,
        "other": 500
      }
    },
    {
      "month": 2,
      "revenue": 500,
      "costs": 8500,
      "cost_breakdown": {
        "personnel": 5000,
        "infrastructure": 1500,
        "marketing": 1500,
        "other": 500
      }
    }
  ],
  "funding_rounds": [
    {
      "round_name": "Pre-seed",
      "target_amount": 100000,
      "target_date": "2026-06-01"
    }
  ]
}

Rules:
- initial_capital must be > 0
- monthly_burn_rate must be > 0
- At least ${MIN_PROJECTION_MONTHS} months of revenue projections required
- Each projection must have month (sequential), revenue (>= 0), and costs (>= 0)
- Each projection MUST include cost_breakdown with: personnel, infrastructure, marketing, other
- cost_breakdown values must be >= 0 and should sum to approximately the total costs
- Revenue should start low and grow based on the market/product
- Costs should reflect the team composition from resource planning
- Personnel costs should be the largest category for most early-stage ventures
- Infrastructure costs should reflect the technical architecture complexity
- Marketing costs should ramp up as the product approaches market readiness
- Funding rounds are optional but recommended if runway < 12 months
- Each funding round must have round_name, target_amount (> 0), and target_date (ISO format)
- Be realistic about early-stage revenue (most ventures have $0 in month 1)
- Consider the venture's market size and pricing strategy`;

/**
 * Generate financial projections from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {Object} [params.stage14Data] - Stage 14 technical architecture
 * @param {Object} [params.stage15Data] - Stage 15 risk register
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Financial projections
 */
export async function analyzeStage16({ stage1Data, stage13Data, stage14Data, stage15Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage16] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 16 financial projections requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap: ${stage13Data.milestones.length} milestones over ${stage13Data.phases?.length || 0} phases`
    : 'No roadmap available';

  const archContext = stage14Data?.layers
    ? `Architecture: ${stage14Data.total_components || 'N/A'} components across ${stage14Data.layer_count || 5} layers (${Object.keys(stage14Data.layers).join(', ')})`
    : 'No architecture available';

  const riskContext = stage15Data?.risks
    ? `Risks: ${stage15Data.total_risks || stage15Data.risks.length} identified (${stage15Data.severity_breakdown?.critical || 0} critical, ${stage15Data.severity_breakdown?.high || 0} high)`
    : 'No risk register available';

  const userPrompt = `Generate financial projections for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}

${roadmapContext}
${archContext}
${riskContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Validate initial_capital
  const initial_capital = Math.max(0, Number(parsed.initial_capital) || 0);
  if (initial_capital <= 0) {
    throw new Error('Stage 16 financial projections: LLM returned zero initial capital');
  }

  const monthly_burn_rate = Math.max(0, Number(parsed.monthly_burn_rate) || 0);

  // Normalize revenue projections
  if (!Array.isArray(parsed.revenue_projections) || parsed.revenue_projections.length === 0) {
    throw new Error('Stage 16 financial projections: LLM returned no revenue projections');
  }

  const revenue_projections = parsed.revenue_projections.map((rp, i) => {
    const costs = Math.max(0, Number(rp.costs) || 0);
    const projection = {
      month: Number(rp.month) || (i + 1),
      revenue: Math.max(0, Number(rp.revenue) || 0),
      costs,
    };

    // Normalize cost_breakdown
    if (rp.cost_breakdown && typeof rp.cost_breakdown === 'object') {
      projection.cost_breakdown = {
        personnel: Math.max(0, Number(rp.cost_breakdown.personnel) || 0),
        infrastructure: Math.max(0, Number(rp.cost_breakdown.infrastructure) || 0),
        marketing: Math.max(0, Number(rp.cost_breakdown.marketing) || 0),
        other: Math.max(0, Number(rp.cost_breakdown.other) || 0),
      };
    } else if (costs > 0) {
      // Generate a reasonable breakdown if LLM omitted it
      projection.cost_breakdown = {
        personnel: Math.round(costs * 0.6),
        infrastructure: Math.round(costs * 0.2),
        marketing: Math.round(costs * 0.1),
        other: Math.round(costs * 0.1),
      };
    }

    return projection;
  });

  // Normalize funding rounds
  const funding_rounds = Array.isArray(parsed.funding_rounds)
    ? parsed.funding_rounds
      .filter(fr => fr && typeof fr === 'object')
      .map(fr => ({
        round_name: String(fr.round_name || 'Round').substring(0, 200),
        target_amount: Math.max(0, Number(fr.target_amount) || 0),
        target_date: String(fr.target_date || '').substring(0, 20),
      }))
      .filter(fr => fr.round_name && fr.target_amount > 0 && fr.target_date)
    : [];

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.revenue_projections) || parsed.revenue_projections.length < MIN_PROJECTION_MONTHS) llmFallbackCount++;
  if (!parsed.initial_capital || Number(parsed.initial_capital) <= 0) llmFallbackCount++;
  if (!parsed.monthly_burn_rate || Number(parsed.monthly_burn_rate) <= 0) llmFallbackCount++;
  for (const rp of parsed.revenue_projections || []) {
    if (!rp.cost_breakdown || typeof rp.cost_breakdown !== 'object') llmFallbackCount++;
  }
  if (llmFallbackCount > 0) {
    logger.warn('[Stage16] LLM fallback fields detected', { llmFallbackCount });
  }

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  const total_projected_revenue = revenue_projections.reduce((sum, rp) => sum + rp.revenue, 0);
  const total_projected_costs = revenue_projections.reduce((sum, rp) => sum + rp.costs, 0);
  const burn_rate = monthly_burn_rate;
  const runway_months = burn_rate > 0
    ? Math.round((initial_capital / burn_rate) * 100) / 100
    : initial_capital > 0 ? Infinity : 0;

  // Break-even month
  let cumulative = -initial_capital;
  let break_even_month = null;
  for (const rp of revenue_projections) {
    cumulative += (rp.revenue - rp.costs);
    if (cumulative >= 0 && break_even_month === null) {
      break_even_month = rp.month;
    }
  }

  // P&L
  const pnl = {
    grossRevenue: total_projected_revenue,
    totalCosts: total_projected_costs,
    netIncome: total_projected_revenue - total_projected_costs,
    margin: total_projected_revenue > 0
      ? Math.round(((total_projected_revenue - total_projected_costs) / total_projected_revenue) * 10000) / 100
      : 0,
  };

  // Running cash balance
  let runningBalance = initial_capital;
  const cash_balance_end = revenue_projections.map(rp => {
    runningBalance += (rp.revenue - rp.costs);
    return { month: rp.month, balance: Math.round(runningBalance * 100) / 100 };
  });

  // Viability warnings
  const viability_warnings = [];
  let consecutiveLoss = 0;
  for (const rp of revenue_projections) {
    if (rp.costs > rp.revenue) {
      consecutiveLoss++;
      if (consecutiveLoss >= 3) {
        viability_warnings.push(`Costs exceed revenue for ${consecutiveLoss} consecutive months (month ${rp.month - consecutiveLoss + 1} to ${rp.month})`);
        break;
      }
    } else {
      consecutiveLoss = 0;
    }
  }
  if (runway_months !== Infinity && runway_months < 6) {
    viability_warnings.push(`Short runway: ${runway_months} months (recommended: >= 6)`);
  }
  if (break_even_month === null && revenue_projections.length > 0) {
    viability_warnings.push(`No break-even within ${revenue_projections.length}-month projection period`);
  }
  const negativeMonth = cash_balance_end.find(cb => cb.balance < 0);
  if (negativeMonth) {
    viability_warnings.push(`Cash balance goes negative in month ${negativeMonth.month}`);
  }

  // Evaluate Phase 4→5 Promotion Gate
  const promotion_gate = evaluatePromotionGate({
    stage13: stage13Data,
    stage14: stage14Data,
    stage15: stage15Data,
    stage16: { initial_capital, revenue_projections },
  });

  logger.log('[Stage16] Analysis complete', { duration: Date.now() - startTime });
  return {
    initial_capital,
    monthly_burn_rate,
    revenue_projections,
    funding_rounds,
    total_projected_revenue,
    total_projected_costs,
    runway_months,
    burn_rate,
    break_even_month,
    pnl,
    cash_balance_end,
    viability_warnings,
    promotion_gate,
    llmFallbackCount,
    fourBuckets, usage,
  };
}


export { MIN_PROJECTION_MONTHS };
