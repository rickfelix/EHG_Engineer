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
import { analyzeStage19 } from './analysis-steps/stage-19-build-execution.js';

const TASK_STATUSES = ['todo', 'in_progress', 'done', 'blocked'];
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
        severity: { type: 'string', required: true },
        status: { type: 'string', required: true },
      },
    },
    // Derived
    total_tasks: { type: 'number', derived: true },
    completed_tasks: { type: 'number', derived: true },
    blocked_tasks: { type: 'number', derived: true },
    completion_pct: { type: 'number', derived: true },
    tasks_by_status: { type: 'object', derived: true },
  },
  defaultData: {
    tasks: [],
    issues: [],
    total_tasks: 0,
    completed_tasks: 0,
    blocked_tasks: 0,
    completion_pct: 0,
    tasks_by_status: {},
  },

  validate(data) {
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
          validateString(issue?.severity, `${prefix}.severity`, 1),
          validateString(issue?.status, `${prefix}.status`, 1),
        ];
        errors.push(...collectErrors(results));
      }
    }

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    const total_tasks = data.tasks.length;
    const completed_tasks = data.tasks.filter(t => t.status === 'done').length;
    const blocked_tasks = data.tasks.filter(t => t.status === 'blocked').length;
    const completion_pct = total_tasks > 0
      ? Math.round((completed_tasks / total_tasks) * 10000) / 100
      : 0;

    const tasks_by_status = {};
    for (const status of TASK_STATUSES) {
      tasks_by_status[status] = data.tasks.filter(t => t.status === status).length;
    }

    return {
      ...data,
      total_tasks,
      completed_tasks,
      blocked_tasks,
      completion_pct,
      tasks_by_status,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage19;

export { TASK_STATUSES, MIN_TASKS };
export default TEMPLATE;
