/**
 * Unit tests for stage templates index/registry
 * Part of SD-LEO-FEAT-TMPL-TRUTH-001, SD-LEO-FEAT-TMPL-ENGINE-001,
 *   SD-LEO-FEAT-TMPL-IDENTITY-001, SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario TS-5: Registry returns correct templates (stages 1-16)
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
  evaluateStage03KillGate,
  evaluateStage05KillGate,
  evaluateStage13KillGate,
  evaluatePhase2RealityGate,
  evaluatePhase3RealityGate,
  evaluatePhase4PromotionGate,
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

    it('should return stage10 for stageNumber 10 (TS-5)', () => {
      const template = getTemplate(10);
      expect(template).toBe(stage10);
      expect(template.id).toBe('stage-10');
      expect(template.slug).toBe('naming-brand');
    });

    it('should return stage11 for stageNumber 11 (TS-5)', () => {
      const template = getTemplate(11);
      expect(template).toBe(stage11);
      expect(template.id).toBe('stage-11');
      expect(template.slug).toBe('gtm');
    });

    it('should return stage12 for stageNumber 12 (TS-5)', () => {
      const template = getTemplate(12);
      expect(template).toBe(stage12);
      expect(template.id).toBe('stage-12');
      expect(template.slug).toBe('sales-logic');
    });

    it('should return stage13 for stageNumber 13', () => {
      const template = getTemplate(13);
      expect(template).toBe(stage13);
      expect(template.id).toBe('stage-13');
      expect(template.slug).toBe('product-roadmap');
    });

    it('should return stage14 for stageNumber 14', () => {
      const template = getTemplate(14);
      expect(template).toBe(stage14);
      expect(template.id).toBe('stage-14');
      expect(template.slug).toBe('technical-architecture');
    });

    it('should return stage15 for stageNumber 15', () => {
      const template = getTemplate(15);
      expect(template).toBe(stage15);
      expect(template.id).toBe('stage-15');
      expect(template.slug).toBe('resource-planning');
    });

    it('should return stage16 for stageNumber 16', () => {
      const template = getTemplate(16);
      expect(template).toBe(stage16);
      expect(template.id).toBe('stage-16');
      expect(template.slug).toBe('financial-projections');
    });

    it('should return null for invalid stage numbers', () => {
      expect(getTemplate(0)).toBeNull();
      expect(getTemplate(17)).toBeNull();
      expect(getTemplate(-1)).toBeNull();
      expect(getTemplate(100)).toBeNull();
    });

    it('should handle string number inputs (JavaScript coercion)', () => {
      expect(getTemplate('1')).toBe(stage01);
      expect(getTemplate('6')).toBe(stage06);
      expect(getTemplate('9')).toBe(stage09);
      expect(getTemplate('10')).toBe(stage10);
      expect(getTemplate('12')).toBe(stage12);
      expect(getTemplate('13')).toBe(stage13);
      expect(getTemplate('16')).toBe(stage16);
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
      expect(getTemplate(10.5)).toBeNull();
    });
  });

  describe('getAllTemplates() - TS-5: Full registry', () => {
    it('should return an array of all 16 templates', () => {
      const templates = getAllTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates).toHaveLength(16);
    });

    it('should return templates in order (stage01 to stage16)', () => {
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
      expect(templates[9]).toBe(stage10);
      expect(templates[10]).toBe(stage11);
      expect(templates[11]).toBe(stage12);
      expect(templates[12]).toBe(stage13);
      expect(templates[13]).toBe(stage14);
      expect(templates[14]).toBe(stage15);
      expect(templates[15]).toBe(stage16);
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
      expect(templates[9].id).toBe('stage-10');
      expect(templates[10].id).toBe('stage-11');
      expect(templates[11].id).toBe('stage-12');
      expect(templates[12].id).toBe('stage-13');
      expect(templates[13].id).toBe('stage-14');
      expect(templates[14].id).toBe('stage-15');
      expect(templates[15].id).toBe('stage-16');
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

    it('evaluateStage13KillGate should work correctly', () => {
      const result = evaluateStage13KillGate({
        milestone_count: 3,
        milestones: [
          { name: 'M1', deliverables: ['D1'] },
          { name: 'M2', deliverables: ['D2'] },
          { name: 'M3', deliverables: ['D3'] },
        ],
        timeline_months: 6,
      });
      expect(result.decision).toBe('pass');
      expect(result.blockProgression).toBe(false);
    });

    it('evaluatePhase2RealityGate should work correctly', () => {
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
      const result = evaluatePhase2RealityGate(prerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('evaluatePhase3RealityGate should work correctly (TS-5)', () => {
      const prerequisites = {
        stage10: {
          candidates: [
            { name: 'C1', weighted_score: 80 },
            { name: 'C2', weighted_score: 70 },
            { name: 'C3', weighted_score: 85 },
            { name: 'C4', weighted_score: 75 },
            { name: 'C5', weighted_score: 90 },
          ],
        },
        stage11: {
          tiers: [
            { name: 'T1', description: 'D1' },
            { name: 'T2', description: 'D2' },
            { name: 'T3', description: 'D3' },
          ],
          channels: [
            { name: 'C1' }, { name: 'C2' }, { name: 'C3' }, { name: 'C4' },
            { name: 'C5' }, { name: 'C6' }, { name: 'C7' }, { name: 'C8' },
          ],
        },
        stage12: {
          funnel_stages: [
            { name: 'F1', metric: 'M1', target_value: 100 },
            { name: 'F2', metric: 'M2', target_value: 50 },
            { name: 'F3', metric: 'M3', target_value: 25 },
            { name: 'F4', metric: 'M4', target_value: 10 },
          ],
          customer_journey: [
            { step: 'S1', funnel_stage: 'F1', touchpoint: 'T1' },
            { step: 'S2', funnel_stage: 'F2', touchpoint: 'T2' },
            { step: 'S3', funnel_stage: 'F3', touchpoint: 'T3' },
            { step: 'S4', funnel_stage: 'F4', touchpoint: 'T4' },
            { step: 'S5', funnel_stage: 'F4', touchpoint: 'T5' },
          ],
        },
      };
      const result = evaluatePhase3RealityGate(prerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
    });

    it('evaluatePhase4PromotionGate should work correctly', () => {
      const prerequisites = {
        stage13: {
          milestones: [
            { name: 'M1', deliverables: ['D1'] },
            { name: 'M2', deliverables: ['D2'] },
            { name: 'M3', deliverables: ['D3'] },
          ],
          decision: 'pass',
        },
        stage14: {
          layers: {
            frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
            backend: { technology: 'Node', components: ['API'], rationale: 'Fast' },
            data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
            infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
          },
        },
        stage15: {
          team_members: [
            { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100 },
            { role: 'Designer', skills: ['Figma'], allocation_pct: 50 },
          ],
        },
        stage16: {
          initial_capital: 100000,
          revenue_projections: Array.from({ length: 6 }, (_, i) => ({
            month: i + 1,
            revenue: 1000,
            costs: 500,
          })),
        },
      };
      const result = evaluatePhase4PromotionGate(prerequisites);
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
      for (let i = 1; i <= 16; i++) {
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

    it('should produce deterministic output for stage 10 (TS-5)', () => {
      const input = {
        brandGenome: {
          archetype: 'Innovator',
          values: ['Innovation'],
          tone: 'Professional',
          audience: 'SMBs',
          differentiators: ['AI'],
        },
        scoringCriteria: [
          { name: 'M', weight: 50 },
          { name: 'R', weight: 50 },
        ],
        candidates: [
          { name: 'C1', rationale: 'R1', scores: { M: 80, R: 90 } },
          { name: 'C2', rationale: 'R2', scores: { M: 70, R: 80 } },
          { name: 'C3', rationale: 'R3', scores: { M: 85, R: 75 } },
          { name: 'C4', rationale: 'R4', scores: { M: 75, R: 85 } },
          { name: 'C5', rationale: 'R5', scores: { M: 90, R: 70 } },
        ],
      };
      const result1 = stage10.computeDerived(input);
      const result2 = stage10.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 11 (TS-5)', () => {
      const input = {
        tiers: [
          { name: 'T1', description: 'D1' },
          { name: 'T2', description: 'D2' },
          { name: 'T3', description: 'D3' },
        ],
        channels: [
          { name: 'C1', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'K1' },
          { name: 'C2', monthly_budget: 2000, expected_cac: 100, primary_kpi: 'K2' },
          { name: 'C3', monthly_budget: 3000, expected_cac: 150, primary_kpi: 'K3' },
          { name: 'C4', monthly_budget: 4000, expected_cac: 200, primary_kpi: 'K4' },
          { name: 'C5', monthly_budget: 5000, expected_cac: 250, primary_kpi: 'K5' },
          { name: 'C6', monthly_budget: 6000, expected_cac: 300, primary_kpi: 'K6' },
          { name: 'C7', monthly_budget: 7000, expected_cac: 350, primary_kpi: 'K7' },
          { name: 'C8', monthly_budget: 8000, expected_cac: 400, primary_kpi: 'K8' },
        ],
        launch_timeline: [
          { milestone: 'M1', date: '2026-Q2' },
        ],
      };
      const result1 = stage11.computeDerived(input);
      const result2 = stage11.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 12 (TS-5)', () => {
      const input = {
        sales_model: 'inside-sales',
        sales_cycle_days: 30,
        deal_stages: [
          { name: 'D1', description: 'Desc1' },
          { name: 'D2', description: 'Desc2' },
          { name: 'D3', description: 'Desc3' },
        ],
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100 },
          { name: 'F2', metric: 'M2', target_value: 50 },
          { name: 'F3', metric: 'M3', target_value: 25 },
          { name: 'F4', metric: 'M4', target_value: 10 },
        ],
        customer_journey: [
          { step: 'S1', funnel_stage: 'F1', touchpoint: 'T1' },
          { step: 'S2', funnel_stage: 'F2', touchpoint: 'T2' },
          { step: 'S3', funnel_stage: 'F3', touchpoint: 'T3' },
          { step: 'S4', funnel_stage: 'F4', touchpoint: 'T4' },
          { step: 'S5', funnel_stage: 'F4', touchpoint: 'T5' },
        ],
      };
      const result1 = stage12.computeDerived(input);
      const result2 = stage12.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 13', () => {
      const input = {
        vision_statement: 'A'.repeat(20),
        milestones: [
          { name: 'M1', date: '2026-01-01', deliverables: ['D1'], dependencies: [] },
          { name: 'M2', date: '2026-04-01', deliverables: ['D2'], dependencies: [] },
          { name: 'M3', date: '2026-07-01', deliverables: ['D3'], dependencies: [] },
        ],
        phases: [{ name: 'Phase 1', start_date: '2026-01-01', end_date: '2026-07-01' }],
      };
      const result1 = stage13.computeDerived(input);
      const result2 = stage13.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 14', () => {
      const input = {
        architecture_summary: 'A'.repeat(20),
        layers: {
          frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
          backend: { technology: 'Node', components: ['API'], rationale: 'Fast' },
          data: { technology: 'PostgreSQL', components: ['DB'], rationale: 'Reliable' },
          infra: { technology: 'AWS', components: ['EC2'], rationale: 'Scalable' },
        },
        integration_points: [{ name: 'API Call', source_layer: 'frontend', target_layer: 'backend', protocol: 'HTTP' }],
      };
      const result1 = stage14.computeDerived(input);
      const result2 = stage14.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 15', () => {
      const input = {
        team_members: [
          { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100, cost_monthly: 10000 },
          { role: 'Designer', skills: ['Figma'], allocation_pct: 50, cost_monthly: 5000 },
        ],
      };
      const result1 = stage15.computeDerived(input);
      const result2 = stage15.computeDerived(input);
      expect(result1).toEqual(result2);
    });

    it('should produce deterministic output for stage 16', () => {
      const input = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000 * (i + 1),
          costs: 500 * (i + 1),
        })),
      };
      const result1 = stage16.computeDerived(input);
      const result2 = stage16.computeDerived(input);
      expect(result1).toEqual(result2);
    });
  });
});
