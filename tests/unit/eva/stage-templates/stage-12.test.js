/**
 * Unit tests for Stage 12 - Sales Logic template
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Test Scenarios:
 * - TS-1: Sales model enum validation
 * - TS-2: Funnel stages validation (min 4 with metrics)
 * - TS-3: Customer journey validation (min 5 steps)
 * - TS-4: Reality gate evaluation logic
 *
 * @module tests/unit/eva/stage-templates/stage-12.test
 */

import { describe, it, expect } from 'vitest';
import stage12, {
  evaluateRealityGate,
  SALES_MODELS,
  MIN_FUNNEL_STAGES,
  MIN_JOURNEY_STEPS,
  MIN_DEAL_STAGES,
} from '../../../../lib/eva/stage-templates/stage-12.js';

describe('stage-12.js - Sales Logic template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage12.id).toBe('stage-12');
      expect(stage12.slug).toBe('sales-logic');
      expect(stage12.title).toBe('Sales Logic');
      expect(stage12.version).toBe('1.0.0');
    });

    it('should export SALES_MODELS', () => {
      expect(SALES_MODELS).toBeInstanceOf(Array);
      expect(SALES_MODELS).toContain('self-serve');
      expect(SALES_MODELS).toContain('inside-sales');
      expect(SALES_MODELS).toContain('enterprise');
      expect(SALES_MODELS).toContain('hybrid');
    });

    it('should export MIN_FUNNEL_STAGES = 4', () => {
      expect(MIN_FUNNEL_STAGES).toBe(4);
    });

    it('should export MIN_JOURNEY_STEPS = 5', () => {
      expect(MIN_JOURNEY_STEPS).toBe(5);
    });

    it('should export MIN_DEAL_STAGES = 3', () => {
      expect(MIN_DEAL_STAGES).toBe(3);
    });

    it('should have defaultData', () => {
      expect(stage12.defaultData).toMatchObject({
        sales_model: null,
        sales_cycle_days: null,
        deal_stages: [],
        funnel_stages: [],
        customer_journey: [],
        reality_gate: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage12.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage12.computeDerived).toBe('function');
    });

    it('should export evaluateRealityGate function', () => {
      expect(typeof evaluateRealityGate).toBe('function');
    });
  });

  describe('validate() - Sales model validation (TS-1)', () => {
    const createValidData = () => ({
      sales_model: 'inside-sales',
      sales_cycle_days: 30,
      deal_stages: [
        { name: 'Discovery', description: 'Initial contact', avg_duration_days: 5 },
        { name: 'Proposal', description: 'Send proposal', avg_duration_days: 10 },
        { name: 'Negotiation', description: 'Negotiate terms', avg_duration_days: 15 },
      ],
      funnel_stages: [
        { name: 'Awareness', metric: 'Website visitors', target_value: 10000 },
        { name: 'Interest', metric: 'Leads', target_value: 1000 },
        { name: 'Decision', metric: 'Qualified leads', target_value: 100 },
        { name: 'Action', metric: 'Customers', target_value: 10 },
      ],
      customer_journey: [
        { step: 'Discover website', funnel_stage: 'Awareness', touchpoint: 'Organic search' },
        { step: 'Read content', funnel_stage: 'Awareness', touchpoint: 'Blog' },
        { step: 'Sign up for trial', funnel_stage: 'Interest', touchpoint: 'Landing page' },
        { step: 'Talk to sales', funnel_stage: 'Decision', touchpoint: 'Sales call' },
        { step: 'Purchase', funnel_stage: 'Action', touchpoint: 'Checkout' },
      ],
    });

    it('should pass with valid sales_model', () => {
      const data = createValidData();
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass with all valid sales models (TS-1)', () => {
      for (const model of SALES_MODELS) {
        const data = createValidData();
        data.sales_model = model;
        const result = stage12.validate(data);
        expect(result.valid).toBe(true);
      }
    });

    it('should fail with invalid sales_model (TS-1)', () => {
      const data = createValidData();
      data.sales_model = 'invalid-model';
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sales_model');
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should fail for missing sales_model', () => {
      const data = createValidData();
      delete data.sales_model;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sales_model');
    });

    it('should fail for missing sales_cycle_days', () => {
      const data = createValidData();
      delete data.sales_cycle_days;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sales_cycle_days');
    });

    it('should fail for sales_cycle_days < 1', () => {
      const data = createValidData();
      data.sales_cycle_days = 0;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sales_cycle_days');
    });

    it('should pass with sales_cycle_days = 1', () => {
      const data = createValidData();
      data.sales_cycle_days = 1;
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Deal stages validation', () => {
    const createValidData = () => ({
      sales_model: 'enterprise',
      sales_cycle_days: 90,
      deal_stages: [
        { name: 'Qualification', description: 'Qualify lead' },
        { name: 'Proposal', description: 'Send proposal' },
        { name: 'Closed Won', description: 'Deal closed' },
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
    });

    it('should pass with exactly 3 deal stages', () => {
      const data = createValidData();
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail with fewer than 3 deal stages', () => {
      const data = createValidData();
      data.deal_stages = data.deal_stages.slice(0, 2);
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('deal_stages');
      expect(result.errors[0]).toContain('must have at least 3 item(s)');
    });

    it('should pass with more than 3 deal stages', () => {
      const data = createValidData();
      data.deal_stages.push({ name: 'Follow-up', description: 'Follow up with client' });
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for deal stage missing name', () => {
      const data = createValidData();
      delete data.deal_stages[1].name;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('deal_stages[1].name'))).toBe(true);
    });

    it('should fail for deal stage missing description', () => {
      const data = createValidData();
      delete data.deal_stages[0].description;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('deal_stages[0].description'))).toBe(true);
    });

    it('should pass with optional avg_duration_days', () => {
      const data = createValidData();
      data.deal_stages[0].avg_duration_days = 10;
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Funnel stages validation (TS-2)', () => {
    const createValidData = () => ({
      sales_model: 'self-serve',
      sales_cycle_days: 7,
      deal_stages: [
        { name: 'D1', description: 'Desc1' },
        { name: 'D2', description: 'Desc2' },
        { name: 'D3', description: 'Desc3' },
      ],
      funnel_stages: [
        { name: 'Awareness', metric: 'Visitors', target_value: 10000 },
        { name: 'Interest', metric: 'Signups', target_value: 1000 },
        { name: 'Decision', metric: 'Trials', target_value: 100 },
        { name: 'Action', metric: 'Customers', target_value: 10 },
      ],
      customer_journey: [
        { step: 'S1', funnel_stage: 'Awareness', touchpoint: 'T1' },
        { step: 'S2', funnel_stage: 'Interest', touchpoint: 'T2' },
        { step: 'S3', funnel_stage: 'Decision', touchpoint: 'T3' },
        { step: 'S4', funnel_stage: 'Action', touchpoint: 'T4' },
        { step: 'S5', funnel_stage: 'Action', touchpoint: 'T5' },
      ],
    });

    it('should pass with exactly 4 funnel stages (TS-2)', () => {
      const data = createValidData();
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail with 3 funnel stages (< 4 required) (TS-2)', () => {
      const data = createValidData();
      data.funnel_stages = data.funnel_stages.slice(0, 3);
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('funnel_stages');
      expect(result.errors[0]).toContain('must have at least 4 item(s)');
      expect(result.errors[0]).toContain('got 3');
    });

    it('should pass with 5 funnel stages (> 4 minimum)', () => {
      const data = createValidData();
      data.funnel_stages.push({ name: 'Retention', metric: 'Active users', target_value: 8 });
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for funnel stage missing name', () => {
      const data = createValidData();
      delete data.funnel_stages[2].name;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnel_stages[2].name'))).toBe(true);
    });

    it('should fail for funnel stage missing metric (TS-2)', () => {
      const data = createValidData();
      delete data.funnel_stages[1].metric;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnel_stages[1].metric'))).toBe(true);
    });

    it('should fail for funnel stage missing target_value (TS-2)', () => {
      const data = createValidData();
      delete data.funnel_stages[3].target_value;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnel_stages[3].target_value'))).toBe(true);
    });

    it('should fail for negative target_value', () => {
      const data = createValidData();
      data.funnel_stages[0].target_value = -100;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funnel_stages[0].target_value'))).toBe(true);
    });

    it('should pass with zero target_value', () => {
      const data = createValidData();
      data.funnel_stages[2].target_value = 0;
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Customer journey validation (TS-3)', () => {
    const createValidData = () => ({
      sales_model: 'hybrid',
      sales_cycle_days: 45,
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
        { step: 'Step 1', funnel_stage: 'F1', touchpoint: 'Website' },
        { step: 'Step 2', funnel_stage: 'F2', touchpoint: 'Email' },
        { step: 'Step 3', funnel_stage: 'F3', touchpoint: 'Demo' },
        { step: 'Step 4', funnel_stage: 'F4', touchpoint: 'Proposal' },
        { step: 'Step 5', funnel_stage: 'F4', touchpoint: 'Contract' },
      ],
    });

    it('should pass with exactly 5 journey steps (TS-3)', () => {
      const data = createValidData();
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail with 4 journey steps (< 5 required) (TS-3)', () => {
      const data = createValidData();
      data.customer_journey = data.customer_journey.slice(0, 4);
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('customer_journey');
      expect(result.errors[0]).toContain('must have at least 5 item(s)');
      expect(result.errors[0]).toContain('got 4');
    });

    it('should pass with 6 journey steps (> 5 minimum)', () => {
      const data = createValidData();
      data.customer_journey.push({ step: 'Step 6', funnel_stage: 'F4', touchpoint: 'Onboarding' });
      const result = stage12.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for journey step missing step field', () => {
      const data = createValidData();
      delete data.customer_journey[2].step;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('customer_journey[2].step'))).toBe(true);
    });

    it('should fail for journey step missing funnel_stage field', () => {
      const data = createValidData();
      delete data.customer_journey[1].funnel_stage;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('customer_journey[1].funnel_stage'))).toBe(true);
    });

    it('should fail for journey step missing touchpoint field', () => {
      const data = createValidData();
      delete data.customer_journey[3].touchpoint;
      const result = stage12.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('customer_journey[3].touchpoint'))).toBe(true);
    });
  });

  describe('evaluateRealityGate() - Reality gate evaluation (TS-4)', () => {
    const createValidPrerequisites = () => ({
      stage10: {
        candidates: [
          { name: 'C1', rationale: 'R1', scores: { M: 80 }, weighted_score: 80 },
          { name: 'C2', rationale: 'R2', scores: { M: 70 }, weighted_score: 70 },
          { name: 'C3', rationale: 'R3', scores: { M: 85 }, weighted_score: 85 },
          { name: 'C4', rationale: 'R4', scores: { M: 75 }, weighted_score: 75 },
          { name: 'C5', rationale: 'R5', scores: { M: 90 }, weighted_score: 90 },
        ],
      },
      stage11: {
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
    });

    it('should pass when all prerequisites are met (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.required_next_actions).toEqual([]);
      expect(result.rationale).toContain('All Phase 3 prerequisites met');
    });

    it('should fail when stage10 has fewer than 5 candidates (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage10.candidates = prerequisites.stage10.candidates.slice(0, 4);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('Insufficient naming candidates: 4 < 5 required');
      expect(result.required_next_actions).toContain('Add 1 more naming candidates with scores');
    });

    it('should pass when stage10 has exactly 5 candidates', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
    });

    it('should fail when stage10 candidates lack weighted scores (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage10.candidates[2].weighted_score = undefined;
      prerequisites.stage10.candidates[3].weighted_score = null;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('Only 3 of 5 candidates have scores computed'))).toBe(true);
      expect(result.required_next_actions).toContain('Ensure all naming candidates have scoring criteria applied');
    });

    it('should fail when stage11 has fewer than 3 tiers (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage11.tiers = prerequisites.stage11.tiers.slice(0, 2);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('GTM requires exactly 3 tiers (got 2)');
      expect(result.required_next_actions).toContain('Define exactly 3 target market tiers');
    });

    it('should fail when stage11 has more than 3 tiers (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage11.tiers.push({ name: 'T4', description: 'D4' });
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('GTM requires exactly 3 tiers (got 4)');
    });

    it('should fail when stage11 has fewer than 8 channels (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage11.channels = prerequisites.stage11.channels.slice(0, 6);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('GTM requires exactly 8 channels (got 6)');
      expect(result.required_next_actions).toContain('Define exactly 8 acquisition channels with budget and CAC');
    });

    it('should fail when stage11 has more than 8 channels (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage11.channels.push({ name: 'C9', monthly_budget: 9000, expected_cac: 450, primary_kpi: 'K9' });
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('GTM requires exactly 8 channels (got 9)');
    });

    it('should fail when stage12 has fewer than 4 funnel stages (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage12.funnel_stages = prerequisites.stage12.funnel_stages.slice(0, 3);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('Insufficient funnel stages: 3 < 4 required');
      expect(result.required_next_actions).toContain('Add 1 more funnel stages with metrics');
    });

    it('should pass when stage12 has exactly 4 funnel stages', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
    });

    it('should fail when stage12 funnel stages lack metrics (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      delete prerequisites.stage12.funnel_stages[1].metric;
      delete prerequisites.stage12.funnel_stages[2].target_value;
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('funnel stage(s) missing metric or target value'))).toBe(true);
      expect(result.required_next_actions).toContain('Ensure all funnel stages have a named metric and target value');
    });

    it('should fail when stage12 has fewer than 5 journey steps (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage12.customer_journey = prerequisites.stage12.customer_journey.slice(0, 4);
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers).toContain('Insufficient customer journey steps: 4 < 5 required');
      expect(result.required_next_actions).toContain('Add 1 more customer journey steps mapped to funnel stages');
    });

    it('should pass when stage12 has exactly 5 journey steps', () => {
      const prerequisites = createValidPrerequisites();
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(true);
    });

    it('should fail with multiple blockers when multiple prerequisites not met (TS-4)', () => {
      const prerequisites = createValidPrerequisites();
      prerequisites.stage10.candidates = [];
      prerequisites.stage11.tiers = [];
      prerequisites.stage11.channels = [];
      prerequisites.stage12.funnel_stages = [];
      prerequisites.stage12.customer_journey = [];
      const result = evaluateRealityGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.length).toBeGreaterThanOrEqual(5);
      expect(result.rationale).toContain('Phase 3 is incomplete');
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
    const createValidData = () => ({
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
    });

    it('should add reality_gate with pass=false when prerequisites not provided', () => {
      const data = createValidData();
      const result = stage12.computeDerived(data);
      expect(result.reality_gate).toBeDefined();
      expect(result.reality_gate.pass).toBe(false);
      expect(result.reality_gate.rationale).toContain('Prerequisites not provided');
      expect(result.reality_gate.blockers).toContain('Stage 10-11 data required');
      expect(result.reality_gate.required_next_actions).toContain('Complete stages 10-11 before evaluating reality gate');
    });

    it('should add reality_gate with evaluateRealityGate result when prerequisites provided', () => {
      const data = createValidData();
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
          tiers: [{ name: 'T1', description: 'D1' }, { name: 'T2', description: 'D2' }, { name: 'T3', description: 'D3' }],
          channels: [
            { name: 'C1' }, { name: 'C2' }, { name: 'C3' }, { name: 'C4' },
            { name: 'C5' }, { name: 'C6' }, { name: 'C7' }, { name: 'C8' },
          ],
        },
      };
      const result = stage12.computeDerived(data, prerequisites);
      expect(result.reality_gate.pass).toBe(true);
      expect(result.reality_gate.blockers).toEqual([]);
    });

    it('should preserve all original fields in output', () => {
      const data = createValidData();
      const result = stage12.computeDerived(data);
      expect(result.sales_model).toBe(data.sales_model);
      expect(result.sales_cycle_days).toBe(data.sales_cycle_days);
      expect(result.deal_stages).toEqual(data.deal_stages);
      expect(result.funnel_stages).toEqual(data.funnel_stages);
      expect(result.customer_journey).toEqual(data.customer_journey);
    });

    it('should not mutate original data', () => {
      const data = createValidData();
      const original = JSON.parse(JSON.stringify(data));
      stage12.computeDerived(data);
      expect(data).toEqual(original);
    });
  });

  describe('Integration: validate + computeDerived + evaluateRealityGate', () => {
    const createValidData = () => ({
      sales_model: 'enterprise',
      sales_cycle_days: 90,
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
    });

    const createValidPrerequisites = () => ({
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
        tiers: [{ name: 'T1', description: 'D1' }, { name: 'T2', description: 'D2' }, { name: 'T3', description: 'D3' }],
        channels: [
          { name: 'C1' }, { name: 'C2' }, { name: 'C3' }, { name: 'C4' },
          { name: 'C5' }, { name: 'C6' }, { name: 'C7' }, { name: 'C8' },
        ],
      },
    });

    it('should work together for passing reality gate', () => {
      const data = createValidData();
      const validation = stage12.validate(data);
      expect(validation.valid).toBe(true);

      const prerequisites = createValidPrerequisites();
      const computed = stage12.computeDerived(data, prerequisites);
      expect(computed.reality_gate.pass).toBe(true);
      expect(computed.reality_gate.blockers).toEqual([]);
    });

    it('should work together for failing reality gate', () => {
      const data = createValidData();
      const validation = stage12.validate(data);
      expect(validation.valid).toBe(true);

      const prerequisites = createValidPrerequisites();
      prerequisites.stage10.candidates = [];
      const computed = stage12.computeDerived(data, prerequisites);
      expect(computed.reality_gate.pass).toBe(false);
      expect(computed.reality_gate.blockers.length).toBeGreaterThan(0);
    });
  });
});
