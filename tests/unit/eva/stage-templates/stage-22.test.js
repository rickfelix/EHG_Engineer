/**
 * Unit tests for Stage 22 - Release Readiness template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 22 validation enforces release checklist and
 * evaluates Phase 5→6 Promotion Gate based on stages 17-22 prerequisites.
 *
 * @module tests/unit/eva/stage-templates/stage-22.test
 */

import { describe, it, expect } from 'vitest';
import stage22, { evaluatePromotionGate, APPROVAL_STATUSES, MIN_RELEASE_ITEMS, MIN_READINESS_PCT, MIN_BUILD_COMPLETION_PCT } from '../../../../lib/eva/stage-templates/stage-22.js';
import { CHECKLIST_CATEGORIES } from '../../../../lib/eva/stage-templates/stage-17.js';
import { MIN_COVERAGE_PCT } from '../../../../lib/eva/stage-templates/stage-20.js';

describe('stage-22.js - Release Readiness template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage22.id).toBe('stage-22');
      expect(stage22.slug).toBe('release-readiness');
      expect(stage22.title).toBe('Release Readiness');
      expect(stage22.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage22.schema).toBeDefined();
      expect(stage22.schema.release_items).toBeDefined();
      expect(stage22.schema.release_notes).toBeDefined();
      expect(stage22.schema.target_date).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage22.defaultData).toEqual({
        release_items: [],
        release_notes: null,
        target_date: null,
        total_items: 0,
        approved_items: 0,
        all_approved: false,
        promotion_gate: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage22.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage22.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(APPROVAL_STATUSES).toEqual(['pending', 'approved', 'rejected']);
      expect(MIN_RELEASE_ITEMS).toBe(1);
      expect(MIN_READINESS_PCT).toBe(80);
      expect(MIN_BUILD_COMPLETION_PCT).toBe(80);
    });

    it('should export evaluatePromotionGate function', () => {
      expect(typeof evaluatePromotionGate).toBe('function');
    });
  });

  describe('validate() - Release items', () => {
    it('should pass for valid release items', () => {
      const validData = {
        release_items: [
          { name: 'Security review', category: 'Security', status: 'approved', approver: 'CISO' },
        ],
        release_notes: 'Release notes for v1.0',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing release_items array', () => {
      const invalidData = {
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items'))).toBe(true);
    });

    it('should fail for empty release_items array', () => {
      const invalidData = {
        release_items: [],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for release item missing name', () => {
      const invalidData = {
        release_items: [{ category: 'Security', status: 'approved' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items[0].name'))).toBe(true);
    });

    it('should fail for release item missing category', () => {
      const invalidData = {
        release_items: [{ name: 'Security review', status: 'approved' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items[0].category'))).toBe(true);
    });

    it('should fail for release item missing status', () => {
      const invalidData = {
        release_items: [{ name: 'Security review', category: 'Security' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items[0].status'))).toBe(true);
    });

    it('should fail for release item with invalid status', () => {
      const invalidData = {
        release_items: [{ name: 'Security review', category: 'Security', status: 'invalid' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_items[0].status'))).toBe(true);
    });

    it('should pass with optional approver field', () => {
      const validData = {
        release_items: [
          { name: 'Security review', category: 'Security', status: 'approved', approver: 'CISO' },
        ],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Release notes and target date', () => {
    const validItems = [
      { name: 'Security review', category: 'Security', status: 'approved' },
    ];

    it('should fail for missing release_notes', () => {
      const invalidData = {
        release_items: validItems,
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_notes'))).toBe(true);
    });

    it('should fail for release_notes < 10 characters', () => {
      const invalidData = {
        release_items: validItems,
        release_notes: 'Short',
        target_date: '2026-03-01',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('release_notes'))).toBe(true);
    });

    it('should fail for missing target_date', () => {
      const invalidData = {
        release_items: validItems,
        release_notes: 'Valid release notes',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('target_date'))).toBe(true);
    });

    it('should fail for empty target_date', () => {
      const invalidData = {
        release_items: validItems,
        release_notes: 'Valid release notes',
        target_date: '',
      };
      const result = stage22.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('target_date'))).toBe(true);
    });
  });

  describe('computeDerived() - Release metrics', () => {
    it('should calculate total_items correctly', () => {
      const data = {
        release_items: [
          { name: 'R1', category: 'C1', status: 'approved' },
          { name: 'R2', category: 'C2', status: 'pending' },
          { name: 'R3', category: 'C3', status: 'approved' },
        ],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.total_items).toBe(3);
    });

    it('should calculate approved_items correctly', () => {
      const data = {
        release_items: [
          { name: 'R1', category: 'C1', status: 'approved' },
          { name: 'R2', category: 'C2', status: 'pending' },
          { name: 'R3', category: 'C3', status: 'approved' },
          { name: 'R4', category: 'C4', status: 'rejected' },
        ],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.approved_items).toBe(2);
    });

    it('should set all_approved to true when all items approved', () => {
      const data = {
        release_items: [
          { name: 'R1', category: 'C1', status: 'approved' },
          { name: 'R2', category: 'C2', status: 'approved' },
        ],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.all_approved).toBe(true);
    });

    it('should set all_approved to false when any item not approved', () => {
      const data = {
        release_items: [
          { name: 'R1', category: 'C1', status: 'approved' },
          { name: 'R2', category: 'C2', status: 'pending' },
        ],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.all_approved).toBe(false);
    });

    it('should set all_approved to false for zero items', () => {
      const data = {
        release_items: [],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.all_approved).toBe(false);
    });
  });

  describe('evaluatePromotionGate() - Pure function', () => {
    const validPrerequisites = {
      stage17: {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'complete' }],
          environment: [{ name: 'T4', status: 'complete' }],
          dependencies: [{ name: 'T5', status: 'complete' }],
        },
        readiness_pct: 100,
      },
      stage18: {
        items: [
          {
            title: 'Feature 1',
            description: 'Test',
            priority: 'high',
            type: 'feature',
            scope: 'Test',
            success_criteria: 'Test',
            target_application: 'Test',
          },
        ],
      },
      stage19: {
        completion_pct: 100,
        blocked_tasks: 0,
      },
      stage20: {
        quality_gate_passed: true,
        overall_pass_rate: 100,
        coverage_pct: 80,
      },
      stage21: {
        all_passing: true,
      },
      stage22: {
        release_items: [
          { name: 'R1', category: 'C1', status: 'approved' },
        ],
      },
    };

    it('should pass promotion gate for all valid prerequisites', () => {
      const result = evaluatePromotionGate(validPrerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.required_next_actions).toEqual([]);
      expect(result.rationale).toContain('All Phase 5 prerequisites met');
    });

    it('should fail for incomplete stage 17 categories', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage17: {
          checklist: {
            architecture: [{ name: 'T1', status: 'complete' }],
            team_readiness: [{ name: 'T2', status: 'complete' }],
            tooling: [],
            environment: [],
            dependencies: [],
          },
          readiness_pct: 100,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('category'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Complete all pre-build checklist categories'))).toBe(true);
    });

    it('should fail for stage 17 readiness < 80%', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage17: {
          ...validPrerequisites.stage17,
          readiness_pct: 75,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('Pre-build readiness at 75%'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('reach readiness threshold'))).toBe(true);
    });

    it('should fail for zero sprint items in stage 18', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage18: {
          items: [],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('No sprint items defined'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Define at least 1 sprint item'))).toBe(true);
    });

    it('should fail for stage 19 completion < 80%', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage19: {
          completion_pct: 75,
          blocked_tasks: 0,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('Build completion at 75%'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Complete more build tasks'))).toBe(true);
    });

    it('should fail for blocked tasks in stage 19', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage19: {
          completion_pct: 100,
          blocked_tasks: 2,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('2 build task(s) are blocked'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Resolve blocked build tasks'))).toBe(true);
    });

    it('should fail for quality gate not passed in stage 20', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage20: {
          quality_gate_passed: false,
          overall_pass_rate: 95,
          coverage_pct: 80,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('Test pass rate at 95%, must be 100%'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Fix all failing tests'))).toBe(true);
    });

    it('should fail for coverage < 60% in stage 20', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage20: {
          quality_gate_passed: false,
          overall_pass_rate: 100,
          coverage_pct: 55,
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('Test coverage at 55%, minimum 60% required'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Increase test coverage to at least 60%'))).toBe(true);
    });

    it('should fail for failing integrations in stage 21', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage21: {
          all_passing: false,
          failing_integrations: [{ name: 'I1', source: 'A', target: 'B' }],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('1 integration(s) failing'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Fix all failing integration tests'))).toBe(true);
    });

    it('should fail for unapproved release items in stage 22', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage22: {
          release_items: [
            { name: 'R1', category: 'C1', status: 'approved' },
            { name: 'R2', category: 'C2', status: 'pending' },
          ],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('1 release item(s) not yet approved'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Get approval for all release items'))).toBe(true);
    });

    it('should collect multiple blockers', () => {
      const prerequisites = {
        stage17: { checklist: {}, readiness_pct: 50 },
        stage18: { items: [] },
        stage19: { completion_pct: 50, blocked_tasks: 1 },
        stage20: { quality_gate_passed: false, overall_pass_rate: 90, coverage_pct: 50 },
        stage21: { all_passing: false, failing_integrations: [{ name: 'I1' }] },
        stage22: { release_items: [{ name: 'R1', category: 'C1', status: 'pending' }] },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(5);
      expect(result.required_next_actions.length).toBeGreaterThan(5);
    });
  });

  describe('computeDerived() - Integration with promotion gate', () => {
    it('should include promotion gate evaluation when prerequisites provided', () => {
      const data = {
        release_items: [{ name: 'R1', category: 'C1', status: 'approved' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const prerequisites = {
        stage17: {
          checklist: {
            architecture: [{ name: 'T1', status: 'complete' }],
            team_readiness: [{ name: 'T2', status: 'complete' }],
            tooling: [{ name: 'T3', status: 'complete' }],
            environment: [{ name: 'T4', status: 'complete' }],
            dependencies: [{ name: 'T5', status: 'complete' }],
          },
          readiness_pct: 100,
        },
        stage18: { items: [{ title: 'T', description: 'D', priority: 'high', type: 'feature', scope: 'S', success_criteria: 'SC', target_application: 'A' }] },
        stage19: { completion_pct: 100, blocked_tasks: 0 },
        stage20: { quality_gate_passed: true, overall_pass_rate: 100, coverage_pct: 80 },
        stage21: { all_passing: true },
      };
      const result = stage22.computeDerived(data, prerequisites);
      expect(result.promotion_gate).toBeDefined();
      expect(result.promotion_gate.pass).toBe(true);
    });

    it('should return default promotion gate when prerequisites not provided', () => {
      const data = {
        release_items: [{ name: 'R1', category: 'C1', status: 'approved' }],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.promotion_gate).toBeDefined();
      expect(result.promotion_gate.pass).toBe(false);
      expect(result.promotion_gate.rationale).toContain('Prerequisites not provided');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty release_items array in computeDerived', () => {
      const data = {
        release_items: [],
        release_notes: 'Release notes',
        target_date: '2026-03-01',
      };
      const result = stage22.computeDerived(data);
      expect(result.total_items).toBe(0);
      expect(result.approved_items).toBe(0);
      expect(result.all_approved).toBe(false);
    });

    it('should handle null data in validate', () => {
      const result = stage22.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage22.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        release_items: [
          { name: 'Security review', category: 'Security', status: 'approved' },
          { name: 'Legal review', category: 'Legal', status: 'approved' },
        ],
        release_notes: 'Major release with new features',
        target_date: '2026-03-01',
      };
      const validation = stage22.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage22.computeDerived(data);
      expect(computed.total_items).toBe(2);
      expect(computed.approved_items).toBe(2);
      expect(computed.all_approved).toBe(true);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        release_items: [
          { name: 'R1', category: 'C1', status: 'invalid_status' },
        ],
        release_notes: 'Short',
        target_date: '2026-03-01',
      };
      const computed = stage22.computeDerived(data);
      expect(computed.total_items).toBe(1);
      expect(computed.approved_items).toBe(0);
    });
  });
});
