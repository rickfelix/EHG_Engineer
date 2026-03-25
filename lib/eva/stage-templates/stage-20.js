/**
 * Stage 19 Template - Build Execution
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Build execution tracking with task statuses, progress,
 * and issue tracking.
 *
 * @module lib/eva/stage-templates/stage-19
 */

import { validateString, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage20 as analyzeStage19 } from './analysis-steps/stage-20-build-execution.js';

const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const ISSUE_STATUSES = ['open', 'investigating', 'resolved', 'deferred'];
const SPRINT_COMPLETION_DECISIONS = ['complete', 'continue', 'blocked'];
const MIN_TASKS = 1;

const TEMPLATE = {
  id: 'stage-19',
  slug: 'build-execution',
  title: 'Build Execution',
  version: '2.0.0',
  schema: {
    tasks: {
      type: 'array',
      minItems: MIN_TASKS,
      items: {
        name: { type: 'string', required: true },
        status: { type: 'enum', values: TASK_STATUSES, required: true },
        assignee: { type: 'string' },
        sprint_item_ref: { type: 'string' },
      },
    },
    issues: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: ISSUE_SEVERITIES, required: true },
        status: { type: 'enum', values: ISSUE_STATUSES, required: true },
      },
    },
    // Derived
    total_tasks: { type: 'number', derived: true },
    completed_tasks: { type: 'number', derived: true },
    blocked_tasks: { type: 'number', derived: true },
    completion_pct: { type: 'number', derived: true },
    tasks_by_status: { type: 'object', derived: true },
    sprintCompletion: { type: 'object', derived: true },
  },
  defaultData: {
    tasks: [],
    issues: [],
    total_tasks: 0,
    completed_tasks: 0,
    blocked_tasks: 0,
    completion_pct: 0,
    tasks_by_status: {},
    sprintCompletion: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const tasksCheck = validateArray(data?.tasks, 'tasks', MIN_TASKS);
    if (!tasksCheck.valid) {
      errors.push(tasksCheck.error);
    } else {
      for (let i = 0; i < data.tasks.length; i++) {
        const t = data.tasks[i];
        const prefix = `tasks[${i}]`;
        const results = [
          validateString(t?.name, `${prefix}.name`, 1),
          validateEnum(t?.status, `${prefix}.status`, TASK_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (data?.issues && Array.isArray(data.issues)) {
      for (let i = 0; i < data.issues.length; i++) {
        const issue = data.issues[i];
        const prefix = `issues[${i}]`;
        const results = [
          validateString(issue?.description, `${prefix}.description`, 1),
          validateEnum(issue?.severity, `${prefix}.severity`, ISSUE_SEVERITIES),
          validateEnum(issue?.status, `${prefix}.status`, ISSUE_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage19] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage19;
ensureOutputSchema(TEMPLATE);

export { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, SPRINT_COMPLETION_DECISIONS, MIN_TASKS };
export default TEMPLATE;
