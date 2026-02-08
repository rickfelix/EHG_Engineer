/**
 * Stage 05 Template - Profitability
 * Phase: THE TRUTH (Stages 1-5)
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001
 *
 * 3-year financial model with break-even calculation, ROI threshold,
 * and deterministic KILL GATE enforcement.
 *
 * Kill gate triggers when:
 * - ROI3Y < 0.5
 * - breakEvenMonth is null (non-profitable Year 1)
 * - breakEvenMonth > 24
 *
 * @module lib/eva/stage-templates/stage-05
 */

import { validateNumber, collectErrors } from './validation.js';

const ROI_THRESHOLD = 0.5;
const MAX_BREAKEVEN_MONTHS = 24;

const TEMPLATE = {
  id: 'stage-05',
  slug: 'profitability',
  title: 'Profitability',
  version: '1.0.0',
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
    // Derived fields
    grossProfitY1: { type: 'number', derived: true },
    grossProfitY2: { type: 'number', derived: true },
    grossProfitY3: { type: 'number', derived: true },
    netProfitY1: { type: 'number', derived: true },
    netProfitY2: { type: 'number', derived: true },
    netProfitY3: { type: 'number', derived: true },
    breakEvenMonth: { type: 'number', nullable: true, derived: true },
    roi3y: { type: 'number', derived: true },
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
  },
  defaultData: {
    initialInvestment: null,
    year1: { revenue: 0, cogs: 0, opex: 0 },
    year2: { revenue: 0, cogs: 0, opex: 0 },
    year3: { revenue: 0, cogs: 0, opex: 0 },
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
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

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

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: gross/net profit, break-even, ROI, kill gate.
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

    const { decision, blockProgression, reasons } = evaluateKillGate({
      roi3y,
      breakEvenMonth,
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
      decision,
      blockProgression,
      reasons,
    };
  },
};

/**
 * Pure function: evaluate kill gate for Stage 05.
 * Kill if ROI3Y < 0.5 OR breakEvenMonth is null OR breakEvenMonth > 24.
 *
 * @param {{ roi3y: number, breakEvenMonth: number|null }} params
 * @returns {{ decision: 'pass'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ roi3y, breakEvenMonth }) {
  const reasons = [];

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

  if (roi3y < ROI_THRESHOLD) {
    reasons.push({
      type: 'roi_below_threshold',
      message: `3-year ROI of ${(roi3y * 100).toFixed(1)}% is below threshold ${ROI_THRESHOLD * 100}%`,
      threshold: ROI_THRESHOLD,
      actual: roi3y,
    });
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';
  return {
    decision,
    blockProgression: decision === 'kill',
    reasons,
  };
}

export { ROI_THRESHOLD, MAX_BREAKEVEN_MONTHS };
export default TEMPLATE;
