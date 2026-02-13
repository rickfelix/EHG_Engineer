/**
 * Unit tests for Stage 09 - Exit Strategy template
 * Part of SD-LEO-FEAT-TMPL-ENGINE-001
 *
 * Test Scenario TS-4: Stage 09 Reality Gate fails with explicit blockers when prerequisites not met
 *
 * @module tests/unit/eva/stage-templates/stage-09.test
 */

import { describe, it, expect } from 'vitest';
import stage09, { evaluateRealityGate, MIN_RISKS, MIN_ACQUIRERS } from '../../../../lib/eva/stage-templates/stage-09.js';

describe('stage-09.js - Exit Strategy template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage09.id).toBe('stage-09');
      expect(stage09.slug).toBe('exit-strategy');
      expect(stage09.title).toBe('Exit Strategy');
      expect(stage09.version).toBe('2.0.0');
    });

    it('should export MIN_RISKS = 10', () => {
      expect(MIN_RISKS).toBe(10);
    });

    it('should export MIN_ACQUIRERS = 3', () => {
      expect(MIN_ACQUIRERS).toBe(3);
    });

    it('should have defaultData', () => {
      expect(stage09.defaultData).toMatchObject({
        exit_thesis: null,
        exit_horizon_months: null,
        exit_paths: [],
        target_acquirers: [],
        milestones: [],
        reality_gate: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage09.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage09.computeDerived).toBe('function');
    });

    it('should export evaluateRealityGate function', () => {
      expect(typeof evaluateRealityGate).toBe('function');
    });
  });

  describe('validate() - Exit strategy inputs validation', () => {
    const validData = {
      exit_thesis: 'Strategic acquisition by enterprise SaaS company seeking AI capabilities',
      exit_horizon_months: 36,
      exit_paths: [
        {
          type: 'Strategic Acquisition',
          description: 'Acquired by enterprise software company',
          probability_pct: 60,
        },
      ],
      target_acquirers: [
        { name: 'Company A', rationale: 'Strong synergy', fit_score: 5 },
        { name: 'Company B', rationale: 'Market overlap', fit_score: 4 },
        { name: 'Company C', rationale: 'Tech stack fit', fit_score: 3 },
      ],
      milestones: [
        { date: '2026-Q3', success_criteria: 'Reach $1M ARR' },
      ],
    };

    it('should pass for valid data', () => {
      const result = stage09.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing exit_thesis', () => {
      const data = { ...validData };
      delete data.exit_thesis;
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_thesis');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for exit_thesis below minimum length (20)', () => {
      const data = { ...validData, exit_thesis: 'Too short' };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_thesis');
      expect(result.errors[0]).toContain('must be at least 20 characters');
    });

    it('should pass for exit_thesis at exactly 20 characters', () => {
      const data = { ...validData, exit_thesis: 'x'.repeat(20) };
      const result = stage09.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for missing exit_horizon_months', () => {
      const data = { ...validData };
      delete data.exit_horizon_months;
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_horizon_months');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for exit_horizon_months < 1', () => {
      const data = { ...validData, exit_horizon_months: 0 };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_horizon_months');
      expect(result.errors[0]).toContain('must be between 1 and 120');
    });

    it('should fail for exit_horizon_months > 120', () => {
      const data = { ...validData, exit_horizon_months: 121 };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_horizon_months');
      expect(result.errors[0]).toContain('must be between 1 and 120');
    });

    it('should pass for exit_horizon_months at boundaries (1 and 120)', () => {
      const data1 = { ...validData, exit_horizon_months: 1 };
      const data120 = { ...validData, exit_horizon_months: 120 };
      expect(stage09.validate(data1).valid).toBe(true);
      expect(stage09.validate(data120).valid).toBe(true);
    });

    it('should fail for empty exit_paths array', () => {
      const data = { ...validData, exit_paths: [] };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_paths');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for exit_path missing type', () => {
      const data = {
        ...validData,
        exit_paths: [{ description: 'Missing type', probability_pct: 50 }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_paths[0].type');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for exit_path missing description', () => {
      const data = {
        ...validData,
        exit_paths: [{ type: 'Acquisition', probability_pct: 50 }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_paths[0].description');
      expect(result.errors[0]).toContain('is required');
    });

    it('should allow optional probability_pct', () => {
      const data = {
        ...validData,
        exit_paths: [{ type: 'Acquisition', description: 'Strategic acquisition' }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for probability_pct > 100', () => {
      const data = {
        ...validData,
        exit_paths: [{ type: 'Acquisition', description: 'Desc', probability_pct: 120 }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exit_paths[0].probability_pct');
      expect(result.errors[0]).toContain('must be <= 100');
    });

    it('should fail for target_acquirers with fewer than 3 items', () => {
      const data = {
        ...validData,
        target_acquirers: [
          { name: 'Company A', rationale: 'Reason', fit_score: 5 },
          { name: 'Company B', rationale: 'Reason', fit_score: 4 },
        ],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('target_acquirers');
      expect(result.errors[0]).toContain('must have at least 3 item(s)');
    });

    it('should fail for target_acquirer missing name', () => {
      const data = {
        ...validData,
        target_acquirers: [
          { rationale: 'Reason', fit_score: 5 },
          { name: 'Company B', rationale: 'Reason', fit_score: 4 },
          { name: 'Company C', rationale: 'Reason', fit_score: 3 },
        ],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('target_acquirers[0].name');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for target_acquirer fit_score out of bounds', () => {
      const data0 = {
        ...validData,
        target_acquirers: [
          { name: 'Company A', rationale: 'Reason', fit_score: 0 },
          { name: 'Company B', rationale: 'Reason', fit_score: 4 },
          { name: 'Company C', rationale: 'Reason', fit_score: 3 },
        ],
      };
      const data6 = {
        ...validData,
        target_acquirers: [
          { name: 'Company A', rationale: 'Reason', fit_score: 6 },
          { name: 'Company B', rationale: 'Reason', fit_score: 4 },
          { name: 'Company C', rationale: 'Reason', fit_score: 3 },
        ],
      };
      expect(stage09.validate(data0).valid).toBe(false);
      expect(stage09.validate(data6).valid).toBe(false);
    });

    it('should fail for empty milestones array', () => {
      const data = { ...validData, milestones: [] };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('milestones');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for milestone missing date', () => {
      const data = {
        ...validData,
        milestones: [{ success_criteria: 'Criteria' }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('milestones[0].date');
      expect(result.errors[0]).toContain('is required');
    });

    it('should fail for milestone missing success_criteria', () => {
      const data = {
        ...validData,
        milestones: [{ date: '2026-Q3' }],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('milestones[0].success_criteria');
      expect(result.errors[0]).toContain('is required');
    });

    it('should collect multiple validation errors', () => {
      const data = {
        exit_thesis: 'Short',
        exit_horizon_months: 0,
        exit_paths: [],
        target_acquirers: [],
        milestones: [],
      };
      const result = stage09.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('evaluateRealityGate() - Reality gate evaluation logic', () => {
    const createValidPrerequisites = () => ({
      stage06: {
        risks: Array.from({ length: 10 }, (_, i) => ({
          id: `RISK-${i + 1}`,
          category: 'Market',
          description: `Risk ${i + 1}`,
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
        customerSegments: { items: [{ text: 'Segment 1', priority: 1 }, { text: 'Segment 2', priority: 2 }] },
        valuePropositions: { items: [{ text: 'VP 1', priority: 1 }, { text: 'VP 2', priority: 2 }] },
        channels: { items: [{ text: 'Channel 1', priority: 1 }, { text: 'Channel 2', priority: 2 }] },
        customerRelationships: { items: [{ text: 'CR 1', priority: 1 }, { text: 'CR 2', priority: 2 }] },
        revenueStreams: { items: [{ text: 'RS 1', priority: 1 }, { text: 'RS 2', priority: 2 }] },
        keyResources: { items: [{ text: 'KR 1', priority: 1 }, { text: 'KR 2', priority: 2 }] },
        keyActivities: { items: [{ text: 'KA 1', priority: 1 }, { text: 'KA 2', priority: 2 }] },
        keyPartnerships: { items: [{ text: 'KP 1', priority: 1 }] },
        costStructure: { items: [{ text: 'CS 1', priority: 1 }, { text: 'CS 2', priority: 2 }] },
      },
    });

    it('should pass when all prerequisites are met', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.required_next_actions).toEqual([]);
      expect(result.rationale).toContain('All Phase 2 prerequisites met');
    });

    it('should fail when stage06 has fewer than 10 risks', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage06.risks = prerequisites.stage06.risks.slice(0, 8);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('Insufficient risks: 8 < 10 required');
      expect(result.required_next_actions).toContain('Add 2 more risks to the risk matrix');
    });

    it('should pass when stage06 has exactly 10 risks', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
    });

    it('should fail when stage07 has no tiers', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage07.tiers = [];
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('No pricing tiers defined');
      expect(result.required_next_actions).toContain('Define at least 1 pricing tier');
    });

    it('should fail when stage07 LTV is null', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage07.ltv = null;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('LTV not computed (likely zero churn rate)');
      expect(result.required_next_actions).toContain('Set a non-zero monthly churn rate to compute LTV');
    });

    it('should fail when stage07 LTV is undefined', () => {
      const prerequisites = createValidPrerequisites();
      delete prerequisites.stage07.ltv;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('LTV not computed (likely zero churn rate)');
    });

    it('should fail when stage07 payback_months is null', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage07.payback_months = null;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('Payback months not computed');
      expect(result.required_next_actions).toContain('Ensure ARPA and gross margin produce positive monthly profit');
    });

    it('should fail when stage08 BMC block is empty', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage08.customerSegments = { items: [] };
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain("BMC block 'customerSegments' is empty or missing");
      expect(result.required_next_actions).toContain("Populate the 'customerSegments' section of the Business Model Canvas");
    });

    it('should fail when stage08 BMC block is missing', () => {
      const prerequisites = createValidPrerequisites();
      delete prerequisites.stage08.valuePropositions;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('valuePropositions'))).toBe(true);
    });

    it('should fail when stage08 BMC block items is not an array', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage08.channels.items = 'not an array';
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('channels'))).toBe(true);
    });

    it('should fail with multiple blockers when multiple prerequisites not met', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage06.risks = [];
      prerequisites.stage07.ltv = null;
      prerequisites.stage08.customerSegments = { items: [] };
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.length).toBeGreaterThanOrEqual(3);
      expect(result.rationale).toContain('Phase 2 is incomplete');
      expect(result.rationale).toContain('blocker(s) found');
    });

    it('should be a pure function (no mutation)', () => {
      const prerequisites = createValidPrerequisites();
      const original = JSON.parse(JSON.stringify(prerequisites));
      evaluateRealityGate(prerequisites);
      expect(prerequisites).toEqual(original);
    });
  });

  describe('computeDerived() - Reality gate integration', () => {
    const validData = {
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

    it('should add reality_gate with pass=false when prerequisites not provided', () => {
      const result = stage09.computeDerived(validData);
      expect(result.reality_gate).toBeDefined();
      expect(result.reality_gate.pass).toBe(false);
      expect(result.reality_gate.rationale).toContain('Prerequisites not provided');
      expect(result.reality_gate.blockers).toContain('Stage 06-08 data required');
      expect(result.reality_gate.required_next_actions).toContain('Complete stages 06-08 before evaluating reality gate');
    });

    it('should add reality_gate with evaluateRealityGate result when prerequisites provided', () => {
      const prerequisites = {
        stage06: {
          risks: Array.from({ length: 10 }, (_, i) => ({
            id: `RISK-${i + 1}`,
            category: 'Market',
            description: `Risk ${i + 1}`,
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
      const result = stage09.computeDerived(validData, prerequisites);
      expect(result.reality_gate.pass).toBe(true);
      expect(result.reality_gate.blockers).toEqual([]);
    });

    it('should preserve all original fields in output', () => {
      const result = stage09.computeDerived(validData);
      expect(result.exit_thesis).toBe(validData.exit_thesis);
      expect(result.exit_horizon_months).toBe(validData.exit_horizon_months);
      expect(result.exit_paths).toEqual(validData.exit_paths);
      expect(result.target_acquirers).toEqual(validData.target_acquirers);
      expect(result.milestones).toEqual(validData.milestones);
    });

    it('should not mutate original data', () => {
      const original = JSON.parse(JSON.stringify(validData));
      stage09.computeDerived(validData);
      expect(validData).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived + evaluateRealityGate', () => {
    const validData = {
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

    const createValidPrerequisites = () => ({
      stage06: {
        risks: Array.from({ length: 10 }, (_, i) => ({
          id: `RISK-${i + 1}`,
          category: 'Market',
          description: `Risk ${i + 1}`,
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
    });

    it('should work together for passing reality gate', () => {
      const validation = stage09.validate(validData);
      expect(validation.valid).toBe(true);

      const prerequisites = createValidPrerequisites();
      const computed = stage09.computeDerived(validData, prerequisites);
      expect(computed.reality_gate.pass).toBe(true);
      expect(computed.reality_gate.blockers).toEqual([]);
    });

    it('should work together for failing reality gate', () => {
      const validation = stage09.validate(validData);
      expect(validation.valid).toBe(true);

      const prerequisites = createValidPrerequisites();
      prerequisites.stage06.risks = [];
      const computed = stage09.computeDerived(validData, prerequisites);
      expect(computed.reality_gate.pass).toBe(false);
      expect(computed.reality_gate.blockers.length).toBeGreaterThan(0);
    });
  });
});
