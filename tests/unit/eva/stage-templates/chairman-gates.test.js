import { describe, it, expect } from 'vitest';
import stage10 from '../../../../lib/eva/stage-templates/stage-10.js';

function persona(n) {
  return {
    name: `Persona ${n}`,
    demographics: { age: '25-35', location: 'US' },
    goals: [`Goal ${n}`],
    painPoints: [`Pain ${n}`],
  };
}

function validStage10Data(gateOverride = {}) {
  return {
    customerPersonas: [persona(1), persona(2), persona(3)],
    brandGenome: {
      archetype: 'Explorer',
      values: ['innovation'],
      tone: 'bold',
      audience: 'startups',
      differentiators: ['speed'],
      customerAlignment: [{ trait: 'bold', personaInsight: 'wants speed', personaName: 'Persona 1' }],
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
});
