/**
 * Tests for Decision Filter Engine
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-B
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateDecision,
  ENGINE_VERSION,
  TRIGGER_TYPES,
  PREFERENCE_KEYS,
  DEFAULTS,
} from '../../../lib/eva/decision-filter-engine.js';

describe('DecisionFilterEngine', () => {
  describe('evaluateDecision - no triggers', () => {
    it('should auto-proceed when input is empty', () => {
      const result = evaluateDecision({});
      expect(result.auto_proceed).toBe(true);
      expect(result.recommendation).toBe('AUTO_PROCEED');
      expect(result.triggers).toEqual([]);
    });

    it('should auto-proceed when all values are within thresholds', () => {
      const result = evaluateDecision(
        { cost: 5000, score: 8, technologies: ['React'], vendors: ['AWS'] },
        { preferences: {
          [PREFERENCE_KEYS.cost_threshold]: 10000,
          [PREFERENCE_KEYS.low_score]: 7,
          [PREFERENCE_KEYS.approved_tech]: ['react'],
          [PREFERENCE_KEYS.approved_vendors]: ['aws'],
        }},
      );
      expect(result.auto_proceed).toBe(true);
      expect(result.recommendation).toBe('AUTO_PROCEED');
    });
  });

  describe('cost_threshold trigger', () => {
    it('should trigger when cost exceeds threshold', () => {
      const result = evaluateDecision(
        { cost: 15000 },
        { preferences: { [PREFERENCE_KEYS.cost_threshold]: 10000 } },
      );
      expect(result.auto_proceed).toBe(false);
      const costTrigger = result.triggers.find(t => t.type === 'cost_threshold');
      expect(costTrigger).toBeDefined();
      expect(costTrigger.severity).toBe('HIGH');
    });

    it('should not trigger when cost is below threshold', () => {
      const result = evaluateDecision(
        { cost: 5000 },
        { preferences: { [PREFERENCE_KEYS.cost_threshold]: 10000 } },
      );
      const costTrigger = result.triggers.find(t => t.type === 'cost_threshold');
      expect(costTrigger).toBeUndefined();
    });

    it('should use default threshold when preference is missing', () => {
      const result = evaluateDecision({ cost: 15000 }, { preferences: {} });
      const costTrigger = result.triggers.find(t => t.type === 'cost_threshold');
      expect(costTrigger).toBeDefined();
      expect(costTrigger.details.threshold).toBe(DEFAULTS['filter.cost_max_usd']);
    });
  });

  describe('new_tech_vendor trigger', () => {
    it('should trigger for unapproved technology', () => {
      const result = evaluateDecision(
        { technologies: ['Vue', 'React'] },
        { preferences: { [PREFERENCE_KEYS.approved_tech]: ['React'] } },
      );
      const techTrigger = result.triggers.find(t => t.type === 'new_tech_vendor' && t.message.includes('technology'));
      expect(techTrigger).toBeDefined();
      expect(techTrigger.details.newItems).toContain('Vue');
    });

    it('should trigger for unapproved vendor', () => {
      const result = evaluateDecision(
        { vendors: ['GCP'] },
        { preferences: { [PREFERENCE_KEYS.approved_vendors]: ['AWS'] } },
      );
      const vendorTrigger = result.triggers.find(t => t.type === 'new_tech_vendor' && t.message.includes('vendor'));
      expect(vendorTrigger).toBeDefined();
    });

    it('should be case-insensitive', () => {
      const result = evaluateDecision(
        { technologies: ['react'] },
        { preferences: { [PREFERENCE_KEYS.approved_tech]: ['React'] } },
      );
      const techTrigger = result.triggers.find(t => t.type === 'new_tech_vendor');
      expect(techTrigger).toBeUndefined();
    });
  });

  describe('strategic_pivot trigger', () => {
    it('should trigger when description contains pivot keywords', () => {
      const result = evaluateDecision(
        { description: 'We should pivot to B2B market' },
        { preferences: { [PREFERENCE_KEYS.pivot_keywords]: ['pivot', 'rebrand'] } },
      );
      const pivotTrigger = result.triggers.find(t => t.type === 'strategic_pivot');
      expect(pivotTrigger).toBeDefined();
      expect(pivotTrigger.severity).toBe('HIGH');
    });

    it('should not trigger without matching keywords', () => {
      const result = evaluateDecision(
        { description: 'Continue building the product' },
        { preferences: { [PREFERENCE_KEYS.pivot_keywords]: ['pivot'] } },
      );
      const pivotTrigger = result.triggers.find(t => t.type === 'strategic_pivot');
      expect(pivotTrigger).toBeUndefined();
    });
  });

  describe('low_score trigger', () => {
    it('should trigger when score is below threshold', () => {
      const result = evaluateDecision(
        { score: 3 },
        { preferences: { [PREFERENCE_KEYS.low_score]: 7 } },
      );
      const scoreTrigger = result.triggers.find(t => t.type === 'low_score');
      expect(scoreTrigger).toBeDefined();
      expect(scoreTrigger.severity).toBe('MEDIUM');
    });

    it('should not trigger when score meets threshold', () => {
      const result = evaluateDecision(
        { score: 8 },
        { preferences: { [PREFERENCE_KEYS.low_score]: 7 } },
      );
      const scoreTrigger = result.triggers.find(t => t.type === 'low_score');
      expect(scoreTrigger).toBeUndefined();
    });
  });

  describe('novel_pattern trigger', () => {
    it('should trigger for patterns not in prior set', () => {
      const result = evaluateDecision({
        patterns: ['microservices', 'event-sourcing'],
        priorPatterns: ['microservices'],
      });
      const novelTrigger = result.triggers.find(t => t.type === 'novel_pattern');
      expect(novelTrigger).toBeDefined();
      expect(novelTrigger.details.novelPatterns).toContain('event-sourcing');
    });
  });

  describe('constraint_drift trigger', () => {
    it('should trigger when constraints drift from approved', () => {
      const result = evaluateDecision({
        constraints: { budget: 50000, team_size: 5 },
        approvedConstraints: { budget: 30000, team_size: 3 },
      });
      const driftTrigger = result.triggers.find(
        t => t.type === 'constraint_drift' && t.details.drifts,
      );
      expect(driftTrigger).toBeDefined();
      expect(driftTrigger.details.drifts.length).toBe(2);
    });
  });

  describe('recommendation mapping', () => {
    it('should recommend PRESENT_TO_CHAIRMAN for HIGH triggers', () => {
      const result = evaluateDecision(
        { cost: 99999 },
        { preferences: { [PREFERENCE_KEYS.cost_threshold]: 100 } },
      );
      expect(result.auto_proceed).toBe(false);
      expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
    });

    it('should recommend PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS for MEDIUM triggers', () => {
      const result = evaluateDecision(
        { score: 3 },
        { preferences: { [PREFERENCE_KEYS.low_score]: 7 } },
      );
      expect(result.auto_proceed).toBe(false);
      expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS');
    });
  });

  describe('trigger ordering', () => {
    it('should return triggers in fixed TRIGGER_TYPES order', () => {
      const result = evaluateDecision(
        {
          cost: 99999,
          score: 1,
          technologies: ['Unknown'],
          description: 'We must pivot now',
          patterns: ['new-thing'],
          priorPatterns: [],
          constraints: { x: 2 },
          approvedConstraints: { x: 1 },
        },
        { preferences: {
          [PREFERENCE_KEYS.cost_threshold]: 100,
          [PREFERENCE_KEYS.low_score]: 7,
          [PREFERENCE_KEYS.approved_tech]: [],
          [PREFERENCE_KEYS.pivot_keywords]: ['pivot'],
        }},
      );

      const triggerOrder = result.triggers.map(t => t.type);
      const typeIndices = triggerOrder.map(t => TRIGGER_TYPES.indexOf(t));
      for (let i = 1; i < typeIndices.length; i++) {
        expect(typeIndices[i]).toBeGreaterThanOrEqual(typeIndices[i - 1]);
      }
    });
  });

  describe('exports', () => {
    it('should export ENGINE_VERSION', () => {
      expect(ENGINE_VERSION).toBe('1.0.0');
    });

    it('should export all 6 trigger types', () => {
      expect(TRIGGER_TYPES).toHaveLength(6);
    });
  });
});
