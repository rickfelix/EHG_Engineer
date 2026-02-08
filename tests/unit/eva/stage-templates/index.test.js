/**
 * Unit tests for stage templates index/registry
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001, SD-LEO-FEAT-TMPL-ENGINE-001,
 *   SD-LEO-FEAT-TMPL-IDENTITY-001, SD-LEO-FEAT-TMPL-BLUEPRINT-001,
 *   SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Test Scenario TS-5: Registry returns correct templates (stages 1-22)
 *
 * @module tests/unit/eva/stage-templates/index.test
 */

import { describe, it, expect } from 'vitest';
import {
  stage01,
  stage02,
  stage03,
  stage04,
  stage05,
  stage06,
  stage07,
  stage08,
  stage09,
  stage10,
  stage11,
  stage12,
  stage13,
  stage14,
  stage15,
  stage16,
  stage17,
  stage18,
  stage19,
  stage20,
  stage21,
  stage22,
  evaluateStage03KillGate,
  evaluateStage05KillGate,
  evaluateStage13KillGate,
  evaluatePhase2RealityGate,
  evaluatePhase3RealityGate,
  evaluatePhase4PromotionGate,
  evaluatePhase5PromotionGate,
  getTemplate,
  getAllTemplates,
} from '../../../../lib/eva/stage-templates/index.js';

describe('index.js - Stage templates registry', () => {
  describe('Named exports - Phase 1 (Stages 1-5)', () => {
    it('should export all Phase 1 stage templates', () => {
      expect(stage01).toBeDefined();
      expect(stage02).toBeDefined();
      expect(stage03).toBeDefined();
      expect(stage04).toBeDefined();
      expect(stage05).toBeDefined();
    });

    it('should export kill gate functions', () => {
      expect(typeof evaluateStage03KillGate).toBe('function');
      expect(typeof evaluateStage05KillGate).toBe('function');
    });

    it('should have correct Phase 1 template IDs', () => {
      expect(stage01.id).toBe('stage-01');
      expect(stage02.id).toBe('stage-02');
      expect(stage03.id).toBe('stage-03');
      expect(stage04.id).toBe('stage-04');
      expect(stage05.id).toBe('stage-05');
    });

    it('should have correct Phase 1 template slugs', () => {
      expect(stage01.slug).toBe('draft-idea');
      expect(stage02.slug).toBe('ai-review');
      expect(stage03.slug).toBe('validation');
      expect(stage04.slug).toBe('competitive-intel');
      expect(stage05.slug).toBe('profitability');
    });
  });

  describe('Named exports - Phase 2 (Stages 6-9)', () => {
    it('should export all Phase 2 stage templates', () => {
      expect(stage06).toBeDefined();
      expect(stage07).toBeDefined();
      expect(stage08).toBeDefined();
      expect(stage09).toBeDefined();
    });

    it('should export reality gate function', () => {
      expect(typeof evaluatePhase2RealityGate).toBe('function');
    });

    it('should have correct Phase 2 template IDs', () => {
      expect(stage06.id).toBe('stage-06');
      expect(stage07.id).toBe('stage-07');
      expect(stage08.id).toBe('stage-08');
      expect(stage09.id).toBe('stage-09');
    });

    it('should have correct Phase 2 template slugs', () => {
      expect(stage06.slug).toBe('risk-matrix');
      expect(stage07.slug).toBe('pricing');
      expect(stage08.slug).toBe('bmc');
      expect(stage09.slug).toBe('exit-strategy');
    });
  });

  describe('Named exports - Phase 3 (Stages 10-12)', () => {
    it('should export all Phase 3 stage templates', () => {
      expect(stage10).toBeDefined();
      expect(stage11).toBeDefined();
      expect(stage12).toBeDefined();
    });

    it('should export Phase 3 reality gate function', () => {
      expect(typeof evaluatePhase3RealityGate).toBe('function');
    });

    it('should have correct Phase 3 template IDs', () => {
      expect(stage10.id).toBe('stage-10');
      expect(stage11.id).toBe('stage-11');
      expect(stage12.id).toBe('stage-12');
    });

    it('should have correct Phase 3 template slugs', () => {
      expect(stage10.slug).toBe('naming-brand');
      expect(stage11.slug).toBe('gtm');
      expect(stage12.slug).toBe('sales-logic');
    });

    it('should have correct Phase 3 template titles', () => {
      expect(stage10.title).toBe('Naming / Brand');
      expect(stage11.title).toBe('Go-To-Market');
      expect(stage12.title).toBe('Sales Logic');
    });
  });

  describe('Named exports - Phase 4 (Stages 13-16)', () => {
    it('should export all Phase 4 stage templates', () => {
      expect(stage13).toBeDefined();
      expect(stage14).toBeDefined();
      expect(stage15).toBeDefined();
      expect(stage16).toBeDefined();
    });

    it('should export Phase 4 gate functions', () => {
      expect(typeof evaluateStage13KillGate).toBe('function');
      expect(typeof evaluatePhase4PromotionGate).toBe('function');
    });

    it('should have correct Phase 4 template IDs', () => {
      expect(stage13.id).toBe('stage-13');
      expect(stage14.id).toBe('stage-14');
      expect(stage15.id).toBe('stage-15');
      expect(stage16.id).toBe('stage-16');
    });

    it('should have correct Phase 4 template slugs', () => {
      expect(stage13.slug).toBe('product-roadmap');
      expect(stage14.slug).toBe('technical-architecture');
      expect(stage15.slug).toBe('resource-planning');
      expect(stage16.slug).toBe('financial-projections');
    });

    it('should have correct Phase 4 template titles', () => {
      expect(stage13.title).toBe('Product Roadmap');
      expect(stage14.title).toBe('Technical Architecture');
      expect(stage15.title).toBe('Resource Planning');
      expect(stage16.title).toBe('Financial Projections');
    });
  });

  describe('Named exports - Phase 5 (Stages 17-22)', () => {
    it('should export all Phase 5 stage templates', () => {
      expect(stage17).toBeDefined();
      expect(stage18).toBeDefined();
      expect(stage19).toBeDefined();
      expect(stage20).toBeDefined();
      expect(stage21).toBeDefined();
      expect(stage22).toBeDefined();
    });

    it('should export Phase 5 promotion gate function', () => {
      expect(typeof evaluatePhase5PromotionGate).toBe('function');
    });

    it('should have correct Phase 5 template IDs', () => {
      expect(stage17.id).toBe('stage-17');
      expect(stage18.id).toBe('stage-18');
      expect(stage19.id).toBe('stage-19');
      expect(stage20.id).toBe('stage-20');
      expect(stage21.id).toBe('stage-21');
      expect(stage22.id).toBe('stage-22');
    });

    it('should have correct Phase 5 template slugs', () => {
      expect(stage17.slug).toBe('pre-build-checklist');
      expect(stage18.slug).toBe('sprint-planning');
      expect(stage19.slug).toBe('build-execution');
      expect(stage20.slug).toBe('quality-assurance');
      expect(stage21.slug).toBe('integration-testing');
      expect(stage22.slug).toBe('release-readiness');
    });

    it('should have correct Phase 5 template titles', () => {
      expect(stage17.title).toBe('Pre-Build Checklist');
      expect(stage18.title).toBe('Sprint Planning');
      expect(stage19.title).toBe('Build Execution');
      expect(stage20.title).toBe('Quality Assurance');
      expect(stage21.title).toBe('Integration Testing');
      expect(stage22.title).toBe('Release Readiness');
    });
  });

  describe('Registry helper functions', () => {
    it('should export registry helper functions', () => {
      expect(typeof getTemplate).toBe('function');
      expect(typeof getAllTemplates).toBe('function');
    });
  });

  describe('getTemplate() - TS-5: Template lookup', () => {
    it('should return stage01 for stageNumber 1', () => {
      const template = getTemplate(1);
      expect(template).toBe(stage01);
      expect(template.id).toBe('stage-01');
    });

    it('should return stage02 for stageNumber 2', () => {
      const template = getTemplate(2);
      expect(template).toBe(stage02);
      expect(template.id).toBe('stage-02');
    });

    it('should return stage03 for stageNumber 3', () => {
      const template = getTemplate(3);
      expect(template).toBe(stage03);
      expect(template.id).toBe('stage-03');
    });

    it('should return stage16 for stageNumber 16', () => {
      const template = getTemplate(16);
      expect(template).toBe(stage16);
      expect(template.id).toBe('stage-16');
      expect(template.slug).toBe('financial-projections');
    });

    it('should return stage17 for stageNumber 17', () => {
      const template = getTemplate(17);
      expect(template).toBe(stage17);
      expect(template.id).toBe('stage-17');
      expect(template.slug).toBe('pre-build-checklist');
    });

    it('should return stage18 for stageNumber 18', () => {
      const template = getTemplate(18);
      expect(template).toBe(stage18);
      expect(template.id).toBe('stage-18');
      expect(template.slug).toBe('sprint-planning');
    });

    it('should return stage19 for stageNumber 19', () => {
      const template = getTemplate(19);
      expect(template).toBe(stage19);
      expect(template.id).toBe('stage-19');
      expect(template.slug).toBe('build-execution');
    });

    it('should return stage20 for stageNumber 20', () => {
      const template = getTemplate(20);
      expect(template).toBe(stage20);
      expect(template.id).toBe('stage-20');
      expect(template.slug).toBe('quality-assurance');
    });

    it('should return stage21 for stageNumber 21', () => {
      const template = getTemplate(21);
      expect(template).toBe(stage21);
      expect(template.id).toBe('stage-21');
      expect(template.slug).toBe('integration-testing');
    });

    it('should return stage22 for stageNumber 22', () => {
      const template = getTemplate(22);
      expect(template).toBe(stage22);
      expect(template.id).toBe('stage-22');
      expect(template.slug).toBe('release-readiness');
    });

    it('should return null for invalid stage numbers', () => {
      expect(getTemplate(0)).toBeNull();
      expect(getTemplate(23)).toBeNull();
      expect(getTemplate(-1)).toBeNull();
      expect(getTemplate(100)).toBeNull();
    });

    it('should handle string number inputs (JavaScript coercion)', () => {
      expect(getTemplate('1')).toBe(stage01);
      expect(getTemplate('16')).toBe(stage16);
      expect(getTemplate('17')).toBe(stage17);
      expect(getTemplate('22')).toBe(stage22);
      expect(getTemplate('invalid')).toBeNull();
    });

    it('should return null for non-coercible inputs', () => {
      expect(getTemplate(null)).toBeNull();
      expect(getTemplate(undefined)).toBeNull();
      expect(getTemplate({})).toBeNull();
    });

    it('should return null for float inputs', () => {
      expect(getTemplate(1.5)).toBeNull();
      expect(getTemplate(17.9)).toBeNull();
      expect(getTemplate(22.5)).toBeNull();
    });
  });

  describe('getAllTemplates() - TS-5: Full registry', () => {
    it('should return an array of all 22 templates', () => {
      const templates = getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toHaveLength(22);
    });

    it('should return templates in order (stage01 to stage22)', () => {
      const templates = getAllTemplates();
      expect(templates[0]).toBe(stage01);
      expect(templates[15]).toBe(stage16);
      expect(templates[16]).toBe(stage17);
      expect(templates[17]).toBe(stage18);
      expect(templates[18]).toBe(stage19);
      expect(templates[19]).toBe(stage20);
      expect(templates[20]).toBe(stage21);
      expect(templates[21]).toBe(stage22);
    });

    it('should return templates with correct IDs', () => {
      const templates = getAllTemplates();
      expect(templates[16].id).toBe('stage-17');
      expect(templates[17].id).toBe('stage-18');
      expect(templates[18].id).toBe('stage-19');
      expect(templates[19].id).toBe('stage-20');
      expect(templates[20].id).toBe('stage-21');
      expect(templates[21].id).toBe('stage-22');
    });

    it('should return new array on each call (not cached reference)', () => {
      const templates1 = getAllTemplates();
      const templates2 = getAllTemplates();
      expect(templates1).not.toBe(templates2); // Different array instances
      expect(templates1).toEqual(templates2); // Same content
    });
  });

  describe('Gate function exports', () => {
    it('evaluatePhase5PromotionGate should work correctly', () => {
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
        stage18: {
          items: [{ title: 'T', description: 'D', priority: 'high', type: 'feature', scope: 'S', success_criteria: 'SC', target_application: 'A' }],
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
          release_items: [{ name: 'R1', category: 'C1', status: 'approved' }],
        },
      };
      const result = evaluatePhase5PromotionGate(prerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
    });
  });

  describe('Template structure consistency', () => {
    it('all templates should have required fields', () => {
      const templates = getAllTemplates();
      templates.forEach(template => {
        expect(template.id).toBeDefined();
        expect(template.slug).toBeDefined();
        expect(template.title).toBeDefined();
        expect(template.version).toBeDefined();
        expect(template.schema).toBeDefined();
        expect(template.defaultData).toBeDefined();
        expect(typeof template.validate).toBe('function');
        expect(typeof template.computeDerived).toBe('function');
      });
    });

    it('all templates should have version 1.0.0', () => {
      const templates = getAllTemplates();
      templates.forEach(template => {
        expect(template.version).toBe('1.0.0');
      });
    });

    it('template IDs should match array position', () => {
      const templates = getAllTemplates();
      templates.forEach((template, index) => {
        const expectedId = `stage-${String(index + 1).padStart(2, '0')}`;
        expect(template.id).toBe(expectedId);
      });
    });
  });

  describe('Integration: getTemplate matches getAllTemplates', () => {
    it('should return same template references', () => {
      const allTemplates = getAllTemplates();
      for (let i = 1; i <= 22; i++) {
        const singleTemplate = getTemplate(i);
        expect(singleTemplate).toBe(allTemplates[i - 1]);
      }
    });
  });

  describe('Round-trip determinism for stages 17-22', () => {
    it('should produce deterministic output for stage 17', () => {
      const input = {
        checklist: {
          architecture: [{ name: 'T1', status: 'complete' }],
          team_readiness: [{ name: 'T2', status: 'complete' }],
          tooling: [{ name: 'T3', status: 'in_progress' }],
          environment: [{ name: 'T4', status: 'not_started' }],
          dependencies: [{ name: 'T5', status: 'blocked' }],
        },
        blockers: [{ description: 'Test', severity: 'low', mitigation: 'Test' }],
      };
      const result1 = stage17.computeDerived(input);
      const result2 = stage17.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 18', () => {
      const input = {
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
      const result1 = stage18.computeDerived(input);
      const result2 = stage18.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 19', () => {
      const input = {
        tasks: [
          { name: 'Task 1', status: 'done' },
          { name: 'Task 2', status: 'in_progress' },
          { name: 'Task 3', status: 'todo' },
        ],
      };
      const result1 = stage19.computeDerived(input);
      const result2 = stage19.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 20', () => {
      const input = {
        test_suites: [
          { name: 'Unit Tests', total_tests: 100, passing_tests: 100, coverage_pct: 80 },
        ],
      };
      const result1 = stage20.computeDerived(input);
      const result2 = stage20.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 21', () => {
      const input = {
        environment: 'staging',
        integrations: [
          { name: 'API to DB', source: 'API', target: 'Database', status: 'pass' },
        ],
      };
      const result1 = stage21.computeDerived(input);
      const result2 = stage21.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 22', () => {
      const input = {
        release_items: [
          { name: 'Security review', category: 'Security', status: 'approved' },
        ],
        release_notes: 'Major release with new features',
        target_date: '2026-03-01',
      };
      const result1 = stage22.computeDerived(input);
      const result2 = stage22.computeDerived(input);
      expect(result1).toEqual(result2);
    });
  });
});
