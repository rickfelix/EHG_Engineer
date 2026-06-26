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
// SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001: ground cost assumptions in EHG's
// operating model (zero human payroll, AI-ops cost, venture-hosting-standard, organic-first GTM,
// solo $0-salary founder) instead of generic SaaS defaults that overstate burn 8-50x.
import { getOperatingModelPromptBlock, groundCostBreakdown, OPERATING_MODEL } from '../../standards/operating-model.js';

// NOTE: MIN_PROJECTION_MONTHS intentionally duplicated from stage-16.js
// to avoid circular dependency — stage-16.js imports analyzeStage16 from this file,
// and SYSTEM_PROMPT uses this constant at module-level evaluation.
const MIN_PROJECTION_MONTHS = 6;

const SYSTEM_PROMPT = `You are EVA's Financial Projections Engine. Generate structured financial projections for a venture.

You MUST output valid JSON with exactly this structure:
{
  "initial_capital": 5000,
  "monthly_burn_rate": 40,
  "revenue_projections": [
    {
      "month": 1,
      "revenue": 0,
      "costs": 37,
      "cost_breakdown": {
        "ai_operations": 5,
        "infrastructure": 30,
        "marketing": 0,
        "other": 2,
        "founder_salary": 0
      }
    },
    {
      "month": 2,
      "revenue": 500,
      "costs": 60,
      "cost_breakdown": {
        "ai_operations": 8,
        "infrastructure": 35,
        "marketing": 0,
        "other": 17,
        "founder_salary": 0
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
- Each projection MUST include cost_breakdown with: ai_operations, infrastructure, marketing, other, founder_salary
- cost_breakdown values must be >= 0 and should sum to approximately the total costs
- Revenue should start low and grow based on the market/product
- GROUND ALL COSTS IN THE EHG OPERATING MODEL BELOW (do NOT use generic SaaS payroll/hosting/ads numbers)
- ai_operations replaces human "personnel": there is NO human payroll — only variable LLM/compute cost
- founder_salary is $0 (solo founder, sweat equity) in early stages
- Infrastructure is the venture-hosting-standard stack (~$25-85/mo), NOT generic $1.5-5.5k
- Marketing is organic-first (~$0-200/mo), NOT paid-ad-led
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

${getOperatingModelPromptBlock()}

Output ONLY valid JSON.`;

  // FR-5: inject the EHG operating model as a first-class context block consumed for every venture.
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

    // Normalize cost_breakdown — SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001:
    // canonical key is ai_operations (NOT human "personnel"); add an explicit founder_salary line.
    // Each line is tagged with provenance (DERIVED-from-operating-model vs ESTIMATE).
    const cb = rp.cost_breakdown;
    if (cb && typeof cb === 'object') {
      // Accept the canonical ai_operations or the legacy personnel key (back-compat).
      const aiOps = cb.ai_operations !== undefined ? cb.ai_operations : cb.personnel;
      projection.cost_breakdown = {
        ai_operations: Math.max(0, Number(aiOps) || 0),
        infrastructure: Math.max(0, Number(cb.infrastructure) || 0),
        marketing: Math.max(0, Number(cb.marketing) || 0),
        other: Math.max(0, Number(cb.other) || 0),
        founder_salary: Math.max(0, Number(cb.founder_salary) || 0),
      };
      projection.cost_breakdown_provenance = {
        ai_operations: OPERATING_MODEL.ai_operations.provenance,
        infrastructure: OPERATING_MODEL.hosting.provenance,
        marketing: OPERATING_MODEL.marketing.provenance,
        other: OPERATING_MODEL.other.provenance,
        founder_salary: OPERATING_MODEL.founder_salary.provenance,
        _note: 'LLM-provided figures grounded against the EHG operating model (ESTIMATE refined toward DERIVED).',
      };
    } else if (costs > 0) {
      // FR-1..FR-4 fallback: ground the breakdown in the EHG operating model instead of the
      // generic 60/20/10/10 split (which assumed human payroll dominance).
      const grounded = groundCostBreakdown({ month: projection.month, revenue: projection.revenue });
      projection.cost_breakdown = grounded.breakdown;
      projection.cost_breakdown_provenance = grounded.provenance;
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
  const net_total = total_projected_revenue - total_projected_costs;
  const burn_rate = monthly_burn_rate;

  // Running cash balance — computed BEFORE runway because runway is derived from this trough (FR-1).
  // SD-LEO-INFRA-AI-FINANCIAL-RIGOR-CONTROLS-001 also tracks the deepest trough for bottom-up capital sizing (FR-3).
  let runningBalance = initial_capital;
  let minRunningBalance = initial_capital;
  const cash_balance_end = revenue_projections.map(rp => {
    runningBalance += (rp.revenue - rp.costs);
    if (runningBalance < minRunningBalance) minRunningBalance = runningBalance;
    return { month: rp.month, balance: Math.round(runningBalance * 100) / 100 };
  });
  const negativeMonth = cash_balance_end.find(cb => cb.balance < 0);

  // FR-1: runway from the cash-balance TROUGH, not the flat initial_capital/monthly_burn_rate (which
  // ignored revenue AND the growing burn). Runway = the count of leading months whose running cash
  // balance stays >= 0 (i.e. months you can operate before insolvency). If the balance never goes
  // negative, runway >= the projection length — Infinity only when net burn over the period is non-negative.
  let runway_months;
  if (revenue_projections.length === 0) {
    runway_months = burn_rate > 0 ? Math.round((initial_capital / burn_rate) * 100) / 100 : (initial_capital > 0 ? Infinity : 0);
  } else if (negativeMonth) {
    let positiveMonths = 0;
    for (const cb of cash_balance_end) { if (cb.balance >= 0) positiveMonths++; else break; }
    runway_months = positiveMonths;
  } else {
    runway_months = net_total >= 0 ? Infinity : revenue_projections.length;
  }

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

  // FR-3: bottom-up capital sizing. The capital needed to keep the running balance >= 0 across the
  // projection covers the deepest cumulative deficit: required = initial_capital - min(trough) when the
  // trough dipped below 0. DERIVED + surfaced — NOT silently overwriting the LLM's initial_capital.
  const recommended_initial_capital = minRunningBalance < 0
    ? Math.round((initial_capital - minRunningBalance) * 100) / 100
    : initial_capital;
  const UNDERCAP_RATIO = 0.9;
  const under_capitalized = recommended_initial_capital > 0 && initial_capital < recommended_initial_capital * UNDERCAP_RATIO;

  // FR-2: deterministic symbolic cross-checks — REJECT + flag (never silently auto-correct a mismatch).
  const COST_SUM_ABS_TOL = 1;       // currency rounding tolerance
  const COST_SUM_REL_TOL = 0.01;    // 1% relative tolerance
  const validation_errors = [];
  for (const rp of revenue_projections) {
    if (rp.cost_breakdown && typeof rp.cost_breakdown === 'object') {
      const cb = rp.cost_breakdown;
      // SD-LEO-INFRA-S16-OPERATING-MODEL-COST-GROUNDING-001: sum the grounded keys
      // (ai_operations + founder_salary), tolerating the legacy personnel key for back-compat.
      const sum = (cb.ai_operations || cb.personnel || 0) + (cb.founder_salary || 0)
        + (cb.infrastructure || 0) + (cb.marketing || 0) + (cb.other || 0);
      const tol = COST_SUM_ABS_TOL + Math.abs(rp.costs) * COST_SUM_REL_TOL;
      if (Math.abs(sum - rp.costs) > tol) {
        validation_errors.push(`Month ${rp.month}: cost_breakdown components sum to ${Math.round(sum)} but costs=${Math.round(rp.costs)} (must reconcile)`);
      }
    }
  }
  if (Math.round(pnl.netIncome) !== Math.round(pnl.grossRevenue - pnl.totalCosts)) {
    validation_errors.push(`P&L identity broken: netIncome ${pnl.netIncome} != grossRevenue - totalCosts (${pnl.grossRevenue - pnl.totalCosts})`);
  }
  if (cash_balance_end.length > 0) {
    const expectedLast = Math.round((initial_capital + net_total) * 100) / 100;
    const actualLast = cash_balance_end[cash_balance_end.length - 1].balance;
    if (Math.abs(actualLast - expectedLast) > COST_SUM_ABS_TOL) {
      validation_errors.push(`Cash identity broken: ending balance ${actualLast} != initial_capital + net (${expectedLast})`);
    }
  }
  const financials_valid = validation_errors.length === 0;

  // Viability warnings (re-derived against the corrected runway + the new rigor signals)
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
  if (negativeMonth) {
    viability_warnings.push(`Cash balance goes negative in month ${negativeMonth.month}`);
  }
  if (under_capitalized) {
    viability_warnings.push(`Under-capitalized: initial_capital ${initial_capital} is below the bottom-up recommended ${recommended_initial_capital} needed to fund the cash trough`);
  }
  if (!financials_valid) {
    viability_warnings.push(`Financial cross-check FAILED (${validation_errors.length} error(s)) — financials are not internally consistent`);
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
    // SD-LEO-INFRA-AI-FINANCIAL-RIGOR-CONTROLS-001 (FR-3): rigor signals the deferred evidence-gate child consumes.
    recommended_initial_capital,
    under_capitalized,
    validation_errors,
    financials_valid,
    viability_warnings,
    promotion_gate,
    llmFallbackCount,
    fourBuckets, usage,
  };
}


export { MIN_PROJECTION_MONTHS };
