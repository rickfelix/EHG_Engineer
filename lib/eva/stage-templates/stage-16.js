/**
 * Stage 16 Template - Financial Projections
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Financial projections with revenue/cost data, runway calculation,
 * burn rate, break-even analysis, P&L, cash balance, viability
 * warnings, and Phase 4→5 Promotion Gate.
 *
 * Promotion gate pass requires:
 *   - Stage 13: >= 3 milestones with deliverables, kill gate passed
 *   - Stage 14: all 5 layers defined (presentation, api, business_logic, data, infrastructure)
 *   - Stage 15: >= 1 risk with severity, priority, and mitigation plan
 *   - Stage 16: positive runway and defined projections
 *
 * @module lib/eva/stage-templates/stage-16
 */

import { validateNumber, validateArray, collectErrors } from './validation.js';
import { analyzeStage16 } from './analysis-steps/stage-16-financial-projections.js';
import { MIN_MILESTONES } from './stage-13.js';
import { REQUIRED_LAYERS } from './stage-14.js';
import { MIN_RISKS } from './stage-15.js';

const MIN_PROJECTION_MONTHS = 6;

const TEMPLATE = {
  id: 'stage-16',
  slug: 'financial-projections',
  title: 'Financial Projections',
  version: '3.0.0',
  schema: {
    initial_capital: { type: 'number', min: 0, required: true },
    monthly_burn_rate: { type: 'number', min: 0, required: true },
    revenue_projections: {
      type: 'array',
      minItems: MIN_PROJECTION_MONTHS,
      items: {
        month: { type: 'number', min: 1, required: true },
        revenue: { type: 'number', min: 0, required: true },
        costs: { type: 'number', min: 0, required: true },
        cost_breakdown: {
          type: 'object',
          properties: {
            personnel: { type: 'number', min: 0 },
            infrastructure: { type: 'number', min: 0 },
            marketing: { type: 'number', min: 0 },
            other: { type: 'number', min: 0 },
          },
        },
      },
    },
    funding_rounds: {
      type: 'array',
      items: {
        round_name: { type: 'string', required: true },
        target_amount: { type: 'number', min: 0, required: true },
        target_date: { type: 'string', required: true },
      },
    },
    // Derived
    runway_months: { type: 'number', derived: true },
    burn_rate: { type: 'number', derived: true },
    break_even_month: { type: 'number', nullable: true, derived: true },
    total_projected_revenue: { type: 'number', derived: true },
    total_projected_costs: { type: 'number', derived: true },
    pnl: { type: 'object', derived: true },
    cashBalanceEnd: { type: 'array', derived: true },
    viabilityWarnings: { type: 'array', derived: true },
    promotion_gate: { type: 'object', derived: true },
  },
  defaultData: {
    initial_capital: 0,
    monthly_burn_rate: 0,
    revenue_projections: [],
    funding_rounds: [],
    runway_months: 0,
    burn_rate: 0,
    break_even_month: null,
    total_projected_revenue: 0,
    total_projected_costs: 0,
    pnl: null,
    cashBalanceEnd: [],
    viabilityWarnings: [],
    promotion_gate: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const capitalCheck = validateNumber(data?.initial_capital, 'initial_capital', 0);
    if (!capitalCheck.valid) errors.push(capitalCheck.error);

    const burnCheck = validateNumber(data?.monthly_burn_rate, 'monthly_burn_rate', 0);
    if (!burnCheck.valid) errors.push(burnCheck.error);

    // Revenue projections
    const projCheck = validateArray(data?.revenue_projections, 'revenue_projections', MIN_PROJECTION_MONTHS);
    if (!projCheck.valid) {
      errors.push(projCheck.error);
    } else {
      for (let i = 0; i < data.revenue_projections.length; i++) {
        const rp = data.revenue_projections[i];
        const prefix = `revenue_projections[${i}]`;
        const results = [
          validateNumber(rp?.month, `${prefix}.month`, 1),
          validateNumber(rp?.revenue, `${prefix}.revenue`, 0),
          validateNumber(rp?.costs, `${prefix}.costs`, 0),
        ];
        errors.push(...collectErrors(results));

        // cost_breakdown is optional but validate structure if present
        if (rp?.cost_breakdown && typeof rp.cost_breakdown === 'object') {
          for (const key of ['personnel', 'infrastructure', 'marketing', 'other']) {
            if (rp.cost_breakdown[key] !== undefined) {
              const cbCheck = validateNumber(rp.cost_breakdown[key], `${prefix}.cost_breakdown.${key}`, 0);
              if (!cbCheck.valid) errors.push(cbCheck.error);
            }
          }
        }
      }
    }

    // Funding rounds (optional but validate if present)
    if (data?.funding_rounds && Array.isArray(data.funding_rounds)) {
      for (let i = 0; i < data.funding_rounds.length; i++) {
        const fr = data.funding_rounds[i];
        const prefix = `funding_rounds[${i}]`;
        if (!fr?.round_name || typeof fr.round_name !== 'string') {
          errors.push(`${prefix}.round_name is required`);
        }
        const amtCheck = validateNumber(fr?.target_amount, `${prefix}.target_amount`, 0);
        if (!amtCheck.valid) errors.push(amtCheck.error);
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: runway, burn rate, break-even, P&L, cash balance,
   * viability warnings, and promotion gate.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage13, stage14, stage15 }
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, prerequisites) {
    const burn_rate = data.monthly_burn_rate;
    const runway_months = burn_rate > 0
      ? Math.round((data.initial_capital / burn_rate) * 100) / 100
      : data.initial_capital > 0 ? Infinity : 0;

    // Find break-even month (first month where cumulative profit >= 0)
    let cumulative = -data.initial_capital;
    let break_even_month = null;
    for (const rp of data.revenue_projections) {
      cumulative += (rp.revenue - rp.costs);
      if (cumulative >= 0 && break_even_month === null) {
        break_even_month = rp.month;
      }
    }

    const total_projected_revenue = data.revenue_projections.reduce(
      (sum, rp) => sum + rp.revenue, 0,
    );
    const total_projected_costs = data.revenue_projections.reduce(
      (sum, rp) => sum + rp.costs, 0,
    );

    // P&L statement
    const pnl = {
      grossRevenue: total_projected_revenue,
      totalCosts: total_projected_costs,
      netIncome: total_projected_revenue - total_projected_costs,
      margin: total_projected_revenue > 0
        ? Math.round(((total_projected_revenue - total_projected_costs) / total_projected_revenue) * 10000) / 100
        : 0,
    };

    // Running cash balance per month
    let runningBalance = data.initial_capital;
    const cashBalanceEnd = data.revenue_projections.map(rp => {
      runningBalance += (rp.revenue - rp.costs);
      return { month: rp.month, balance: Math.round(runningBalance * 100) / 100 };
    });

    // Viability warnings
    const viabilityWarnings = [];

    // Warn if burn > revenue for 3+ consecutive months
    let consecutiveLoss = 0;
    for (const rp of data.revenue_projections) {
      if (rp.costs > rp.revenue) {
        consecutiveLoss++;
        if (consecutiveLoss >= 3) {
          viabilityWarnings.push(`Costs exceed revenue for ${consecutiveLoss} consecutive months (month ${rp.month - consecutiveLoss + 1} to ${rp.month})`);
          break;
        }
      } else {
        consecutiveLoss = 0;
      }
    }

    // Warn if runway < 6 months
    if (runway_months !== Infinity && runway_months < 6) {
      viabilityWarnings.push(`Short runway: ${runway_months} months (recommended: >= 6)`);
    }

    // Warn if no break-even within projection period
    if (break_even_month === null && data.revenue_projections.length > 0) {
      viabilityWarnings.push(`No break-even within ${data.revenue_projections.length}-month projection period`);
    }

    // Warn if cash balance goes negative
    const negativeMonth = cashBalanceEnd.find(cb => cb.balance < 0);
    if (negativeMonth) {
      viabilityWarnings.push(`Cash balance goes negative in month ${negativeMonth.month}`);
    }

    const promotion_gate = prerequisites
      ? evaluatePromotionGate({ ...prerequisites, stage16: data })
      : { pass: false, rationale: 'Prerequisites not provided', blockers: ['Stage 13-15 data required'], required_next_actions: ['Complete stages 13-15 before evaluating promotion gate'] };

    return {
      ...data,
      runway_months,
      burn_rate,
      break_even_month,
      total_projected_revenue,
      total_projected_costs,
      pnl,
      cashBalanceEnd,
      viabilityWarnings,
      promotion_gate,
    };
  },
};

/**
 * Pure function: evaluate Phase 4→5 Promotion Gate.
 *
 * Pass requires:
 *   - Stage 13: >= 3 milestones, kill gate passed (decision !== 'kill')
 *   - Stage 14: all 5 required layers defined
 *   - Stage 15: >= 1 risk with severity, priority, and mitigation plan
 *   - Stage 16: initial_capital > 0, revenue_projections defined
 *
 * @param {{ stage13: Object, stage14: Object, stage15: Object, stage16: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[] }}
 */
export function evaluatePromotionGate({ stage13, stage14, stage15, stage16 }) {
  const blockers = [];
  const required_next_actions = [];

  // Stage 13: milestones and kill gate
  const milestoneCount = stage13?.milestones?.length || 0;
  if (milestoneCount < MIN_MILESTONES) {
    blockers.push(`Product roadmap has ${milestoneCount} milestone(s), minimum ${MIN_MILESTONES} required`);
    required_next_actions.push(`Add ${MIN_MILESTONES - milestoneCount} more milestones to the product roadmap`);
  }
  if (stage13?.decision === 'kill') {
    blockers.push('Product roadmap kill gate triggered - roadmap is incomplete');
    required_next_actions.push('Resolve kill gate reasons in Stage 13 before promotion');
  }

  // Stage 14: all 5 layers defined
  for (const layer of REQUIRED_LAYERS) {
    if (!stage14?.layers?.[layer]) {
      blockers.push(`Technical architecture missing '${layer}' layer`);
      required_next_actions.push(`Define the '${layer}' layer with technology, components, and rationale`);
    }
  }

  // Stage 15: risk register
  const riskCount = stage15?.risks?.length || 0;
  if (riskCount < MIN_RISKS) {
    blockers.push(`Risk register has ${riskCount} risk(s), minimum ${MIN_RISKS} required`);
    required_next_actions.push(`Identify at least ${MIN_RISKS} risk(s) with severity, priority, and mitigation plans`);
  }

  // Stage 16: financial data
  if (!stage16?.initial_capital || stage16.initial_capital <= 0) {
    blockers.push('Financial projections have no initial capital');
    required_next_actions.push('Set initial_capital to a positive value');
  }
  const projCount = stage16?.revenue_projections?.length || 0;
  if (projCount < MIN_PROJECTION_MONTHS) {
    blockers.push(`Financial projections have ${projCount} month(s), minimum ${MIN_PROJECTION_MONTHS} required`);
    required_next_actions.push(`Add projections for at least ${MIN_PROJECTION_MONTHS} months`);
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? 'All Phase 4 prerequisites met. Blueprint planning is complete with roadmap, architecture, resources, and financials.'
    : `Phase 4 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, required_next_actions };
}

TEMPLATE.analysisStep = analyzeStage16;

export { MIN_PROJECTION_MONTHS };
export default TEMPLATE;
