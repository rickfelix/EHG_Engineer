/**
 * Tests for DFE Context Adapter
 * SD-EVA-FEAT-DFE-PRESENTATION-001 (US-001)
 */

import { describe, it, expect } from 'vitest';
import {
  transformForPresentation,
  TRIGGER_DISPLAY_MAP,
  SEVERITY_SCORE_RANGES,
  severityToNumericScore,
  extractSourceDetails,
  transformTrigger,
} from '../../../lib/eva/dfe-context-adapter.js';

describe('DFEContextAdapter', () => {
  describe('severityToNumericScore', () => {
    it('should return midpoint for HIGH', () => {
      expect(severityToNumericScore('HIGH')).toBe(90);
    });

    it('should return midpoint for MEDIUM', () => {
      expect(severityToNumericScore('MEDIUM')).toBe(60);
    });

    it('should return midpoint for LOW', () => {
      expect(severityToNumericScore('LOW')).toBe(25);
    });

    it('should return midpoint for INFO', () => {
      expect(severityToNumericScore('INFO')).toBe(5);
    });

    it('should return 50 for unknown severity', () => {
      expect(severityToNumericScore('UNKNOWN')).toBe(50);
      expect(severityToNumericScore(undefined)).toBe(50);
    });
  });

  describe('extractSourceDetails - cost_threshold', () => {
    it('should extract cost details with overage percent', () => {
      const trigger = {
        type: 'cost_threshold',
        details: { cost: 15000, threshold: 10000, thresholdSource: 'chairman_preferences' },
      };
      const result = extractSourceDetails(trigger);
      expect(result.threshold).toBe(10000);
      expect(result.actual).toBe(15000);
      expect(result.overagePercent).toBe(50);
      expect(result.thresholdSource).toBe('chairman_preferences');
    });

    it('should handle zero threshold', () => {
      const trigger = {
        type: 'cost_threshold',
        details: { cost: 5000, threshold: 0, thresholdSource: 'default' },
      };
      const result = extractSourceDetails(trigger);
      expect(result.overagePercent).toBeNull();
    });
  });

  describe('extractSourceDetails - new_tech_vendor', () => {
    it('should extract new items and approved list', () => {
      const trigger = {
        type: 'new_tech_vendor',
        details: { newItems: ['Vue.js'], approvedList: ['React', 'Angular'], thresholdSource: 'preferences' },
      };
      const result = extractSourceDetails(trigger);
      expect(result.newItems).toEqual(['Vue.js']);
      expect(result.approvedList).toEqual(['React', 'Angular']);
    });

    it('should default to empty arrays', () => {
      const trigger = { type: 'new_tech_vendor', details: {} };
      const result = extractSourceDetails(trigger);
      expect(result.newItems).toEqual([]);
      expect(result.approvedList).toEqual([]);
    });
  });

  describe('extractSourceDetails - strategic_pivot', () => {
    it('should extract matched keywords', () => {
      const trigger = {
        type: 'strategic_pivot',
        details: { matchedKeywords: ['pivot', 'rebrand'], thresholdSource: 'default' },
      };
      const result = extractSourceDetails(trigger);
      expect(result.matchedKeywords).toEqual(['pivot', 'rebrand']);
    });
  });

  describe('extractSourceDetails - low_score', () => {
    it('should calculate deficit', () => {
      const trigger = {
        type: 'low_score',
        details: { score: 3, threshold: 7, thresholdSource: 'preferences' },
      };
      const result = extractSourceDetails(trigger);
      expect(result.score).toBe(3);
      expect(result.threshold).toBe(7);
      expect(result.deficit).toBe(4);
    });

    it('should handle null score', () => {
      const trigger = {
        type: 'low_score',
        details: { score: null, threshold: 7 },
      };
      const result = extractSourceDetails(trigger);
      expect(result.deficit).toBeNull();
    });
  });

  describe('extractSourceDetails - novel_pattern', () => {
    it('should extract novel patterns and prior count', () => {
      const trigger = {
        type: 'novel_pattern',
        details: { novelPatterns: ['unusual_distribution'], priorCount: 5 },
      };
      const result = extractSourceDetails(trigger);
      expect(result.novelPatterns).toEqual(['unusual_distribution']);
      expect(result.priorPatternCount).toBe(5);
    });
  });

  describe('extractSourceDetails - constraint_drift', () => {
    it('should extract drift details', () => {
      const trigger = {
        type: 'constraint_drift',
        details: {
          drifts: [{ key: 'maxBudget', current: 20000, approved: 15000 }],
        },
      };
      const result = extractSourceDetails(trigger);
      expect(result.drifts).toEqual([{ parameter: 'maxBudget', current: 20000, approved: 15000 }]);
    });

    it('should handle missing preference key', () => {
      const trigger = {
        type: 'constraint_drift',
        details: { missingKey: 'approved_vendors', defaultValue: [] },
      };
      const result = extractSourceDetails(trigger);
      expect(result.missingPreference).toBe('approved_vendors');
      expect(result.defaultUsed).toEqual([]);
    });
  });

  describe('extractSourceDetails - unknown type', () => {
    it('should spread details for unknown type', () => {
      const trigger = { type: 'unknown_type', details: { foo: 'bar' } };
      const result = extractSourceDetails(trigger);
      expect(result.foo).toBe('bar');
    });

    it('should return empty object when details is null', () => {
      const trigger = { type: 'cost_threshold', details: null };
      const result = extractSourceDetails(trigger);
      expect(result).toEqual({});
    });
  });

  describe('transformTrigger', () => {
    it('should transform a known trigger type', () => {
      const trigger = {
        type: 'cost_threshold',
        severity: 'HIGH',
        message: 'Cost exceeded threshold',
        details: { cost: 15000, threshold: 10000, thresholdSource: 'prefs' },
      };
      const result = transformTrigger(trigger);
      expect(result.triggerType).toBe('cost_threshold');
      expect(result.displayLabel).toBe('Cost Threshold Exceeded');
      expect(result.category).toBe('financial');
      expect(result.severityBand).toBe('HIGH');
      expect(result.numericScore).toBe(90);
      expect(result.message).toBe('Cost exceeded threshold');
      expect(result.sourceDetails.actual).toBe(15000);
    });

    it('should handle unknown trigger type with fallback label', () => {
      const trigger = { type: 'custom_check', severity: 'LOW', message: 'Custom', details: {} };
      const result = transformTrigger(trigger);
      expect(result.displayLabel).toBe('Custom Check');
      expect(result.category).toBe('unknown');
    });
  });

  describe('transformForPresentation', () => {
    it('should return empty structure for null dfeResult', () => {
      const result = transformForPresentation(null);
      expect(result.triggers).toEqual([]);
      expect(result.recommendation).toBe('AUTO_PROCEED');
      expect(result.triggerCount).toBe(0);
      expect(result.maxSeverityScore).toBe(0);
    });

    it('should transform a full DFE result', () => {
      const dfeResult = {
        auto_proceed: false,
        recommendation: 'PRESENT_TO_CHAIRMAN',
        triggers: [
          { type: 'cost_threshold', severity: 'HIGH', message: 'Over budget', details: { cost: 20000, threshold: 10000, thresholdSource: 'prefs' } },
          { type: 'low_score', severity: 'MEDIUM', message: 'Low quality', details: { score: 3, threshold: 7, thresholdSource: 'prefs' } },
        ],
      };
      const ventureContext = { ventureId: 'v-123', ventureName: 'Test Venture', stageNumber: 3 };

      const result = transformForPresentation(dfeResult, ventureContext);
      expect(result.triggerCount).toBe(2);
      expect(result.maxSeverityScore).toBe(90);
      expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
      expect(result.ventureContext.ventureId).toBe('v-123');
      expect(result.ventureContext.ventureName).toBe('Test Venture');
      expect(result.ventureContext.stageNumber).toBe(3);
      expect(result.triggers[0].displayLabel).toBe('Cost Threshold Exceeded');
      expect(result.triggers[1].displayLabel).toBe('Quality Score Below Threshold');
    });

    it('should handle empty triggers array', () => {
      const result = transformForPresentation({ auto_proceed: true, recommendation: 'AUTO_PROCEED', triggers: [] });
      expect(result.triggerCount).toBe(0);
      expect(result.maxSeverityScore).toBe(0);
    });

    it('should default ventureContext fields to null', () => {
      const result = transformForPresentation({ auto_proceed: true, recommendation: 'AUTO_PROCEED', triggers: [] });
      expect(result.ventureContext.ventureId).toBeNull();
      expect(result.ventureContext.ventureName).toBeNull();
      expect(result.ventureContext.stageNumber).toBeNull();
    });
  });

  describe('TRIGGER_DISPLAY_MAP', () => {
    it('should have entries for all 6 trigger types', () => {
      const expected = ['cost_threshold', 'new_tech_vendor', 'strategic_pivot', 'low_score', 'novel_pattern', 'constraint_drift'];
      for (const type of expected) {
        expect(TRIGGER_DISPLAY_MAP[type]).toBeDefined();
        expect(TRIGGER_DISPLAY_MAP[type].displayLabel).toBeTruthy();
        expect(TRIGGER_DISPLAY_MAP[type].category).toBeTruthy();
      }
    });
  });

  describe('SEVERITY_SCORE_RANGES', () => {
    it('should have non-overlapping ranges', () => {
      expect(SEVERITY_SCORE_RANGES.HIGH.min).toBeGreaterThan(SEVERITY_SCORE_RANGES.MEDIUM.max);
      expect(SEVERITY_SCORE_RANGES.MEDIUM.min).toBeGreaterThan(SEVERITY_SCORE_RANGES.LOW.max);
      expect(SEVERITY_SCORE_RANGES.LOW.min).toBeGreaterThan(SEVERITY_SCORE_RANGES.INFO.max);
    });
  });
});
