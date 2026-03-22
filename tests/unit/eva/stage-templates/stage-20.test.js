/**
 * Unit tests for Stage 19 - Build Execution template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 19 validation enforces task tracking and
 * computes completion percentage.
 *
 * @module tests/unit/eva/stage-templates/stage-19.test
 */

import { describe, it, expect } from 'vitest';
import stage19, {
  TASK_STATUSES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  SPRINT_COMPLETION_DECISIONS,
  MIN_TASKS,
} from '../../../../lib/eva/stage-templates/stage-19.js';

describe('stage-19.js - Build Execution template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage19.id).toBe('stage-19');
      expect(stage19.slug).toBe('build-execution');
      expect(stage19.title).toBe('Build Execution');
      expect(stage19.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage19.schema).toBeDefined();
      expect(stage19.schema.tasks).toBeDefined();
      expect(stage19.schema.issues).toBeDefined();
      expect(stage19.schema.total_tasks).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage19.defaultData).toEqual({
        tasks: [],
        issues: [],
        total_tasks: 0,
        completed_tasks: 0,
        blocked_tasks: 0,
        completion_pct: 0,
        tasks_by_status: {},
        sprintCompletion: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage19.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage19.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(TASK_STATUSES).toEqual(['pending', 'in_progress', 'done', 'blocked']);
      expect(ISSUE_SEVERITIES).toEqual(['critical', 'high', 'medium', 'low']);
      expect(ISSUE_STATUSES).toEqual(['open', 'investigating', 'resolved', 'deferred']);
      expect(SPRINT_COMPLETION_DECISIONS).toEqual(['complete', 'continue', 'blocked']);
      expect(MIN_TASKS).toBe(1);
    });
  });

  describe('validate() - Tasks', () => {
    it('should pass for valid tasks', () => {
      const validData = {
        tasks: [
          { name: 'Task 1', status: 'done', assignee: 'Dev 1', sprint_item_ref: 'ITEM-1' },
          { name: 'Task 2', status: 'in_progress' },
        ],
      };
      const result = stage19.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing tasks array', () => {
      const invalidData = {};
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks'))).toBe(true);
    });

    it('should fail for empty tasks array', () => {
      const invalidData = { tasks: [] };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for task missing name', () => {
      const invalidData = {
        tasks: [{ status: 'done' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks[0].name'))).toBe(true);
    });

    it('should fail for task missing status', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks[0].status'))).toBe(true);
    });

    it('should fail for task with invalid status', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'invalid' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tasks[0].status'))).toBe(true);
    });

    it('should pass with optional fields (assignee, sprint_item_ref)', () => {
      const validData = {
        tasks: [
          { name: 'Task 1', status: 'done', assignee: 'Dev 1', sprint_item_ref: 'ITEM-1' },
        ],
      };
      const result = stage19.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Issues (optional)', () => {
    it('should pass when issues are omitted', () => {
      const validData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
      };
      const result = stage19.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when issues are empty array', () => {
      const validData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [],
      };
      const result = stage19.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when issues have valid items', () => {
      const validData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [
          { description: 'Issue 1', severity: 'high', status: 'open' },
        ],
      };
      const result = stage19.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for issue missing description', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [{ severity: 'high', status: 'open' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issues[0].description'))).toBe(true);
    });

    it('should fail for issue missing severity', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [{ description: 'Issue 1', status: 'open' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issues[0].severity'))).toBe(true);
    });

    it('should fail for issue missing status', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [{ description: 'Issue 1', severity: 'high' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issues[0].status'))).toBe(true);
    });
    it('should fail for issue with invalid severity enum value', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [{ description: 'Issue 1', severity: 'urgent', status: 'open' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issues[0].severity'))).toBe(true);
    });

    it('should fail for issue with invalid status enum value', () => {
      const invalidData = {
        tasks: [{ name: 'Task 1', status: 'done' }],
        issues: [{ description: 'Issue 1', severity: 'high', status: 'closed' }],
      };
      const result = stage19.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('issues[0].status'))).toBe(true);
    });
  });

  describe('computeDerived() - Task metrics', () => {
    it('should calculate total_tasks correctly', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'in_progress' },
          { name: 'T3', status: 'pending' },
        ],
      };
      const result = stage19.computeDerived(data);
      expect(result.total_tasks).toBe(3);
    });

    it('should calculate completed_tasks correctly', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'in_progress' },
          { name: 'T3', status: 'done' },
          { name: 'T4', status: 'blocked' },
        ],
      };
      const result = stage19.computeDerived(data);
      expect(result.completed_tasks).toBe(2);
    });

    it('should calculate blocked_tasks correctly', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'blocked' },
          { name: 'T3', status: 'in_progress' },
          { name: 'T4', status: 'blocked' },
        ],
      };
      const result = stage19.computeDerived(data);
      expect(result.blocked_tasks).toBe(2);
    });

    it('should calculate completion_pct correctly', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'done' },
          { name: 'T3', status: 'in_progress' },
          { name: 'T4', status: 'pending' },
          { name: 'T5', status: 'blocked' },
        ],
      };
      const result = stage19.computeDerived(data);
      // 2 done out of 5 = 40%
      expect(result.completion_pct).toBe(40);
    });

    it('should return 0 completion_pct for zero tasks', () => {
      const data = { tasks: [] };
      const result = stage19.computeDerived(data);
      expect(result.completion_pct).toBe(0);
    });

    it('should calculate completion_pct to 2 decimal places', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'in_progress' },
          { name: 'T3', status: 'pending' },
        ],
      };
      const result = stage19.computeDerived(data);
      // 1 done out of 3 = 33.33%
      expect(result.completion_pct).toBe(33.33);
    });
  });

  describe('computeDerived() - Tasks by status', () => {
    it('should calculate tasks_by_status correctly', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
          { name: 'T2', status: 'done' },
          { name: 'T3', status: 'in_progress' },
          { name: 'T4', status: 'pending' },
          { name: 'T5', status: 'blocked' },
        ],
      };
      const result = stage19.computeDerived(data);
      expect(result.tasks_by_status).toEqual({
        pending: 1,
        in_progress: 1,
        done: 2,
        blocked: 1,
      });
    });

    it('should include all statuses in tasks_by_status', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
        ],
      };
      const result = stage19.computeDerived(data);
      TASK_STATUSES.forEach(status => {
        expect(result.tasks_by_status).toHaveProperty(status);
      });
    });

    it('should return 0 counts for statuses with no tasks', () => {
      const data = {
        tasks: [
          { name: 'T1', status: 'done' },
        ],
      };
      const result = stage19.computeDerived(data);
      expect(result.tasks_by_status.pending).toBe(0);
      expect(result.tasks_by_status.in_progress).toBe(0);
      expect(result.tasks_by_status.done).toBe(1);
      expect(result.tasks_by_status.blocked).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty tasks array in computeDerived', () => {
      const data = { tasks: [] };
      const result = stage19.computeDerived(data);
      expect(result.total_tasks).toBe(0);
      expect(result.completed_tasks).toBe(0);
      expect(result.blocked_tasks).toBe(0);
      expect(result.completion_pct).toBe(0);
      expect(result.tasks_by_status).toEqual({
        pending: 0,
        in_progress: 0,
        done: 0,
        blocked: 0,
      });
    });

    it('should handle null data in validate', () => {
      const result = stage19.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage19.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        tasks: [
          { name: 'Task 1', status: 'done', assignee: 'Dev 1' },
          { name: 'Task 2', status: 'in_progress', assignee: 'Dev 2' },
          { name: 'Task 3', status: 'pending' },
        ],
        issues: [
          { description: 'Issue 1', severity: 'medium', status: 'open' },
        ],
      };
      const validation = stage19.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage19.computeDerived(data);
      expect(computed.total_tasks).toBe(3);
      expect(computed.completed_tasks).toBe(1);
      expect(computed.blocked_tasks).toBe(0);
      expect(computed.completion_pct).toBe(33.33);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        tasks: [
          { name: 'Task 1', status: 'invalid_status' },
        ],
      };
      const computed = stage19.computeDerived(data);
      expect(computed.total_tasks).toBe(1);
      expect(computed.completed_tasks).toBe(0);
    });
  });
});
