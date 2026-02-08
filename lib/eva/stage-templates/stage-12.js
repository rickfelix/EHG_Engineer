/**
 * Stage 12 Template - Sales Logic
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Sales process definition with funnel stages, metrics,
 * customer journey mapping, and Phase 3→4 Reality Gate.
 *
 * Reality gate pass requires:
 *   - Stage 10: >= 5 scored naming candidates
 *   - Stage 11: exactly 3 tiers and 8 channels
 *   - Stage 12: >= 4 funnel stages with metrics, >= 5 journey steps
 *
 * @module lib/eva/stage-templates/stage-12
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { REQUIRED_TIERS, REQUIRED_CHANNELS } from './stage-11.js';
import { MIN_CANDIDATES } from './stage-10.js';

const SALES_MODELS = ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'];
const MIN_FUNNEL_STAGES = 4;
const MIN_JOURNEY_STEPS = 5;
const MIN_DEAL_STAGES = 3;

const TEMPLATE = {
  id: 'stage-12',
  slug: 'sales-logic',
  title: 'Sales Logic',
  version: '1.0.0',
  schema: {
    sales_model: { type: 'enum', values: SALES_MODELS, required: true },
    sales_cycle_days: { type: 'number', min: 1, required: true },
    deal_stages: {
      type: 'array',
      minItems: MIN_DEAL_STAGES,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        avg_duration_days: { type: 'number', min: 0 },
      },
    },
    funnel_stages: {
      type: 'array',
      minItems: MIN_FUNNEL_STAGES,
      items: {
        name: { type: 'string', required: true },
        metric: { type: 'string', required: true },
        target_value: { type: 'number', min: 0, required: true },
      },
    },
    customer_journey: {
      type: 'array',
      minItems: MIN_JOURNEY_STEPS,
      items: {
        step: { type: 'string', required: true },
        funnel_stage: { type: 'string', required: true },
        touchpoint: { type: 'string', required: true },
      },
    },
    // Derived
    reality_gate: {
      type: 'object',
      derived: true,
    },
  },
  defaultData: {
    sales_model: null,
    sales_cycle_days: null,
    deal_stages: [],
    funnel_stages: [],
    customer_journey: [],
    reality_gate: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data) {
    const errors = [];

    const modelCheck = validateEnum(data?.sales_model, 'sales_model', SALES_MODELS);
    if (!modelCheck.valid) errors.push(modelCheck.error);

    const cycleCheck = validateNumber(data?.sales_cycle_days, 'sales_cycle_days', 1);
    if (!cycleCheck.valid) errors.push(cycleCheck.error);

    // Deal stages
    const dealCheck = validateArray(data?.deal_stages, 'deal_stages', MIN_DEAL_STAGES);
    if (!dealCheck.valid) {
      errors.push(dealCheck.error);
    } else {
      for (let i = 0; i < data.deal_stages.length; i++) {
        const ds = data.deal_stages[i];
        const prefix = `deal_stages[${i}]`;
        const results = [
          validateString(ds?.name, `${prefix}.name`, 1),
          validateString(ds?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Funnel stages
    const funnelCheck = validateArray(data?.funnel_stages, 'funnel_stages', MIN_FUNNEL_STAGES);
    if (!funnelCheck.valid) {
      errors.push(funnelCheck.error);
    } else {
      for (let i = 0; i < data.funnel_stages.length; i++) {
        const fs = data.funnel_stages[i];
        const prefix = `funnel_stages[${i}]`;
        const results = [
          validateString(fs?.name, `${prefix}.name`, 1),
          validateString(fs?.metric, `${prefix}.metric`, 1),
          validateNumber(fs?.target_value, `${prefix}.target_value`, 0),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Customer journey
    const journeyCheck = validateArray(data?.customer_journey, 'customer_journey', MIN_JOURNEY_STEPS);
    if (!journeyCheck.valid) {
      errors.push(journeyCheck.error);
    } else {
      for (let i = 0; i < data.customer_journey.length; i++) {
        const cj = data.customer_journey[i];
        const prefix = `customer_journey[${i}]`;
        const results = [
          validateString(cj?.step, `${prefix}.step`, 1),
          validateString(cj?.funnel_stage, `${prefix}.funnel_stage`, 1),
          validateString(cj?.touchpoint, `${prefix}.touchpoint`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: reality gate evaluation.
   * @param {Object} data - Validated input data
   * @param {Object} [prerequisites] - Optional: { stage10, stage11 }
   * @returns {Object} Data with reality_gate
   */
  computeDerived(data, prerequisites) {
    const reality_gate = prerequisites
      ? evaluateRealityGate({ ...prerequisites, stage12: data })
      : { pass: false, rationale: 'Prerequisites not provided', blockers: ['Stage 10-11 data required'], required_next_actions: ['Complete stages 10-11 before evaluating reality gate'] };

    return { ...data, reality_gate };
  },
};

/**
 * Pure function: evaluate Phase 3→4 Reality Gate.
 *
 * Pass requires:
 *   - Stage 10: >= 5 scored naming candidates
 *   - Stage 11: exactly 3 tiers and 8 channels
 *   - Stage 12: >= 4 funnel stages with metrics, >= 5 journey steps
 *
 * @param {{ stage10: Object, stage11: Object, stage12: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[] }}
 */
export function evaluateRealityGate({ stage10, stage11, stage12 }) {
  const blockers = [];
  const required_next_actions = [];

  // Stage 10: >= 5 scored candidates
  const candidatesCount = stage10?.candidates?.length || 0;
  if (candidatesCount < MIN_CANDIDATES) {
    blockers.push(`Insufficient naming candidates: ${candidatesCount} < ${MIN_CANDIDATES} required`);
    required_next_actions.push(`Add ${MIN_CANDIDATES - candidatesCount} more naming candidates with scores`);
  }

  // Check that candidates have scores
  const scoredCount = stage10?.candidates?.filter(c => c.weighted_score !== undefined && c.weighted_score !== null).length || 0;
  if (scoredCount < MIN_CANDIDATES && candidatesCount >= MIN_CANDIDATES) {
    blockers.push(`Only ${scoredCount} of ${candidatesCount} candidates have scores computed`);
    required_next_actions.push('Ensure all naming candidates have scoring criteria applied');
  }

  // Stage 11: exactly 3 tiers
  const tiersCount = stage11?.tiers?.length || 0;
  if (tiersCount !== REQUIRED_TIERS) {
    blockers.push(`GTM requires exactly ${REQUIRED_TIERS} tiers (got ${tiersCount})`);
    required_next_actions.push(`Define exactly ${REQUIRED_TIERS} target market tiers`);
  }

  // Stage 11: exactly 8 channels
  const channelsCount = stage11?.channels?.length || 0;
  if (channelsCount !== REQUIRED_CHANNELS) {
    blockers.push(`GTM requires exactly ${REQUIRED_CHANNELS} channels (got ${channelsCount})`);
    required_next_actions.push(`Define exactly ${REQUIRED_CHANNELS} acquisition channels with budget and CAC`);
  }

  // Stage 12: >= 4 funnel stages
  const funnelCount = stage12?.funnel_stages?.length || 0;
  if (funnelCount < MIN_FUNNEL_STAGES) {
    blockers.push(`Insufficient funnel stages: ${funnelCount} < ${MIN_FUNNEL_STAGES} required`);
    required_next_actions.push(`Add ${MIN_FUNNEL_STAGES - funnelCount} more funnel stages with metrics`);
  }

  // Stage 12: funnel stages must have metrics
  const funnelWithMetrics = stage12?.funnel_stages?.filter(fs => fs.metric && fs.target_value !== undefined).length || 0;
  if (funnelWithMetrics < funnelCount && funnelCount >= MIN_FUNNEL_STAGES) {
    blockers.push(`${funnelCount - funnelWithMetrics} funnel stage(s) missing metric or target value`);
    required_next_actions.push('Ensure all funnel stages have a named metric and target value');
  }

  // Stage 12: >= 5 journey steps
  const journeyCount = stage12?.customer_journey?.length || 0;
  if (journeyCount < MIN_JOURNEY_STEPS) {
    blockers.push(`Insufficient customer journey steps: ${journeyCount} < ${MIN_JOURNEY_STEPS} required`);
    required_next_actions.push(`Add ${MIN_JOURNEY_STEPS - journeyCount} more customer journey steps mapped to funnel stages`);
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? 'All Phase 3 prerequisites met. Identity, GTM, and sales logic are complete.'
    : `Phase 3 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, required_next_actions };
}

export { SALES_MODELS, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS, MIN_DEAL_STAGES };
export default TEMPLATE;
