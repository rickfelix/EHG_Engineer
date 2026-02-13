/**
 * Unit tests for Stage 16 - Financial Projections template
 * Part of SD-LEO-FEAT-TMPL-BLUEPRINT-001
 *
 * Test Scenario: Stage 16 validation enforces financial data and
 * evaluates Phase 4 promotion gate based on stages 13-16 prerequisites.
 *
 * @module tests/unit/eva/stage-templates/stage-16.test
 */

import { describe, it, expect } from 'vitest';
import stage16, { evaluatePromotionGate, MIN_PROJECTION_MONTHS } from '../../../../lib/eva/stage-templates/stage-16.js';
import { MIN_MILESTONES } from '../../../../lib/eva/stage-templates/stage-13.js';
import { REQUIRED_LAYERS } from '../../../../lib/eva/stage-templates/stage-14.js';
import { MIN_TEAM_MEMBERS, MIN_ROLES } from '../../../../lib/eva/stage-templates/stage-15.js';

describe('stage-16.js - Financial Projections template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage16.id).toBe('stage-16');
      expect(stage16.slug).toBe('financial-projections');
      expect(stage16.title).toBe('Financial Projections');
      expect(stage16.version).toBe('2.0.0');
    });

    it('should have schema definition', () => {
      expect(stage16.schema).toBeDefined();
      expect(stage16.schema.initial_capital).toBeDefined();
      expect(stage16.schema.monthly_burn_rate).toBeDefined();
      expect(stage16.schema.revenue_projections).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage16.defaultData).toEqual({
        initial_capital: 0,
        monthly_burn_rate: 0,
        revenue_projections: [],
        funding_rounds: [],
        runway_months: 0,
        burn_rate: 0,
        break_even_month: null,
        total_projected_revenue: 0,
        total_projected_costs: 0,
        promotion_gate: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage16.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage16.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(MIN_PROJECTION_MONTHS).toBe(6);
    });
  });

  describe('validate() - Financial inputs', () => {
    const validRevenue = Array.from({ length: 6 }, (_, i) => ({
      month: i + 1,
      revenue: 1000 * (i + 1),
      costs: 500 * (i + 1),
    }));

    it('should pass for valid financial data', () => {
      const validData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(validData);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for missing initial_capital', () => {
      const invalidData = {
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initial_capital'))).toBe(true);
    });

    it('should fail for negative initial_capital', () => {
      const invalidData = {
        initial_capital: -10000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('initial_capital'))).toBe(true);
    });

    it('should fail for missing monthly_burn_rate', () => {
      const invalidData = {
        initial_capital: 100000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monthly_burn_rate'))).toBe(true);
    });

    it('should fail for negative monthly_burn_rate', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: -5000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('monthly_burn_rate'))).toBe(true);
    });
  });

  describe('validate() - Revenue projections', () => {
    it('should fail for fewer than 6 revenue projections', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections') && e.includes('at least 6'))).toBe(true);
    });

    it('should fail for revenue projection missing month', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { revenue: 1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections[0].month'))).toBe(true);
    });

    it('should fail for revenue projection with month < 1', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 0, revenue: 1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections[0].month'))).toBe(true);
    });

    it('should fail for revenue projection missing revenue', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections[0].revenue'))).toBe(true);
    });

    it('should fail for revenue projection missing costs', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 1000 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections[0].costs'))).toBe(true);
    });

    it('should fail for negative revenue or costs', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: -1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('revenue_projections[0].revenue'))).toBe(true);
    });
  });

  describe('validate() - Funding rounds (optional)', () => {
    const validRevenue = Array.from({ length: 6 }, (_, i) => ({
      month: i + 1,
      revenue: 1000 * (i + 1),
      costs: 500 * (i + 1),
    }));

    it('should pass when funding_rounds are omitted', () => {
      const validData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
      };
      const result = stage16.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when funding_rounds are empty array', () => {
      const validData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
        funding_rounds: [],
      };
      const result = stage16.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should pass when funding_rounds have valid items', () => {
      const validData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
        funding_rounds: [
          { round_name: 'Seed', target_amount: 500000, target_date: '2026-Q3' },
        ],
      };
      const result = stage16.validate(validData);
      expect(result.valid).toBe(true);
    });

    it('should fail for funding round missing round_name', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
        funding_rounds: [
          { target_amount: 500000, target_date: '2026-Q3' },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funding_rounds[0].round_name'))).toBe(true);
    });

    it('should fail for funding round missing target_amount', () => {
      const invalidData = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: validRevenue,
        funding_rounds: [
          { round_name: 'Seed', target_date: '2026-Q3' },
        ],
      };
      const result = stage16.validate(invalidData);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('funding_rounds[0].target_amount'))).toBe(true);
    });
  });

  describe('computeDerived() - Financial calculations', () => {
    it('should calculate runway_months correctly', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000,
          costs: 500,
        })),
      };
      const result = stage16.computeDerived(data);
      expect(result.runway_months).toBe(20);
    });

    it('should return Infinity runway for zero burn_rate with capital', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 0,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000,
          costs: 500,
        })),
      };
      const result = stage16.computeDerived(data);
      expect(result.runway_months).toBe(Infinity);
    });

    it('should return 0 runway for zero capital and zero burn', () => {
      const data = {
        initial_capital: 0,
        monthly_burn_rate: 0,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000,
          costs: 500,
        })),
      };
      const result = stage16.computeDerived(data);
      expect(result.runway_months).toBe(0);
    });

    it('should calculate total_projected_revenue correctly', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.computeDerived(data);
      expect(result.total_projected_revenue).toBe(21000);
    });

    it('should calculate total_projected_costs correctly', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 1000, costs: 500 },
          { month: 2, revenue: 2000, costs: 1000 },
          { month: 3, revenue: 3000, costs: 1500 },
          { month: 4, revenue: 4000, costs: 2000 },
          { month: 5, revenue: 5000, costs: 2500 },
          { month: 6, revenue: 6000, costs: 3000 },
        ],
      };
      const result = stage16.computeDerived(data);
      expect(result.total_projected_costs).toBe(10500);
    });

    it('should find break_even_month when cumulative profit >= 0', () => {
      const data = {
        initial_capital: 10000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 2000, costs: 1000 },
          { month: 2, revenue: 3000, costs: 1000 },
          { month: 3, revenue: 4000, costs: 1000 },
          { month: 4, revenue: 5000, costs: 1000 },
          { month: 5, revenue: 6000, costs: 1000 },
          { month: 6, revenue: 7000, costs: 1000 },
        ],
      };
      const result = stage16.computeDerived(data);
      expect(result.break_even_month).toBeGreaterThan(0);
    });

    it('should return null break_even_month when never breaks even', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [
          { month: 1, revenue: 100, costs: 500 },
          { month: 2, revenue: 200, costs: 600 },
          { month: 3, revenue: 300, costs: 700 },
          { month: 4, revenue: 400, costs: 800 },
          { month: 5, revenue: 500, costs: 900 },
          { month: 6, revenue: 600, costs: 1000 },
        ],
      };
      const result = stage16.computeDerived(data);
      expect(result.break_even_month).toBeNull();
    });
  });

  describe('evaluatePromotionGate() - Pure function', () => {
    const validPrerequisites = {
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

    it('should pass promotion gate for all valid prerequisites', () => {
      const result = evaluatePromotionGate(validPrerequisites);
      expect(result.pass).toBe(true);
      expect(result.blockers).toEqual([]);
      expect(result.required_next_actions).toEqual([]);
      expect(result.rationale).toContain('All Phase 4 prerequisites met');
    });

    it('should fail for insufficient milestones in stage 13', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage13: {
          milestones: [{ name: 'M1', deliverables: ['D1'] }],
          decision: 'pass',
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('milestone'))).toBe(true);
      expect(result.required_next_actions.length).toBeGreaterThan(0);
    });

    it('should fail for kill gate triggered in stage 13', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage13: {
          milestones: [
            { name: 'M1', deliverables: ['D1'] },
            { name: 'M2', deliverables: ['D2'] },
            { name: 'M3', deliverables: ['D3'] },
          ],
          decision: 'kill',
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('kill gate'))).toBe(true);
      expect(result.required_next_actions.some(a => a.includes('Resolve kill gate'))).toBe(true);
    });

    it('should fail for missing layer in stage 14', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage14: {
          layers: {
            frontend: { technology: 'React', components: ['UI'], rationale: 'Modern' },
            backend: { technology: 'Node', components: ['API'], rationale: 'Fast' },
          },
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('data'))).toBe(true);
      expect(result.blockers.some(b => b.includes('infra'))).toBe(true);
    });

    it('should fail for insufficient team members in stage 15', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage15: {
          team_members: [
            { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100 },
          ],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('team member'))).toBe(true);
    });

    it('should fail for insufficient unique roles in stage 15', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage15: {
          team_members: [
            { role: 'Engineer', skills: ['JavaScript'], allocation_pct: 100 },
            { role: 'Engineer', skills: ['Python'], allocation_pct: 100 },
          ],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('unique role'))).toBe(true);
    });

    it('should fail for zero initial_capital in stage 16', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage16: {
          initial_capital: 0,
          revenue_projections: Array.from({ length: 6 }, (_, i) => ({
            month: i + 1,
            revenue: 1000,
            costs: 500,
          })),
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('initial capital'))).toBe(true);
    });

    it('should fail for insufficient revenue projections in stage 16', () => {
      const prerequisites = {
        ...validPrerequisites,
        stage16: {
          initial_capital: 100000,
          revenue_projections: [
            { month: 1, revenue: 1000, costs: 500 },
            { month: 2, revenue: 2000, costs: 1000 },
          ],
        },
      };
      const result = evaluatePromotionGate(prerequisites);
      expect(result.pass).toBe(false);
      expect(result.blockers.some(b => b.includes('projection'))).toBe(true);
    });

    it('should collect multiple blockers', () => {
      const prerequisites = {
        stage13: { milestones: [], decision: 'kill' },
        stage14: { layers: {} },
        stage15: { team_members: [] },
        stage16: { initial_capital: 0, revenue_projections: [] },
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
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000,
          costs: 500,
        })),
      };
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
      };
      const result = stage16.computeDerived(data, prerequisites);
      expect(result.promotion_gate).toBeDefined();
      expect(result.promotion_gate.pass).toBe(true);
    });

    it('should return default promotion gate when prerequisites not provided', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000,
          costs: 500,
        })),
      };
      const result = stage16.computeDerived(data);
      expect(result.promotion_gate).toBeDefined();
      expect(result.promotion_gate.pass).toBe(false);
      expect(result.promotion_gate.rationale).toContain('Prerequisites not provided');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty revenue_projections array', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: [],
      };
      const validation = stage16.validate(data);
      expect(validation.valid).toBe(false);

      const derived = stage16.computeDerived(data);
      expect(derived.total_projected_revenue).toBe(0);
      expect(derived.total_projected_costs).toBe(0);
      expect(derived.break_even_month).toBeNull();
    });

    it('should handle null values', () => {
      const result = stage16.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined values', () => {
      const result = stage16.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = {
        initial_capital: 100000,
        monthly_burn_rate: 5000,
        revenue_projections: Array.from({ length: 6 }, (_, i) => ({
          month: i + 1,
          revenue: 1000 * (i + 1),
          costs: 500 * (i + 1),
        })),
      };
      const validation = stage16.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage16.computeDerived(data);
      expect(computed.runway_months).toBe(20);
      expect(computed.total_projected_revenue).toBeGreaterThan(0);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = {
        initial_capital: -1000,
        monthly_burn_rate: 5000,
        revenue_projections: [],
      };
      const computed = stage16.computeDerived(data);
      expect(computed.total_projected_revenue).toBe(0);
    });
  });
});
