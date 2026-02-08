/**
 * Unit tests for stage templates index/registry
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001, SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Test Scenario TS-5: Registry returns correct templates (stages 1-9)
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
  evaluateStage03KillGate,
  evaluateStage05KillGate,
  evaluateRealityGate,
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
      expect(typeof evaluateRealityGate).toBe('function');
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

    it('should return stage04 for stageNumber 4', () => {
      const template = getTemplate(4);
      expect(template).toBe(stage04);
      expect(template.id).toBe('stage-04');
    });

    it('should return stage05 for stageNumber 5', () => {
      const template = getTemplate(5);
      expect(template).toBe(stage05);
      expect(template.id).toBe('stage-05');
    });

    it('should return stage06 for stageNumber 6', () => {
      const template = getTemplate(6);
      expect(template).toBe(stage06);
      expect(template.id).toBe('stage-06');
    });

    it('should return stage07 for stageNumber 7', () => {
      const template = getTemplate(7);
      expect(template).toBe(stage07);
      expect(template.id).toBe('stage-07');
    });

    it('should return stage08 for stageNumber 8', () => {
      const template = getTemplate(8);
      expect(template).toBe(stage08);
      expect(template.id).toBe('stage-08');
    });

    it('should return stage09 for stageNumber 9', () => {
      const template = getTemplate(9);
      expect(template).toBe(stage09);
      expect(template.id).toBe('stage-09');
    });

    it('should return null for invalid stage numbers', () => {
      expect(getTemplate(0)).toBeNull();
      expect(getTemplate(10)).toBeNull();
      expect(getTemplate(-1)).toBeNull();
      expect(getTemplate(100)).toBeNull();
    });

    it('should handle string number inputs (JavaScript coercion)', () => {
      expect(getTemplate('1')).toBe(stage01);
      expect(getTemplate('6')).toBe(stage06);
      expect(getTemplate('9')).toBe(stage09);
      expect(getTemplate('invalid')).toBeNull();
    });

    it('should return null for non-coercible inputs', () => {
      expect(getTemplate(null)).toBeNull();
      expect(getTemplate(undefined)).toBeNull();
      expect(getTemplate({})).toBeNull();
    });

    it('should return null for float inputs', () => {
      expect(getTemplate(1.5)).toBeNull();
      expect(getTemplate(6.9)).toBeNull();
    });
  });

  describe('getAllTemplates() - TS-5: Full registry', () => {
    it('should return an array of all 9 templates', () => {
      const templates = getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toHaveLength(9);
    });

    it('should return templates in order (stage01 to stage09)', () => {
      const templates = getAllTemplates();
      expect(templates[0]).toBe(stage01);
      expect(templates[1]).toBe(stage02);
      expect(templates[2]).toBe(stage03);
      expect(templates[3]).toBe(stage04);
      expect(templates[4]).toBe(stage05);
      expect(templates[5]).toBe(stage06);
      expect(templates[6]).toBe(stage07);
      expect(templates[7]).toBe(stage08);
      expect(templates[8]).toBe(stage09);
    });

    it('should return templates with correct IDs', () => {
      const templates = getAllTemplates();
      expect(templates[0].id).toBe('stage-01');
      expect(templates[1].id).toBe('stage-02');
      expect(templates[2].id).toBe('stage-03');
      expect(templates[3].id).toBe('stage-04');
      expect(templates[4].id).toBe('stage-05');
      expect(templates[5].id).toBe('stage-06');
      expect(templates[6].id).toBe('stage-07');
      expect(templates[7].id).toBe('stage-08');
      expect(templates[8].id).toBe('stage-09');
    });

    it('should return new array on each call (not cached reference)', () => {
      const templates1 = getAllTemplates();
      const templates2 = getAllTemplates();
      expect(templates1).not.toBe(templates2); // Different array instances
      expect(templates1).toEqual(templates2); // Same content
    });
  });

  describe('Kill gate and reality gate exports', () => {
    it('evaluateStage03KillGate should work correctly', () => {
      const result = evaluateStage03KillGate({
        overallScore: 75,
        metrics: {
          marketFit: 70,
          customerNeed: 75,
          momentum: 80,
          revenuePotential: 75,
          competitiveBarrier: 70,
          executionFeasibility: 80,
        },
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('evaluateStage05KillGate should work correctly', () => {
      const result = evaluateStage05KillGate({
        roi3y: 0.6,
        breakEvenMonth: 20,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('evaluateRealityGate should work correctly', () => {
      const prerequisites = {
        stage06: {
          risks: Array.from({ length: 10 }, (_, i) => ({
            id: `RISK-${i + 1}`,
            category: 'Market',
            description: 'Risk',
            severity: 3,
            probability: 3,
            impact: 3,
          })),
        },
        stage07: {
          tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
          ltv: 1400,
          payback_months: 3,
        },
        stage08: {
          customerSegments: { items: [{ text: 'S1', priority: 1 }, { text: 'S2', priority: 2 }] },
          valuePropositions: { items: [{ text: 'VP1', priority: 1 }, { text: 'VP2', priority: 2 }] },
          channels: { items: [{ text: 'C1', priority: 1 }, { text: 'C2', priority: 2 }] },
          customerRelationships: { items: [{ text: 'CR1', priority: 1 }, { text: 'CR2', priority: 2 }] },
          revenueStreams: { items: [{ text: 'RS1', priority: 1 }, { text: 'RS2', priority: 2 }] },
          keyResources: { items: [{ text: 'KR1', priority: 1 }, { text: 'KR2', priority: 2 }] },
          keyActivities: { items: [{ text: 'KA1', priority: 1 }, { text: 'KA2', priority: 2 }] },
          keyPartnerships: { items: [{ text: 'KP1', priority: 1 }] },
          costStructure: { items: [{ text: 'CS1', priority: 1 }, { text: 'CS2', priority: 2 }] },
        },
      };
      const result = evaluateRealityGate(prerequisites);
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
        const expectedId = `stage-0${index + 1}`;
        expect(template.id).toBe(expectedId);
      });
    });
  });

  describe('Integration: getTemplate matches getAllTemplates', () => {
    it('should return same template references', () => {
      const allTemplates = getAllTemplates();
      for (let i = 1; i <= 9; i++) {
        const singleTemplate = getTemplate(i);
        expect(singleTemplate).toBe(allTemplates[i - 1]);
      }
    });
  });

  describe('Round-trip determinism (TS-5)', () => {
    it('should produce deterministic output for stage 6', () => {
      const input = {
        risks: [
          {
            id: 'RISK-001',
            category: 'Market',
            description: 'Market risk',
            severity: 3,
            probability: 2,
            impact: 4,
            mitigation: 'Mitigate',
            owner: 'PM',
            status: 'open',
            review_date: '2026-03-01',
          },
        ],
      };
      const result1 = stage06.computeDerived(input);
      const result2 = stage06.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 7', () => {
      const input = {
        currency: 'USD',
        tiers: [{ name: 'Pro', price: 99, billing_period: 'monthly', target_segment: 'SMB' }],
        gross_margin_pct: 70,
        churn_rate_monthly: 5,
        cac: 200,
        arpa: 100,
      };
      const result1 = stage07.computeDerived(input);
      const result2 = stage07.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 8', () => {
      const input = {
        customerSegments: { items: [{ text: 'S1', priority: 1 }, { text: 'S2', priority: 2 }] },
        valuePropositions: { items: [{ text: 'VP1', priority: 1 }, { text: 'VP2', priority: 2 }] },
        channels: { items: [{ text: 'C1', priority: 1 }, { text: 'C2', priority: 2 }] },
        customerRelationships: { items: [{ text: 'CR1', priority: 1 }, { text: 'CR2', priority: 2 }] },
        revenueStreams: { items: [{ text: 'RS1', priority: 1 }, { text: 'RS2', priority: 2 }] },
        keyResources: { items: [{ text: 'KR1', priority: 1 }, { text: 'KR2', priority: 2 }] },
        keyActivities: { items: [{ text: 'KA1', priority: 1 }, { text: 'KA2', priority: 2 }] },
        keyPartnerships: { items: [{ text: 'KP1', priority: 1 }] },
        costStructure: { items: [{ text: 'CS1', priority: 1 }, { text: 'CS2', priority: 2 }] },
      };
      const result1 = stage08.computeDerived(input);
      const result2 = stage08.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 9', () => {
      const input = {
        exit_thesis: 'Strategic acquisition by enterprise SaaS company',
        exit_horizon_months: 36,
        exit_paths: [{ type: 'Acquisition', description: 'Strategic', probability_pct: 60 }],
        target_acquirers: [
          { name: 'A', rationale: 'Reason', fit_score: 5 },
          { name: 'B', rationale: 'Reason', fit_score: 4 },
          { name: 'C', rationale: 'Reason', fit_score: 3 },
        ],
        milestones: [{ date: '2026-Q3', success_criteria: 'Criteria' }],
      };
      const result1 = stage09.computeDerived(input);
      const result2 = stage09.computeDerived(input);
      expect(result1).toEqual(result2);
    });
  });
});
