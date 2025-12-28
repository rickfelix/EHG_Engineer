/**
 * CompletionValidator Unit Tests
 *
 * SD-REFACTOR-VERIFY-001 Phase 2: Unit Tests for Rules
 *
 * Tests the VerificationRules engine and CompletionValidator facade.
 * Each rule is tested in isolation for pass/fail conditions.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import {
  validateCompletion,
  validateForHandoff,
  getAvailableRules,
  executeRule,
  executeRules,
  createValidationInput,
  SCORE_THRESHOLDS
} from '../../scripts/modules/handoff/completion/index.js';

describe('ValidationInput', () => {
  it('should create normalized input from raw input', () => {
    const raw = {
      sdId: 'SD-TEST-001',
      handoffType: 'PLAN-TO-EXEC',
      supabase: {}
    };

    const input = createValidationInput(raw);

    expect(input.sdId).toBe('SD-TEST-001');
    expect(input.handoffType).toBe('PLAN-TO-EXEC');
    expect(input.options).toBeDefined();
    expect(input._raw).toBe(raw);
  });

  it('should normalize handoff type variants', () => {
    const variants = [
      { type: 'lead-to-plan', expected: 'LEAD-TO-PLAN' },
      { type: 'LEADTOPLAN', expected: 'LEAD-TO-PLAN' },
      { type: 'L2P', expected: 'LEAD-TO-PLAN' },
      { type: 'plan_to_exec', expected: 'PLAN-TO-EXEC' },
      { type: 'P2E', expected: 'PLAN-TO-EXEC' }
    ];

    for (const { type, expected } of variants) {
      const input = createValidationInput({
        sdId: 'SD-TEST-001',
        handoffType: type,
        supabase: {}
      });
      expect(input.handoffType).toBe(expected);
    }
  });

  it('should throw on missing sdId', () => {
    expect(() => createValidationInput({ handoffType: 'PLAN-TO-EXEC' }))
      .toThrow(/sdId is required/);
  });
});

describe('VerificationRules', () => {
  describe('SD_EXISTS rule', () => {
    it('should pass when SD is provided', async () => {
      const result = await executeRule('SD_EXISTS', {
        sdId: 'SD-TEST-001',
        sd: { id: 'SD-TEST-001', title: 'Test SD' }
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
      expect(result.details.sdTitle).toBe('Test SD');
    });

    it('should fail when SD is missing', async () => {
      const result = await executeRule('SD_EXISTS', {
        sdId: 'SD-TEST-001',
        sd: null
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.issues).toContain('SD SD-TEST-001 not found in database');
    });
  });

  describe('SD_COMPLETENESS rule', () => {
    it('should pass for complete SD', async () => {
      const result = await executeRule('SD_COMPLETENESS', {
        sd: {
          title: 'Test SD',
          description: 'A test',
          category: 'feature',
          success_criteria: ['Criterion 1'],
          success_metrics: [{ metric: 'Test', target: '100%' }]
        }
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(20);
    });

    it('should fail for SD missing required fields', async () => {
      const result = await executeRule('SD_COMPLETENESS', {
        sd: {
          title: 'Test SD'
          // missing description and category
        }
      });

      expect(result.passed).toBe(false);
      expect(result.issues).toContainEqual(expect.stringContaining('description'));
    });

    it('should warn for missing recommended fields', async () => {
      const result = await executeRule('SD_COMPLETENESS', {
        sd: {
          title: 'Test SD',
          description: 'Test',
          category: 'feature'
          // missing success_criteria, success_metrics
        }
      });

      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('EXPLORATION_AUDIT rule', () => {
    it('should pass with 5+ files explored', async () => {
      const files = Array(6).fill(null).map((_, i) => ({
        path: `file-${i}.js`,
        lines: 100,
        findings: 'Test'
      }));

      const result = await executeRule('EXPLORATION_AUDIT', {
        prd: { exploration_summary: files }
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(12);
    });

    it('should fail with no exploration', async () => {
      const result = await executeRule('EXPLORATION_AUDIT', {
        prd: { exploration_summary: [] }
      });

      expect(result.passed).toBe(false);
      expect(result.issues).toContain('No exploration documented in PRD');
    });

    it('should handle nested files_explored structure', async () => {
      const result = await executeRule('EXPLORATION_AUDIT', {
        prd: {
          exploration_summary: {
            files_explored: [
              { path: 'a.js', lines: 100, findings: 'Test' },
              { path: 'b.js', lines: 100, findings: 'Test' },
              { path: 'c.js', lines: 100, findings: 'Test' }
            ]
          }
        }
      });

      expect(result.passed).toBe(true);
    });
  });

  describe('PRD_STATUS_READY rule', () => {
    it('should pass for approved status', async () => {
      const result = await executeRule('PRD_STATUS_READY', {
        prd: { status: 'approved' }
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(15);
    });

    it('should fail for planning status', async () => {
      const result = await executeRule('PRD_STATUS_READY', {
        prd: { status: 'planning' }
      });

      expect(result.passed).toBe(false);
      expect(result.issues[0]).toContain('planning');
    });
  });
});

describe('executeRules', () => {
  it('should execute all rules for LEAD-TO-PLAN in order', async () => {
    const result = await executeRules('LEAD-TO-PLAN', {
      sdId: 'SD-TEST-001',
      sd: {
        id: 'SD-TEST-001',
        title: 'Test',
        description: 'Test',
        category: 'feature',
        status: 'draft',
        success_criteria: ['Test'],
        exploration_summary: [
          { path: 'a.js', lines: 100, findings: 'Test' }
        ]
      }
    });

    expect(result.ruleResults).toBeDefined();
    expect(result.ruleResults.length).toBeGreaterThan(0);
    expect(result.percentage).toBeDefined();
  });

  it('should aggregate scores correctly', async () => {
    const result = await executeRules('LEAD-TO-PLAN', {
      sdId: 'SD-TEST-001',
      sd: {
        id: 'SD-TEST-001',
        title: 'Test',
        description: 'Test',
        category: 'feature',
        status: 'draft',
        success_criteria: ['Test'],
        exploration_summary: [
          { path: 'a.js', lines: 100, findings: 'Test' },
          { path: 'b.js', lines: 100, findings: 'Test' },
          { path: 'c.js', lines: 100, findings: 'Test' }
        ]
      }
    });

    const totalRuleMaxScore = result.ruleResults.reduce((sum, r) => sum + r.maxScore, 0);
    expect(result.maxScore).toBe(totalRuleMaxScore);
  });
});

describe('validateCompletion', () => {
  it('should return deterministic result structure', async () => {
    const result = await validateCompletion({
      sdId: 'SD-TEST-001',
      handoffType: 'PLAN-TO-EXEC',
      sd: { id: 'SD-TEST-001', status: 'active' },
      prd: { id: 'PRD-TEST', status: 'approved' },
      userStories: [{ id: 'US-001' }]
    });

    // Verify result structure
    expect(result).toHaveProperty('isValid');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('maxScore');
    expect(result).toHaveProperty('percentage');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
    expect(result).toHaveProperty('ruleResults');
    expect(result).toHaveProperty('metadata');

    // Errors/warnings have normalized structure
    if (result.errors.length > 0) {
      expect(result.errors[0]).toHaveProperty('code');
      expect(result.errors[0]).toHaveProperty('message');
    }
  });

  it('should return error result for missing input', async () => {
    const result = await validateCompletion({});

    expect(result.isValid).toBe(false);
    expect(result.errors[0].code).toBe('INPUT_VALIDATION_FAILED');
  });

  it('should include debug diagnostics when enabled', async () => {
    const result = await validateCompletion({
      sdId: 'SD-TEST-001',
      handoffType: 'PLAN-TO-EXEC',
      sd: { id: 'SD-TEST-001', status: 'active' },
      prd: { id: 'PRD-TEST', status: 'approved' },
      userStories: [{ id: 'US-001' }],
      supabase: {}, // Provide supabase to skip loading
      options: { debugDiagnostics: true }
    });

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics.input).toBeDefined();
    expect(result.diagnostics.ruleOrder).toBeDefined();
  });
});

describe('getAvailableRules', () => {
  it('should return rules for each handoff type', () => {
    const handoffTypes = [
      'LEAD-TO-PLAN',
      'PLAN-TO-EXEC',
      'EXEC-TO-PLAN',
      'PLAN-TO-LEAD',
      'ORCHESTRATOR_COMPLETION'
    ];

    for (const type of handoffTypes) {
      const rules = getAvailableRules(type);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toHaveProperty('id');
      expect(rules[0]).toHaveProperty('name');
      expect(rules[0]).toHaveProperty('maxScore');
    }
  });
});

describe('SCORE_THRESHOLDS', () => {
  it('should have thresholds for all handoff types', () => {
    expect(SCORE_THRESHOLDS['LEAD-TO-PLAN']).toBe(85);
    expect(SCORE_THRESHOLDS['PLAN-TO-EXEC']).toBe(85);
    expect(SCORE_THRESHOLDS['EXEC-TO-PLAN']).toBe(85);
    expect(SCORE_THRESHOLDS['PLAN-TO-LEAD']).toBe(85);
    expect(SCORE_THRESHOLDS['ORCHESTRATOR_COMPLETION']).toBe(90);
  });
});
