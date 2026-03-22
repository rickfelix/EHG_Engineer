/**
 * Stage 24 Template - Launch Readiness
 * Phase: THE LAUNCH (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Chairman go/no-go launch decision gate with real upstream readiness data.
 * Readiness checklist: release_confirmed, marketing_complete,
 * monitoring_ready, rollback_plan_exists.
 *
 * Replaces the former Metrics & Learning template (AARRR framework
 * becomes a continuous operations service, not a pipeline stage).
 *
 * @module lib/eva/stage-templates/stage-24
 */

import { validateString, validateNumber, validateEnum, validateArray, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage24 } from './analysis-steps/stage-25-launch-readiness.js';
import { createOrReusePendingDecision } from '../chairman-decision-watcher.js';

const GO_NO_GO_DECISIONS = ['go', 'no_go', 'conditional_go'];
const CHECKLIST_ITEM_STATUSES = ['pass', 'fail', 'pending', 'waived'];

const READINESS_CHECKLIST_KEYS = [
  'release_confirmed',
  'marketing_complete',
  'monitoring_ready',
  'rollback_plan_exists',
];

// Weights for readiness score computation
const CHECKLIST_WEIGHTS = {
  release_confirmed: 0.35,
  marketing_complete: 0.25,
  monitoring_ready: 0.20,
  rollback_plan_exists: 0.20,
};

const TEMPLATE = {
  id: 'stage-24',
  slug: 'launch-readiness',
  title: 'Launch Readiness',
  version: '2.0.0',
  schema: {
    readiness_checklist: {
      type: 'object',
      required: true,
      properties: Object.fromEntries(READINESS_CHECKLIST_KEYS.map(key => [key, {
        type: 'object',
        fields: {
          status: { type: 'enum', values: CHECKLIST_ITEM_STATUSES, required: true },
          evidence: { type: 'string', required: true },
          verified_at: { type: 'string' },
        },
      }])),
    },
    go_no_go_decision: { type: 'enum', values: GO_NO_GO_DECISIONS },
    decision_rationale: { type: 'string', minLength: 10 },
    incident_response_plan: { type: 'string', minLength: 10, required: true },
    monitoring_setup: { type: 'string', minLength: 10, required: true },
    rollback_plan: { type: 'string', minLength: 10, required: true },
    launch_risks: {
      type: 'array',
      items: {
        risk: { type: 'string', required: true },
        severity: { type: 'enum', values: ['critical', 'high', 'medium', 'low'] },
        mitigation: { type: 'string', required: true },
      },
    },
    // Chairman governance gate
    chairmanGate: {
      type: 'object',
      fields: {
        status: { type: 'string' },
        rationale: { type: 'string' },
        decision_id: { type: 'string' },
      },
    },
    // Derived
    readiness_score: { type: 'number', derived: true },
    all_checks_pass: { type: 'boolean', derived: true },
    blocking_items: { type: 'array', derived: true },
  },
  defaultData: {
    readiness_checklist: Object.fromEntries(
      READINESS_CHECKLIST_KEYS.map(key => [key, { status: 'pending', evidence: null, verified_at: null }])
    ),
    go_no_go_decision: null,
    decision_rationale: null,
    incident_response_plan: null,
    monitoring_setup: null,
    rollback_plan: null,
    launch_risks: [],
    chairmanGate: { status: 'pending', rationale: null, decision_id: null },
    readiness_score: 0,
    all_checks_pass: false,
    blocking_items: [],
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    // Validate readiness checklist
    if (!data?.readiness_checklist || typeof data.readiness_checklist !== 'object') {
      errors.push('readiness_checklist is required and must be an object');
    } else {
      for (const key of READINESS_CHECKLIST_KEYS) {
        const item = data.readiness_checklist[key];
        if (!item) {
          errors.push(`readiness_checklist.${key} is required`);
          continue;
        }
        if (!CHECKLIST_ITEM_STATUSES.includes(item.status)) {
          errors.push(`readiness_checklist.${key}.status must be one of [${CHECKLIST_ITEM_STATUSES.join(', ')}]`);
        }
        const evidenceCheck = validateString(item?.evidence, `readiness_checklist.${key}.evidence`, 1);
        if (!evidenceCheck.valid) errors.push(evidenceCheck.error);
      }
    }

    // Validate operational readiness items
    const irpCheck = validateString(data?.incident_response_plan, 'incident_response_plan', 10);
    if (!irpCheck.valid) errors.push(irpCheck.error);

    const monCheck = validateString(data?.monitoring_setup, 'monitoring_setup', 10);
    if (!monCheck.valid) errors.push(monCheck.error);

    const rollbackCheck = validateString(data?.rollback_plan, 'rollback_plan', 10);
    if (!rollbackCheck.valid) errors.push(rollbackCheck.error);

    // Chairman governance gate check
    const gateStatus = data?.chairmanGate?.status;
    if (gateStatus === 'rejected') {
      errors.push(`Chairman gate rejected: ${data.chairmanGate.rationale || 'No rationale provided'}`);
    } else if (gateStatus !== 'approved') {
      errors.push('Chairman launch readiness gate is pending — awaiting chairman decision');
    }

    if (errors.length > 0) { logger.warn('[Stage24] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, _prerequisites, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

/**
 * Pure function: compute readiness score from checklist items.
 *
 * @param {{ readiness_checklist: Object }} params
 * @returns {{ readiness_score: number, all_checks_pass: boolean, blocking_items: string[] }}
 */
export function computeReadinessScore({ readiness_checklist }) {
  if (!readiness_checklist || typeof readiness_checklist !== 'object') {
    return { readiness_score: 0, all_checks_pass: false, blocking_items: READINESS_CHECKLIST_KEYS.slice() };
  }

  let weightedScore = 0;
  const blocking_items = [];

  for (const key of READINESS_CHECKLIST_KEYS) {
    const item = readiness_checklist[key];
    const weight = CHECKLIST_WEIGHTS[key] || 0;

    if (item?.status === 'pass') {
      weightedScore += weight * 100;
    } else if (item?.status === 'waived') {
      weightedScore += weight * 50; // Waived counts as partial
    } else {
      blocking_items.push(key);
    }
  }

  const readiness_score = Math.round(weightedScore);
  const all_checks_pass = blocking_items.length === 0;

  return { readiness_score, all_checks_pass, blocking_items };
}

/**
 * Pre-analysis hook: create or reuse a PENDING chairman decision.
 * Blocks launch until chairman reviews readiness and approves.
 */
TEMPLATE.onBeforeAnalysis = async function onBeforeAnalysis(supabase, ventureId) {
  const { id, isNew } = await createOrReusePendingDecision({
    ventureId,
    stageNumber: 24,
    summary: 'Chairman launch readiness go/no-go decision required for Stage 24',
    supabase,
  });
  return { chairmanDecisionId: id, isNew };
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage24;
ensureOutputSchema(TEMPLATE);

export {
  GO_NO_GO_DECISIONS,
  CHECKLIST_ITEM_STATUSES,
  READINESS_CHECKLIST_KEYS,
  CHECKLIST_WEIGHTS,
};
export default TEMPLATE;
