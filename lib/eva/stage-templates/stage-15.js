/**
 * Stage 15 Template - Risk Register
 * Phase: THE BLUEPRINT (Stages 13-16)
 * Part of SD-EVA-FIX-STAGE15-RISK-001
 *
 * Risk identification, severity/priority classification,
 * mitigation planning, and budget coherence validation.
 *
 * @module lib/eva/stage-templates/stage-15
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage15 } from './analysis-steps/stage-15-risk-register.js';

const MIN_RISKS = 1;
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ENUM = ['immediate', 'short_term', 'long_term'];

const TEMPLATE = {
  id: 'stage-15',
  slug: 'risk-register',
  title: 'Risk Register',
  version: '3.0.0',
  schema: {
    risks: {
      type: 'array',
      minItems: MIN_RISKS,
      items: {
        title: { type: 'string', required: true },
        description: { type: 'string', required: true },
        owner: { type: 'string', required: true },
        severity: { type: 'enum', values: SEVERITY_ENUM, required: true },
        priority: { type: 'enum', values: PRIORITY_ENUM, required: true },
        phaseRef: { type: 'string' },
        mitigationPlan: { type: 'string', required: true },
        contingencyPlan: { type: 'string' },
      },
    },
    // Derived
    total_risks: { type: 'number', derived: true },
    severity_breakdown: { type: 'object', derived: true },
    budget_coherence: { type: 'object', derived: true },
  },
  defaultData: {
    risks: [],
    total_risks: 0,
    severity_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
    budget_coherence: { aligned: false, notes: '' },
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { valid: false, errors: ['data is required and must be an object'] };
    }

    // Risks array
    const risksCheck = validateArray(data?.risks, 'risks', MIN_RISKS);
    if (!risksCheck.valid) {
      errors.push(risksCheck.error);
    } else {
      for (let i = 0; i < data.risks.length; i++) {
        const risk = data.risks[i];
        const prefix = `risks[${i}]`;
        const results = [
          validateString(risk?.title, `${prefix}.title`, 1),
          validateString(risk?.description, `${prefix}.description`, 1),
          validateString(risk?.owner, `${prefix}.owner`, 1),
          validateString(risk?.mitigationPlan, `${prefix}.mitigationPlan`, 1),
        ];
        errors.push(...collectErrors(results));

        // Severity enum
        if (risk?.severity !== undefined) {
          const sevCheck = validateEnum(risk.severity, `${prefix}.severity`, SEVERITY_ENUM);
          if (!sevCheck.valid) errors.push(sevCheck.error);
        } else {
          errors.push(`${prefix}.severity is required`);
        }

        // Priority enum
        if (risk?.priority !== undefined) {
          const priCheck = validateEnum(risk.priority, `${prefix}.priority`, PRIORITY_ENUM);
          if (!priCheck.valid) errors.push(priCheck.error);
        } else {
          errors.push(`${prefix}.priority is required`);
        }
      }
    }

    if (errors.length > 0) { logger.warn('[Stage15] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields.
   * @param {Object} data - Validated input data
   * @param {Object} [stage16Data] - Optional Stage 16 financial data for budget coherence cross-validation
   * @returns {Object} Data with derived fields
   */
  computeDerived(data, stage16Data, { logger = console } = {}) {
    const risks = data?.risks || [];
    const total_risks = risks.length;

    const severity_breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const risk of risks) {
      if (risk.severity && severity_breakdown[risk.severity] !== undefined) {
        severity_breakdown[risk.severity]++;
      }
    }

    // Budget coherence — cross-validate with Stage 16 financial data when available
    let budget_coherence;
    if (stage16Data && stage16Data.monthly_burn_rate > 0) {
      const criticalCount = severity_breakdown.critical + severity_breakdown.high;
      const hasFinancialCoverage = stage16Data.initial_capital > 0 && stage16Data.revenue_projections?.length >= 6;
      const runwayAdequate = stage16Data.initial_capital / stage16Data.monthly_burn_rate >= 6;

      budget_coherence = {
        aligned: hasFinancialCoverage && (criticalCount === 0 || runwayAdequate),
        financialDataAvailable: true,
        criticalRiskCount: criticalCount,
        runwayMonths: Math.round((stage16Data.initial_capital / stage16Data.monthly_burn_rate) * 100) / 100,
        notes: hasFinancialCoverage
          ? `${total_risks} risk(s) cross-validated against Stage 16 financials. Runway: ${Math.round(stage16Data.initial_capital / stage16Data.monthly_burn_rate)} months.`
          : `${total_risks} risk(s) identified but Stage 16 financial coverage incomplete.`,
      };
    } else {
      budget_coherence = {
        aligned: total_risks > 0,
        financialDataAvailable: false,
        notes: total_risks > 0
          ? `${total_risks} risk(s) identified with mitigation plans (Stage 16 data not available for cross-validation)`
          : 'No risks identified',
      };
    }

    return {
      ...data,
      total_risks,
      severity_breakdown,
      budget_coherence,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage15;

export { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM };
export default TEMPLATE;
