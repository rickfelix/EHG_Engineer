/**
 * Risk Classifier Unit Tests
 * Phase 2: SD-LEO-SELF-IMPROVE-RISK-001
 *
 * Tests all 9 classification rules plus edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RiskClassifier,
  createRiskClassifier,
  CLASSIFICATION_RULES,
  IMMUTABLE_TABLES,
  GOVERNED_TABLES,
  AUTO_ELIGIBLE_TABLES
} from '../../../scripts/modules/risk-classifier/index.js';

// Mock the config import
vi.mock('../../../scripts/modules/ai-quality-judge/config.js', () => ({
  RISK_TIERS: {
    AUTO: {
      min_score: 85,
      min_safety: 8,
      allowed_operations: ['INSERT', 'UPSERT']
    },
    GOVERNED: {
      min_score: 70
    },
    IMMUTABLE: {
      min_score: 0
    }
  }
}));

describe('RiskClassifier', () => {
  let classifier;

  beforeEach(() => {
    classifier = createRiskClassifier();
  });

  describe('RULE-001: Constitution table is IMMUTABLE', () => {
    it('should classify protocol_constitution changes as IMMUTABLE', () => {
      const improvement = {
        id: 'test-001',
        target_table: 'protocol_constitution',
        target_operation: 'INSERT',
        payload: { rule_code: 'CONST-010' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-001');
      expect(result.confidence).toBe(100);
    });

    it('should classify UPDATE to protocol_constitution as IMMUTABLE', () => {
      const improvement = {
        target_table: 'protocol_constitution',
        target_operation: 'UPDATE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-001');
    });
  });

  describe('RULE-002: CONST rule changes are IMMUTABLE', () => {
    it('should classify CONST-* rule changes as IMMUTABLE', () => {
      const improvement = {
        target_table: 'leo_validation_rules',
        payload: { rule_code: 'CONST-001' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-002');
    });

    it('should recognize rule_id as well as rule_code', () => {
      const improvement = {
        target_table: 'some_table',
        payload: { rule_id: 'CONST-005' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-002');
    });

    it('should not match non-CONST rule codes', () => {
      const improvement = {
        target_table: 'leo_validation_rules',
        payload: { rule_code: 'VAL-001' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-004'); // Matches validation rules
    });
  });

  describe('RULE-003: CORE priority sections are IMMUTABLE', () => {
    it('should classify CORE priority sections as IMMUTABLE', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        payload: { priority: 'CORE', content: 'test' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-003');
    });

    it('should recognize CORE in section_key', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        payload: { section_key: 'CORE_WORKFLOW_001' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-003');
    });

    it('should not match non-CORE sections', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        target_operation: 'INSERT',
        payload: { priority: 'STANDARD' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).not.toBe('IMMUTABLE');
    });
  });

  describe('RULE-004: Validation rules require GOVERNED', () => {
    it('should classify leo_validation_rules changes as GOVERNED', () => {
      const improvement = {
        target_table: 'leo_validation_rules',
        target_operation: 'INSERT',
        payload: { rule_name: 'test_rule' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-004');
    });

    it('should classify VALIDATION_RULE type as GOVERNED', () => {
      const improvement = {
        improvement_type: 'VALIDATION_RULE',
        target_table: 'other_table'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-004');
    });
  });

  describe('RULE-005: Sub-agent configuration requires GOVERNED', () => {
    it('should classify leo_sub_agents changes as GOVERNED', () => {
      const improvement = {
        target_table: 'leo_sub_agents',
        target_operation: 'UPDATE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-005');
    });

    it('should classify leo_sub_agent_triggers as GOVERNED', () => {
      const improvement = {
        target_table: 'leo_sub_agent_triggers',
        target_operation: 'INSERT'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-005');
    });

    it('should classify SUB_AGENT_CONFIG type as GOVERNED', () => {
      const improvement = {
        improvement_type: 'SUB_AGENT_CONFIG',
        target_table: 'custom_table'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-005');
    });
  });

  describe('RULE-006: DELETE/UPDATE operations require GOVERNED', () => {
    it('should classify DELETE operations as GOVERNED', () => {
      const improvement = {
        target_table: 'issue_patterns',
        target_operation: 'DELETE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });

    it('should classify UPDATE operations as GOVERNED', () => {
      const improvement = {
        target_table: 'issue_patterns',
        target_operation: 'UPDATE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });

    it('should handle case-insensitive operations', () => {
      const improvement = {
        target_table: 'issue_patterns',
        target_operation: 'delete'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });
  });

  describe('RULE-007: Checklist items can be AUTO (INSERT only)', () => {
    it('should classify CHECKLIST_ITEM INSERT as AUTO', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_table: 'leo_protocol_sections',
        target_operation: 'INSERT'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('AUTO');
      expect(result.rule).toBe('RULE-007');
    });

    it('should classify CHECKLIST_ITEM UPSERT as AUTO', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_table: 'leo_protocol_sections',
        target_operation: 'UPSERT'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('AUTO');
      expect(result.rule).toBe('RULE-007');
    });

    it('should NOT classify CHECKLIST_ITEM DELETE as AUTO', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_operation: 'DELETE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });
  });

  describe('RULE-008: SITUATIONAL sections can be AUTO (INSERT only)', () => {
    it('should classify SITUATIONAL section INSERT as AUTO', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        target_operation: 'INSERT',
        payload: { priority: 'SITUATIONAL' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('AUTO');
      expect(result.rule).toBe('RULE-008');
    });

    it('should NOT classify SITUATIONAL UPDATE as AUTO', () => {
      const improvement = {
        target_table: 'leo_protocol_sections',
        target_operation: 'UPDATE',
        payload: { priority: 'SITUATIONAL' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });
  });

  describe('RULE-009: Unknown defaults to GOVERNED', () => {
    it('should default unknown improvements to GOVERNED', () => {
      const improvement = {
        target_table: 'unknown_table',
        target_operation: 'INSERT'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-009');
    });

    it('should handle null improvement as GOVERNED', () => {
      const result = classifier.classify(null);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-009');
    });

    it('should handle empty improvement as GOVERNED', () => {
      const result = classifier.classify({});

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-009');
    });
  });

  describe('classifyBatch', () => {
    it('should classify multiple improvements', () => {
      const improvements = [
        { id: '1', target_table: 'protocol_constitution' },
        { id: '2', target_table: 'leo_validation_rules' },
        { id: '3', improvement_type: 'CHECKLIST_ITEM', target_operation: 'INSERT' }
      ];

      const results = classifier.classifyBatch(improvements);

      expect(results).toHaveLength(3);
      expect(results[0].tier).toBe('IMMUTABLE');
      expect(results[1].tier).toBe('GOVERNED');
      expect(results[2].tier).toBe('AUTO');
    });

    it('should include improvement_id in results', () => {
      const improvements = [{ id: 'test-id', target_table: 'unknown' }];

      const results = classifier.classifyBatch(improvements);

      expect(results[0].improvement_id).toBe('test-id');
    });
  });

  describe('getTierForTable', () => {
    it('should return IMMUTABLE for constitution tables', () => {
      expect(classifier.getTierForTable('protocol_constitution')).toBe('IMMUTABLE');
      expect(classifier.getTierForTable('audit_log')).toBe('IMMUTABLE');
      expect(classifier.getTierForTable('system_flags')).toBe('IMMUTABLE');
    });

    it('should return GOVERNED for governance tables', () => {
      expect(classifier.getTierForTable('leo_validation_rules')).toBe('GOVERNED');
      expect(classifier.getTierForTable('leo_sub_agents')).toBe('GOVERNED');
      expect(classifier.getTierForTable('strategic_directives_v2')).toBe('GOVERNED');
    });

    it('should return AUTO for auto-eligible tables', () => {
      expect(classifier.getTierForTable('leo_protocol_sections')).toBe('AUTO');
      expect(classifier.getTierForTable('issue_patterns')).toBe('AUTO');
    });

    it('should return GOVERNED for unknown tables', () => {
      expect(classifier.getTierForTable('unknown_table')).toBe('GOVERNED');
    });
  });

  describe('canAutoApply', () => {
    it('should allow AUTO tier with high score and safety', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_operation: 'INSERT'
      };

      const result = classifier.canAutoApply(improvement, 90, 10);

      expect(result.eligible).toBe(true);
    });

    it('should reject non-AUTO tier', () => {
      const improvement = {
        target_table: 'protocol_constitution'
      };

      const result = classifier.canAutoApply(improvement, 100, 10);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('IMMUTABLE');
    });

    it('should reject low score', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_operation: 'INSERT'
      };

      const result = classifier.canAutoApply(improvement, 70, 10);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Score');
    });

    it('should reject low safety score', () => {
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_operation: 'INSERT'
      };

      const result = classifier.canAutoApply(improvement, 90, 5);

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('Safety');
    });
  });

  describe('getStatistics', () => {
    it('should calculate tier distribution', () => {
      const classifications = [
        { tier: 'IMMUTABLE', rule: 'RULE-001', confidence: 100 },
        { tier: 'GOVERNED', rule: 'RULE-004', confidence: 95 },
        { tier: 'GOVERNED', rule: 'RULE-005', confidence: 95 },
        { tier: 'AUTO', rule: 'RULE-007', confidence: 90 }
      ];

      const stats = classifier.getStatistics(classifications);

      expect(stats.total).toBe(4);
      expect(stats.byTier.IMMUTABLE).toBe(1);
      expect(stats.byTier.GOVERNED).toBe(2);
      expect(stats.byTier.AUTO).toBe(1);
      expect(stats.avgConfidence).toBe(95);
    });
  });

  describe('Rule ordering', () => {
    it('should match IMMUTABLE before GOVERNED', () => {
      // A CONST rule in validation_rules should be IMMUTABLE, not GOVERNED
      const improvement = {
        target_table: 'leo_validation_rules',
        payload: { rule_code: 'CONST-001' }
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('IMMUTABLE');
      expect(result.rule).toBe('RULE-002');
    });

    it('should match DELETE before AUTO-eligible', () => {
      // A CHECKLIST_ITEM DELETE should be GOVERNED
      const improvement = {
        improvement_type: 'CHECKLIST_ITEM',
        target_operation: 'DELETE'
      };

      const result = classifier.classify(improvement);

      expect(result.tier).toBe('GOVERNED');
      expect(result.rule).toBe('RULE-006');
    });
  });

  describe('getRules', () => {
    it('should return all 9 rules', () => {
      const rules = classifier.getRules();

      expect(rules).toHaveLength(9);
      expect(rules.map(r => r.id)).toContain('RULE-001');
      expect(rules.map(r => r.id)).toContain('RULE-009');
    });
  });
});

describe('Module exports', () => {
  it('should export CLASSIFICATION_RULES', () => {
    expect(CLASSIFICATION_RULES).toBeDefined();
    expect(CLASSIFICATION_RULES.length).toBe(9);
  });

  it('should export table lists', () => {
    expect(IMMUTABLE_TABLES).toContain('protocol_constitution');
    expect(GOVERNED_TABLES).toContain('leo_validation_rules');
    expect(AUTO_ELIGIBLE_TABLES).toContain('leo_protocol_sections');
  });

  it('should export createRiskClassifier factory', () => {
    const classifier = createRiskClassifier();
    expect(classifier).toBeInstanceOf(RiskClassifier);
  });
});
