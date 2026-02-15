/**
 * Stage 07 Template - Pricing
 * Phase: THE ENGINE (Stages 6-9)
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Pricing tier structure with unit economics (CAC, LTV, payback).
 * Handles zero-churn edge case by returning null derived metrics with warnings.
 *
 * Formulas:
 *   LTV = (ARPA * gross_margin_pct/100) / churn_rate_monthly_decimal
 *   CAC:LTV = CAC / LTV
 *   Payback = CAC / (ARPA * gross_margin_pct/100)
 *
 * @module lib/eva/stage-templates/stage-07
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors, validateCrossStageContract } from './validation.js';
import { analyzeStage07 } from './analysis-steps/stage-07-pricing-strategy.js';

const BILLING_PERIODS = ['monthly', 'quarterly', 'annual'];
const PRICING_MODELS = ['subscription', 'usage_based', 'tiered', 'freemium', 'enterprise', 'marketplace'];

const TEMPLATE = {
  id: 'stage-07',
  slug: 'pricing',
  title: 'Pricing',
  version: '2.0.0',
  schema: {
    currency: { type: 'string', required: true },
    pricing_model: { type: 'enum', values: PRICING_MODELS, required: true },
    primaryValueMetric: { type: 'string' },
    priceAnchor: { type: 'number', min: 0 },
    competitiveContext: { type: 'string' },
    tiers: {
      type: 'array',
      minItems: 1,
      items: {
        name: { type: 'string', required: true },
        price: { type: 'number', min: 0, required: true },
        billing_period: { type: 'enum', values: BILLING_PERIODS, required: true },
        included_units: { type: 'string' },
        target_segment: { type: 'string', required: true },
      },
    },
    gross_margin_pct: { type: 'number', min: 0, max: 100, required: true },
    churn_rate_monthly: { type: 'number', min: 0, max: 100, required: true },
    cac: { type: 'number', min: 0, required: true },
    arpa: { type: 'number', min: 0, required: true },
    // Derived fields
    positioningDecision: { type: 'object', derived: true },
    ltv: { type: 'number', nullable: true, derived: true },
    cac_ltv_ratio: { type: 'number', nullable: true, derived: true },
    payback_months: { type: 'number', nullable: true, derived: true },
    warnings: { type: 'array', derived: true },
  },
  defaultData: {
    currency: 'USD',
    pricing_model: null,
    primaryValueMetric: null,
    priceAnchor: null,
    competitiveContext: null,
    tiers: [],
    gross_margin_pct: null,
    churn_rate_monthly: null,
    cac: null,
    arpa: null,
    positioningDecision: null,
    ltv: null,
    cac_ltv_ratio: null,
    payback_months: null,
    warnings: [],
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, prerequisites) {
    const errors = [];

    // Cross-stage contract: validate stage-05 unit economics if provided
    if (prerequisites?.stage05) {
      const s05Contract = {
        unitEconomics: { type: 'object' },
      };
      const s05Check = validateCrossStageContract(prerequisites.stage05, s05Contract, 'stage-05');
      errors.push(...s05Check.errors);
    }
    // Cross-stage contract: validate stage-06 risk context if provided
    if (prerequisites?.stage06) {
      const s06Contract = {
        aggregate_risk_score: { type: 'number', required: false },
      };
      const s06Check = validateCrossStageContract(prerequisites.stage06, s06Contract, 'stage-06');
      errors.push(...s06Check.errors);
    }

    const currencyCheck = validateString(data?.currency, 'currency', 1);
    if (!currencyCheck.valid) errors.push(currencyCheck.error);

    const modelCheck = validateEnum(data?.pricing_model, 'pricing_model', PRICING_MODELS);
    if (!modelCheck.valid) errors.push(modelCheck.error);

    const tiersCheck = validateArray(data?.tiers, 'tiers', 1);
    if (!tiersCheck.valid) {
      errors.push(tiersCheck.error);
    } else {
      for (let i = 0; i < data.tiers.length; i++) {
        const t = data.tiers[i];
        const prefix = `tiers[${i}]`;
        const results = [
          validateString(t?.name, `${prefix}.name`, 1),
          validateNumber(t?.price, `${prefix}.price`, 0),
          validateEnum(t?.billing_period, `${prefix}.billing_period`, BILLING_PERIODS),
          validateString(t?.target_segment, `${prefix}.target_segment`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    const numericResults = [
      validateNumber(data?.gross_margin_pct, 'gross_margin_pct', 0),
      validateNumber(data?.churn_rate_monthly, 'churn_rate_monthly', 0),
      validateNumber(data?.cac, 'cac', 0),
      validateNumber(data?.arpa, 'arpa', 0),
    ];
    errors.push(...collectErrors(numericResults));

    // Bounds check: gross_margin_pct and churn_rate_monthly must be <= 100
    if (typeof data?.gross_margin_pct === 'number' && data.gross_margin_pct > 100) {
      errors.push('gross_margin_pct must be <= 100 (got ' + data.gross_margin_pct + ')');
    }
    if (typeof data?.churn_rate_monthly === 'number' && data.churn_rate_monthly > 100) {
      errors.push('churn_rate_monthly must be <= 100 (got ' + data.churn_rate_monthly + ')');
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: LTV, CAC:LTV, payback months.
   * When churn is 0, derived metrics are null with a warning.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with derived metrics
   */
  computeDerived(data) {
    const warnings = [];
    const churnDecimal = data.churn_rate_monthly / 100;
    const monthlyGrossProfit = data.arpa * (data.gross_margin_pct / 100);

    let ltv = null;
    let cac_ltv_ratio = null;
    let payback_months = null;

    if (churnDecimal === 0) {
      warnings.push({
        type: 'churn_zero',
        message: 'Monthly churn rate is 0%; LTV cannot be calculated (would be infinite). Set a non-zero churn rate for unit economics.',
      });
    } else {
      ltv = monthlyGrossProfit / churnDecimal;
      cac_ltv_ratio = ltv > 0 ? data.cac / ltv : null;
    }

    if (monthlyGrossProfit > 0) {
      payback_months = data.cac / monthlyGrossProfit;
    } else if (churnDecimal !== 0) {
      warnings.push({
        type: 'zero_gross_profit',
        message: 'Monthly gross profit is $0; payback period cannot be calculated.',
      });
    }

    // Warning for suspicious churn
    if (data.churn_rate_monthly > 30) {
      warnings.push({
        type: 'high_churn',
        message: `Monthly churn rate of ${data.churn_rate_monthly}% is unusually high. Verify this is monthly (not annual) churn.`,
      });
    }

    // Positioning decision (derived from pricing model and competitive context)
    let positioningDecision = null;
    if (data.pricing_model) {
      positioningDecision = {
        position: data.pricing_model,
        rationale: data.competitiveContext || null,
      };
    }

    return {
      ...data,
      positioningDecision,
      ltv,
      cac_ltv_ratio,
      payback_months,
      warnings,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage07;

export { BILLING_PERIODS, PRICING_MODELS };
export default TEMPLATE;
