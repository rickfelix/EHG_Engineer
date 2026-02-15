/**
 * Unit tests for Stage 23 - Launch Execution template
 * Part of SD-LEO-FEAT-TMPL-LAUNCH-001
 *
 * Test Scenario: Stage 23 validation enforces Go/No-Go kill gate with
 * incident response, monitoring, and rollback plan requirements.
 *
 * @module tests/unit/eva/stage-templates/stage-23.test
 */

import { describe, it, expect } from 'vitest';
import stage23, { evaluateKillGate, GO_DECISIONS, LAUNCH_TYPES, MIN_LAUNCH_TASKS } from '../../../../lib/eva/stage-templates/stage-23.js';

describe('stage-23.js - Launch Execution template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage23.id).toBe('stage-23');
      expect(stage23.slug).toBe('launch-execution');
      expect(stage23.title).toBe('Launch Execution');
      expect(stage23.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage23.schema).toBeDefined();
      expect(stage23.schema.go_decision).toBeDefined();
      expect(stage23.schema.incident_response_plan).toBeDefined();
      expect(stage23.schema.monitoring_setup).toBeDefined();
      expect(stage23.schema.rollback_plan).toBeDefined();
      expect(stage23.schema.launch_tasks).toBeDefined();
      expect(stage23.schema.launch_date).toBeDefined();
      expect(stage23.schema.decision).toBeDefined();
      expect(stage23.schema.blockProgression).toBeDefined();
      expect(stage23.schema.reasons).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage23.defaultData).toEqual({
        go_decision: null,
        launchType: null,
        incident_response_plan: null,
        monitoring_setup: null,
        rollback_plan: null,
        launch_tasks: [],
        launch_date: null,
        planned_launch_date: null,
        actual_launch_date: null,
        successCriteria: [],
        rollbackTriggers: [],
        decision: null,
        blockProgression: false,
        reasons: [],
      });
    });

    it('should have validate function', () => {
      expect(typeof stage23.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage23.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(GO_DECISIONS).toEqual(['go', 'no-go', 'conditional_go']);
      expect(LAUNCH_TYPES).toEqual(['soft_launch', 'hard_launch', 'staged_rollout', 'beta_release']);
      expect(MIN_LAUNCH_TASKS).toBe(1);
    });

    it('should export evaluateKillGate function', () => {
      expect(typeof evaluateKillGate).toBe('function');
    });
  });

  describe('validate() - Go/No-Go decision', () => {
    it('should pass for valid go decision', () => {
      const validData = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [
          { name: 'Deploy to production', status: 'ready', owner: 'DevOps' },
        ],
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for valid no-go decision', () => {
      const validData = {
        go_decision: 'no-go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [
          { name: 'Deploy to production', status: 'blocked' },
        ],
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing go_decision', () => {
      const invalidData = {
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('go_decision'))).toBe(true);
    });

    it('should fail for invalid go_decision value', () => {
      const invalidData = {
        go_decision: 'maybe',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('go_decision'))).toBe(true);
    });
  });

  describe('validate() - Required plans', () => {
    const validTasks = [{ name: 'Deploy to production', status: 'ready' }];

    it('should fail for missing incident_response_plan', () => {
      const invalidData = {
        go_decision: 'go',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('incident_response_plan'))).toBe(true);
    });

    it('should fail for incident_response_plan < 10 characters', () => {
      const invalidData = {
        go_decision: 'go',
        incident_response_plan: 'Short',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('incident_response_plan'))).toBe(true);
    });

    it('should fail for missing monitoring_setup', () => {
      const invalidData = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monitoring_setup'))).toBe(true);
    });

    it('should fail for monitoring_setup < 10 characters', () => {
      const invalidData = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Short',
        rollback_plan: 'Rollback plan details',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monitoring_setup'))).toBe(true);
    });

    it('should fail for missing rollback_plan', () => {
      const invalidData = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rollback_plan'))).toBe(true);
    });

    it('should fail for rollback_plan < 10 characters', () => {
      const invalidData = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Short',
        launch_tasks: validTasks,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rollback_plan'))).toBe(true);
    });
  });

  describe('validate() - Launch tasks', () => {
    const validPlans = {
      go_decision: 'go',
      incident_response_plan: 'Incident response plan details',
      monitoring_setup: 'Monitoring setup details',
      rollback_plan: 'Rollback plan details',
      launch_date: '2026-03-01',
    };

    it('should fail for missing launch_tasks', () => {
      const invalidData = { ...validPlans };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_tasks'))).toBe(true);
    });

    it('should fail for empty launch_tasks array', () => {
      const invalidData = {
        ...validPlans,
        launch_tasks: [],
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_tasks') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for launch task missing name', () => {
      const invalidData = {
        ...validPlans,
        launch_tasks: [{ status: 'ready' }],
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_tasks[0].name'))).toBe(true);
    });

    it('should fail for launch task missing status', () => {
      const invalidData = {
        ...validPlans,
        launch_tasks: [{ name: 'Deploy to production' }],
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_tasks[0].status'))).toBe(true);
    });

    it('should pass with optional owner field', () => {
      const validData = {
        ...validPlans,
        launch_tasks: [
          { name: 'Deploy to production', status: 'ready', owner: 'DevOps' },
        ],
      };
      const result = stage23.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should validate multiple launch tasks', () => {
      const validData = {
        ...validPlans,
        launch_tasks: [
          { name: 'Deploy to production', status: 'ready', owner: 'DevOps' },
          { name: 'Update DNS', status: 'pending', owner: 'SRE' },
          { name: 'Notify customers', status: 'ready', owner: 'Marketing' },
        ],
      };
      const result = stage23.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Launch date', () => {
    const validData = {
      go_decision: 'go',
      incident_response_plan: 'Incident response plan details',
      monitoring_setup: 'Monitoring setup details',
      rollback_plan: 'Rollback plan details',
      launch_tasks: [{ name: 'Deploy', status: 'ready' }],
    };

    it('should fail for missing launch_date', () => {
      const invalidData = { ...validData };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_date'))).toBe(true);
    });

    it('should fail for empty launch_date', () => {
      const invalidData = {
        ...validData,
        launch_date: '',
      };
      const result = stage23.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_date'))).toBe(true);
    });

    it('should pass for valid launch_date', () => {
      const validDataWithDate = {
        ...validData,
        launch_date: '2026-03-01',
      };
      const result = stage23.validate(validDataWithDate);
      expect(result.valid).toBe(true);
    });
  });

  describe('evaluateKillGate() - Pure function', () => {
    it('should pass for go decision with all required plans', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should kill for no-go decision', () => {
      const result = evaluateKillGate({
        go_decision: 'no-go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('no_go_decision');
      expect(result.reasons[0].message).toContain('no-go');
    });

    it('should kill for null go_decision', () => {
      const result = evaluateKillGate({
        go_decision: null,
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('no_go_decision');
      expect(result.reasons[0].message).toContain('not set');
    });

    it('should kill for go decision missing incident_response_plan', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: null,
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('missing_incident_response');
      expect(result.reasons[0].message).toContain('Incident response plan');
    });

    it('should kill for go decision with short incident_response_plan', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Short',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('missing_incident_response');
    });

    it('should kill for go decision missing monitoring_setup', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: null,
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('missing_monitoring');
      expect(result.reasons[0].message).toContain('Monitoring setup');
    });

    it('should kill for go decision missing rollback_plan', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: null,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('missing_rollback');
      expect(result.reasons[0].message).toContain('Rollback plan');
    });

    it('should collect multiple blockers for go decision', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: null,
        monitoring_setup: 'Short',
        rollback_plan: null,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(3);
      expect(result.reasons.some(r => r.type === 'missing_incident_response')).toBe(true);
      expect(result.reasons.some(r => r.type === 'missing_monitoring')).toBe(true);
      expect(result.reasons.some(r => r.type === 'missing_rollback')).toBe(true);
    });

    it('should not check plans for no-go decision', () => {
      const result = evaluateKillGate({
        go_decision: 'no-go',
        incident_response_plan: null,
        monitoring_setup: null,
        rollback_plan: null,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('no_go_decision');
    });

    it('should kill when stage22 promotion gate has not passed (Launch CC-3)', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        stage22Data: {
          promotion_gate: { pass: false, blockers: ['Test coverage below 80%', 'Integration failing'] },
        },
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      const s22Reason = result.reasons.find(r => r.type === 'stage22_not_complete');
      expect(s22Reason).toBeDefined();
      expect(s22Reason.message).toContain('2 blocker(s)');
    });

    it('should pass when stage22 promotion gate has passed', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        stage22Data: {
          promotion_gate: { pass: true, blockers: [], warnings: [] },
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('should not check stage22 when stage22Data is not provided', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
      });
      expect(result.decision).toBe('pass');
      expect(result.reasons.some(r => r.type === 'stage22_not_complete')).toBe(false);
    });
  });

  describe('computeDerived() - Kill gate integration', () => {
    it('should include kill gate evaluation in derived fields', () => {
      const data = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.computeDerived(data);
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should block progression for no-go decision', () => {
      const data = {
        go_decision: 'no-go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'blocked' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.computeDerived(data);
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
    });

    it('should block progression for missing plans', () => {
      const data = {
        go_decision: 'go',
        incident_response_plan: null,
        monitoring_setup: null,
        rollback_plan: null,
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.computeDerived(data);
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it('should pass prerequisites stage22Data to kill gate', () => {
      const data = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const prerequisites = {
        stage22: { promotion_gate: { pass: false, blockers: ['Not ready'] } },
      };
      const result = stage23.computeDerived(data, prerequisites);
      expect(result.decision).toBe('kill');
      expect(result.reasons.some(r => r.type === 'stage22_not_complete')).toBe(true);
    });

    it('should preserve original data fields', () => {
      const data = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [{ name: 'Deploy', status: 'ready' }],
        launch_date: '2026-03-01',
      };
      const result = stage23.computeDerived(data);
      expect(result.go_decision).toBe('go');
      expect(result.incident_response_plan).toBe('Incident response plan details');
      expect(result.monitoring_setup).toBe('Monitoring setup details');
      expect(result.rollback_plan).toBe('Rollback plan details');
      expect(result.launch_tasks).toEqual(data.launch_tasks);
      expect(result.launch_date).toBe('2026-03-01');
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage23.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage23.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only strings in kill gate', () => {
      const result = evaluateKillGate({
        go_decision: 'go',
        incident_response_plan: '          ',
        monitoring_setup: '          ',
        rollback_plan: '          ',
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBe(3);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        go_decision: 'go',
        incident_response_plan: 'Incident response plan details',
        monitoring_setup: 'Monitoring setup details',
        rollback_plan: 'Rollback plan details',
        launch_tasks: [
          { name: 'Deploy to production', status: 'ready', owner: 'DevOps' },
          { name: 'Update DNS', status: 'ready', owner: 'SRE' },
        ],
        launch_date: '2026-03-01',
      };
      const validation = stage23.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage23.computeDerived(data);
      expect(computed.decision).toBe('pass');
      expect(computed.blockProgression).toBe(false);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        go_decision: 'invalid',
        incident_response_plan: 'Short',
        monitoring_setup: null,
        rollback_plan: null,
        launch_tasks: [],
        launch_date: '',
      };
      const computed = stage23.computeDerived(data);
      expect(computed.decision).toBe('kill');
      expect(computed.blockProgression).toBe(true);
    });
  });
});
