/**
 * Unit tests for Stage 17 - Pre-Build Checklist template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 17 validation enforces checklist data with 5 categories
 * and computes readiness percentage.
 *
 * @module tests/unit/eva/stage-templates/stage-17.test
 */

import { describe, it, expect } from 'vitest';
import stage17, { CHECKLIST_CATEGORIES, ITEM_STATUSES, MIN_ITEMS_PER_CATEGORY } from '../../../../lib/eva/stage-templates/stage-17.js';

describe('stage-17.js - Pre-Build Checklist template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage17.id).toBe('stage-17');
      expect(stage17.slug).toBe('pre-build-checklist');
      expect(stage17.title).toBe('Pre-Build Checklist');
      expect(stage17.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage17.schema).toBeDefined();
      expect(stage17.schema.checklist).toBeDefined();
      expect(stage17.schema.blockers).toBeDefined();
      expect(stage17.schema.total_items).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage17.defaultData).toEqual({
        checklist: {},
        blockers: [],
        total_items: 0,
        completed_items: 0,
        readiness_pct: 0,
        all_categories_present: false,
        blocker_count: 0,
        buildReadiness: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage17.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage17.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(CHECKLIST_CATEGORIES).toEqual(['architecture', 'team_readiness', 'tooling', 'environment', 'dependencies']);
      expect(ITEM_STATUSES).toEqual(['not_started', 'in_progress', 'complete', 'blocked']);
      expect(MIN_ITEMS_PER_CATEGORY).toBe(1);
    });
  });

  describe('validate() - Checklist structure', () => {
    const validChecklist = {
      architecture: [{ name: 'Define architecture', status: 'complete', owner: 'Tech Lead' }],
      team_readiness: [{ name: 'Team hired', status: 'complete' }],
      tooling: [{ name: 'Setup dev tools', status: 'in_progress' }],
      environment: [{ name: 'Setup staging', status: 'not_started' }],
      dependencies: [{ name: 'API keys', status: 'complete' }],
    };

    it('should pass for valid checklist with all categories', () => {
      const validData = { checklist: validChecklist };
      const result = stage17.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing checklist', () => {
      const invalidData = {};
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('checklist'))).toBe(true);
    });

    it('should fail for non-object checklist', () => {
      const invalidData = { checklist: 'not an object' };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('checklist'))).toBe(true);
    });

    it('should fail for missing category', () => {
      const invalidData = {
        checklist: {
          architecture: [{ name: 'Test', status: 'complete' }],
          team_readiness: [{ name: 'Test', status: 'complete' }],
          tooling: [{ name: 'Test', status: 'complete' }],
          environment: [{ name: 'Test', status: 'complete' }],
          // Missing dependencies category
        },
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('dependencies'))).toBe(true);
    });

    it('should fail for empty category array', () => {
      const invalidData = {
        checklist: {
          ...validChecklist,
          architecture: [],
        },
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture') && e.includes('at least 1'))).toBe(true);
    });
  });

  describe('validate() - Checklist items', () => {
    it('should fail for item missing name', () => {
      const invalidData = {
        checklist: {
          architecture: [{ status: 'complete' }],
          team_readiness: [{ name: 'Test', status: 'complete' }],
          tooling: [{ name: 'Test', status: 'complete' }],
          environment: [{ name: 'Test', status: 'complete' }],
          dependencies: [{ name: 'Test', status: 'complete' }],
        },
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture[0].name'))).toBe(true);
    });

    it('should fail for item missing status', () => {
      const invalidData = {
        checklist: {
          architecture: [{ name: 'Test' }],
          team_readiness: [{ name: 'Test', status: 'complete' }],
          tooling: [{ name: 'Test', status: 'complete' }],
          environment: [{ name: 'Test', status: 'complete' }],
          dependencies: [{ name: 'Test', status: 'complete' }],
        },
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture[0].status'))).toBe(true);
    });

    it('should fail for invalid status value', () => {
      const invalidData = {
        checklist: {
          architecture: [{ name: 'Test', status: 'invalid_status' }],
          team_readiness: [{ name: 'Test', status: 'complete' }],
          tooling: [{ name: 'Test', status: 'complete' }],
          environment: [{ name: 'Test', status: 'complete' }],
          dependencies: [{ name: 'Test', status: 'complete' }],
        },
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('architecture[0].status'))).toBe(true);
    });

    it('should pass with optional fields (owner, notes)', () => {
      const validData = {
        checklist: {
          architecture: [{ name: 'Test', status: 'complete', owner: 'Owner', notes: 'Notes' }],
          team_readiness: [{ name: 'Test', status: 'complete' }],
          tooling: [{ name: 'Test', status: 'complete' }],
          environment: [{ name: 'Test', status: 'complete' }],
          dependencies: [{ name: 'Test', status: 'complete' }],
        },
      };
      const result = stage17.validate(validData);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Blockers (optional)', () => {
    const validChecklist = {
      architecture: [{ name: 'Test', status: 'complete' }],
      team_readiness: [{ name: 'Test', status: 'complete' }],
      tooling: [{ name: 'Test', status: 'complete' }],
      environment: [{ name: 'Test', status: 'complete' }],
      dependencies: [{ name: 'Test', status: 'complete' }],
    };

    it('should pass when blockers are omitted', () => {
      const validData = { checklist: validChecklist };
      const result = stage17.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when blockers are empty array', () => {
      const validData = { checklist: validChecklist, blockers: [] };
      const result = stage17.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when blockers have valid items', () => {
      const validData = {
        checklist: validChecklist,
        blockers: [
          { description: 'Budget not approved', severity: 'high', mitigation: 'Escalate to CFO' },
        ],
      };
      const result = stage17.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for blocker missing description', () => {
      const invalidData = {
        checklist: validChecklist,
        blockers: [{ severity: 'high', mitigation: 'Escalate' }],
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('blockers[0].description'))).toBe(true);
    });

    it('should fail for blocker missing severity', () => {
      const invalidData = {
        checklist: validChecklist,
        blockers: [{ description: 'Test', mitigation: 'Escalate' }],
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('blockers[0].severity'))).toBe(true);
    });

    it('should fail for blocker with invalid severity enum value', () => {
      const invalidData = {
        checklist: validChecklist,
        blockers: [{ description: 'Test', severity: 'urgent', mitigation: 'Escalate' }],
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('blockers[0].severity'))).toBe(true);
    });

    it('should fail for blocker missing mitigation', () => {
      const invalidData = {
        checklist: validChecklist,
        blockers: [{ description: 'Test', severity: 'high' }],
      };
      const result = stage17.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('blockers[0].mitigation'))).toBe(true);
    });
  });

  describe('computeDerived() - Readiness calculation', () => {
    it('should calculate total_items correctly', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }, { name: 'T2', status: 'in_progress' }],
          team_readiness: [{ name: 'T3', status: 'complete' }],
          tooling: [{ name: 'T4', status: 'not_started' }],
          environment: [{ name: 'T5', status: 'complete' }],
          dependencies: [{ name: 'T6', status: 'blocked' }],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.total_items).toBe(6);
    });

    it('should calculate completed_items correctly', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }, { name: 'T2', status: 'in_progress' }],
          team_readiness: [{ name: 'T3', status: 'complete' }],
          tooling: [{ name: 'T4', status: 'not_started' }],
          environment: [{ name: 'T5', status: 'complete' }],
          dependencies: [{ name: 'T6', status: 'blocked' }],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.completed_items).toBe(3);
    });

    it('should calculate readiness_pct correctly', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'in_progress' }],
          environment: [{ name: 'T4', status: 'not_started' }],
          dependencies: [{ name: 'T5', status: 'not_started' }],
        },
      };
      const result = stage17.computeDerived(data);
      // 2 complete out of 5 = 40%
      expect(result.readiness_pct).toBe(40);
    });

    it('should return 0 readiness_pct for zero total items', () => {
      const data = {
        checklist: {
          architecture: [],
          team_readiness: [],
          tooling: [],
          environment: [],
          dependencies: [],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.readiness_pct).toBe(0);
    });

    it('should calculate readiness_pct to 2 decimal places', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'in_progress' }],
          environment: [{ name: 'T4', status: 'not_started' }],
          dependencies: [{ name: 'T5', status: 'not_started' }],
          // Add 2 more to get 3 total items
        },
      };
      data.checklist.architecture.push({ name: 'T6', status: 'not_started' });
      data.checklist.architecture.push({ name: 'T7', status: 'not_started' });
      const result = stage17.computeDerived(data);
      // 2 complete out of 7 = 28.57%
      expect(result.readiness_pct).toBe(28.57);
    });
  });

  describe('computeDerived() - Categories and blockers', () => {
    it('should set all_categories_present to true when all categories have items', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'complete' }],
          environment: [{ name: 'T4', status: 'complete' }],
          dependencies: [{ name: 'T5', status: 'complete' }],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.all_categories_present).toBe(true);
    });

    it('should set all_categories_present to false when a category is empty', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [],
          tooling: [{ name: 'T3', status: 'complete' }],
          environment: [{ name: 'T4', status: 'complete' }],
          dependencies: [{ name: 'T5', status: 'complete' }],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.all_categories_present).toBe(false);
    });

    it('should calculate blocker_count correctly', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'complete' }],
          environment: [{ name: 'T4', status: 'complete' }],
          dependencies: [{ name: 'T5', status: 'complete' }],
        },
        blockers: [
          { description: 'B1', severity: 'high', mitigation: 'M1' },
          { description: 'B2', severity: 'medium', mitigation: 'M2' },
        ],
      };
      const result = stage17.computeDerived(data);
      expect(result.blocker_count).toBe(2);
    });

    it('should return 0 blocker_count when blockers omitted', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'complete' }],
          environment: [{ name: 'T4', status: 'complete' }],
          dependencies: [{ name: 'T5', status: 'complete' }],
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.blocker_count).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle missing category gracefully in computeDerived', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          // Missing other categories
        },
      };
      const result = stage17.computeDerived(data);
      expect(result.total_items).toBe(1);
      expect(result.completed_items).toBe(1);
      expect(result.all_categories_present).toBe(false);
    });

    it('should handle null checklist in validate', () => {
      const result = stage17.validate({ checklist: null });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('checklist'))).toBe(true);
    });

    it('should handle undefined data in validate', () => {
      const result = stage17.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'in_progress' }],
          environment: [{ name: 'T4', status: 'not_started' }],
          dependencies: [{ name: 'T5', status: 'blocked' }],
        },
        blockers: [{ description: 'Test', severity: 'low', mitigation: 'Test' }],
      };
      const validation = stage17.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage17.computeDerived(data);
      expect(computed.total_items).toBe(5);
      expect(computed.completed_items).toBe(2);
      expect(computed.readiness_pct).toBe(40);
      expect(computed.all_categories_present).toBe(true);
      expect(computed.blocker_count).toBe(1);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        checklist: {
          architecture: [{ name: 'T1', status: 'invalid_status' }],
        },
      };
      const computed = stage17.computeDerived(data);
      expect(computed.total_items).toBe(1);
      expect(computed.completed_items).toBe(0);
    });
  });
});
