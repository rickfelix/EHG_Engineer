/**
 * Stage 12 Template - GTM & Sales Strategy
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-A
 *
 * Combined go-to-market and sales strategy in one stage.
 * Produces market tiers, channels, sales model, funnel, journey.
 * Phase 3→4 Reality Gate preserved as dual-gate pattern.
 *
 * DUAL-GATE DESIGN (G12-6):
 * This stage participates in two separate gates for the 12→13 boundary:
 *   1. LOCAL gate (this file, evaluateRealityGate): Validates data completeness
 *      across Stages 10-12 (personas, brand, naming, tiers, channels, funnel, journey).
 *   2. SYSTEM gate (reality-gates.js, BOUNDARY_CONFIG '12->13'): Validates
 *      artifact existence in venture_artifacts table.
 * Both gates must pass for a venture to transition from IDENTITY to BLUEPRINT.
 *
 * @module lib/eva/stage-templates/stage-12
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage12 } from './analysis-steps/stage-12-gtm-sales.js';
import { MIN_PERSONAS } from './stage-10.js';

const SALES_MODELS = ['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel'];
const CHANNEL_TYPES = ['paid', 'organic', 'earned', 'owned'];
const REQUIRED_TIERS = 3;
const REQUIRED_CHANNELS = 8;
const MIN_DEAL_STAGES = 3;
const MIN_FUNNEL_STAGES = 4;
const MIN_JOURNEY_STEPS = 5;
const MIN_CANDIDATES = 5;

const TEMPLATE = {
  id: 'stage-12',
  slug: 'gtm-sales-strategy',
  title: 'GTM & Sales Strategy',
  version: '3.0.0',
  schema: {
    // GTM section
    marketTiers: {
      type: 'array',
      exactItems: REQUIRED_TIERS,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        persona: { type: 'string' },
        painPoints: { type: 'array' },
        tam: { type: 'number', min: 0 },
        sam: { type: 'number', min: 0 },
        som: { type: 'number', min: 0 },
      },
    },
    channels: {
      type: 'array',
      exactItems: REQUIRED_CHANNELS,
      items: {
        name: { type: 'string', required: true },
        channelType: { type: 'enum', values: CHANNEL_TYPES },
        primaryTier: { type: 'string' },
        monthly_budget: { type: 'number', min: 0, required: true },
        expected_cac: { type: 'number', min: 0, required: true },
        primary_kpi: { type: 'string', required: true },
      },
    },
    // Sales section
    salesModel: { type: 'enum', values: SALES_MODELS, required: true },
    sales_cycle_days: { type: 'number', min: 1, required: true },
    deal_stages: {
      type: 'array',
      minItems: MIN_DEAL_STAGES,
      items: {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        avg_duration_days: { type: 'number', min: 0 },
        mappedFunnelStage: { type: 'string' },
      },
    },
    funnel_stages: {
      type: 'array',
      minItems: MIN_FUNNEL_STAGES,
      items: {
        name: { type: 'string', required: true },
        metric: { type: 'string', required: true },
        target_value: { type: 'number', min: 0, required: true },
        conversionRateEstimate: { type: 'number', min: 0, max: 1 },
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
    economyCheck: { type: 'object', derived: true },
    reality_gate: { type: 'object', derived: true },
    total_monthly_budget: { type: 'number', derived: true },
    avg_cac: { type: 'number', derived: true },
  },
  defaultData: {
    marketTiers: [],
    channels: [],
    salesModel: null,
    sales_cycle_days: null,
    deal_stages: [],
    funnel_stages: [],
    customer_journey: [],
    economyCheck: null,
    reality_gate: null,
    total_monthly_budget: null,
    avg_cac: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    // --- GTM section ---

    // Market tiers: exactly 3
    if (!Array.isArray(data?.marketTiers)) {
      errors.push('marketTiers must be an array');
    } else if (data.marketTiers.length !== REQUIRED_TIERS) {
      errors.push(`marketTiers must have exactly ${REQUIRED_TIERS} items (got ${data.marketTiers.length})`);
    } else {
      for (let i = 0; i < data.marketTiers.length; i++) {
        const t = data.marketTiers[i];
        const prefix = `marketTiers[${i}]`;
        const results = [
          validateString(t?.name, `${prefix}.name`, 1),
          validateString(t?.description, `${prefix}.description`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    // Channels: exactly 8
    if (!Array.isArray(data?.channels)) {
      errors.push('channels must be an array');
    } else if (data.channels.length !== REQUIRED_CHANNELS) {
      errors.push(`channels must have exactly ${REQUIRED_CHANNELS} items (got ${data.channels.length})`);
    } else {
      for (let i = 0; i < data.channels.length; i++) {
        const ch = data.channels[i];
        const prefix = `channels[${i}]`;
        const results = [
          validateString(ch?.name, `${prefix}.name`, 1),
          validateNumber(ch?.monthly_budget, `${prefix}.monthly_budget`, 0),
          validateNumber(ch?.expected_cac, `${prefix}.expected_cac`, 0),
          validateString(ch?.primary_kpi, `${prefix}.primary_kpi`, 1),
        ];
        errors.push(...collectErrors(results));

        if (ch?.channelType !== null && ch?.channelType !== undefined) {
          const ctCheck = validateEnum(ch.channelType, `${prefix}.channelType`, CHANNEL_TYPES);
          if (!ctCheck.valid) errors.push(ctCheck.error);
        }
      }
    }

    // --- Sales section ---

    const modelCheck = validateEnum(data?.salesModel, 'salesModel', SALES_MODELS);
    if (!modelCheck.valid) errors.push(modelCheck.error);

    const cycleCheck = validateNumber(data?.sales_cycle_days, 'sales_cycle_days', 1);
    if (!cycleCheck.valid) errors.push(cycleCheck.error);

    // Deal stages (min 3)
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

    // Funnel stages (min 4)
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

        if (fs?.conversionRateEstimate !== null && fs?.conversionRateEstimate !== undefined) {
          const crCheck = validateNumber(fs.conversionRateEstimate, `${prefix}.conversionRateEstimate`, 0);
          if (!crCheck.valid) {
            errors.push(crCheck.error);
          } else if (fs.conversionRateEstimate > 1) {
            errors.push(`${prefix}.conversionRateEstimate must be <= 1 (ratio), got ${fs.conversionRateEstimate}`);
          }
        }
      }
    }

    // Customer journey (min 5)
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

    if (errors.length > 0) { logger.warn('[Stage12] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    return { ...data };
  },
};

/**
 * Pure function: evaluate Phase 3→4 Reality Gate.
 *
 * Checks data completeness across Stages 10, 11, 12:
 *   - Stage 10: >= 3 customer personas, brand genome with customerAlignment
 *   - Stage 11: >= 5 naming candidates with personaFit scores
 *   - Stage 12: 3 tiers, 8 channels, >= 3 deal stages, >= 4 funnel stages, >= 5 journey steps
 *
 * @param {{ stage10: Object, stage11: Object, stage12: Object }} prerequisites
 * @returns {{ pass: boolean, rationale: string, blockers: string[], required_next_actions: string[] }}
 */
export function evaluateRealityGate({ stage10, stage11, stage12 }) {
  const blockers = [];
  const required_next_actions = [];

  // Stage 10: customer personas (>= 3)
  const personaCount = stage10?.customerPersonas?.length || 0;
  if (personaCount < MIN_PERSONAS) {
    blockers.push(`Insufficient customer personas: ${personaCount} < ${MIN_PERSONAS} required`);
    required_next_actions.push(`Add ${MIN_PERSONAS - personaCount} more customer personas`);
  }

  // Stage 10: brand genome with customerAlignment
  const alignmentCount = stage10?.brandGenome?.customerAlignment?.length || 0;
  if (alignmentCount === 0) {
    blockers.push('Brand genome missing customerAlignment — brand traits not linked to persona insights');
    required_next_actions.push('Add customerAlignment entries linking brand traits to persona insights');
  }

  // Stage 11: naming candidates with personaFit (>= 5)
  const candidatesCount = stage11?.candidates?.length || 0;
  if (candidatesCount < MIN_CANDIDATES) {
    blockers.push(`Insufficient naming candidates: ${candidatesCount} < ${MIN_CANDIDATES} required`);
    required_next_actions.push(`Add ${MIN_CANDIDATES - candidatesCount} more naming candidates with persona fit scores`);
  }

  // Stage 11: candidates must have personaFit scores
  const candidatesWithFit = stage11?.candidates?.filter(c => Array.isArray(c.personaFit) && c.personaFit.length > 0).length || 0;
  if (candidatesWithFit < candidatesCount && candidatesCount >= MIN_CANDIDATES) {
    blockers.push(`${candidatesCount - candidatesWithFit} candidate(s) missing personaFit scores`);
    required_next_actions.push('Ensure all naming candidates have personaFit scores');
  }

  // Stage 12: market tiers (exactly 3)
  const tiersCount = stage12?.marketTiers?.length || 0;
  if (tiersCount !== REQUIRED_TIERS) {
    blockers.push(`GTM requires exactly ${REQUIRED_TIERS} market tiers (got ${tiersCount})`);
    required_next_actions.push(`Define exactly ${REQUIRED_TIERS} target market tiers`);
  }

  // Stage 12: channels (exactly 8)
  const channelsCount = stage12?.channels?.length || 0;
  if (channelsCount !== REQUIRED_CHANNELS) {
    blockers.push(`GTM requires exactly ${REQUIRED_CHANNELS} channels (got ${channelsCount})`);
    required_next_actions.push(`Define exactly ${REQUIRED_CHANNELS} acquisition channels`);
  }

  // Stage 12: deal stages (>= 3)
  const dealCount = stage12?.deal_stages?.length || 0;
  if (dealCount < MIN_DEAL_STAGES) {
    blockers.push(`Insufficient deal stages: ${dealCount} < ${MIN_DEAL_STAGES} required`);
    required_next_actions.push(`Add ${MIN_DEAL_STAGES - dealCount} more deal stages`);
  }

  // Stage 12: funnel stages (>= 4) with metrics
  const funnelCount = stage12?.funnel_stages?.length || 0;
  if (funnelCount < MIN_FUNNEL_STAGES) {
    blockers.push(`Insufficient funnel stages: ${funnelCount} < ${MIN_FUNNEL_STAGES} required`);
    required_next_actions.push(`Add ${MIN_FUNNEL_STAGES - funnelCount} more funnel stages with metrics`);
  }
  const funnelWithMetrics = stage12?.funnel_stages?.filter(fs => fs.metric && fs.target_value !== undefined).length || 0;
  if (funnelWithMetrics < funnelCount && funnelCount >= MIN_FUNNEL_STAGES) {
    blockers.push(`${funnelCount - funnelWithMetrics} funnel stage(s) missing metric or target value`);
    required_next_actions.push('Ensure all funnel stages have a named metric and target value');
  }

  // Stage 12: journey steps (>= 5)
  const journeyCount = stage12?.customer_journey?.length || 0;
  if (journeyCount < MIN_JOURNEY_STEPS) {
    blockers.push(`Insufficient customer journey steps: ${journeyCount} < ${MIN_JOURNEY_STEPS} required`);
    required_next_actions.push(`Add ${MIN_JOURNEY_STEPS - journeyCount} more customer journey steps`);
  }

  // Economy check validation
  const econ = stage12?.economyCheck;
  if (econ) {
    if (typeof econ.totalPipelineValue === 'number' && econ.totalPipelineValue <= 0) {
      blockers.push('Economy check: totalPipelineValue must be > 0');
      required_next_actions.push('Ensure funnel stages have positive target values');
    }
    if (typeof econ.avgConversionRate === 'number' && (econ.avgConversionRate <= 0 || econ.avgConversionRate > 1)) {
      blockers.push(`Economy check: avgConversionRate ${econ.avgConversionRate} is out of expected range (0-1)`);
      required_next_actions.push('Review funnel stage conversion rate estimates');
    }
  }

  const pass = blockers.length === 0;
  const rationale = pass
    ? 'All Phase 3 prerequisites met. Customer foundation, naming/identity, GTM, and sales logic are complete.'
    : `Phase 3 is incomplete: ${blockers.length} blocker(s) found.`;

  return { pass, rationale, blockers, required_next_actions };
}

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage12;
ensureOutputSchema(TEMPLATE);

export { SALES_MODELS, CHANNEL_TYPES, REQUIRED_TIERS, REQUIRED_CHANNELS, MIN_DEAL_STAGES, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS, MIN_CANDIDATES };
export default TEMPLATE;
