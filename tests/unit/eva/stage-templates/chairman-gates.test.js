/**
 * Unit tests for Chairman Governance Gates (SD-EVA-FIX-CHAIRMAN-GATES-001)
 *
 * Tests that stages 10, 22, and 25 have blocking chairman decision gates
 * that use createOrReusePendingDecision/waitForDecision pattern.
 *
 * @module tests/unit/eva/stage-templates/chairman-gates.test
 */

import { describe, it, expect, vi } from 'vitest';
import stage10 from '../../../../lib/eva/stage-templates/stage-10.js';
import stage22 from '../../../../lib/eva/stage-templates/stage-22.js';
import stage25 from '../../../../lib/eva/stage-templates/stage-25.js';

// Helper: valid stage 10 data with approved chairman gate
function validStage10Data(gateOverride = {}) {
  return {
    brandGenome: {
      archetype: 'Explorer',
      values: ['innovation'],
      tone: 'bold',
      audience: 'startups',
      differentiators: ['speed'],
    },
    scoringCriteria: [
      { name: 'memorability', weight: 50 },
      { name: 'relevance', weight: 50 },
    ],
    candidates: Array.from({ length: 5 }, (_, i) => ({
      name: `Brand${i + 1}`,
      rationale: `Rationale for Brand${i + 1}`,
      scores: { memorability: 80, relevance: 70 },
    })),
    chairmanGate: { status: 'approved', rationale: 'Brand direction approved', decision_id: 'dec-1' },
    ...gateOverride,
  };
}

// Helper: valid stage 22 data with approved chairman gate
function validStage22Data(gateOverride = {}) {
  return {
    release_items: [
      { name: 'Feature A', category: 'core', status: 'approved', approver: 'QA' },
    ],
    release_notes: 'Release notes for version 1.0 with improvements and fixes.',
    target_date: '2026-03-01',
    chairmanGate: { status: 'approved', rationale: 'Release approved', decision_id: 'dec-2' },
    ...gateOverride,
  };
}

// Helper: valid stage 25 data with approved chairman gate
function validStage25Data(gateOverride = {}) {
  return {
    review_summary: 'Comprehensive venture review covering all categories and outcomes.',
    initiatives: {
      product: [{ title: 'MVP', status: 'complete', outcome: 'Shipped' }],
      market: [{ title: 'Launch', status: 'complete', outcome: 'Validated' }],
      technical: [{ title: 'Platform', status: 'complete', outcome: 'Stable' }],
      financial: [{ title: 'Revenue', status: 'on-track', outcome: 'Growing' }],
      team: [{ title: 'Hiring', status: 'complete', outcome: 'Full team' }],
    },
    current_vision: 'Building the next generation platform for startups',
    next_steps: [{ action: 'Scale', owner: 'CEO', timeline: 'Q2' }],
    chairmanGate: { status: 'approved', rationale: 'Venture review approved', decision_id: 'dec-3' },
    ...gateOverride,
  };
}

describe('Chairman Governance Gates', () => {
  describe('Stage 10 - Brand Approval Gate', () => {
    it('should have chairmanGate in defaultData', () => {
      expect(stage10.defaultData.chairmanGate).toEqual({
        status: 'pending',
        rationale: null,
        decision_id: null,
      });
    });

    it('should have chairmanGate in schema', () => {
      expect(stage10.schema.chairmanGate).toBeDefined();
      expect(stage10.schema.chairmanGate.type).toBe('object');
    });

    it('should pass validation when chairman gate is approved', () => {
      const result = stage10.validate(validStage10Data());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when chairman gate is pending', () => {
      const data = validStage10Data({ chairmanGate: { status: 'pending', rationale: null, decision_id: null } });
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chairman brand approval gate is pending — awaiting chairman decision');
    });

    it('should fail validation when chairman gate is rejected', () => {
      const data = validStage10Data({ chairmanGate: { status: 'rejected', rationale: 'Brand not ready', decision_id: 'dec-x' } });
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman gate rejected'))).toBe(true);
      expect(result.errors.some(e => e.includes('Brand not ready'))).toBe(true);
    });

    it('should fail validation when chairmanGate is missing', () => {
      const data = validStage10Data({ chairmanGate: undefined });
      const result = stage10.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pending'))).toBe(true);
    });

    it('should have onBeforeAnalysis hook', () => {
      expect(typeof stage10.onBeforeAnalysis).toBe('function');
    });
  });

  describe('Stage 22 - Release Readiness Gate', () => {
    it('should have chairmanGate in defaultData', () => {
      expect(stage22.defaultData.chairmanGate).toEqual({
        status: 'pending',
        rationale: null,
        decision_id: null,
      });
    });

    it('should have chairmanGate in schema', () => {
      expect(stage22.schema.chairmanGate).toBeDefined();
      expect(stage22.schema.chairmanGate.type).toBe('object');
    });

    it('should pass validation when chairman gate is approved', () => {
      const result = stage22.validate(validStage22Data());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when chairman gate is pending', () => {
      const data = validStage22Data({ chairmanGate: { status: 'pending', rationale: null, decision_id: null } });
      const result = stage22.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chairman release readiness gate is pending — awaiting chairman decision');
    });

    it('should fail validation when chairman gate is rejected', () => {
      const data = validStage22Data({ chairmanGate: { status: 'rejected', rationale: 'Not ready for release', decision_id: 'dec-y' } });
      const result = stage22.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman gate rejected'))).toBe(true);
    });

    it('should have onBeforeAnalysis hook', () => {
      expect(typeof stage22.onBeforeAnalysis).toBe('function');
    });
  });

  describe('Stage 25 - Venture Review Gate', () => {
    it('should have chairmanGate in defaultData', () => {
      expect(stage25.defaultData.chairmanGate).toEqual({
        status: 'pending',
        rationale: null,
        decision_id: null,
      });
    });

    it('should have chairmanGate in schema', () => {
      expect(stage25.schema.chairmanGate).toBeDefined();
      expect(stage25.schema.chairmanGate.type).toBe('object');
    });

    it('should pass validation when chairman gate is approved', () => {
      const result = stage25.validate(validStage25Data());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when chairman gate is pending', () => {
      const data = validStage25Data({ chairmanGate: { status: 'pending', rationale: null, decision_id: null } });
      const result = stage25.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Chairman venture review gate is pending — awaiting chairman decision');
    });

    it('should fail validation when chairman gate is rejected', () => {
      const data = validStage25Data({ chairmanGate: { status: 'rejected', rationale: 'Venture not viable', decision_id: 'dec-z' } });
      const result = stage25.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Chairman gate rejected'))).toBe(true);
      expect(result.errors.some(e => e.includes('Venture not viable'))).toBe(true);
    });

    it('should have onBeforeAnalysis hook', () => {
      expect(typeof stage25.onBeforeAnalysis).toBe('function');
    });
  });

  describe('Cross-stage consistency', () => {
    it('all three stages should have identical chairmanGate schema structure', () => {
      const schemas = [stage10.schema.chairmanGate, stage22.schema.chairmanGate, stage25.schema.chairmanGate];
      for (const schema of schemas) {
        expect(schema.type).toBe('object');
        expect(schema.fields.status.type).toBe('string');
        expect(schema.fields.rationale.type).toBe('string');
        expect(schema.fields.decision_id.type).toBe('string');
      }
    });

    it('all three stages should have identical chairmanGate default values', () => {
      const defaults = [stage10.defaultData.chairmanGate, stage22.defaultData.chairmanGate, stage25.defaultData.chairmanGate];
      for (const def of defaults) {
        expect(def).toEqual({ status: 'pending', rationale: null, decision_id: null });
      }
    });
  });
});
