/**
 * Tests for Decision Filter Engine
 * SD-LEO-INFRA-FILTER-ENGINE-001
 *
 * Tests the deterministic evaluation of stage outputs against
 * Chairman-configured thresholds.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateDecision,
  ENGINE_VERSION,
  TRIGGER_TYPES,
  DEFAULTS,
} from '../../lib/eva/decision-filter-engine.js';

describe('Decision Filter Engine - Core API', () => {
  it('should return auto_proceed=true when no triggers fire', () => {
    const result = evaluateDecision({}, { preferences: { 'filter.cost_max_usd': 50000 } });
    expect(result.auto_proceed).toBe(true);
    expect(result.recommendation).toBe('AUTO_PROCEED');
    expect(result.triggers.filter(t => !t.details.missingKey)).toHaveLength(0);
  });

  it('should return correct structure', () => {
    const result = evaluateDecision({});
    expect(result).toHaveProperty('auto_proceed');
    expect(result).toHaveProperty('triggers');
    expect(result).toHaveProperty('recommendation');
    expect(typeof result.auto_proceed).toBe('boolean');
    expect(Array.isArray(result.triggers)).toBe(true);
    expect(typeof result.recommendation).toBe('string');
  });

  it('should be deterministic: same inputs produce same outputs', () => {
    const input = { cost: 15000, score: 5 };
    const prefs = { 'filter.cost_max_usd': 10000, 'filter.min_score': 7 };
    const r1 = evaluateDecision(input, { preferences: prefs });
    const r2 = evaluateDecision(input, { preferences: prefs });
    expect(r1).toEqual(r2);
  });

  it('should export ENGINE_VERSION', () => {
    expect(ENGINE_VERSION).toBe('1.0.0');
  });

  it('should export 6 trigger types', () => {
    expect(TRIGGER_TYPES).toHaveLength(6);
    expect(TRIGGER_TYPES).toContain('cost_threshold');
    expect(TRIGGER_TYPES).toContain('new_tech_vendor');
    expect(TRIGGER_TYPES).toContain('strategic_pivot');
    expect(TRIGGER_TYPES).toContain('low_score');
    expect(TRIGGER_TYPES).toContain('novel_pattern');
    expect(TRIGGER_TYPES).toContain('constraint_drift');
  });
});

describe('Decision Filter Engine - cost_threshold', () => {
  const prefs = { 'filter.cost_max_usd': 10000 };

  it('should trigger when cost exceeds threshold', () => {
    const result = evaluateDecision({ cost: 15000 }, { preferences: prefs });
    const costTriggers = result.triggers.filter(t => t.type === 'cost_threshold');
    expect(costTriggers).toHaveLength(1);
    expect(costTriggers[0].severity).toBe('HIGH');
    expect(costTriggers[0].details.cost).toBe(15000);
    expect(costTriggers[0].details.threshold).toBe(10000);
    expect(result.auto_proceed).toBe(false);
  });

  it('should NOT trigger when cost is within threshold', () => {
    const result = evaluateDecision({ cost: 5000 }, { preferences: prefs });
    const costTriggers = result.triggers.filter(t => t.type === 'cost_threshold');
    expect(costTriggers).toHaveLength(0);
  });

  it('should NOT trigger when cost equals threshold', () => {
    const result = evaluateDecision({ cost: 10000 }, { preferences: prefs });
    const costTriggers = result.triggers.filter(t => t.type === 'cost_threshold');
    expect(costTriggers).toHaveLength(0);
  });

  it('should use default threshold when preference missing', () => {
    const result = evaluateDecision({ cost: 15000 }, { preferences: {} });
    const costTriggers = result.triggers.filter(t => t.type === 'cost_threshold');
    expect(costTriggers).toHaveLength(1);
    expect(costTriggers[0].details.threshold).toBe(DEFAULTS['filter.cost_max_usd']);
  });
});

describe('Decision Filter Engine - new_tech_vendor', () => {
  const prefs = {
    'filter.approved_tech_list': ['React', 'Node.js', 'PostgreSQL'],
    'filter.approved_vendor_list': ['AWS', 'Vercel'],
  };

  it('should trigger for unapproved technology', () => {
    const result = evaluateDecision(
      { technologies: ['React', 'Rust'] },
      { preferences: prefs }
    );
    const techTriggers = result.triggers.filter(t => t.type === 'new_tech_vendor');
    expect(techTriggers).toHaveLength(1);
    expect(techTriggers[0].details.newItems).toEqual(['Rust']);
    expect(techTriggers[0].severity).toBe('HIGH');
  });

  it('should NOT trigger for approved technology (case-insensitive)', () => {
    const result = evaluateDecision(
      { technologies: ['react', 'node.js'] },
      { preferences: prefs }
    );
    const techTriggers = result.triggers.filter(t => t.type === 'new_tech_vendor');
    expect(techTriggers).toHaveLength(0);
  });

  it('should trigger for unapproved vendor', () => {
    const result = evaluateDecision(
      { vendors: ['AWS', 'GCP'] },
      { preferences: prefs }
    );
    const vendorTriggers = result.triggers.filter(t => t.type === 'new_tech_vendor');
    expect(vendorTriggers).toHaveLength(1);
    expect(vendorTriggers[0].details.newItems).toEqual(['GCP']);
  });

  it('should handle both tech and vendor triggers simultaneously', () => {
    const result = evaluateDecision(
      { technologies: ['Go'], vendors: ['Azure'] },
      { preferences: prefs }
    );
    const triggers = result.triggers.filter(t => t.type === 'new_tech_vendor');
    expect(triggers).toHaveLength(2);
  });
});

describe('Decision Filter Engine - strategic_pivot', () => {
  const prefs = { 'filter.pivot_keywords': ['pivot', 'abandon', 'scrap'] };

  it('should trigger when description contains pivot keywords', () => {
    const result = evaluateDecision(
      { description: 'We should pivot to a B2C model' },
      { preferences: prefs }
    );
    const pivotTriggers = result.triggers.filter(t => t.type === 'strategic_pivot');
    expect(pivotTriggers).toHaveLength(1);
    expect(pivotTriggers[0].details.matchedKeywords).toContain('pivot');
    expect(pivotTriggers[0].severity).toBe('HIGH');
  });

  it('should NOT trigger when no pivot keywords present', () => {
    const result = evaluateDecision(
      { description: 'Continue with current approach' },
      { preferences: prefs }
    );
    const pivotTriggers = result.triggers.filter(t => t.type === 'strategic_pivot');
    expect(pivotTriggers).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    const result = evaluateDecision(
      { description: 'ABANDON this strategy' },
      { preferences: prefs }
    );
    const pivotTriggers = result.triggers.filter(t => t.type === 'strategic_pivot');
    expect(pivotTriggers).toHaveLength(1);
  });
});

describe('Decision Filter Engine - low_score', () => {
  const prefs = { 'filter.min_score': 7 };

  it('should trigger when score is below threshold', () => {
    const result = evaluateDecision({ score: 5 }, { preferences: prefs });
    const scoreTriggers = result.triggers.filter(t => t.type === 'low_score');
    expect(scoreTriggers).toHaveLength(1);
    expect(scoreTriggers[0].severity).toBe('MEDIUM');
    expect(scoreTriggers[0].details.score).toBe(5);
    expect(scoreTriggers[0].details.threshold).toBe(7);
  });

  it('should NOT trigger when score meets threshold', () => {
    const result = evaluateDecision({ score: 7 }, { preferences: prefs });
    const scoreTriggers = result.triggers.filter(t => t.type === 'low_score');
    expect(scoreTriggers).toHaveLength(0);
  });

  it('should NOT trigger when score exceeds threshold', () => {
    const result = evaluateDecision({ score: 9 }, { preferences: prefs });
    const scoreTriggers = result.triggers.filter(t => t.type === 'low_score');
    expect(scoreTriggers).toHaveLength(0);
  });
});

describe('Decision Filter Engine - novel_pattern', () => {
  it('should trigger for patterns not in prior stages', () => {
    const result = evaluateDecision(
      { patterns: ['microservices', 'CQRS'], priorPatterns: ['microservices'] },
      { preferences: {} }
    );
    const novelTriggers = result.triggers.filter(t => t.type === 'novel_pattern');
    expect(novelTriggers).toHaveLength(1);
    expect(novelTriggers[0].details.novelPatterns).toEqual(['CQRS']);
    expect(novelTriggers[0].severity).toBe('MEDIUM');
  });

  it('should NOT trigger when all patterns are known', () => {
    const result = evaluateDecision(
      { patterns: ['microservices'], priorPatterns: ['microservices', 'event-sourcing'] },
      { preferences: {} }
    );
    const novelTriggers = result.triggers.filter(t => t.type === 'novel_pattern');
    expect(novelTriggers).toHaveLength(0);
  });

  it('should be case-insensitive', () => {
    const result = evaluateDecision(
      { patterns: ['Microservices'], priorPatterns: ['microservices'] },
      { preferences: {} }
    );
    const novelTriggers = result.triggers.filter(t => t.type === 'novel_pattern');
    expect(novelTriggers).toHaveLength(0);
  });
});

describe('Decision Filter Engine - constraint_drift', () => {
  it('should trigger when constraints drift from approved values', () => {
    const result = evaluateDecision(
      {
        constraints: { budget: 50000, timeline: '6 months' },
        approvedConstraints: { budget: 30000, timeline: '6 months' },
      },
      { preferences: {} }
    );
    const driftTriggers = result.triggers.filter(
      t => t.type === 'constraint_drift' && t.details.drifts
    );
    expect(driftTriggers).toHaveLength(1);
    expect(driftTriggers[0].details.drifts).toHaveLength(1);
    expect(driftTriggers[0].details.drifts[0].key).toBe('budget');
  });

  it('should NOT trigger when constraints match', () => {
    const result = evaluateDecision(
      {
        constraints: { budget: 30000 },
        approvedConstraints: { budget: 30000 },
      },
      { preferences: {} }
    );
    const driftTriggers = result.triggers.filter(
      t => t.type === 'constraint_drift' && t.details.drifts
    );
    expect(driftTriggers).toHaveLength(0);
  });

  it('should add missing preference trigger for unset preference keys', () => {
    // Providing a cost input but NO cost preference triggers a "missing preference" constraint_drift
    const result = evaluateDecision({ cost: 5000 }, { preferences: {} });
    const missingTriggers = result.triggers.filter(
      t => t.type === 'constraint_drift' && t.details.missingKey
    );
    expect(missingTriggers.length).toBeGreaterThan(0);
    expect(missingTriggers[0].details.missingKey).toBe('filter.cost_max_usd');
  });
});

describe('Decision Filter Engine - Recommendation Logic', () => {
  it('should recommend AUTO_PROCEED when no business triggers', () => {
    const result = evaluateDecision({}, { preferences: { 'filter.cost_max_usd': 50000 } });
    expect(result.recommendation).toBe('AUTO_PROCEED');
  });

  it('should recommend PRESENT_TO_CHAIRMAN for HIGH severity triggers', () => {
    const result = evaluateDecision(
      { cost: 100000 },
      { preferences: { 'filter.cost_max_usd': 10000 } }
    );
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
  });

  it('should recommend PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS for MEDIUM-only triggers', () => {
    const result = evaluateDecision(
      { score: 5 },
      { preferences: { 'filter.min_score': 7, 'filter.cost_max_usd': 99999 } }
    );
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN_WITH_MITIGATIONS');
  });

  it('should handle multiple triggers with mixed severity', () => {
    const result = evaluateDecision(
      { cost: 100000, score: 3 },
      { preferences: { 'filter.cost_max_usd': 10000, 'filter.min_score': 7 } }
    );
    expect(result.auto_proceed).toBe(false);
    expect(result.recommendation).toBe('PRESENT_TO_CHAIRMAN');
    expect(result.triggers.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Decision Filter Engine - Trigger Ordering', () => {
  it('should order triggers by TRIGGER_TYPES order', () => {
    const result = evaluateDecision(
      {
        cost: 100000,
        score: 3,
        technologies: ['Rust'],
        description: 'We pivot now',
        patterns: ['new-arch'],
        priorPatterns: [],
      },
      {
        preferences: {
          'filter.cost_max_usd': 10000,
          'filter.min_score': 7,
          'filter.approved_tech_list': ['React'],
          'filter.approved_vendor_list': [],
          'filter.pivot_keywords': ['pivot'],
        },
      }
    );

    // Extract only business trigger types (exclude missing pref triggers)
    const businessTypes = result.triggers
      .filter(t => !t.details.missingKey)
      .map(t => t.type);

    // Verify ordering follows TRIGGER_TYPES sequence
    for (let i = 1; i < businessTypes.length; i++) {
      const prevIdx = TRIGGER_TYPES.indexOf(businessTypes[i - 1]);
      const currIdx = TRIGGER_TYPES.indexOf(businessTypes[i]);
      expect(currIdx).toBeGreaterThanOrEqual(prevIdx);
    }
  });
});

describe('Decision Filter Engine - Structured Logging', () => {
  it('should call logger.info with structured event', () => {
    const logs = [];
    const logger = {
      info: (msg) => logs.push(JSON.parse(msg)),
      debug: () => {},
    };

    evaluateDecision({ stage: 'idea_validation' }, { preferences: {}, logger });

    expect(logs).toHaveLength(1);
    expect(logs[0].event).toBe('decision_filter_evaluated');
    expect(logs[0].stage).toBe('idea_validation');
    expect(logs[0].evaluation_version).toBe(ENGINE_VERSION);
  });

  it('should call logger.debug when triggers fire', () => {
    const debugLogs = [];
    const logger = {
      info: () => {},
      debug: (msg) => debugLogs.push(JSON.parse(msg)),
    };

    evaluateDecision(
      { cost: 100000 },
      { preferences: { 'filter.cost_max_usd': 10000 }, logger }
    );

    expect(debugLogs.length).toBeGreaterThan(0);
    expect(debugLogs[0].event).toBe('decision_filter_trigger_details');
  });
});
