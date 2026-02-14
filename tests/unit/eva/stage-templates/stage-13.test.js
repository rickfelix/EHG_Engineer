/**
 * Unit tests for Stage 13 - Product Roadmap template
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario: Stage 13 validation enforces roadmap completeness
 * with deterministic kill gate based on milestones, deliverables, and timeline.
 *
 * @module tests/unit/eva/stage-templates/stage-13.test
 */

import { describe, it, expect } from 'vitest';
import stage13, { evaluateKillGate, MIN_MILESTONES, MIN_TIMELINE_MONTHS, MIN_DELIVERABLES_PER_MILESTONE } from '../../../../lib/eva/stage-templates/stage-13.js';

describe('stage-13.js - Product Roadmap template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage13.id).toBe('stage-13');
      expect(stage13.slug).toBe('product-roadmap');
      expect(stage13.title).toBe('Product Roadmap');
      expect(stage13.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage13.schema).toBeDefined();
      expect(stage13.schema.vision_statement).toEqual({
        type: 'string',
        minLength: 20,
        required: true,
      });
      expect(stage13.schema.milestones).toBeDefined();
      expect(stage13.schema.phases).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage13.defaultData).toEqual({
        vision_statement: null,
        milestones: [],
        phases: [],
        timeline_months: null,
        milestone_count: 0,
        decision: null,
        blockProgression: false,
        reasons: [],
      });
    });

    it('should have validate function', () => {
      expect(typeof stage13.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage13.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(MIN_MILESTONES).toBe(3);
      expect(MIN_TIMELINE_MONTHS).toBe(3);
      expect(MIN_DELIVERABLES_PER_MILESTONE).toBe(1);
    });
  });

  describe('validate() - Vision statement', () => {
    it('should pass for valid vision_statement', () => {
      const validData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for vision_statement below minimum length', () => {
      const invalidData = {
        vision_statement: 'Short vision',
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('vision_statement'))).toBe(true);
    });

    it('should fail for missing vision_statement', () => {
      const invalidData = {
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('vision_statement'))).toBe(true);
    });
  });

  describe('validate() - Milestones array', () => {
    it('should fail for fewer than 3 milestones', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-07-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('milestones') && e.includes('at least 3'))).toBe(true);
    });

    it('should fail for milestone missing name', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('milestones[0].name'))).toBe(true);
    });

    it('should fail for milestone missing date', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('milestones[0].date'))).toBe(true);
    });

    it('should fail for milestone with empty deliverables array', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: [], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('milestones[0].deliverables'))).toBe(true);
    });

    it('should fail for milestone missing deliverables', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('milestones[0].deliverables'))).toBe(true);
    });
  });

  describe('validate() - Phases array', () => {
    it('should fail for empty phases array', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('phases'))).toBe(true);
    });

    it('should fail for phase missing name', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ start_date: '2026-04-01', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('phases[0].name'))).toBe(true);
    });

    it('should fail for phase missing start_date', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', end_date: '2026-10-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('phases[0].start_date'))).toBe(true);
    });

    it('should fail for phase missing end_date', () => {
      const invalidData = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-04-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-07-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-10-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-04-01' }],
      };
      const result = stage13.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('phases[0].end_date'))).toBe(true);
    });
  });

  describe('computeDerived() - Timeline calculation', () => {
    it('should calculate timeline_months from milestone dates', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-04-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-07-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-07-01' }],
      };
      const result = stage13.computeDerived(data);
      expect(result.timeline_months).toBeGreaterThanOrEqual(5);
      expect(result.timeline_months).toBeLessThanOrEqual(7);
    });

    it('should calculate milestone_count', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-04-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-07-01', deliverables: ['D3'], dependencies: [] },
          { name: 'M4', date: '2026-10-01', deliverables: ['D4'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-10-01' }],
      };
      const result = stage13.computeDerived(data);
      expect(result.milestone_count).toBe(4);
    });

    it('should handle timeline_months = 0 for single or invalid dates', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-01-01' }],
      };
      const result = stage13.computeDerived(data);
      expect(result.timeline_months).toBe(0);
    });
  });

  describe('evaluateKillGate() - Pure function', () => {
    it('should pass kill gate for valid roadmap (>= 3 milestones, all with deliverables, >= 3 months, one now priority)', () => {
      const result = evaluateKillGate({
        milestone_count: 3,
        milestones: [
          { name: 'M1', deliverables: ['D1'], priority: 'now' },
          { name: 'M2', deliverables: ['D2'], priority: 'next' },
          { name: 'M3', deliverables: ['D3'], priority: 'later' },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should kill for insufficient milestones (< 3)', () => {
      const result = evaluateKillGate({
        milestone_count: 2,
        milestones: [
          { name: 'M1', deliverables: ['D1'], priority: 'now' },
          { name: 'M2', deliverables: ['D2'] },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.some(r => r.type === 'insufficient_milestones')).toBe(true);
      const reason = result.reasons.find(r => r.type === 'insufficient_milestones');
      expect(reason.threshold).toBe(MIN_MILESTONES);
      expect(reason.actual).toBe(2);
    });

    it('should kill for milestone missing deliverables', () => {
      const result = evaluateKillGate({
        milestone_count: 3,
        milestones: [
          { name: 'M1', deliverables: ['D1'], priority: 'now' },
          { name: 'M2', deliverables: [] },
          { name: 'M3', deliverables: ['D3'] },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('milestone_missing_deliverables');
      expect(result.reasons[0].milestone_index).toBe(1);
    });

    it('should kill for timeline too short (< 3 months)', () => {
      const result = evaluateKillGate({
        milestone_count: 3,
        milestones: [
          { name: 'M1', deliverables: ['D1'], priority: 'now' },
          { name: 'M2', deliverables: ['D2'] },
          { name: 'M3', deliverables: ['D3'] },
        ],
        timeline_months: 2,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('timeline_too_short');
      expect(result.reasons[0].threshold).toBe(MIN_TIMELINE_MONTHS);
      expect(result.reasons[0].actual).toBe(2);
    });

    it('should kill for no now-priority milestone (Blueprint #8)', () => {
      const result = evaluateKillGate({
        milestone_count: 3,
        milestones: [
          { name: 'M1', deliverables: ['D1'], priority: 'next' },
          { name: 'M2', deliverables: ['D2'], priority: 'later' },
          { name: 'M3', deliverables: ['D3'] },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0].type).toBe('no_now_priority_milestone');
    });

    it('should not trigger now-priority check for empty milestones', () => {
      const result = evaluateKillGate({
        milestone_count: 0,
        milestones: [],
        timeline_months: 0,
      });
      // Should have insufficient_milestones and timeline_too_short but NOT no_now_priority
      expect(result.reasons.some(r => r.type === 'no_now_priority_milestone')).toBe(false);
    });

    it('should collect multiple kill reasons', () => {
      const result = evaluateKillGate({
        milestone_count: 2,
        milestones: [
          { name: 'M1', deliverables: [] },
          { name: 'M2', deliverables: ['D2'] },
        ],
        timeline_months: 1,
      });
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(3);
      expect(result.reasons.some(r => r.type === 'insufficient_milestones')).toBe(true);
      expect(result.reasons.some(r => r.type === 'milestone_missing_deliverables')).toBe(true);
      expect(result.reasons.some(r => r.type === 'timeline_too_short')).toBe(true);
      expect(result.reasons.some(r => r.type === 'no_now_priority_milestone')).toBe(true);
    });

    it('should handle milestone without name (uses index)', () => {
      const result = evaluateKillGate({
        milestone_count: 3,
        milestones: [
          { deliverables: [], priority: 'now' },
          { name: 'M2', deliverables: ['D2'] },
          { name: 'M3', deliverables: ['D3'] },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('kill');
      const delReason = result.reasons.find(r => r.type === 'milestone_missing_deliverables');
      expect(delReason).toBeDefined();
      expect(delReason.message).toContain('0');
    });
  });

  describe('computeDerived() - Integration with kill gate', () => {
    it('should include kill gate evaluation in derived fields', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [], priority: 'now' },
          { name: 'M2', date: '2026-04-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-07-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-07-01' }],
      };
      const result = stage13.computeDerived(data);
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('should trigger kill gate for insufficient milestones', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-01-01' }],
      };
      const result = stage13.computeDerived(data);
      expect(result.decision).toBe('kill');
      expect(result.blockProgression).toBe(true);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty milestones array', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-07-01' }],
      };
      const validation = stage13.validate(data);
      expect(validation.valid).toBe(false);

      const derived = stage13.computeDerived(data);
      expect(derived.milestone_count).toBe(0);
      expect(derived.timeline_months).toBe(0);
      expect(derived.decision).toBe('kill');
    });

    it('should handle null values', () => {
      const result = stage13.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined values', () => {
      const result = stage13.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [], priority: 'now' },
          { name: 'M2', date: '2026-04-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-07-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-07-01' }],
      };
      const validation = stage13.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage13.computeDerived(data);
      expect(computed.decision).toBe('pass');
      expect(computed.milestone_count).toBe(3);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        vision_statement: 'Short',
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-01-01' }],
      };
      const computed = stage13.computeDerived(data);
      expect(computed.decision).toBe('kill');
    });
  });
});
