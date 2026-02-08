/**
 * Stage 09 Template - Exit Strategy
 * Phase: THE ENGINE (Stages 6-9)
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Exit thesis, time horizon, target acquirers, milestones,
 * and Phase 2→3 Reality Gate evaluation.
 *
 * Reality gate pass requires:
 *   - Stage 06: >= 10 risks captured
 *   - Stage 07: >= 1 tier with non-null LTV and payback
 *   - Stage 08: all 9 BMC blocks populated
 *
 * @module lib/eva/stage-templates/stage-09
 */

import { validateString, validateInteger, validateNumber, validateArray, collectErrors } from './validation.js';
import { BMC_BLOCKS } from './stage-08.js';

const MIN_RISKS = 10;
const MIN_ACQUIRERS = 3;

const TEMPLATE = {
  id: 'stage-09',
  slug: 'exit-strategy',
  title: 'Exit Strategy',
  version: '1.0.0',
  schema: {
    exit_thesis: { type: 'string', minLength: 20, required: true },
    exit_horizon_months: { type: 'integer', min: 1, max: 120, required: true },
    exit_paths: {
      type: 'array',
      minItems: 1,
      items: {
        type: { type: 'string', required: true },
        description: { type: 'string', required: true },
        probability_pct: { type: 'number', min: 0, max: 100 },
      },
    },
    target_acquirers: {
      type: 'array',
      minItems: MIN_ACQUIRERS,
      items: {
        name: { type: 'string', required: true },
        rationale: { type: 'string', required: true },
        fit_score: { type: 'integer', min: 1, max: 5, required: true },
      },
    },
    milestones: {
      type: 'array',
      minItems: 1,
      items: {
        date: { type: 'string', required: true },
        success_criteria: { type: 'string', required: true },
      },
    },
    // Derived: reality gate payload
    reality_gate: {
      type: 'object',
      derived: true,
      properties: {
        pass: { type: 'boolean' },
        rationale: { type: 'string' },
        blockers: { type: 'array' },
        required_next_actions: { type: 'array' },
      },
    },
  },
  defaultData: {
    exit_thesis: null,
    exit_horizon_months: null,
    exit_paths: [],
    target_acquirers: [],
    milestones: [],
    reality_gate: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const thesisCheck = validateString(data?.exit_thesis, 'exit_thesis', 20);
    if (!thesisCheck.valid) errors.push(thesisCheck.error);

    const horizonCheck = validateInteger(data?.exit_horizon_months, 'exit_horizon_months', 1, 120);
    if (!horizonCheck.valid) errors.push(horizonCheck.error);

    // Exit paths
    const pathsCheck = validateArray(data?.exit_paths, 'exit_paths', 1);
    if (!pathsCheck.valid) {
      errors.push(pathsCheck.error);
    } else {
      for (let i = 0; i < data.exit_paths.length; i++) {
        const p = data.exit_paths[i];
        const prefix = `exit_paths[${i}]`;
        const results = [
          validateString(p?.type, `${prefix}.type`, 1),
          validateString(p?.description, `${prefix}.description`, 1),
        ];
        if (p?.probability_pct !== undefined) {
          results.push(validateNumber(p.probability_pct, `${prefix}.probability_pct`, 0));
          if (typeof p.probability_pct === 'number' && p.probability_pct > 100) {
            errors.push(`${prefix}.probability_pct must be <= 100 (got ${p.probability_pct})`);
          }
        }
        errors.push(...collectErrors(results));
      }
    }

    // Target acquirers
    const acquirersCheck = validateArray(data?.target_acquirers, 'target_acquirers', MIN_ACQUIRERS);
    if (!acquirersCheck.valid) {
      errors.push(acquirersCheck.error);
    } else {
      for (let i = 0; i < data.target_acquirers.length; i++) {
        const a = data.target_acquirers[i];
        const prefix = `target_acquirers[${i}]`;
        const results = [
          validateString(a?.name, `${prefix}.name`, 1),
          validateString(a?.rationale, `${prefix}.rationale`, 1),
          validateInteger(a?.fit_score, `${prefix}.fit_score`, 1, 5),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Milestones
    const msCheck = validateArray(data?.milestones, 'milestones', 1);
    if (!msCheck.valid) {
      errors.push(msCheck.error);
    } else {
      for (let i = 0; i < data.milestones.length; i++) {
        const m = data.milestones[i];
        const prefix = `milestones[${i}]`;
        const results = [
          validateString(m?.date, `${prefix}.date`, 1),
          validateString(m?.success_criteria, `${prefix}.success_criteria`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: reality gate evaluation.
   * Requires prerequisite data from stages 6-8.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage06, stage07, stage08 }
   * @returns {Object} Data with reality_gate
   */
  computeDerived(data, prerequisites) {
    const reality_gate = prerequisites
      ? evaluateRealityGate(prerequisites)
      : { pass: false, rationale: 'Prerequisites not provided', blockers: ['Stage 06-08 data required'], required_next_actions: ['Complete stages 06-08 before evaluating reality gate'] };

    return { ...data, reality_gate };
  },
};

/**
 * Pure function: evaluate Phase 2→3 Reality Gate.
 *
 * Pass requires:
 *   - Stage 06: >= 10 risks captured
 *   - Stage 07: >= 1 tier and non-null LTV and payback
 *   - Stage 08: all 9 BMC blocks populated with items
 *
 * @param {{ stage06: Object, stage07: Object, stage08: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[] }}
 */
export function evaluateRealityGate({ stage06, stage07, stage08 }) {
  const blockers = [];
  const required_next_actions = [];

  // Stage 06 check: >= 10 risks
  const risksCount = stage06?.risks?.length || 0;
  if (risksCount < MIN_RISKS) {
    blockers.push(`Insufficient risks: ${risksCount} < ${MIN_RISKS} required`);
    required_next_actions.push(`Add ${MIN_RISKS - risksCount} more risks to the risk matrix`);
  }

  // Stage 07 check: >= 1 tier, non-null LTV and payback
  const tiersCount = stage07?.tiers?.length || 0;
  if (tiersCount < 1) {
    blockers.push('No pricing tiers defined');
    required_next_actions.push('Define at least 1 pricing tier');
  }
  if (stage07?.ltv === null || stage07?.ltv === undefined) {
    blockers.push('LTV not computed (likely zero churn rate)');
    required_next_actions.push('Set a non-zero monthly churn rate to compute LTV');
  }
  if (stage07?.payback_months === null || stage07?.payback_months === undefined) {
    blockers.push('Payback months not computed');
    required_next_actions.push('Ensure ARPA and gross margin produce positive monthly profit');
  }

  // Stage 08 check: all 9 blocks populated
  for (const block of BMC_BLOCKS) {
    const blockData = stage08?.[block];
    if (!blockData || !Array.isArray(blockData.items) || blockData.items.length === 0) {
      blockers.push(`BMC block '${block}' is empty or missing`);
      required_next_actions.push(`Populate the '${block}' section of the Business Model Canvas`);
    }
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? 'All Phase 2 prerequisites met. Risk matrix, pricing model, and business model canvas are complete.'
    : `Phase 2 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, required_next_actions };
}

export { MIN_RISKS, MIN_ACQUIRERS };
export default TEMPLATE;
