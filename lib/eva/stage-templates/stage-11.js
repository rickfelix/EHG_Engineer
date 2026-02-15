/**
 * Stage 11 Template - GTM (Go-To-Market)
 * Phase: THE IDENTITY (Stages 10-12)
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Exactly 3 target-market tiers and exactly 8 acquisition channels.
 * Each channel requires budget and CAC fields.
 * Launch timeline with milestones.
 *
 * @module lib/eva/stage-templates/stage-11
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { analyzeStage11 } from './analysis-steps/stage-11-gtm.js';

const REQUIRED_TIERS = 3;
const REQUIRED_CHANNELS = 8;
const CHANNEL_TYPES = ['paid', 'organic', 'earned', 'owned'];

const CHANNEL_NAMES = [
  'Organic Search',
  'Paid Search',
  'Social Media',
  'Content Marketing',
  'Email Marketing',
  'Partnerships',
  'Events',
  'Direct Sales',
  'Referrals',
  'PR/Media',
  'Influencer Marketing',
  'Community',
];

const TEMPLATE = {
  id: 'stage-11',
  slug: 'gtm',
  title: 'Go-To-Market',
  version: '2.0.0',
  schema: {
    tiers: {
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
        target_cac: { type: 'number', min: 0 },
        primary_kpi: { type: 'string', required: true },
      },
    },
    launch_timeline: {
      type: 'array',
      minItems: 1,
      items: {
        milestone: { type: 'string', required: true },
        date: { type: 'string', required: true },
        owner: { type: 'string' },
      },
    },
    // Derived
    total_monthly_budget: { type: 'number', derived: true },
    avg_cac: { type: 'number', derived: true },
  },
  defaultData: {
    tiers: [],
    channels: [],
    launch_timeline: [],
    total_monthly_budget: null,
    avg_cac: null,
  },

  /**
   * Validate stage input data.
   * @param {Object} data
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate(data, { logger = console } = {}) {
    const errors = [];

    // Tiers: exactly 3
    if (!Array.isArray(data?.tiers)) {
      errors.push('tiers must be an array');
    } else if (data.tiers.length !== REQUIRED_TIERS) {
      errors.push(`tiers must have exactly ${REQUIRED_TIERS} items (got ${data.tiers.length})`);
    } else {
      for (let i = 0; i < data.tiers.length; i++) {
        const t = data.tiers[i];
        const prefix = `tiers[${i}]`;
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
      }
    }

    // Launch timeline
    const timelineCheck = validateArray(data?.launch_timeline, 'launch_timeline', 1);
    if (!timelineCheck.valid) {
      errors.push(timelineCheck.error);
    } else {
      for (let i = 0; i < data.launch_timeline.length; i++) {
        const m = data.launch_timeline[i];
        const prefix = `launch_timeline[${i}]`;
        const results = [
          validateString(m?.milestone, `${prefix}.milestone`, 1),
          validateString(m?.date, `${prefix}.date`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage11] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  /**
   * Compute derived fields: total budget and average CAC.
   * @param {Object} data - Validated input data
   * @returns {Object} Data with derived metrics
   */
  computeDerived(data, { logger = console } = {}) {
    const total_monthly_budget = data.channels.reduce((sum, ch) => sum + ch.monthly_budget, 0);
    const cacValues = data.channels.filter(ch => ch.expected_cac > 0);
    const avg_cac = cacValues.length > 0
      ? cacValues.reduce((sum, ch) => sum + ch.expected_cac, 0) / cacValues.length
      : null;

    return { ...data, total_monthly_budget, avg_cac };
  },
};

TEMPLATE.analysisStep = analyzeStage11;

export { REQUIRED_TIERS, REQUIRED_CHANNELS, CHANNEL_NAMES, CHANNEL_TYPES };
export default TEMPLATE;
