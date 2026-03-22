/**
 * Unit tests for Stage 24 - Launch Readiness template
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Test Scenario: Stage 24 validation enforces a readiness checklist with
 * weighted scoring, operational readiness plans, and chairman governance gate.
 *
 * @module tests/unit/eva/stage-templates/stage-24.test
 */

import { describe, it, expect } from 'vitest';
import stage24, {
  computeReadinessScore,
  GO_NO_GO_DECISIONS,
  CHECKLIST_ITEM_STATUSES,
  READINESS_CHECKLIST_KEYS,
  CHECKLIST_WEIGHTS,
} from '../../../../lib/eva/stage-templates/stage-24.js';

describe('stage-24.js - Launch Readiness template', () => {
  describe('Template contract', () => {
    it('should export TEMPLATE with required properties', () => {
      expect(stage24).toBeDefined();
      expect(stage24.id).toBeDefined();
      expect(stage24.slug).toBeDefined();
      expect(stage24.title).toBeDefined();
      expect(stage24.version).toBeDefined();
    });

    it('should have correct id, slug, title, version', () => {
      expect(stage24.id).toBe('stage-24');
      expect(stage24.slug).toBe('launch-readiness');
      expect(stage24.title).toBe('Launch Readiness');
      expect(stage24.version).toBe('2.0.0');
    });

    it('should have schema, defaultData, validate, computeDerived', () => {
      expect(stage24.schema).toBeDefined();
      expect(stage24.defaultData).toBeDefined();
      expect(typeof stage24.validate).toBe('function');
      expect(typeof stage24.computeDerived).toBe('function');
    });

    it('should have analysisStep function', () => {
      expect(typeof stage24.analysisStep).toBe('function');
    });

    it('should have outputSchema from extractOutputSchema', () => {
      expect(stage24.outputSchema).toBeDefined();
    });

    it('should have onBeforeAnalysis hook', () => {
      expect(typeof stage24.onBeforeAnalysis).toBe('function');
    });

    it('should have schema with expected fields', () => {
      expect(stage24.schema.readiness_checklist).toBeDefined();
      expect(stage24.schema.go_no_go_decision).toBeDefined();
      expect(stage24.schema.decision_rationale).toBeDefined();
      expect(stage24.schema.incident_response_plan).toBeDefined();
      expect(stage24.schema.monitoring_setup).toBeDefined();
      expect(stage24.schema.rollback_plan).toBeDefined();
      expect(stage24.schema.launch_risks).toBeDefined();
      expect(stage24.schema.chairmanGate).toBeDefined();
      expect(stage24.schema.readiness_score).toBeDefined();
      expect(stage24.schema.all_checks_pass).toBeDefined();
      expect(stage24.schema.blocking_items).toBeDefined();
    });

    it('should have correct defaultData', () => {
      expect(stage24.defaultData.go_no_go_decision).toBeNull();
      expect(stage24.defaultData.decision_rationale).toBeNull();
      expect(stage24.defaultData.incident_response_plan).toBeNull();
      expect(stage24.defaultData.monitoring_setup).toBeNull();
      expect(stage24.defaultData.rollback_plan).toBeNull();
      expect(stage24.defaultData.launch_risks).toEqual([]);
      expect(stage24.defaultData.chairmanGate).toEqual({
        status: 'pending', rationale: null, decision_id: null,
      });
      expect(stage24.defaultData.readiness_score).toBe(0);
      expect(stage24.defaultData.all_checks_pass).toBe(false);
      expect(stage24.defaultData.blocking_items).toEqual([]);
    });

    it('should have readiness_checklist default with pending status for all keys', () => {
      const checklist = stage24.defaultData.readiness_checklist;
      for (const key of READINESS_CHECKLIST_KEYS) {
        expect(checklist[key]).toEqual({ status: 'pending', evidence: null, verified_at: null });
      }
    });

    it('should export constants', () => {
      expect(GO_NO_GO_DECISIONS).toEqual(['go', 'no_go', 'conditional_go']);
      expect(CHECKLIST_ITEM_STATUSES).toEqual(['pass', 'fail', 'pending', 'waived']);
      expect(READINESS_CHECKLIST_KEYS).toEqual([
        'release_confirmed', 'marketing_complete', 'monitoring_ready', 'rollback_plan_exists',
      ]);
      expect(CHECKLIST_WEIGHTS).toEqual({
        release_confirmed: 0.35,
        marketing_complete: 0.25,
        monitoring_ready: 0.20,
        rollback_plan_exists: 0.20,
      });
    });

    it('should export computeReadinessScore function', () => {
      expect(typeof computeReadinessScore).toBe('function');
    });
  });

  describe('validate() - Readiness checklist', () => {
    const makeValidData = (overrides = {}) => ({
      readiness_checklist: {
        release_confirmed: { status: 'pass', evidence: 'Release build verified' },
        marketing_complete: { status: 'pass', evidence: 'Marketing materials ready' },
        monitoring_ready: { status: 'pass', evidence: 'Dashboards configured' },
        rollback_plan_exists: { status: 'pass', evidence: 'Rollback playbook approved' },
      },
      incident_response_plan: 'Full incident response plan details here',
      monitoring_setup: 'Full monitoring setup details here',
      rollback_plan: 'Full rollback plan details here',
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      ...overrides,
    });

    it('should pass for valid data with all checks passing', () => {
      const result = stage24.validate(makeValidData(), { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing readiness_checklist', () => {
      const data = makeValidData();
      delete data.readiness_checklist;
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('readiness_checklist'))).toBe(true);
    });

    it('should fail for non-object readiness_checklist', () => {
      const data = makeValidData({ readiness_checklist: 'not an object' });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('readiness_checklist'))).toBe(true);
    });

    it('should fail for missing checklist key', () => {
      const data = makeValidData();
      delete data.readiness_checklist.release_confirmed;
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('readiness_checklist.release_confirmed'))).toBe(true);
    });

    it('should fail for checklist item with invalid status', () => {
      const data = makeValidData();
      data.readiness_checklist.release_confirmed.status = 'invalid';
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('readiness_checklist.release_confirmed.status'))).toBe(true);
    });

    it('should fail for checklist item with missing evidence', () => {
      const data = makeValidData();
      data.readiness_checklist.marketing_complete.evidence = null;
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('readiness_checklist.marketing_complete.evidence'))).toBe(true);
    });

    it('should accept waived status as valid', () => {
      const data = makeValidData();
      data.readiness_checklist.monitoring_ready = { status: 'waived', evidence: 'Deferred to post-launch' };
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });

    it('should accept pending status as valid (status-wise)', () => {
      const data = makeValidData();
      data.readiness_checklist.rollback_plan_exists = { status: 'pending', evidence: 'In progress' };
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      // pending is a valid status per CHECKLIST_ITEM_STATUSES
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Operational readiness plans', () => {
    const makeValidData = (overrides = {}) => ({
      readiness_checklist: {
        release_confirmed: { status: 'pass', evidence: 'Release build verified' },
        marketing_complete: { status: 'pass', evidence: 'Marketing materials ready' },
        monitoring_ready: { status: 'pass', evidence: 'Dashboards configured' },
        rollback_plan_exists: { status: 'pass', evidence: 'Rollback playbook approved' },
      },
      incident_response_plan: 'Full incident response plan details here',
      monitoring_setup: 'Full monitoring setup details here',
      rollback_plan: 'Full rollback plan details here',
      chairmanGate: { status: 'approved', rationale: null, decision_id: null },
      ...overrides,
    });

    it('should fail for missing incident_response_plan', () => {
      const data = makeValidData({ incident_response_plan: null });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('incident_response_plan'))).toBe(true);
    });

    it('should fail for incident_response_plan < 10 characters', () => {
      const data = makeValidData({ incident_response_plan: 'Short' });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('incident_response_plan'))).toBe(true);
    });

    it('should fail for missing monitoring_setup', () => {
      const data = makeValidData({ monitoring_setup: null });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monitoring_setup'))).toBe(true);
    });

    it('should fail for monitoring_setup < 10 characters', () => {
      const data = makeValidData({ monitoring_setup: 'Short' });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monitoring_setup'))).toBe(true);
    });

    it('should fail for missing rollback_plan', () => {
      const data = makeValidData({ rollback_plan: null });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rollback_plan'))).toBe(true);
    });

    it('should fail for rollback_plan < 10 characters', () => {
      const data = makeValidData({ rollback_plan: 'Short' });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('rollback_plan'))).toBe(true);
    });
  });

  describe('validate() - Chairman governance gate', () => {
    const makeValidData = (overrides = {}) => ({
      readiness_checklist: {
        release_confirmed: { status: 'pass', evidence: 'Release build verified' },
        marketing_complete: { status: 'pass', evidence: 'Marketing materials ready' },
        monitoring_ready: { status: 'pass', evidence: 'Dashboards configured' },
        rollback_plan_exists: { status: 'pass', evidence: 'Rollback playbook approved' },
      },
      incident_response_plan: 'Full incident response plan details here',
      monitoring_setup: 'Full monitoring setup details here',
      rollback_plan: 'Full rollback plan details here',
      ...overrides,
    });

    it('should pass when chairman gate is approved', () => {
      const data = makeValidData({ chairmanGate: { status: 'approved', rationale: null, decision_id: null } });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(true);
    });

    it('should fail when chairman gate is pending', () => {
      const data = makeValidData({ chairmanGate: { status: 'pending', rationale: null, decision_id: null } });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman') && e.includes('pending'))).toBe(true);
    });

    it('should fail when chairman gate is rejected', () => {
      const data = makeValidData({
        chairmanGate: { status: 'rejected', rationale: 'Not ready for launch', decision_id: null },
      });
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman') && e.includes('rejected'))).toBe(true);
    });

    it('should fail when chairmanGate is not provided', () => {
      const data = makeValidData();
      // No chairmanGate means status is undefined, which is not 'approved'
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman') || e.includes('chairman'))).toBe(true);
    });
  });

  describe('computeReadinessScore() - Pure function', () => {
    it('should return 100 when all items pass', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'pass' },
          marketing_complete: { status: 'pass' },
          monitoring_ready: { status: 'pass' },
          rollback_plan_exists: { status: 'pass' },
        },
      });
      expect(result.readiness_score).toBe(100);
      expect(result.all_checks_pass).toBe(true);
      expect(result.blocking_items).toEqual([]);
    });

    it('should return 0 when all items are pending', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'pending' },
          marketing_complete: { status: 'pending' },
          monitoring_ready: { status: 'pending' },
          rollback_plan_exists: { status: 'pending' },
        },
      });
      expect(result.readiness_score).toBe(0);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toHaveLength(4);
    });

    it('should return 0 when all items fail', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'fail' },
          marketing_complete: { status: 'fail' },
          monitoring_ready: { status: 'fail' },
          rollback_plan_exists: { status: 'fail' },
        },
      });
      expect(result.readiness_score).toBe(0);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toHaveLength(4);
    });

    it('should give waived items 50% weight', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'waived' },
          marketing_complete: { status: 'waived' },
          monitoring_ready: { status: 'waived' },
          rollback_plan_exists: { status: 'waived' },
        },
      });
      // All waived: 0.35*50 + 0.25*50 + 0.20*50 + 0.20*50 = 50
      expect(result.readiness_score).toBe(50);
      expect(result.all_checks_pass).toBe(true);
      expect(result.blocking_items).toEqual([]);
    });

    it('should apply correct weights per checklist key', () => {
      // Only release_confirmed passes (weight 0.35), rest fail
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'pass' },
          marketing_complete: { status: 'fail' },
          monitoring_ready: { status: 'fail' },
          rollback_plan_exists: { status: 'fail' },
        },
      });
      // 0.35 * 100 = 35
      expect(result.readiness_score).toBe(35);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toEqual(['marketing_complete', 'monitoring_ready', 'rollback_plan_exists']);
    });

    it('should handle mixed pass and waived statuses', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'pass' },      // 0.35 * 100 = 35
          marketing_complete: { status: 'waived' },    // 0.25 * 50  = 12.5
          monitoring_ready: { status: 'pass' },        // 0.20 * 100 = 20
          rollback_plan_exists: { status: 'pending' }, // 0.20 * 0   = 0
        },
      });
      // 35 + 12.5 + 20 + 0 = 67.5 -> rounded to 68
      expect(result.readiness_score).toBe(68);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toEqual(['rollback_plan_exists']);
    });

    it('should handle null readiness_checklist', () => {
      const result = computeReadinessScore({ readiness_checklist: null });
      expect(result.readiness_score).toBe(0);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toEqual(READINESS_CHECKLIST_KEYS.slice());
    });

    it('should handle undefined readiness_checklist', () => {
      const result = computeReadinessScore({ readiness_checklist: undefined });
      expect(result.readiness_score).toBe(0);
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toHaveLength(4);
    });

    it('should handle missing keys in checklist', () => {
      const result = computeReadinessScore({
        readiness_checklist: {
          release_confirmed: { status: 'pass' },
          // Other keys missing
        },
      });
      expect(result.readiness_score).toBe(35); // Only release_confirmed passes
      expect(result.all_checks_pass).toBe(false);
      expect(result.blocking_items).toContain('marketing_complete');
      expect(result.blocking_items).toContain('monitoring_ready');
      expect(result.blocking_items).toContain('rollback_plan_exists');
    });
  });

  describe('computeDerived()', () => {
    it('should spread input data to output', () => {
      const data = {
        readiness_checklist: {
          release_confirmed: { status: 'pass', evidence: 'Verified' },
          marketing_complete: { status: 'pass', evidence: 'Ready' },
          monitoring_ready: { status: 'pass', evidence: 'Configured' },
          rollback_plan_exists: { status: 'pass', evidence: 'Approved' },
        },
        incident_response_plan: 'Incident response plan',
        monitoring_setup: 'Monitoring setup',
        rollback_plan: 'Rollback plan',
      };
      const result = stage24.computeDerived(data);
      expect(result.readiness_checklist).toEqual(data.readiness_checklist);
      expect(result.incident_response_plan).toBe(data.incident_response_plan);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data in validate', () => {
      const result = stage24.validate(null, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage24.validate(undefined, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle whitespace-only plan strings', () => {
      const data = {
        readiness_checklist: {
          release_confirmed: { status: 'pass', evidence: 'Verified' },
          marketing_complete: { status: 'pass', evidence: 'Ready' },
          monitoring_ready: { status: 'pass', evidence: 'Configured' },
          rollback_plan_exists: { status: 'pass', evidence: 'Approved' },
        },
        incident_response_plan: '          ',
        monitoring_setup: '          ',
        rollback_plan: '          ',
        chairmanGate: { status: 'approved' },
      };
      const result = stage24.validate(data, { logger: { warn: () => {} } });
      expect(result.valid).toBe(false);
      // Whitespace-only strings should fail minimum length checks
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        readiness_checklist: {
          release_confirmed: { status: 'pass', evidence: 'Release build verified' },
          marketing_complete: { status: 'pass', evidence: 'Marketing materials ready' },
          monitoring_ready: { status: 'pass', evidence: 'Dashboards configured' },
          rollback_plan_exists: { status: 'pass', evidence: 'Rollback playbook approved' },
        },
        incident_response_plan: 'Full incident response plan with escalation matrix',
        monitoring_setup: 'Full monitoring setup with dashboards and alerts',
        rollback_plan: 'Full rollback plan with versioned deployment strategy',
        chairmanGate: { status: 'approved', rationale: null, decision_id: null },
        go_no_go_decision: 'go',
      };
      const validation = stage24.validate(data, { logger: { warn: () => {} } });
      expect(validation.valid).toBe(true);

      const computed = stage24.computeDerived(data);
      expect(computed.readiness_checklist).toEqual(data.readiness_checklist);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        readiness_checklist: {},
        incident_response_plan: 'Short',
        monitoring_setup: null,
        rollback_plan: null,
      };
      const computed = stage24.computeDerived(data);
      expect(computed.readiness_checklist).toEqual({});
    });
  });
});
