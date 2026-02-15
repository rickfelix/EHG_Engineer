/**
 * Unit tests for Stage 15 - Risk Register template
 * Part of SD-EVA-FIX-STAGE15-RISK-001
 *
 * Test Scenario: Stage 15 validation enforces minimum risks,
 * severity/priority enums, and required fields.
 *
 * @module tests/unit/eva/stage-templates/stage-15.test
 */

import { describe, it, expect } from 'vitest';
import stage15, { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM } from '../../../../lib/eva/stage-templates/stage-15.js';

describe('stage-15.js - Risk Register template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage15.id).toBe('stage-15');
      expect(stage15.slug).toBe('risk-register');
      expect(stage15.title).toBe('Resource Planning');
      expect(stage15.version).toBe('3.0.0');
    });

    it('should have schema definition', () => {
      expect(stage15.schema).toBeDefined();
      expect(stage15.schema.risks).toBeDefined();
      expect(stage15.schema.total_risks).toBeDefined();
      expect(stage15.schema.severity_breakdown).toBeDefined();
      expect(stage15.schema.budget_coherence).toBeDefined();
    });

    it('should have defaultData', () => {
      expect(stage15.defaultData).toEqual({
        risks: [],
        total_risks: 0,
        severity_breakdown: { critical: 0, high: 0, medium: 0, low: 0 },
        budget_coherence: { aligned: false, notes: '' },
      });
    });

    it('should have validate function', () => {
      expect(typeof stage15.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage15.computeDerived).toBe('function');
    });

    it('should export constants', () => {
      expect(MIN_RISKS).toBe(1);
      expect(SEVERITY_ENUM).toEqual(['critical', 'high', 'medium', 'low']);
      expect(PRIORITY_ENUM).toEqual(['immediate', 'short_term', 'long_term']);
    });
  });

  const validRisk = {
    title: 'Market adoption risk',
    description: 'Target market may not adopt the product within expected timeframe',
    owner: 'Product Manager',
    severity: 'high',
    priority: 'immediate',
    phaseRef: 'Phase 1 - MVP Launch',
    mitigationPlan: 'Conduct user interviews and iterate on feedback',
    contingencyPlan: 'Pivot to adjacent market segment',
  };

  const minValidRisk = {
    title: 'Technical risk',
    description: 'Integration complexity',
    owner: 'Tech Lead',
    severity: 'medium',
    priority: 'short_term',
    mitigationPlan: 'Prototype early',
  };

  describe('validate() - Risks array', () => {
    it('should pass for valid risks (>= 1 risk)', () => {
      const result = stage15.validate({ risks: [validRisk] });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should pass for multiple valid risks', () => {
      const result = stage15.validate({ risks: [validRisk, minValidRisk] });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for empty risks array', () => {
      const result = stage15.validate({ risks: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks') && e.includes('at least 1'))).toBe(true);
    });

    it('should fail for missing risks', () => {
      const result = stage15.validate({});
      expect(result.valid).toBe(false);
    });

    it('should fail for risk missing title', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, title: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].title'))).toBe(true);
    });

    it('should fail for risk missing description', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, description: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].description'))).toBe(true);
    });

    it('should fail for risk missing owner', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, owner: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].owner'))).toBe(true);
    });

    it('should fail for risk missing mitigationPlan', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, mitigationPlan: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].mitigationPlan'))).toBe(true);
    });

    it('should fail for risk missing severity', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, severity: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].severity'))).toBe(true);
    });

    it('should fail for risk missing priority', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, priority: undefined }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].priority'))).toBe(true);
    });

    it('should fail for invalid severity enum', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, severity: 'extreme' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].severity') && e.includes('extreme'))).toBe(true);
    });

    it('should fail for invalid priority enum', () => {
      const result = stage15.validate({
        risks: [{ ...validRisk, priority: 'urgent' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('risks[0].priority') && e.includes('urgent'))).toBe(true);
    });

    it('should pass without optional phaseRef and contingencyPlan', () => {
      const result = stage15.validate({ risks: [minValidRisk] });
      expect(result.valid).toBe(true);
    });

    it('should report multiple errors for a single risk', () => {
      const result = stage15.validate({
        risks: [{ severity: 'invalid', priority: 'invalid' }],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('computeDerived() - Risk statistics', () => {
    it('should calculate total_risks correctly', () => {
      const result = stage15.computeDerived({ risks: [validRisk, minValidRisk] });
      expect(result.total_risks).toBe(2);
    });

    it('should calculate severity_breakdown correctly', () => {
      const risks = [
        { ...validRisk, severity: 'critical' },
        { ...validRisk, severity: 'high' },
        { ...validRisk, severity: 'high' },
        { ...validRisk, severity: 'low' },
      ];
      const result = stage15.computeDerived({ risks });
      expect(result.severity_breakdown).toEqual({
        critical: 1,
        high: 2,
        medium: 0,
        low: 1,
      });
    });

    it('should return zeroed severity_breakdown for empty risks', () => {
      const result = stage15.computeDerived({ risks: [] });
      expect(result.severity_breakdown).toEqual({
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      });
    });

    it('should set budget_coherence.aligned to true when risks exist', () => {
      const result = stage15.computeDerived({ risks: [validRisk] });
      expect(result.budget_coherence.aligned).toBe(true);
    });

    it('should set budget_coherence.aligned to false when no risks', () => {
      const result = stage15.computeDerived({ risks: [] });
      expect(result.budget_coherence.aligned).toBe(false);
    });

    it('should include notes in budget_coherence', () => {
      const result = stage15.computeDerived({ risks: [validRisk, minValidRisk] });
      expect(result.budget_coherence.notes).toContain('2 risk(s)');
    });

    it('should return 0 total_risks for empty array', () => {
      const result = stage15.computeDerived({ risks: [] });
      expect(result.total_risks).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle null data', () => {
      const result = stage15.validate(null);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data', () => {
      const result = stage15.validate(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty object', () => {
      const result = stage15.validate({});
      expect(result.valid).toBe(false);
    });

    it('should handle computeDerived with missing risks gracefully', () => {
      const result = stage15.computeDerived({});
      expect(result.total_risks).toBe(0);
      expect(result.severity_breakdown).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    it('should work together for valid data', () => {
      const data = { risks: [validRisk, minValidRisk] };
      const validation = stage15.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage15.computeDerived(data);
      expect(computed.total_risks).toBe(2);
      expect(computed.severity_breakdown.high).toBe(1);
      expect(computed.severity_breakdown.medium).toBe(1);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = { risks: [{ severity: 'critical' }] };
      const computed = stage15.computeDerived(data);
      expect(computed.total_risks).toBe(1);
      expect(computed.severity_breakdown.critical).toBe(1);
    });
  });

  describe('computeDerived() - Stage 16 cross-validation', () => {
    it('should set financialDataAvailable: true when stage16Data has positive burn rate', () => {
      const data = { risks: [validRisk] };
      const stage16Data = {
        initial_capital: 100000,
        monthly_burn_rate: 10000,
        revenue_projections: [1, 2, 3, 4, 5, 6],
      };
      const result = stage15.computeDerived(data, stage16Data);
      expect(result.budget_coherence.financialDataAvailable).toBe(true);
    });

    it('should set aligned: true when runway >= 6 months and no critical/high risks', () => {
      const lowRisk = { ...validRisk, severity: 'low' };
      const data = { risks: [lowRisk, { ...lowRisk, title: 'Another low risk' }] };
      const stage16Data = {
        initial_capital: 60000,
        monthly_burn_rate: 10000,
        revenue_projections: [1, 2, 3, 4, 5, 6],
      };
      const result = stage15.computeDerived(data, stage16Data);
      expect(result.budget_coherence.aligned).toBe(true);
      expect(result.budget_coherence.runwayMonths).toBe(6);
    });

    it('should set aligned: false when runway < 6 months and critical risks present', () => {
      const criticalRisk = { ...validRisk, severity: 'critical' };
      const data = { risks: [criticalRisk] };
      const stage16Data = {
        initial_capital: 30000,
        monthly_burn_rate: 10000,
        revenue_projections: [1, 2, 3, 4, 5, 6],
      };
      const result = stage15.computeDerived(data, stage16Data);
      expect(result.budget_coherence.aligned).toBe(false);
      expect(result.budget_coherence.runwayMonths).toBe(3);
      expect(result.budget_coherence.criticalRiskCount).toBeGreaterThan(0);
    });

    it('should set aligned: false when financial coverage is incomplete (initial_capital=0)', () => {
      const lowRisk = { ...validRisk, severity: 'low' };
      const data = { risks: [lowRisk] };
      const stage16Data = {
        initial_capital: 0,
        monthly_burn_rate: 10000,
        revenue_projections: [1, 2, 3, 4, 5, 6],
      };
      const result = stage15.computeDerived(data, stage16Data);
      expect(result.budget_coherence.aligned).toBe(false);
      expect(result.budget_coherence.financialDataAvailable).toBe(true);
    });

    it('should fall back to risk-count-only alignment without stage16Data', () => {
      const data = { risks: [validRisk] };
      const result = stage15.computeDerived(data);
      expect(result.budget_coherence.financialDataAvailable).toBe(false);
      expect(result.budget_coherence.aligned).toBe(true); // true because risks.length > 0
      expect(result.budget_coherence.notes).toContain('Stage 16 data not available');
    });
  });
});
