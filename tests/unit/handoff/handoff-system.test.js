/**
 * Unit tests for LEO Protocol Handoff Orchestrator System
 * SD-LEO-INFRA-HANDOFF-ORCHESTRATOR-UNIT-001
 *
 * Covers:
 * 1. Rejection-to-SubAgent Mapping (pure functions)
 * 2. Validator Registry (core registration and lookup)
 * 3. Gate Score Normalization (ValidatorRegistry.normalizeResult)
 * 4. Handoff Type Routing (workflow definitions + orchestrator type support)
 * 5. ResultBuilder (response factory)
 * 6. Bypass Rubric (reason validation)
 * 7. Self-Critique Pre-Flight (confidence gating)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Module imports ---
import rejectionMapping, {
  getRemediation,
  getSubagentType,
  getAllCodes,
  hasSubagentMapping
} from '../../../scripts/modules/handoff/rejection-subagent-mapping.js';

const { fivePointBrief, taskInvocation } = rejectionMapping;

import { ValidatorRegistry } from '../../../scripts/modules/handoff/validation/validator-registry/core.js';

import {
  getWorkflowForType,
  isHandoffRequired,
  isHandoffOptional,
  WORKFLOW_BY_SD_TYPE
} from '../../../scripts/modules/handoff/cli/workflow-definitions.js';

import ResultBuilder from '../../../scripts/modules/handoff/ResultBuilder.js';

import {
  validateBypassReason,
  LEGITIMATE_REASONS,
  ILLEGITIMATE_REASONS
} from '../../../scripts/modules/handoff/bypass-rubric.js';

import { HandoffOrchestrator } from '../../../scripts/modules/handoff/HandoffOrchestrator.js';

// ============================================================
// 1. REJECTION-TO-SUBAGENT MAPPING
// ============================================================

describe('Rejection-to-SubAgent Mapping', () => {
  describe('fivePointBrief', () => {
    it('should format all five fields into a newline-separated string', () => {
      const brief = fivePointBrief({
        symptom: 'Test fails',
        location: 'tests/',
        frequency: 'Every run',
        priorAttempts: 'None',
        desiredOutcome: 'Tests pass'
      });

      expect(brief).toContain('Symptom: Test fails');
      expect(brief).toContain('Location: tests/');
      expect(brief).toContain('Frequency: Every run');
      expect(brief).toContain('Prior attempts: None');
      expect(brief).toContain('Desired outcome: Tests pass');
      // Verify newline separation
      expect(brief.split('\n')).toHaveLength(5);
    });
  });

  describe('taskInvocation', () => {
    it('should produce a formatted task invocation block', () => {
      const result = taskInvocation('testing-agent', 'Line 1\nLine 2');

      expect(result).toContain('--- TASK TOOL INVOCATION ---');
      expect(result).toContain('subagent_type: "testing-agent"');
      expect(result).toContain('prompt: |');
      expect(result).toContain('  Line 1');
      expect(result).toContain('  Line 2');
      expect(result).toContain('--- END INVOCATION ---');
    });
  });

  describe('getRemediation', () => {
    it('should return remediation for known code NO_PRD', () => {
      const result = getRemediation('NO_PRD', { sdId: 'SD-TEST-001' });

      expect(result).not.toBeNull();
      expect(result.subagentType).toBe('general-purpose');
      expect(result.category).toBe('quality');
      expect(result.message).toContain('PRD');
      expect(result.message).toContain('SD-TEST-001');
    });

    it('should return remediation with task invocation for codes with subagent', () => {
      const result = getRemediation('MANDATORY_TESTING_VALIDATION', { sdId: 'SD-TEST-001' });

      expect(result).not.toBeNull();
      expect(result.subagentType).toBe('testing-agent');
      expect(result.category).toBe('testing');
      expect(result.message).toContain('TASK TOOL INVOCATION');
    });

    it('should return null for unknown rejection code', () => {
      const result = getRemediation('TOTALLY_UNKNOWN_CODE');
      expect(result).toBeNull();
    });

    it('should handle context with details for PRD_QUALITY', () => {
      const result = getRemediation('PRD_QUALITY', {
        sdId: 'SD-TEST-002',
        details: {
          actualScore: 45,
          requiredScore: 70,
          prdValidation: { errors: ['missing_architecture', 'weak_tests'] }
        }
      });

      expect(result.message).toContain('45%');
      expect(result.message).toContain('70%');
      expect(result.message).toContain('missing_architecture');
    });

    it('should return simple message for codes without subagent', () => {
      const result = getRemediation('PLAN_INCOMPLETE', { sdId: 'SD-TEST-001' });

      expect(result).not.toBeNull();
      expect(result.subagentType).toBeNull();
      expect(result.category).toBe('quality');
      expect(result.message).not.toContain('TASK TOOL INVOCATION');
    });
  });

  describe('getSubagentType', () => {
    it('should return correct subagent for testing codes', () => {
      expect(getSubagentType('MANDATORY_TESTING_VALIDATION')).toBe('testing-agent');
      expect(getSubagentType('TEST_EVIDENCE_AUTO_CAPTURE')).toBe('testing-agent');
      expect(getSubagentType('BMAD_EXEC_TO_PLAN_FAILED')).toBe('testing-agent');
    });

    it('should return null for codes without subagent', () => {
      expect(getSubagentType('PLAN_INCOMPLETE')).toBeNull();
      expect(getSubagentType('GATE3_VALIDATION_FAILED')).toBeNull();
      expect(getSubagentType('BRANCH_ENFORCEMENT_FAILED')).toBeNull();
    });

    it('should return null for unknown codes', () => {
      expect(getSubagentType('FAKE_CODE')).toBeNull();
    });
  });

  describe('getAllCodes', () => {
    it('should return an array of all rejection codes', () => {
      const codes = getAllCodes();

      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(30);
    });

    it('should have code, subagentType, and category for each entry', () => {
      const codes = getAllCodes();

      for (const entry of codes) {
        expect(entry).toHaveProperty('code');
        expect(entry).toHaveProperty('subagentType');
        expect(entry).toHaveProperty('category');
        expect(typeof entry.code).toBe('string');
        expect(typeof entry.category).toBe('string');
      }
    });

    it('should include known categories', () => {
      const codes = getAllCodes();
      const categories = new Set(codes.map(c => c.category));

      expect(categories.has('quality')).toBe(true);
      expect(categories.has('testing')).toBe(true);
      expect(categories.has('workflow')).toBe(true);
      expect(categories.has('git')).toBe(true);
      expect(categories.has('design')).toBe(true);
      expect(categories.has('infrastructure')).toBe(true);
      expect(categories.has('stories')).toBe(true);
    });
  });

  describe('hasSubagentMapping', () => {
    it('should return true for codes with subagent', () => {
      expect(hasSubagentMapping('NO_PRD')).toBe(true);
      expect(hasSubagentMapping('MANDATORY_TESTING_VALIDATION')).toBe(true);
      expect(hasSubagentMapping('RCA_GATE')).toBe(true);
    });

    it('should return false for codes without subagent', () => {
      expect(hasSubagentMapping('PLAN_INCOMPLETE')).toBe(false);
      expect(hasSubagentMapping('GATE5_VALIDATION_FAILED')).toBe(false);
    });

    it('should return false for unknown codes', () => {
      expect(hasSubagentMapping('NONEXISTENT_CODE')).toBe(false);
    });
  });
});

// ============================================================
// 2. VALIDATOR REGISTRY
// ============================================================

describe('ValidatorRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new ValidatorRegistry();
  });

  describe('register and get', () => {
    it('should register and retrieve a validator function', () => {
      const myValidator = async () => ({ passed: true, score: 100 });
      registry.register('test_rule', myValidator, 'Test rule');

      const retrieved = registry.get('test_rule');
      expect(retrieved).toBe(myValidator);
    });

    it('should throw if validator is not a function', () => {
      expect(() => registry.register('bad_rule', 'not a function')).toThrow(
        'Validator for bad_rule must be a function'
      );
    });

    it('should return null for unregistered rule', () => {
      expect(registry.get('nonexistent_rule')).toBeNull();
    });
  });

  describe('has', () => {
    it('should return true for registered validators', () => {
      registry.register('my_rule', async () => ({}));
      expect(registry.has('my_rule')).toBe(true);
    });

    it('should return false for unregistered validators', () => {
      expect(registry.has('missing_rule')).toBe(false);
    });

    it('should return true for fallback validators', () => {
      registry.getOrCreateFallback('fallback_rule', {});
      expect(registry.has('fallback_rule')).toBe(true);
    });
  });

  describe('getRegisteredRules', () => {
    it('should return array of registered rule names', () => {
      registry.register('rule_a', async () => ({}));
      registry.register('rule_b', async () => ({}));

      const rules = registry.getRegisteredRules();
      expect(rules).toContain('rule_a');
      expect(rules).toContain('rule_b');
      expect(rules).toHaveLength(2);
    });
  });

  describe('getOrCreateFallback', () => {
    it('should return registered validator if exists', () => {
      const myValidator = async () => ({ passed: true });
      registry.register('exists_rule', myValidator);

      const result = registry.getOrCreateFallback('exists_rule');
      expect(result).toBe(myValidator);
    });

    it('should create a fallback that auto-passes when no validator registered', async () => {
      const fallback = registry.getOrCreateFallback('unknown_rule', {
        validator_module: 'test-module',
        validator_function: 'testFn'
      });

      expect(typeof fallback).toBe('function');
      const result = await fallback();
      expect(result.passed).toBe(true);
      // Fallback validators return a penalized score of 50, not 100
      expect(result.score).toBe(50);
      expect(result.details.isFallback).toBe(true);
    });

    it('should cache fallback validators for repeated lookups', () => {
      const first = registry.getOrCreateFallback('cache_test');
      const second = registry.getOrCreateFallback('cache_test');
      expect(first).toBe(second);
    });
  });

  describe('getStats', () => {
    it('should report counts of registered and fallback validators', () => {
      registry.register('rule_1', async () => ({}));
      registry.register('rule_2', async () => ({}));
      registry.getOrCreateFallback('fallback_1');

      const stats = registry.getStats();
      expect(stats.totalRegistered).toBe(2);
      expect(stats.totalFallbacks).toBe(1);
    });
  });
});

// ============================================================
// 3. GATE SCORE NORMALIZATION
// ============================================================

describe('Gate Score Normalization', () => {
  let registry;

  beforeEach(() => {
    registry = new ValidatorRegistry();
  });

  it('should normalize result with "passed" field', () => {
    const result = registry.normalizeResult({
      passed: true,
      score: 85,
      max_score: 100
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(85);
    expect(result.max_score).toBe(100);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should normalize result with "pass" field instead of "passed"', () => {
    const result = registry.normalizeResult({
      pass: false,
      score: 30,
      max_score: 100,
      issues: ['Low quality']
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(30);
    expect(result.issues).toEqual(['Low quality']);
  });

  it('should infer passed from score when neither passed nor pass exists', () => {
    const passing = registry.normalizeResult({ score: 100, max_score: 100 });
    expect(passing.passed).toBe(true);

    const failing = registry.normalizeResult({ score: 50, max_score: 100 });
    expect(failing.passed).toBe(false);
  });

  it('should default score to 0 when not provided', () => {
    const result = registry.normalizeResult({});
    expect(result.score).toBe(0);
    expect(result.max_score).toBe(100);
  });

  it('should handle maxScore alias for max_score', () => {
    const result = registry.normalizeResult({
      passed: true,
      score: 90,
      maxScore: 100
    });

    expect(result.max_score).toBe(100);
  });

  it('should preserve existing issues and warnings arrays', () => {
    const result = registry.normalizeResult({
      passed: false,
      score: 40,
      issues: ['Problem A', 'Problem B'],
      warnings: ['Consider X']
    });

    expect(result.issues).toEqual(['Problem A', 'Problem B']);
    expect(result.warnings).toEqual(['Consider X']);
  });
});

// ============================================================
// 4. HANDOFF TYPE ROUTING
// ============================================================

describe('Handoff Type Routing', () => {
  describe('WORKFLOW_BY_SD_TYPE', () => {
    it('should define workflows for all 9 SD types', () => {
      const expectedTypes = [
        'feature', 'infrastructure', 'documentation', 'database',
        'security', 'refactor', 'bugfix', 'performance', 'orchestrator'
      ];

      for (const sdType of expectedTypes) {
        expect(WORKFLOW_BY_SD_TYPE[sdType]).toBeDefined();
        expect(WORKFLOW_BY_SD_TYPE[sdType].required).toBeDefined();
        expect(Array.isArray(WORKFLOW_BY_SD_TYPE[sdType].required)).toBe(true);
      }
    });

    it('should require all 5 handoffs for feature SDs', () => {
      const workflow = WORKFLOW_BY_SD_TYPE.feature;
      expect(workflow.required).toContain('LEAD-TO-PLAN');
      expect(workflow.required).toContain('PLAN-TO-EXEC');
      expect(workflow.required).toContain('EXEC-TO-PLAN');
      expect(workflow.required).toContain('PLAN-TO-LEAD');
      expect(workflow.required).toContain('LEAD-FINAL-APPROVAL');
      expect(workflow.required).toHaveLength(5);
    });

    it('should make EXEC-TO-PLAN optional for infrastructure SDs', () => {
      const workflow = WORKFLOW_BY_SD_TYPE.infrastructure;
      expect(workflow.optional).toContain('EXEC-TO-PLAN');
      expect(workflow.required).not.toContain('EXEC-TO-PLAN');
    });

    it('should make PLAN-TO-EXEC and EXEC-TO-PLAN optional for orchestrator SDs', () => {
      const workflow = WORKFLOW_BY_SD_TYPE.orchestrator;
      expect(workflow.optional).toContain('PLAN-TO-EXEC');
      expect(workflow.optional).toContain('EXEC-TO-PLAN');
    });

    it('should define intensity overrides for refactor SDs', () => {
      const workflow = WORKFLOW_BY_SD_TYPE.refactor;
      expect(workflow.intensityOverrides).toBeDefined();
      expect(workflow.intensityOverrides.cosmetic).toBeDefined();
      expect(workflow.intensityOverrides.structural).toBeDefined();
      expect(workflow.intensityOverrides.architectural).toBeDefined();
    });
  });

  describe('getWorkflowForType', () => {
    it('should return correct workflow for known SD type', () => {
      const workflow = getWorkflowForType('infrastructure');
      expect(workflow.name).toContain('Infrastructure');
    });

    it('should fall back to feature workflow for unknown SD type', () => {
      const workflow = getWorkflowForType('unknown_type');
      expect(workflow).toEqual(WORKFLOW_BY_SD_TYPE.feature);
    });
  });

  describe('isHandoffRequired', () => {
    it('should return true for required handoffs', () => {
      expect(isHandoffRequired('feature', 'LEAD-TO-PLAN')).toBe(true);
      expect(isHandoffRequired('feature', 'EXEC-TO-PLAN')).toBe(true);
    });

    it('should return false for optional handoffs', () => {
      expect(isHandoffRequired('infrastructure', 'EXEC-TO-PLAN')).toBe(false);
    });

    it('should handle case-insensitive handoff type', () => {
      expect(isHandoffRequired('feature', 'lead-to-plan')).toBe(true);
    });
  });

  describe('isHandoffOptional', () => {
    it('should return true for optional handoffs', () => {
      expect(isHandoffOptional('infrastructure', 'EXEC-TO-PLAN')).toBe(true);
    });

    it('should return false for required handoffs', () => {
      expect(isHandoffOptional('feature', 'LEAD-TO-PLAN')).toBe(false);
    });
  });
});

// ============================================================
// 5. RESULT BUILDER
// ============================================================

describe('ResultBuilder', () => {
  describe('success', () => {
    it('should create a success response', () => {
      const result = ResultBuilder.success({ handoffId: '123' });
      expect(result.success).toBe(true);
      expect(result.handoffId).toBe('123');
    });

    it('should create a minimal success response with no data', () => {
      const result = ResultBuilder.success();
      expect(result.success).toBe(true);
    });
  });

  describe('rejected', () => {
    it('should create a rejection response with reason code', () => {
      const result = ResultBuilder.rejected('NO_PRD', 'PRD not found');

      expect(result.success).toBe(false);
      expect(result.rejected).toBe(true);
      expect(result.reasonCode).toBe('NO_PRD');
      expect(result.message).toBe('PRD not found');
    });

    it('should include details when provided', () => {
      const result = ResultBuilder.rejected('TEST_CODE', 'msg', { table: 'foo' });
      expect(result.details.table).toBe('foo');
    });

    it('should include remediation from centralized mapping for known codes', () => {
      const result = ResultBuilder.rejected('NO_PRD', 'PRD missing');
      // NO_PRD has a mapping in rejection-subagent-mapping.js
      expect(result.remediation).toBeTruthy();
    });
  });

  describe('systemError', () => {
    it('should create a system error response from Error object', () => {
      const result = ResultBuilder.systemError(new Error('DB timeout'));

      expect(result.success).toBe(false);
      expect(result.systemError).toBe(true);
      expect(result.error).toBe('DB timeout');
      expect(result.reasonCode).toBe('SYSTEM_ERROR');
    });

    it('should create a system error response from string', () => {
      const result = ResultBuilder.systemError('Connection lost');
      expect(result.error).toBe('Connection lost');
    });
  });

  describe('notFound', () => {
    it('should create a not-found response with correct reason code', () => {
      const result = ResultBuilder.notFound('SD', 'SD-TEST-001');

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('SD_NOT_FOUND');
      expect(result.message).toContain('SD-TEST-001');
    });
  });

  describe('unsupportedType', () => {
    it('should list supported types in the message', () => {
      const result = ResultBuilder.unsupportedType('INVALID-TYPE', ['LEAD-TO-PLAN', 'PLAN-TO-EXEC']);

      expect(result.success).toBe(false);
      expect(result.reasonCode).toBe('UNSUPPORTED_HANDOFF_TYPE');
      expect(result.message).toContain('INVALID-TYPE');
      expect(result.message).toContain('LEAD-TO-PLAN');
      expect(result.message).toContain('PLAN-TO-EXEC');
    });
  });

  describe('gateFailure', () => {
    it('should create a gate failure with reason code based on gate name', () => {
      const result = ResultBuilder.gateFailure('GATE1', {
        issues: ['Missing architecture', 'No database review']
      });

      expect(result.reasonCode).toBe('GATE1_FAILED');
      expect(result.message).toContain('GATE1');
      expect(result.message).toContain('Missing architecture');
    });
  });

  describe('fieldError', () => {
    it('should create a field-level error with table and path', () => {
      const result = ResultBuilder.fieldError(
        'sd_phase_handoffs',
        'metadata.gate2_validation',
        'Missing required field'
      );

      expect(result.reasonCode).toBe('DATABASE_FIELD_ERROR');
      expect(result.details.table).toBe('sd_phase_handoffs');
      expect(result.details.field).toBe('metadata.gate2_validation');
      expect(result.details.fullPath).toBe('sd_phase_handoffs.metadata.gate2_validation');
    });
  });
});

// ============================================================
// 6. BYPASS RUBRIC
// ============================================================

describe('Bypass Rubric', () => {
  describe('validateBypassReason', () => {
    it('should reject empty or null reasons', () => {
      expect(validateBypassReason(null).allowed).toBe(false);
      expect(validateBypassReason('').allowed).toBe(false);
      expect(validateBypassReason(undefined).allowed).toBe(false);
    });

    it('should reject illegitimate reason: gate too strict', () => {
      const result = validateBypassReason('The gate threshold is too strict for this SD');
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('GATE_TOO_STRICT');
    });

    it('should reject illegitimate reason: taking too long', () => {
      const result = validateBypassReason('This is taking too long, just skip it');
      expect(result.allowed).toBe(false);
      expect(result.category).toBe('ILLEGITIMATE');
      expect(result.matchedRule).toBe('TAKING_TOO_LONG');
    });

    it('should allow legitimate reason: environment down', () => {
      const result = validateBypassReason('Staging test environment is down and unreachable');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('LEGITIMATE');
      expect(result.matchedRule).toBe('ENV_UNAVAILABLE');
    });

    it('should allow legitimate reason: external API outage', () => {
      const result = validateBypassReason('The external third-party API has an outage');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('LEGITIMATE');
      expect(result.matchedRule).toBe('EXTERNAL_API_DOWN');
    });

    it('should allow legitimate reason: tooling bug', () => {
      const result = validateBypassReason('The gate validator has a known bug causing false positives');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('LEGITIMATE');
      expect(result.matchedRule).toBe('TOOLING_BUG');
    });

    it('should allow unclassified reasons with UNCLASSIFIED category', () => {
      const result = validateBypassReason('Unique scenario that does not match any pattern at all xyz');
      expect(result.allowed).toBe(true);
      expect(result.category).toBe('UNCLASSIFIED');
      expect(result.matchedRule).toBeNull();
    });
  });
});

// ============================================================
// 7. HANDOFF ORCHESTRATOR SELF-CRITIQUE + TYPE SUPPORT
// ============================================================

describe('HandoffOrchestrator', () => {
  describe('supportedHandoffs', () => {
    it('should support all 5 handoff types', () => {
      const orchestrator = new HandoffOrchestrator({
        supabase: {},
        sdRepo: {},
        prdRepo: {},
        handoffRepo: {},
        validationOrchestrator: {},
        contentBuilder: {},
        recorder: {}
      });

      expect(orchestrator.supportedHandoffs).toContain('LEAD-TO-PLAN');
      expect(orchestrator.supportedHandoffs).toContain('PLAN-TO-EXEC');
      expect(orchestrator.supportedHandoffs).toContain('EXEC-TO-PLAN');
      expect(orchestrator.supportedHandoffs).toContain('PLAN-TO-LEAD');
      expect(orchestrator.supportedHandoffs).toContain('LEAD-FINAL-APPROVAL');
      expect(orchestrator.supportedHandoffs).toHaveLength(5);
    });
  });

  describe('registerExecutor', () => {
    it('should register and retrieve a custom executor', async () => {
      const orchestrator = new HandoffOrchestrator({
        supabase: {},
        sdRepo: {},
        prdRepo: {},
        handoffRepo: {},
        validationOrchestrator: {},
        contentBuilder: {},
        recorder: {}
      });

      const mockExecutor = { execute: vi.fn() };
      orchestrator.registerExecutor('CUSTOM-TYPE', mockExecutor);

      // Access internal executors
      const retrieved = orchestrator._executors['CUSTOM-TYPE'];
      expect(retrieved).toBe(mockExecutor);
    });

    it('should normalize executor type to uppercase', () => {
      const orchestrator = new HandoffOrchestrator({
        supabase: {},
        sdRepo: {},
        prdRepo: {},
        handoffRepo: {},
        validationOrchestrator: {},
        contentBuilder: {},
        recorder: {}
      });

      const mockExecutor = { execute: vi.fn() };
      orchestrator.registerExecutor('lower-case', mockExecutor);

      expect(orchestrator._executors['LOWER-CASE']).toBe(mockExecutor);
    });
  });

  describe('_validateSelfCritique', () => {
    let orchestrator;

    beforeEach(() => {
      orchestrator = new HandoffOrchestrator({
        supabase: {},
        sdRepo: {},
        prdRepo: {},
        handoffRepo: {},
        validationOrchestrator: {},
        contentBuilder: {},
        recorder: {}
      });
    });

    it('should not block when no self-critique provided (soft enforcement)', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {});

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBeNull();
    });

    it('should pass with high confidence (>=7)', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: { confidence: 8, reasoning: 'All gates reviewed' }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(false);
      expect(result.confidence).toBe(8);
    });

    it('should warn but allow with medium confidence (5-6)', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: { confidence: 5, reasoning: 'Some concerns' }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBe(5);
    });

    it('should block low confidence (<5) without explanation', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: { confidence: 3 }
      });

      expect(result.blocked).toBe(true);
      expect(result.confidence).toBe(3);
    });

    it('should allow low confidence with sufficient explanation', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        self_critique: {
          confidence: 3,
          reasoning: 'Infrastructure SD with no code changes - standard low confidence for process-only SDs is expected'
        }
      });

      expect(result.blocked).toBe(false);
      expect(result.warning).toBe(true);
      expect(result.confidence).toBe(3);
    });

    it('should accept numeric confidence directly', () => {
      const result = orchestrator._validateSelfCritique('PLAN-TO-EXEC', {
        confidence: 9
      });

      expect(result.blocked).toBe(false);
      expect(result.confidence).toBe(9);
    });
  });
});
