/**
 * Unit tests for Stage 18 - Sprint Planning template
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario: Stage 18 validation enforces sprint structure with items
 * and generates SD bridge payloads.
 *
 * @module tests/unit/eva/stage-templates/stage-18.test
 */

import { describe, it, expect } from 'vitest';
import stage18, { PRIORITY_VALUES, SD_TYPES, MIN_SPRINT_ITEMS, SD_BRIDGE_REQUIRED_FIELDS, MIN_SPRINT_DURATION_DAYS, MAX_SPRINT_DURATION_DAYS } from '../../../../lib/eva/stage-templates/stage-18.js';

describe('stage-18.js - Sprint Planning template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage18.id).toBe('stage-18');
      expect(stage18.slug).toBe('sprint-planning');
      expect(stage18.title).toBe('Sprint Planning');
      expect(stage18.version).toBe('1.0.0');
    });

    it('should have schema definition', () => {
      expect(stage18.schema).toBeDefined();
      expect(stage18.schema.sprint_name).toBeDefined();
      expect(stage18.schema.sprint_duration_days).toBeDefined();
      expect(stage18.schema.sprint_goal).toBeDefined();
      expect(stage18.schema.items).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage18.defaultData).toEqual({
        sprint_name: null,
        sprint_duration_days: null,
        sprint_goal: null,
        items: [],
        total_items: 0,
        total_story_points: 0,
        sd_bridge_payloads: [],
      });
    });

    it('should have validate function', () => {
      expect(typeof stage18.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage18.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(PRIORITY_VALUES).toEqual(['critical', 'high', 'medium', 'low']);
      expect(SD_TYPES).toEqual(['feature', 'bugfix', 'enhancement', 'refactor', 'infra']);
      expect(MIN_SPRINT_ITEMS).toBe(1);
      expect(SD_BRIDGE_REQUIRED_FIELDS).toEqual([
        'title', 'description', 'priority', 'type', 'scope',
        'success_criteria', 'dependencies', 'risks', 'target_application',
      ]);
      expect(MIN_SPRINT_DURATION_DAYS).toBe(1);
      expect(MAX_SPRINT_DURATION_DAYS).toBe(30);
    });
  });

  describe('validate() - Sprint metadata', () => {
    const validItems = [
      {
        title: 'Test feature',
        description: 'Test description',
        priority: 'high',
        type: 'feature',
        scope: 'Frontend',
        success_criteria: 'Works as expected',
        target_application: 'EHG_Engineer',
      },
    ];

    it('should pass for valid sprint data', () => {
      const validData = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing sprint_name', () => {
      const invalidData = {
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_name'))).toBe(true);
    });

    it('should fail for empty sprint_name', () => {
      const invalidData = {
        sprint_name: '',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_name'))).toBe(true);
    });

    it('should fail for missing sprint_duration_days', () => {
      const invalidData = {
        sprint_name: 'Sprint 1',
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_duration_days'))).toBe(true);
    });

    it('should fail for sprint_duration_days < 1', () => {
      const invalidData = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 0,
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_duration_days'))).toBe(true);
    });

    it('should fail for sprint_duration_days > 30', () => {
      const invalidData = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 31,
        sprint_goal: 'Complete MVP features',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_duration_days') && e.includes('30'))).toBe(true);
    });

    it('should fail for missing sprint_goal', () => {
      const invalidData = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_goal'))).toBe(true);
    });

    it('should fail for sprint_goal < 10 characters', () => {
      const invalidData = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Short',
        items: validItems,
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sprint_goal'))).toBe(true);
    });
  });

  describe('validate() - Sprint items', () => {
    const validData = {
      sprint_name: 'Sprint 1',
      sprint_duration_days: 14,
      sprint_goal: 'Complete MVP features',
    };

    it('should fail for missing items array', () => {
      const invalidData = { ...validData };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items'))).toBe(true);
    });

    it('should fail for empty items array', () => {
      const invalidData = { ...validData, items: [] };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for item missing title', () => {
      const invalidData = {
        ...validData,
        items: [{
          description: 'Test',
          priority: 'high',
          type: 'feature',
          scope: 'Test',
          success_criteria: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].title'))).toBe(true);
    });

    it('should fail for item missing description', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          priority: 'high',
          type: 'feature',
          scope: 'Test',
          success_criteria: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].description'))).toBe(true);
    });

    it('should fail for item with invalid priority', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'invalid',
          type: 'feature',
          scope: 'Test',
          success_criteria: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].priority'))).toBe(true);
    });

    it('should fail for item with invalid type', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'high',
          type: 'invalid',
          scope: 'Test',
          success_criteria: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].type'))).toBe(true);
    });

    it('should fail for item missing scope', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'high',
          type: 'feature',
          success_criteria: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].scope'))).toBe(true);
    });

    it('should fail for item missing success_criteria', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'high',
          type: 'feature',
          scope: 'Test',
          target_application: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].success_criteria'))).toBe(true);
    });

    it('should fail for item missing target_application', () => {
      const invalidData = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'high',
          type: 'feature',
          scope: 'Test',
          success_criteria: 'Test',
        }],
      };
      const result = stage18.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('items[0].target_application'))).toBe(true);
    });

    it('should pass with optional fields (dependencies, risks, story_points)', () => {
      const validData2 = {
        ...validData,
        items: [{
          title: 'Test',
          description: 'Test',
          priority: 'high',
          type: 'feature',
          scope: 'Test',
          success_criteria: 'Test',
          target_application: 'Test',
          dependencies: ['SD-001'],
          risks: ['Risk 1'],
          story_points: 5,
        }],
      };
      const result = stage18.validate(validData2);
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived() - Sprint metrics', () => {
    it('should calculate total_items correctly', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'T1',
            description: 'D1',
            priority: 'high',
            type: 'feature',
            scope: 'S1',
            success_criteria: 'SC1',
            target_application: 'A1',
          },
          {
            title: 'T2',
            description: 'D2',
            priority: 'medium',
            type: 'bugfix',
            scope: 'S2',
            success_criteria: 'SC2',
            target_application: 'A2',
          },
        ],
      };
      const result = stage18.computeDerived(data);
      expect(result.total_items).toBe(2);
    });

    it('should calculate total_story_points correctly', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'T1',
            description: 'D1',
            priority: 'high',
            type: 'feature',
            scope: 'S1',
            success_criteria: 'SC1',
            target_application: 'A1',
            story_points: 5,
          },
          {
            title: 'T2',
            description: 'D2',
            priority: 'medium',
            type: 'bugfix',
            scope: 'S2',
            success_criteria: 'SC2',
            target_application: 'A2',
            story_points: 3,
          },
        ],
      };
      const result = stage18.computeDerived(data);
      expect(result.total_story_points).toBe(8);
    });

    it('should handle missing story_points', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'T1',
            description: 'D1',
            priority: 'high',
            type: 'feature',
            scope: 'S1',
            success_criteria: 'SC1',
            target_application: 'A1',
          },
          {
            title: 'T2',
            description: 'D2',
            priority: 'medium',
            type: 'bugfix',
            scope: 'S2',
            success_criteria: 'SC2',
            target_application: 'A2',
            story_points: 3,
          },
        ],
      };
      const result = stage18.computeDerived(data);
      expect(result.total_story_points).toBe(3);
    });
  });

  describe('computeDerived() - SD bridge payloads', () => {
    it('should generate SD bridge payloads for all items', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'Feature 1',
            description: 'Build feature 1',
            priority: 'high',
            type: 'feature',
            scope: 'Frontend',
            success_criteria: 'UI works',
            dependencies: ['SD-001'],
            risks: ['Complexity'],
            target_application: 'EHG_Engineer',
            story_points: 5,
          },
          {
            title: 'Bug fix 1',
            description: 'Fix critical bug',
            priority: 'critical',
            type: 'bugfix',
            scope: 'Backend',
            success_criteria: 'Bug resolved',
            target_application: 'EHG',
          },
        ],
      };
      const result = stage18.computeDerived(data);
      expect(result.sd_bridge_payloads).toHaveLength(2);
      expect(result.sd_bridge_payloads[0]).toEqual({
        title: 'Feature 1',
        description: 'Build feature 1',
        priority: 'high',
        type: 'feature',
        scope: 'Frontend',
        success_criteria: 'UI works',
        dependencies: ['SD-001'],
        risks: ['Complexity'],
        target_application: 'EHG_Engineer',
      });
      expect(result.sd_bridge_payloads[1]).toEqual({
        title: 'Bug fix 1',
        description: 'Fix critical bug',
        priority: 'critical',
        type: 'bugfix',
        scope: 'Backend',
        success_criteria: 'Bug resolved',
        dependencies: [],
        risks: [],
        target_application: 'EHG',
      });
    });

    it('should include all SD_BRIDGE_REQUIRED_FIELDS', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'Test',
            description: 'Test',
            priority: 'high',
            type: 'feature',
            scope: 'Test',
            success_criteria: 'Test',
            target_application: 'Test',
          },
        ],
      };
      const result = stage18.computeDerived(data);
      const payload = result.sd_bridge_payloads[0];
      SD_BRIDGE_REQUIRED_FIELDS.forEach(field => {
        expect(payload).toHaveProperty(field);
      });
    });

    it('should default dependencies and risks to empty arrays', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'Test',
            description: 'Test',
            priority: 'high',
            type: 'feature',
            scope: 'Test',
            success_criteria: 'Test',
            target_application: 'Test',
          },
        ],
      };
      const result = stage18.computeDerived(data);
      expect(result.sd_bridge_payloads[0].dependencies).toEqual([]);
      expect(result.sd_bridge_payloads[0].risks).toEqual([]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty items array in computeDerived', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [],
      };
      const result = stage18.computeDerived(data);
      expect(result.total_items).toBe(0);
      expect(result.total_story_points).toBe(0);
      expect(result.sd_bridge_payloads).toEqual([]);
    });

    it('should handle null data in validate', () => {
      const result = stage18.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data in validate', () => {
      const result = stage18.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 14,
        sprint_goal: 'Complete MVP features',
        items: [
          {
            title: 'Feature 1',
            description: 'Build feature 1',
            priority: 'high',
            type: 'feature',
            scope: 'Frontend',
            success_criteria: 'UI works',
            target_application: 'EHG_Engineer',
            story_points: 5,
          },
        ],
      };
      const validation = stage18.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage18.computeDerived(data);
      expect(computed.total_items).toBe(1);
      expect(computed.total_story_points).toBe(5);
      expect(computed.sd_bridge_payloads).toHaveLength(1);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        sprint_name: 'Sprint 1',
        sprint_duration_days: 100, // Invalid
        sprint_goal: 'Short', // Invalid
        items: [],
      };
      const computed = stage18.computeDerived(data);
      expect(computed.total_items).toBe(0);
    });
  });
});
