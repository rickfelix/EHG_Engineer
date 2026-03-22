/**
 * Stage 25 Template - Launch Execution
 * Phase: THE LAUNCH (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Pipeline terminus: execute go-live, activate distribution channels,
 * and hand off to operations. Sets ventures.pipeline_mode to 'operations'.
 *
 * Replaces the former Venture Review template (drift detection and
 * venture health assessment become continuous operations services).
 *
 * @module lib/eva/stage-templates/stage-25
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage25 } from './analysis-steps/stage-26-launch-execution.js';

const CHANNEL_STATUSES = ['inactive', 'activating', 'active', 'failed', 'paused'];
const PIPELINE_MODES = ['discovery', 'build', 'launch', 'operations'];
const ESCALATION_LEVELS = ['L1', 'L2', 'L3'];
const MIN_DISTRIBUTION_CHANNELS = 1;

const TEMPLATE = {
  id: 'stage-25',
  slug: 'launch-execution',
  title: 'Launch Execution',
  version: '2.0.0',
  schema: {
    distribution_channels: {
      type: 'array',
      minItems: MIN_DISTRIBUTION_CHANNELS,
      required: true,
      items: {
        name: { type: 'string', required: true },
        type: { type: 'string', required: true },
        status: { type: 'enum', values: CHANNEL_STATUSES, required: true },
        activation_date: { type: 'string' },
        metrics_endpoint: { type: 'string' },
      },
    },
    operations_handoff: {
      type: 'object',
      required: true,
      fields: {
        monitoring: {
          type: 'object',
          fields: {
            dashboards: { type: 'array' },
            alerts: { type: 'array' },
            health_check_url: { type: 'string' },
          },
        },
        escalation: {
          type: 'object',
          fields: {
            contacts: { type: 'array' },
            runbook_url: { type: 'string' },
            sla_targets: { type: 'object' },
          },
        },
        maintenance: {
          type: 'object',
          fields: {
            schedule: { type: 'string' },
            backup_strategy: { type: 'string' },
            update_policy: { type: 'string' },
          },
        },
      },
    },
    launch_summary: { type: 'string', minLength: 10, required: true },
    go_live_timestamp: { type: 'string' },
    // Derived
    pipeline_terminus: { type: 'boolean', derived: true },
    pipeline_mode: { type: 'enum', values: PIPELINE_MODES, derived: true },
    channels_active_count: { type: 'number', derived: true },
    channels_total_count: { type: 'number', derived: true },
  },
  defaultData: {
    distribution_channels: [],
    operations_handoff: {
      monitoring: { dashboards: [], alerts: [], health_check_url: null },
      escalation: { contacts: [], runbook_url: null, sla_targets: {} },
      maintenance: { schedule: null, backup_strategy: null, update_policy: null },
    },
    launch_summary: null,
    go_live_timestamp: null,
    pipeline_terminus: false,
    pipeline_mode: 'launch',
    channels_active_count: 0,
    channels_total_count: 0,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    // Validate distribution channels
    const channelsCheck = validateArray(data?.distribution_channels, 'distribution_channels', MIN_DISTRIBUTION_CHANNELS);
    if (!channelsCheck.valid) {
      errors.push(channelsCheck.error);
    } else {
      for (let i = 0; i < data.distribution_channels.length; i++) {
        const ch = data.distribution_channels[i];
        const prefix = `distribution_channels[${i}]`;
        const results = [
          validateString(ch?.name, `${prefix}.name`, 1),
          validateString(ch?.type, `${prefix}.type`, 1),
        ];
        errors.push(...collectErrors(results));

        if (ch?.status && !CHANNEL_STATUSES.includes(ch.status)) {
          errors.push(`${prefix}.status must be one of [${CHANNEL_STATUSES.join(', ')}] (got '${ch.status}')`);
        }
      }
    }

    // Validate operations handoff
    if (!data?.operations_handoff || typeof data.operations_handoff !== 'object') {
      errors.push('operations_handoff is required and must be an object');
    } else {
      const handoff = data.operations_handoff;
      if (!handoff.monitoring || typeof handoff.monitoring !== 'object') {
        errors.push('operations_handoff.monitoring is required');
      }
      if (!handoff.escalation || typeof handoff.escalation !== 'object') {
        errors.push('operations_handoff.escalation is required');
      }
    }

    // Validate launch summary
    const summaryCheck = validateString(data?.launch_summary, 'launch_summary', 10);
    if (!summaryCheck.valid) errors.push(summaryCheck.error);

    if (errors.length > 0) { logger.warn('[Stage25] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

/**
 * Pure function: verify Stage 24 chairman gate approval before launch.
 *
 * @param {{ stage24Data?: Object }} params
 * @returns {{ authorized: boolean, reasons: string[] }}
 */
export function verifyLaunchAuthorization({ stage24Data }) {
  const reasons = [];

  if (!stage24Data) {
    reasons.push('Stage 24 launch readiness data not available');
    return { authorized: false, reasons };
  }

  // Check chairman gate
  const gateStatus = stage24Data.chairmanGate?.status;
  if (gateStatus !== 'approved') {
    reasons.push(`Stage 24 chairman gate status is '${gateStatus || 'unknown'}', not 'approved'`);
  }

  // Check go/no-go decision
  const decision = stage24Data.go_no_go_decision;
  if (decision !== 'go' && decision !== 'conditional_go') {
    reasons.push(`Stage 24 go/no-go decision is '${decision || 'not set'}', expected 'go' or 'conditional_go'`);
  }

  return { authorized: reasons.length === 0, reasons };
}

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage25;
ensureOutputSchema(TEMPLATE);

export { CHANNEL_STATUSES, PIPELINE_MODES, ESCALATION_LEVELS, MIN_DISTRIBUTION_CHANNELS };
export default TEMPLATE;
