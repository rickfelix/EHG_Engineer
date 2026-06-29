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
import { getOperatingModelPromptBlock, groundCostBreakdown, groundRevenue, OPERATING_MODEL, PROVENANCE } from '../../standards/operating-model.js';

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
 * @param {Object} [params.stage7Economics] - SD-...-GROUNDING-EVIDENCE-GATE-001 FR-A: ratified S7 unit-economics
 * @returns {Promise<Object>} Financial projections
 */

/**
 * FR-A: normalize the threaded S7 economics into a verified-inputs block, or null when absent/invalid.
 * A valid block requires the load-bearing facts (cac, arpa) to be finite positive numbers.
 */
export function buildVerifiedInputs(stage7Economics) {
  const e = stage7Economics;
  if (!e || typeof e !== 'object') return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const cac = num(e.cac);
  const arpa = num(e.arpa);
  if (!(cac > 0) || !(arpa > 0)) return null; // not groundable without the core unit economics
  return {
    cac,
    arpa,
    churn_rate_monthly: num(e.churn_rate_monthly),
    gross_margin_pct: num(e.gross_margin_pct),
    ltv: num(e.ltv),
    tiers: Array.isArray(e.tiers) ? e.tiers : null,
    source: 'engine_pricing_model (S7)',
  };
}

/**
 * FR-A/FR-B: register the verified inputs as FACT classifications in fourBuckets (so summary.facts > 0)
 * and compute DERIVED grounded figures (LTV, LTV:CAC, monthly gross profit per customer). PURE-ish
 * (mutates the passed fourBuckets). Returns the derived economics for the artifact.
 */
export function groundVerifiedFacts(fourBuckets, vi) {
  if (!fourBuckets || typeof fourBuckets !== 'object') return null;
  if (!Array.isArray(fourBuckets.classifications)) fourBuckets.classifications = [];
  if (!fourBuckets.summary) fourBuckets.summary = { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 };
  const addFact = (claim, evidence) => {
    fourBuckets.classifications.push({ claim, bucket: 'fact', evidence });
    fourBuckets.summary.facts = (fourBuckets.summary.facts || 0) + 1;
  };
  addFact(`CAC = $${vi.cac}`, 'ratified S7 unit-economics (engine_pricing_model)');
  addFact(`ARPA = $${vi.arpa}/mo`, 'ratified S7 unit-economics (engine_pricing_model)');
  if (vi.churn_rate_monthly != null) addFact(`Monthly churn = ${vi.churn_rate_monthly}%`, 'ratified S7 unit-economics');
  if (vi.gross_margin_pct != null) addFact(`Gross margin = ${vi.gross_margin_pct}%`, 'ratified S7 unit-economics');
  // DERIVED (FR-B = DERIVED): LTV = ARPA*margin / churn (monthly), LTV:CAC, monthly gross profit/customer.
  const marginFrac = vi.gross_margin_pct != null ? vi.gross_margin_pct / 100 : null;
  const churnFrac = vi.churn_rate_monthly != null ? vi.churn_rate_monthly / 100 : null;
  const monthly_gross_profit_per_customer = marginFrac != null ? Math.round(vi.arpa * marginFrac * 100) / 100 : null;
  const ltv_derived = (marginFrac != null && churnFrac > 0)
    ? Math.round((vi.arpa * marginFrac / churnFrac) * 100) / 100
    : (vi.ltv ?? null);
  const ltv_cac_ratio = (ltv_derived != null && vi.cac > 0) ? Math.round((ltv_derived / vi.cac) * 100) / 100 : null;
  return { monthly_gross_profit_per_customer, ltv_derived, ltv_cac_ratio };
}

export async function analyzeStage16({ stage1Data, stage7Data, stage13Data, stage14Data, stage15Data, stage7Economics, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage16] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 16 financial projections requires Stage 1 data with description');
  }

  // SD-LEO-INFRA-S16-FINANCIAL-GROUNDING-EVIDENCE-GATE-001 FR-A: GROUND the financials in the ratified
  // upstream S7 unit-economics (engine_pricing_model artifact, threaded via onBeforeAnalysis). These are
  // VERIFIED FACTS — the producer must TRANSFORM/aggregate them, not invent different unit economics.
  const verifiedInputs = buildVerifiedInputs(stage7Economics);

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

  // FR-A: a VERIFIED-INPUTS block the producer must transform, not override.
  const economicsContext = verifiedInputs
    ? `VERIFIED UNIT-ECONOMICS (RATIFIED — from the upstream S7 pricing strategy; these are FACTS you MUST use, not invent):
- CAC (customer acquisition cost): $${verifiedInputs.cac}
- ARPA (avg revenue per account / month): $${verifiedInputs.arpa}
- Monthly churn: ${verifiedInputs.churn_rate_monthly}%
- Gross margin: ${verifiedInputs.gross_margin_pct}%${verifiedInputs.ltv != null ? `\n- LTV: $${verifiedInputs.ltv}` : ''}${Array.isArray(verifiedInputs.tiers) && verifiedInputs.tiers.length ? `\n- Pricing tiers: ${verifiedInputs.tiers.map(t => `${t.name || t.target_segment || 'tier'} $${t.price}`).join(', ')}` : ''}
CONSTRAINT: derive revenue from ARPA × the customer count you project; derive acquisition costs from CAC × new customers; apply the ${verifiedInputs.churn_rate_monthly}% monthly churn to retention and the ${verifiedInputs.gross_margin_pct}% gross margin. Do NOT introduce different unit economics from memory. Only the customer-GROWTH trajectory and operating-expense lines are yours to estimate.`
    : 'No verified upstream unit-economics available — estimate conservatively and flag as simulation.';

  const userPrompt = `Generate financial projections for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket || 'N/A')}
Problem: ${sanitizeForPrompt(stage1Data.problemStatement || 'N/A')}

${roadmapContext}
${archContext}
${riskContext}

${getOperatingModelPromptBlock()}
${economicsContext}

Output ONLY valid JSON.`;

  // FR-5: inject the EHG operating model as a first-class context block consumed for every venture.
  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // FR-A: deterministically register the VERIFIED upstream economics as FACT classifications so a
  // grounded S16 has fourBuckets.summary.facts > 0 — the (merged) evidence-gate then treats it as
  // grounded instead of all-simulation. Without verified inputs, facts stay LLM-derived (likely 0).
  const derivedEconomics = verifiedInputs ? groundVerifiedFacts(fourBuckets, verifiedInputs) : null;

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

  // SD-LEO-INFRA-S16-REVENUE-GROUNDING-001: carry the grounded customer count forward month-to-month
  // so the S7-derived revenue follows a continuous adoption ramp instead of independent per-month guesses.
  let priorCustomers = 0;
  const revenue_projections = parsed.revenue_projections.map((rp, i) => {
    const costs = Math.max(0, Number(rp.costs) || 0);
    const projection = {
      month: Number(rp.month) || (i + 1),
      revenue: Math.max(0, Number(rp.revenue) || 0),
      costs,
    };

    // SD-LEO-INFRA-S16-REVENUE-GROUNDING-001: ground REVENUE in the S7 unit-economics (price DERIVED
    // from the ratified S7 arpa; volume an explicit ESTIMATE) instead of accepting raw LLM-invented
    // revenue. groundRevenue returns null when S7 has no usable arpa → keep the LLM revenue but tag it
    // ESTIMATE (graceful degradation — never fabricate a DERIVED price).
    const groundedRevenue = groundRevenue({ s7economics: stage7Data, month: projection.month, priorCustomers });
    if (groundedRevenue) {
      projection.revenue = groundedRevenue.revenue;
      projection.customers = groundedRevenue.customers;
      projection.revenue_provenance = groundedRevenue.provenance;
      priorCustomers = groundedRevenue.customers;
    } else {
      projection.revenue_provenance = { price: PROVENANCE.ESTIMATE, volume: PROVENANCE.ESTIMATE };
    }

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
  // SD-LEO-INFRA-S16-PROFITABLE-RUNWAY-CONTRACT-001: profitable ventures emit null+runway_unbounded=true
  // instead of Infinity — Infinity silently becomes null in JSON.stringify, losing the signal.
  let runway_months;
  let runway_unbounded = false;
  if (revenue_projections.length === 0) {
    if (burn_rate > 0) {
      runway_months = Math.round((initial_capital / burn_rate) * 100) / 100;
    } else if (initial_capital > 0) {
      runway_months = null;
      runway_unbounded = true;
    } else {
      runway_months = 0;
    }
  } else if (negativeMonth) {
    let positiveMonths = 0;
    for (const cb of cash_balance_end) { if (cb.balance >= 0) positiveMonths++; else break; }
    runway_months = positiveMonths;
  } else if (net_total >= 0) {
    runway_months = null;
    runway_unbounded = true;
  } else {
    runway_months = revenue_projections.length;
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
  if (!runway_unbounded && runway_months !== null && runway_months < 6) {
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
    runway_unbounded,
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
    // SD-...-GROUNDING-EVIDENCE-GATE-001 FR-A/FR-B: grounding provenance.
    verified_inputs: verifiedInputs,                 // the ratified S7 facts the producer transformed
    grounded: Boolean(verifiedInputs),               // true when financials are grounded in real economics
    grounding_source: verifiedInputs ? verifiedInputs.source : null,
    derived_economics: derivedEconomics,             // DERIVED grounded figures (LTV, LTV:CAC, gross profit/customer)
    epistemic_tags: {                                // FR-B: epistemic status of the key figure classes
      cac: verifiedInputs ? 'FACT' : 'ESTIMATE',
      arpa: verifiedInputs ? 'FACT' : 'ESTIMATE',
      churn_rate_monthly: verifiedInputs && verifiedInputs.churn_rate_monthly != null ? 'FACT' : 'ESTIMATE',
      gross_margin_pct: verifiedInputs && verifiedInputs.gross_margin_pct != null ? 'FACT' : 'ESTIMATE',
      ltv: derivedEconomics && derivedEconomics.ltv_derived != null ? 'DERIVED' : 'ESTIMATE',
      revenue_projections: 'ESTIMATE',               // customer-growth trajectory is the producer's estimate
      recommended_initial_capital: 'DERIVED',        // bottom-up from the (grounded) cash trough
    },
    llmFallbackCount,
    fourBuckets, usage,
  };
}


export { MIN_PROJECTION_MONTHS };
