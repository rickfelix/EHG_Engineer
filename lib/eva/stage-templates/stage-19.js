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

  computeDerived(data, { logger = console } = {}) {
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

    // Sprint completion decision object
    const hasCriticalIssues = (data.issues || []).some(i => i.severity === 'critical' && i.status !== 'resolved');
    let sprintDecision;
    if (hasCriticalIssues || blocked_tasks > 0) {
      sprintDecision = 'blocked';
    } else if (completion_pct >= 100) {
      sprintDecision = 'complete';
    } else {
      sprintDecision = 'continue';
    }

    const sprintCompletion = {
      decision: sprintDecision,
      rationale: sprintDecision === 'complete'
        ? 'All tasks completed'
        : sprintDecision === 'blocked'
          ? `${blocked_tasks} blocked task(s)${hasCriticalIssues ? ', critical issues unresolved' : ''}`
          : `${completion_pct}% complete, work in progress`,
      readyForQa: completion_pct >= 80 && !hasCriticalIssues,
    };

    return {
      ...data,
      total_tasks,
      completed_tasks,
      blocked_tasks,
      completion_pct,
      tasks_by_status,
      sprintCompletion,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage19;

export { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES, SPRINT_COMPLETION_DECISIONS, MIN_TASKS };
export default TEMPLATE;
