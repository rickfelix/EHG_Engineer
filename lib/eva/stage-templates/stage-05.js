/**
 * Stage 05 Template - Profitability Kill Gate
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Financial model with unit economics, scenario analysis, and banded ROI gate:
 *   PASS:             roi3y ≥ 0.25 AND breakEvenMonth ≤ 24 AND ltvCacRatio ≥ 2 AND paybackMonths ≤ 18
 *   CONDITIONAL_PASS: 0.15 ≤ roi3y < 0.25 AND ltvCacRatio ≥ 3 AND paybackMonths ≤ 12 → Chairman Review
 *   KILL:             roi3y < 0.15 OR breakEvenMonth > 24 OR breakEvenMonth === null
 *
 * Cross-stage contracts:
 *   ← Stage 4: stage5Handoff (pricingLandscape, competitivePositioning, marketGaps)
 *   ← Stage 3: market validation metrics, competitiveBarrier score
 *   ← Stage 1: archetype, targetMarket
 *   → Stage 6: unit economics (cac, ltv, churnRate)
 *   → Stage 9: financial profile (projections, unitEconomics, scenarioAnalysis)
 *   → Stage 16: projection baseline for financial tracking
 *
 * @module lib/eva/stage-templates/stage-05
 */

import { validateNumber, validateString, collectErrors, validateCrossStageContract } from './validation.js';
import { analyzeStage05 } from './analysis-steps/stage-05-financial-model.js';

// Banded ROI thresholds (architecture spec)
const ROI_PASS_THRESHOLD = 0.25;
const ROI_CONDITIONAL_THRESHOLD = 0.15;
const MAX_BREAKEVEN_MONTHS = 24;
const LTV_CAC_THRESHOLD = 2;
const PAYBACK_THRESHOLD = 18;
// Conditional pass supplementary thresholds
const CONDITIONAL_LTV_CAC_THRESHOLD = 3;
const CONDITIONAL_PAYBACK_THRESHOLD = 12;

const ROBUSTNESS_LEVELS = ['fragile', 'normal', 'resilient'];

const TEMPLATE = {
  id: 'stage-05',
  slug: 'profitability',
  title: 'Profitability Kill Gate',
  version: '2.0.0',
  schema: {
    initialInvestment: { type: 'number', min: 0.01, required: true },
    year1: {
      revenue: { type: 'number', min: 0, required: true },
      cogs: { type: 'number', min: 0, required: true },
      opex: { type: 'number', min: 0, required: true },
    },
    year2: {
      revenue: { type: 'number', min: 0, required: true },
      cogs: { type: 'number', min: 0, required: true },
      opex: { type: 'number', min: 0, required: true },
    },
    year3: {
      revenue: { type: 'number', min: 0, required: true },
      cogs: { type: 'number', min: 0, required: true },
      opex: { type: 'number', min: 0, required: true },
    },
    // Unit economics
    unitEconomics: {
      type: 'object',
      required: true,
      properties: {
        cac: { type: 'number', min: 0, required: true },
        ltv: { type: 'number', min: 0, required: true },
        ltvCacRatio: { type: 'number', derived: true },
        churnRate: { type: 'number', min: 0, max: 1, required: true },
        paybackMonths: { type: 'number', min: 0, required: true },
        grossMargin: { type: 'number', min: 0, max: 1, required: true },
      },
    },
    // Scenario analysis
    scenarioAnalysis: {
      type: 'object',
      required: false,
      properties: {
        pessimisticMultiplier: { type: 'number' },
        optimisticMultiplier: { type: 'number' },
        robustness: { type: 'enum', values: ROBUSTNESS_LEVELS },
      },
    },
    // Documented assumptions
    assumptions: {
      type: 'object',
      required: false,
    },
    // Stage 4 context carried forward
    stage4Context: {
      type: 'object',
      required: false,
    },
    // Derived fields
    grossProfitY1: { type: 'number', derived: true },
    grossProfitY2: { type: 'number', derived: true },
    grossProfitY3: { type: 'number', derived: true },
    netProfitY1: { type: 'number', derived: true },
    netProfitY2: { type: 'number', derived: true },
    netProfitY3: { type: 'number', derived: true },
    breakEvenMonth: { type: 'number', nullable: true, derived: true },
    roi3y: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'conditional_pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
    remediationRoute: { type: 'string', derived: true },
  },
  defaultData: {
    initialInvestment: null,
    year1: { revenue: 0, cogs: 0, opex: 0 },
    year2: { revenue: 0, cogs: 0, opex: 0 },
    year3: { revenue: 0, cogs: 0, opex: 0 },
    unitEconomics: { cac: 0, ltv: 0, ltvCacRatio: null, churnRate: 0, paybackMonths: 0, grossMargin: 0 },
    scenarioAnalysis: null,
    assumptions: null,
    stage4Context: null,
    grossProfitY1: null,
    grossProfitY2: null,
    grossProfitY3: null,
    netProfitY1: null,
    netProfitY2: null,
    netProfitY3: null,
    breakEvenMonth: null,
    roi3y: null,
    decision: null,
    blockProgression: false,
    reasons: [],
    remediationRoute: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites) {
    const errors = [];

    // Cross-stage contract: validate stage-04 outputs if provided
    if (prerequisites?.stage04) {
      const contract = {
        stage5Handoff: { type: 'object' },
      };
      const crossCheck = validateCrossStageContract(prerequisites.stage04, contract, 'stage-04');
      errors.push(...crossCheck.errors);
    }

    // initialInvestment must be > 0
    const investCheck = validateNumber(data?.initialInvestment, 'initialInvestment', 0.01);
    if (!investCheck.valid) errors.push(investCheck.error);

    for (const yearKey of ['year1', 'year2', 'year3']) {
      const year = data?.[yearKey];
      if (!year || typeof year !== 'object') {
        errors.push(`${yearKey} is required and must be an object`);
        continue;
      }
      const results = [
        validateNumber(year.revenue, `${yearKey}.revenue`, 0),
        validateNumber(year.cogs, `${yearKey}.cogs`, 0),
        validateNumber(year.opex, `${yearKey}.opex`, 0),
      ];
      errors.push(...collectErrors(results));
    }

    // Unit economics validation
    if (!data?.unitEconomics || typeof data.unitEconomics !== 'object') {
      errors.push('unitEconomics is required and must be an object');
    } else {
      const ue = data.unitEconomics;
      const ueResults = [
        validateNumber(ue.cac, 'unitEconomics.cac', 0),
        validateNumber(ue.ltv, 'unitEconomics.ltv', 0),
        validateNumber(ue.churnRate, 'unitEconomics.churnRate', 0),
        validateNumber(ue.paybackMonths, 'unitEconomics.paybackMonths', 0),
        validateNumber(ue.grossMargin, 'unitEconomics.grossMargin', 0),
      ];
      errors.push(...collectErrors(ueResults));

      // churnRate and grossMargin must be 0-1
      if (typeof ue.churnRate === 'number' && (ue.churnRate < 0 || ue.churnRate > 1)) {
        errors.push('unitEconomics.churnRate must be between 0 and 1');
      }
      if (typeof ue.grossMargin === 'number' && (ue.grossMargin < 0 || ue.grossMargin > 1)) {
        errors.push('unitEconomics.grossMargin must be between 0 and 1');
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: profit, break-even, ROI, unit economics, kill gate.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with all derived fields
   */
  computeDerived(data) {
    const grossProfitY1 = data.year1.revenue - data.year1.cogs;
    const grossProfitY2 = data.year2.revenue - data.year2.cogs;
    const grossProfitY3 = data.year3.revenue - data.year3.cogs;

    const netProfitY1 = grossProfitY1 - data.year1.opex;
    const netProfitY2 = grossProfitY2 - data.year2.opex;
    const netProfitY3 = grossProfitY3 - data.year3.opex;

    const totalNetProfit = netProfitY1 + netProfitY2 + netProfitY3;
    const roi3y = (totalNetProfit - data.initialInvestment) / data.initialInvestment;

    // Break-even: monthly net profit from Y1
    const monthlyNetProfit = netProfitY1 / 12;
    let breakEvenMonth = null;
    if (monthlyNetProfit > 0) {
      breakEvenMonth = Math.ceil(data.initialInvestment / monthlyNetProfit);
    }

    // Compute LTV/CAC ratio
    const ue = data.unitEconomics || {};
    const ltvCacRatio = ue.cac > 0 ? ue.ltv / ue.cac : null;

    const updatedUnitEconomics = {
      ...ue,
      ltvCacRatio,
    };

    const { decision, blockProgression, reasons, remediationRoute } = evaluateKillGate({
      roi3y,
      breakEvenMonth,
      ltvCacRatio,
      paybackMonths: ue.paybackMonths,
    });

    return {
      ...data,
      grossProfitY1,
      grossProfitY2,
      grossProfitY3,
      netProfitY1,
      netProfitY2,
      netProfitY3,
      breakEvenMonth,
      roi3y,
      unitEconomics: updatedUnitEconomics,
      decision,
      blockProgression,
      reasons,
      remediationRoute,
    };
  },
};

/**
 * Pure function: evaluate banded kill gate for Stage 05.
 *
 * PASS:             roi3y ≥ 0.25 AND breakEvenMonth ≤ 24 AND ltvCacRatio ≥ 2 AND paybackMonths ≤ 18
 * CONDITIONAL_PASS: 0.15 ≤ roi3y < 0.25 AND ltvCacRatio ≥ 3 AND paybackMonths ≤ 12
 * KILL:             roi3y < 0.15 OR breakEvenMonth > 24 OR breakEvenMonth === null
 *
 * @param {{ roi3y: number, breakEvenMonth: number|null, ltvCacRatio: number|null, paybackMonths: number }} params
 * @returns {{ decision: string, blockProgression: boolean, reasons: Object[], remediationRoute: string|null }}
 */
export function evaluateKillGate({ roi3y, breakEvenMonth, ltvCacRatio, paybackMonths }) {
  const reasons = [];
  let remediationRoute = null;

  // Hard kill conditions
  if (breakEvenMonth === null) {
    reasons.push({
      type: 'no_break_even_year1',
      message: 'Year 1 net profit is non-positive; break-even cannot be calculated',
    });
  } else if (breakEvenMonth > MAX_BREAKEVEN_MONTHS) {
    reasons.push({
      type: 'break_even_too_late',
      message: `Break-even at month ${breakEvenMonth} exceeds maximum ${MAX_BREAKEVEN_MONTHS} months`,
      threshold: MAX_BREAKEVEN_MONTHS,
      actual: breakEvenMonth,
    });
  }

  if (roi3y < ROI_CONDITIONAL_THRESHOLD) {
    reasons.push({
      type: 'roi_below_kill_threshold',
      message: `3-year ROI of ${(roi3y * 100).toFixed(1)}% is below kill threshold ${ROI_CONDITIONAL_THRESHOLD * 100}%`,
      threshold: ROI_CONDITIONAL_THRESHOLD,
      actual: roi3y,
    });
  }

  // Kill: hard conditions triggered
  if (reasons.length > 0) {
    remediationRoute = roi3y < 0
      ? 'Revisit Stage 1 problem definition and target market'
      : 'Revisit Stage 2 assumptions and market sizing';
    return { decision: 'kill', blockProgression: true, reasons, remediationRoute };
  }

  // Conditional pass band: 0.15 ≤ ROI < 0.25
  if (roi3y < ROI_PASS_THRESHOLD) {
    // Check supplementary metrics for conditional pass
    const supplementaryPass =
      ltvCacRatio !== null && ltvCacRatio >= CONDITIONAL_LTV_CAC_THRESHOLD &&
      paybackMonths <= CONDITIONAL_PAYBACK_THRESHOLD;

    if (supplementaryPass) {
      reasons.push({
        type: 'roi_in_conditional_band',
        message: `3-year ROI of ${(roi3y * 100).toFixed(1)}% is in conditional band (${ROI_CONDITIONAL_THRESHOLD * 100}%-${ROI_PASS_THRESHOLD * 100}%). Supplementary metrics strong — routing to Chairman Review.`,
        threshold: ROI_PASS_THRESHOLD,
        actual: roi3y,
      });
      return { decision: 'conditional_pass', blockProgression: true, reasons, remediationRoute: null };
    }

    // Supplementary metrics too weak for conditional pass → kill
    reasons.push({
      type: 'roi_conditional_supplementary_fail',
      message: `3-year ROI of ${(roi3y * 100).toFixed(1)}% is in conditional band but supplementary metrics insufficient (ltvCacRatio: ${ltvCacRatio?.toFixed(1) ?? 'N/A'}, paybackMonths: ${paybackMonths})`,
      threshold: ROI_PASS_THRESHOLD,
      actual: roi3y,
    });
    remediationRoute = 'Improve unit economics: reduce CAC or increase LTV';
    return { decision: 'kill', blockProgression: true, reasons, remediationRoute };
  }

  // Full pass: ROI ≥ 0.25
  // Check additional pass criteria
  if (ltvCacRatio !== null && ltvCacRatio < LTV_CAC_THRESHOLD) {
    reasons.push({
      type: 'ltv_cac_below_threshold',
      message: `LTV/CAC ratio ${ltvCacRatio.toFixed(1)} is below minimum ${LTV_CAC_THRESHOLD}`,
      threshold: LTV_CAC_THRESHOLD,
      actual: ltvCacRatio,
    });
    remediationRoute = 'Improve unit economics: reduce CAC or increase LTV';
    return { decision: 'kill', blockProgression: true, reasons, remediationRoute };
  }

  if (paybackMonths > PAYBACK_THRESHOLD) {
    reasons.push({
      type: 'payback_too_long',
      message: `Payback period ${paybackMonths} months exceeds maximum ${PAYBACK_THRESHOLD} months`,
      threshold: PAYBACK_THRESHOLD,
      actual: paybackMonths,
    });
    remediationRoute = 'Reduce customer acquisition cost or increase early revenue';
    return { decision: 'kill', blockProgression: true, reasons, remediationRoute };
  }

  return { decision: 'pass', blockProgression: false, reasons: [], remediationRoute: null };
}

TEMPLATE.analysisStep = analyzeStage05;

export {
  ROI_PASS_THRESHOLD,
  ROI_CONDITIONAL_THRESHOLD,
  MAX_BREAKEVEN_MONTHS,
  LTV_CAC_THRESHOLD,
  PAYBACK_THRESHOLD,
  CONDITIONAL_LTV_CAC_THRESHOLD,
  CONDITIONAL_PAYBACK_THRESHOLD,
  ROBUSTNESS_LEVELS,
};
export default TEMPLATE;
