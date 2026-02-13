/**
 * Tests for Mitigation Generator
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-002)
 */

import { describe, it, expect } from 'vitest';
import {
  generateForTrigger,
  generateForEscalation,
  MITIGATION_TEMPLATES,
  FALLBACK_MITIGATIONS,
} from '../../../lib/eva/mitigation-generator.js';

describe('MitigationGenerator', () => {
  describe('generateForTrigger', () => {
    it('should return mitigations for cost_threshold', () => {
      const result = generateForTrigger({ type: 'cost_threshold', severity: 'HIGH' });
      expect(result).toEqual(MITIGATION_TEMPLATES.cost_threshold);
      expect(result.length).toBe(3);
      for (const m of result) {
        expect(m.action).toBeTruthy();
        expect(m.effort).toMatch(/^(low|medium|high)$/);
        expect(m.impact).toBeTruthy();
        expect(m.rationale).toBeTruthy();
      }
    });

    it('should return mitigations for new_tech_vendor', () => {
      const result = generateForTrigger({ type: 'new_tech_vendor', severity: 'MEDIUM' });
      expect(result).toEqual(MITIGATION_TEMPLATES.new_tech_vendor);
      expect(result.length).toBe(3);
    });

    it('should return mitigations for strategic_pivot', () => {
      const result = generateForTrigger({ type: 'strategic_pivot', severity: 'HIGH' });
      expect(result).toEqual(MITIGATION_TEMPLATES.strategic_pivot);
      expect(result.length).toBe(3);
    });

    it('should return mitigations for low_score', () => {
      const result = generateForTrigger({ type: 'low_score', severity: 'MEDIUM' });
      expect(result).toEqual(MITIGATION_TEMPLATES.low_score);
      expect(result.length).toBe(2);
    });

    it('should return mitigations for novel_pattern', () => {
      const result = generateForTrigger({ type: 'novel_pattern', severity: 'MEDIUM' });
      expect(result).toEqual(MITIGATION_TEMPLATES.novel_pattern);
      expect(result.length).toBe(2);
    });

    it('should return mitigations for constraint_drift', () => {
      const result = generateForTrigger({ type: 'constraint_drift', severity: 'MEDIUM' });
      expect(result).toEqual(MITIGATION_TEMPLATES.constraint_drift);
      expect(result.length).toBe(2);
    });

    it('should return fallback for unknown trigger type', () => {
      const result = generateForTrigger({ type: 'unknown_type', severity: 'HIGH' });
      expect(result).toEqual(FALLBACK_MITIGATIONS);
    });

    it('should return fallback when trigger is null', () => {
      expect(generateForTrigger(null)).toEqual(FALLBACK_MITIGATIONS);
    });

    it('should return fallback when trigger has no type', () => {
      expect(generateForTrigger({})).toEqual(FALLBACK_MITIGATIONS);
    });
  });

  describe('generateForEscalation', () => {
    it('should group mitigations by trigger type', () => {
      const dfeResult = {
        triggers: [
          { type: 'cost_threshold', severity: 'HIGH', message: 'Over budget' },
          { type: 'low_score', severity: 'MEDIUM', message: 'Low quality' },
        ],
      };
      const result = generateForEscalation(dfeResult);
      expect(result.byTrigger.cost_threshold).toEqual(MITIGATION_TEMPLATES.cost_threshold);
      expect(result.byTrigger.low_score).toEqual(MITIGATION_TEMPLATES.low_score);
    });

    it('should deduplicate triggers of the same type', () => {
      const dfeResult = {
        triggers: [
          { type: 'cost_threshold', severity: 'HIGH', message: 'First' },
          { type: 'cost_threshold', severity: 'HIGH', message: 'Second' },
        ],
      };
      const result = generateForEscalation(dfeResult);
      expect(Object.keys(result.byTrigger)).toEqual(['cost_threshold']);
    });

    it('should return top 3 combined priority mitigations', () => {
      const dfeResult = {
        triggers: [
          { type: 'cost_threshold', severity: 'HIGH', message: 'Cost' },
          { type: 'low_score', severity: 'MEDIUM', message: 'Score' },
          { type: 'novel_pattern', severity: 'MEDIUM', message: 'Pattern' },
        ],
      };
      const result = generateForEscalation(dfeResult);
      expect(result.combinedPriority.length).toBeLessThanOrEqual(3);
      // HIGH severity should come first
      expect(result.combinedPriority[0].triggerSeverity).toBe('HIGH');
    });

    it('should sort by severity first, then by effort', () => {
      const dfeResult = {
        triggers: [
          { type: 'low_score', severity: 'MEDIUM', message: 'Score' },
          { type: 'cost_threshold', severity: 'HIGH', message: 'Cost' },
        ],
      };
      const result = generateForEscalation(dfeResult);
      // First should be HIGH severity
      expect(result.combinedPriority[0].triggerSeverity).toBe('HIGH');
    });

    it('should return empty for null dfeResult', () => {
      const result = generateForEscalation(null);
      expect(result.byTrigger).toEqual({});
      expect(result.combinedPriority).toEqual([]);
    });

    it('should return empty for missing triggers array', () => {
      const result = generateForEscalation({});
      expect(result.byTrigger).toEqual({});
      expect(result.combinedPriority).toEqual([]);
    });

    it('should handle single trigger', () => {
      const dfeResult = {
        triggers: [{ type: 'strategic_pivot', severity: 'HIGH', message: 'Pivot detected' }],
      };
      const result = generateForEscalation(dfeResult);
      expect(Object.keys(result.byTrigger)).toEqual(['strategic_pivot']);
      expect(result.combinedPriority.length).toBeLessThanOrEqual(3);
      expect(result.combinedPriority[0].triggerType).toBe('strategic_pivot');
    });
  });

  describe('MITIGATION_TEMPLATES', () => {
    it('should have templates for all 6 trigger types', () => {
      const types = ['cost_threshold', 'new_tech_vendor', 'strategic_pivot', 'low_score', 'novel_pattern', 'constraint_drift'];
      for (const type of types) {
        expect(MITIGATION_TEMPLATES[type]).toBeDefined();
        expect(MITIGATION_TEMPLATES[type].length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should have valid effort values in all templates', () => {
      for (const [, templates] of Object.entries(MITIGATION_TEMPLATES)) {
        for (const m of templates) {
          expect(['low', 'medium', 'high']).toContain(m.effort);
        }
      }
    });
  });

  describe('FALLBACK_MITIGATIONS', () => {
    it('should have at least one mitigation', () => {
      expect(FALLBACK_MITIGATIONS.length).toBeGreaterThanOrEqual(1);
    });

    it('should have valid structure', () => {
      for (const m of FALLBACK_MITIGATIONS) {
        expect(m.action).toBeTruthy();
        expect(m.effort).toBeTruthy();
        expect(m.impact).toBeTruthy();
        expect(m.rationale).toBeTruthy();
      }
    });
  });
});
