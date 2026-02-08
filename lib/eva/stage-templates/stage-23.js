/**
 * Stage 23 Template - Launch Execution
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Launch execution with Go/No-Go kill gate.
 * Kill gate requires:
 *   - go_decision set to "go"
 *   - incident_response_plan present
 *   - monitoring_setup present
 *   - rollback_plan present
 *
 * @module lib/eva/stage-templates/stage-23
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';

const GO_DECISIONS = ['go', 'no-go'];
const MIN_LAUNCH_TASKS = 1;

const TEMPLATE = {
  id: 'stage-23',
  slug: 'launch-execution',
  title: 'Launch Execution',
  version: '1.0.0',
  schema: {
    go_decision: { type: 'enum', values: GO_DECISIONS, required: true },
    incident_response_plan: { type: 'string', minLength: 10, required: true },
    monitoring_setup: { type: 'string', minLength: 10, required: true },
    rollback_plan: { type: 'string', minLength: 10, required: true },
    launch_tasks: {
      type: 'array',
      minItems: MIN_LAUNCH_TASKS,
      items: {
        name: { type: 'string', required: true },
        status: { type: 'string', required: true },
        owner: { type: 'string' },
      },
    },
    launch_date: { type: 'string', required: true },
    // Derived
    decision: { type: 'enum', values: ['pass', 'kill'], derived: true },
    blockProgression: { type: 'boolean', derived: true },
    reasons: { type: 'array', derived: true },
  },
  defaultData: {
    go_decision: null,
    incident_response_plan: null,
    monitoring_setup: null,
    rollback_plan: null,
    launch_tasks: [],
    launch_date: null,
    decision: null,
    blockProgression: false,
    reasons: [],
  },

  validate(data) {
    const errors = [];

    const goCheck = validateEnum(data?.go_decision, 'go_decision', GO_DECISIONS);
    if (!goCheck.valid) errors.push(goCheck.error);

    const irpCheck = validateString(data?.incident_response_plan, 'incident_response_plan', 10);
    if (!irpCheck.valid) errors.push(irpCheck.error);

    const monCheck = validateString(data?.monitoring_setup, 'monitoring_setup', 10);
    if (!monCheck.valid) errors.push(monCheck.error);

    const rollbackCheck = validateString(data?.rollback_plan, 'rollback_plan', 10);
    if (!rollbackCheck.valid) errors.push(rollbackCheck.error);

    const tasksCheck = validateArray(data?.launch_tasks, 'launch_tasks', MIN_LAUNCH_TASKS);
    if (!tasksCheck.valid) {
      errors.push(tasksCheck.error);
    } else {
      for (let i = 0; i < data.launch_tasks.length; i++) {
        const t = data.launch_tasks[i];
        const prefix = `launch_tasks[${i}]`;
        const results = [
          validateString(t?.name, `${prefix}.name`, 1),
          validateString(t?.status, `${prefix}.status`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    const dateCheck = validateString(data?.launch_date, 'launch_date', 1);
    if (!dateCheck.valid) errors.push(dateCheck.error);

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    const { decision, blockProgression, reasons } = evaluateKillGate({
      go_decision: data.go_decision,
      incident_response_plan: data.incident_response_plan,
      monitoring_setup: data.monitoring_setup,
      rollback_plan: data.rollback_plan,
    });

    return { ...data, decision, blockProgression, reasons };
  },
};

/**
 * Pure function: evaluate Go/No-Go kill gate for Stage 23.
 *
 * @param {{ go_decision: string, incident_response_plan: string, monitoring_setup: string, rollback_plan: string }} params
 * @returns {{ decision: 'pass'|'kill', blockProgression: boolean, reasons: Object[] }}
 */
export function evaluateKillGate({ go_decision, incident_response_plan, monitoring_setup, rollback_plan }) {
  const reasons = [];

  if (go_decision !== 'go') {
    reasons.push({
      type: 'no_go_decision',
      message: go_decision === 'no-go'
        ? 'Launch decision is no-go'
        : 'Go/no-go decision not set',
    });
  }

  if (go_decision === 'go') {
    if (!incident_response_plan || incident_response_plan.trim().length < 10) {
      reasons.push({
        type: 'missing_incident_response',
        message: 'Incident response plan is required for GO decision',
      });
    }
    if (!monitoring_setup || monitoring_setup.trim().length < 10) {
      reasons.push({
        type: 'missing_monitoring',
        message: 'Monitoring setup is required for GO decision',
      });
    }
    if (!rollback_plan || rollback_plan.trim().length < 10) {
      reasons.push({
        type: 'missing_rollback',
        message: 'Rollback plan is required for GO decision',
      });
    }
  }

  const decision = reasons.length > 0 ? 'kill' : 'pass';
  return { decision, blockProgression: decision === 'kill', reasons };
}

export { GO_DECISIONS, MIN_LAUNCH_TASKS };
export default TEMPLATE;
