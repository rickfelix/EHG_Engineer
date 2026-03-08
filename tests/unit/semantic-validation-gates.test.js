/**
 * Semantic Validation Gates — Comprehensive Test Suite
 * SD-LEO-FEAT-SEMANTIC-VALIDATION-GATES-002
 *
 * Tests:
 * 1. All 11 files can be imported without errors
 * 2. Shared utility exports are correct and functional
 * 3. Gate factories return objects with correct shape
 * 4. Gate validators produce results matching the contract
 * 5. Applicability-based skip behavior
 * 6. Error/fallback handling (no supabase, no sdId)
 * 7. Mock Supabase integration tests for gate logic
 */

import { describe, it, expect, vi } from 'vitest';

// ────────────────────────────────────────────────
// MOCK SUPABASE HELPER
// ────────────────────────────────────────────────

/**
 * Creates a mock Supabase client where every query builder method
 * returns a chainable, thenable object. When awaited, resolves to
 * { data: <array from tableData>, error: null }.
 * Calling .single() resolves to { data: <first element or object>, error: null }.
 */
function createMockSupabase(tableData = {}) {
  function makeChain(data, error = null) {
    const arrayData = Array.isArray(data) ? data : (data != null ? [data] : []);
    const singleData = Array.isArray(data) ? (data[0] || null) : data;

    const chain = {
      // Thenable: await chain resolves to array result
      then(resolve, reject) {
        return Promise.resolve({ data: arrayData, error }).then(resolve, reject);
      },
      // Terminal: .single() resolves to single result
      single() {
        return Promise.resolve({ data: singleData, error });
      },
      // All chaining methods return a new chain with same data
      eq()    { return makeChain(data, error); },
      neq()   { return makeChain(data, error); },
      in()    { return makeChain(data, error); },
      limit() { return makeChain(data, error); },
      order() { return makeChain(data, error); },
    };
    return chain;
  }

  return {
    from(table) {
      const data = tableData[table] !== undefined ? tableData[table] : null;
      return {
        select() { return makeChain(data); },
      };
    },
  };
}

/** Required fields in every semantic gate result */
const REQUIRED_RESULT_FIELDS = ['passed', 'score', 'maxScore', 'confidence', 'semantic', 'issues', 'warnings', 'details'];

function assertValidResult(result) {
  for (const field of REQUIRED_RESULT_FIELDS) {
    expect(result).toHaveProperty(field);
  }
  expect(result.passed).toBeTypeOf('boolean');
  expect(result.score).toBeTypeOf('number');
  expect(result.maxScore).toBeTypeOf('number');
  expect(result.confidence).toBeTypeOf('number');
  expect(result.confidence).toBeGreaterThanOrEqual(0);
  expect(result.confidence).toBeLessThanOrEqual(1.0);
  expect(result.semantic).toBe(true);
  expect(Array.isArray(result.issues)).toBe(true);
  expect(Array.isArray(result.warnings)).toBe(true);
  expect(result.details).toBeTypeOf('object');
}

// ────────────────────────────────────────────────
// 1. IMPORT VERIFICATION
// ────────────────────────────────────────────────

describe('Semantic Validation Gates — Import Verification', () => {
  it('imports semantic-gate-utils.js without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/validation/semantic-gate-utils.js');
    expect(mod).toBeDefined();
  });

  it('imports scope-audit.js (Gate 1) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js');
    expect(mod).toBeDefined();
    expect(mod.createScopeAuditGate).toBeTypeOf('function');
  });

  it('imports deliverables-completeness.js (Gate 2) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js');
    expect(mod).toBeDefined();
    expect(mod.createDeliverablesCompletenessGate).toBeTypeOf('function');
  });

  it('imports child-scope-coverage.js (Gate 3) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js');
    expect(mod).toBeDefined();
    expect(mod.createChildScopeCoverageGate).toBeTypeOf('function');
  });

  it('imports vision-dimension-completeness.js (Gate 4) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js');
    expect(mod).toBeDefined();
    expect(mod.createVisionDimensionCompletenessGate).toBeTypeOf('function');
  });

  it('imports smoke-test-validation.js (Gate 5) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js');
    expect(mod).toBeDefined();
    expect(mod.createSmokeTestValidationGate).toBeTypeOf('function');
  });

  it('imports scope-reduction-verification.js (Gate 6) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js');
    expect(mod).toBeDefined();
    expect(mod.createScopeReductionVerificationGate).toBeTypeOf('function');
  });

  it('imports architecture-requirement-trace.js (Gate 7) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/architecture-requirement-trace.js');
    expect(mod).toBeDefined();
    expect(mod.createArchitectureRequirementTraceGate).toBeTypeOf('function');
  });

  it('imports user-story-coverage.js (Gate 8) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js');
    expect(mod).toBeDefined();
    expect(mod.createUserStoryCoverageGate).toBeTypeOf('function');
  });

  it('imports sd-type-compatibility.js (Gate 9) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-compatibility.js');
    expect(mod).toBeDefined();
    expect(mod.createSdTypeCompatibilityGate).toBeTypeOf('function');
  });

  it('imports overlapping-scope-detection.js (Gate 10) without errors', async () => {
    const mod = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js');
    expect(mod).toBeDefined();
    expect(mod.createOverlappingScopeDetectionGate).toBeTypeOf('function');
  });
});

// ────────────────────────────────────────────────
// 2. SHARED UTILITY TESTS
// ────────────────────────────────────────────────

describe('semantic-gate-utils.js — Shared Utilities', () => {
  let utils;

  beforeAll(async () => {
    utils = await import('../../scripts/modules/handoff/validation/semantic-gate-utils.js');
  });

  describe('SEMANTIC_GATE_APPLICABILITY', () => {
    it('exports SEMANTIC_GATE_APPLICABILITY as an object', () => {
      expect(utils.SEMANTIC_GATE_APPLICABILITY).toBeTypeOf('object');
    });

    it('contains all 9 gate keys', () => {
      const expectedKeys = [
        'SCOPE_AUDIT', 'DELIVERABLES_COMPLETENESS', 'CHILD_SCOPE_COVERAGE',
        'VISION_DIMENSION_COMPLETENESS', 'SMOKE_TEST_VALIDATION',
        'SCOPE_REDUCTION_VERIFICATION', 'ARCHITECTURE_REQUIREMENT_TRACE',
        'USER_STORY_COVERAGE', 'OVERLAPPING_SCOPE_DETECTION'
      ];
      for (const key of expectedKeys) {
        expect(utils.SEMANTIC_GATE_APPLICABILITY).toHaveProperty(key);
      }
    });

    it('each entry has all standard SD type keys with valid values', () => {
      const sdTypes = ['feature', 'bugfix', 'infrastructure', 'documentation', 'security', 'refactor', 'orchestrator', 'database', 'enhancement'];
      for (const [gateName, matrix] of Object.entries(utils.SEMANTIC_GATE_APPLICABILITY)) {
        for (const sdType of sdTypes) {
          expect(matrix).toHaveProperty(sdType);
          expect(['REQ', 'OPT', 'SKIP']).toContain(matrix[sdType]);
        }
      }
    });

    it('CHILD_SCOPE_COVERAGE is REQ only for orchestrator type', () => {
      const matrix = utils.SEMANTIC_GATE_APPLICABILITY.CHILD_SCOPE_COVERAGE;
      expect(matrix.orchestrator).toBe('REQ');
      expect(matrix.feature).toBe('SKIP');
      expect(matrix.bugfix).toBe('SKIP');
    });
  });

  describe('getGateApplicability()', () => {
    it('returns applicable=true and level=REQ for a known required combo', () => {
      expect(utils.getGateApplicability('SCOPE_AUDIT', 'feature')).toEqual({ applicable: true, level: 'REQ' });
    });

    it('returns applicable=true and level=OPT for optional combos', () => {
      expect(utils.getGateApplicability('SCOPE_AUDIT', 'infrastructure')).toEqual({ applicable: true, level: 'OPT' });
    });

    it('returns applicable=false and level=SKIP for non-applicable combos', () => {
      expect(utils.getGateApplicability('SCOPE_AUDIT', 'documentation')).toEqual({ applicable: false, level: 'SKIP' });
    });

    it('defaults to REQ for unknown gate names', () => {
      expect(utils.getGateApplicability('UNKNOWN_GATE', 'feature')).toEqual({ applicable: true, level: 'REQ' });
    });

    it('defaults sdType to feature when null/undefined', () => {
      expect(utils.getGateApplicability('SCOPE_AUDIT', null).level).toBe('REQ');
    });

    it('normalizes sdType to lowercase', () => {
      expect(utils.getGateApplicability('SCOPE_AUDIT', 'Feature').level).toBe('REQ');
    });
  });

  describe('computeConfidence()', () => {
    it('returns 0.3 when hasDatabase is false', () => {
      expect(utils.computeConfidence({ dataPoints: 5, expectedPoints: 5, hasDatabase: false })).toBe(0.3);
    });

    it('returns 1.0 when expectedPoints is 0', () => {
      expect(utils.computeConfidence({ dataPoints: 0, expectedPoints: 0 })).toBe(1.0);
    });

    it('returns 1.0 when data is complete', () => {
      expect(utils.computeConfidence({ dataPoints: 5, expectedPoints: 5 })).toBe(1.0);
    });

    it('returns 0.5 when no data points (but DB available)', () => {
      expect(utils.computeConfidence({ dataPoints: 0, expectedPoints: 5 })).toBe(0.5);
    });

    it('returns between 0.5 and 1.0 for partial data', () => {
      const result = utils.computeConfidence({ dataPoints: 3, expectedPoints: 6 });
      expect(result).toBeGreaterThanOrEqual(0.5);
      expect(result).toBeLessThanOrEqual(1.0);
    });

    it('caps ratio at 1.0 when more data than expected', () => {
      expect(utils.computeConfidence({ dataPoints: 10, expectedPoints: 5 })).toBe(1.0);
    });

    it('defaults hasDatabase to true', () => {
      expect(utils.computeConfidence({ dataPoints: 5, expectedPoints: 5 })).toBe(1.0);
    });
  });

  describe('isAutoGenerated()', () => {
    it('returns false for null/undefined', () => {
      expect(utils.isAutoGenerated(null)).toBe(false);
      expect(utils.isAutoGenerated(undefined)).toBe(false);
    });

    it('returns false for normal items', () => {
      expect(utils.isAutoGenerated({ title: 'Normal task' })).toBe(false);
    });

    it('detects generated_by AUTO_HOOK', () => {
      expect(utils.isAutoGenerated({ generated_by: 'AUTO_HOOK' })).toBe(true);
    });

    it('detects trigger_event AUTO_FIX', () => {
      expect(utils.isAutoGenerated({ trigger_event: 'AUTO_FIX' })).toBe(true);
    });

    it('detects created_by auto-fix-guardian', () => {
      expect(utils.isAutoGenerated({ created_by: 'auto-fix-guardian' })).toBe(true);
    });

    it('detects metadata.auto_generated', () => {
      expect(utils.isAutoGenerated({ metadata: { auto_generated: true } })).toBe(true);
    });

    it('detects metadata.source auto-completion', () => {
      expect(utils.isAutoGenerated({ metadata: { source: 'auto-completion' } })).toBe(true);
    });

    it('returns false when metadata exists but no auto markers', () => {
      expect(utils.isAutoGenerated({ metadata: { author: 'human' } })).toBe(false);
    });
  });

  describe('buildSemanticResult()', () => {
    it('builds a valid result with all required fields', () => {
      const result = utils.buildSemanticResult({ passed: true, score: 90, confidence: 0.9 });
      expect(result).toHaveProperty('passed', true);
      expect(result).toHaveProperty('score', 90);
      expect(result).toHaveProperty('maxScore', 100);
      expect(result).toHaveProperty('confidence', 0.9);
      expect(result).toHaveProperty('semantic', true);
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('details');
      expect(result.details).toHaveProperty('confidence', 0.9);
      expect(result.details).toHaveProperty('semantic', true);
    });

    it('degrades blocking to warning when confidence < 0.7', () => {
      const result = utils.buildSemanticResult({
        passed: false, score: 20, confidence: 0.5, issues: ['Something failed']
      });
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.warnings).toContainEqual(expect.stringContaining('Low confidence'));
    });

    it('does NOT degrade when confidence >= 0.7', () => {
      const result = utils.buildSemanticResult({
        passed: false, score: 20, confidence: 0.8, issues: ['Something failed']
      });
      expect(result.passed).toBe(false);
      expect(result.issues).toContain('Something failed');
    });

    it('includes remediation only when not passed', () => {
      const failing = utils.buildSemanticResult({ passed: false, score: 20, confidence: 0.9, remediation: 'Fix it' });
      expect(failing).toHaveProperty('remediation', 'Fix it');
      const passing = utils.buildSemanticResult({ passed: true, score: 90, confidence: 0.9, remediation: 'Fix it' });
      expect(passing).not.toHaveProperty('remediation');
    });

    it('merges custom details with confidence and semantic flag', () => {
      const result = utils.buildSemanticResult({ passed: true, score: 100, confidence: 1.0, details: { custom: 'value' } });
      expect(result.details).toEqual({ custom: 'value', confidence: 1.0, semantic: true });
    });
  });

  describe('buildSkipResult()', () => {
    it('builds a valid skip result', () => {
      const result = utils.buildSkipResult('SCOPE_AUDIT', 'documentation');
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.maxScore).toBe(100);
      expect(result.confidence).toBe(1.0);
      expect(result.semantic).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.warnings).toContainEqual(expect.stringContaining('skipped'));
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
      expect(result.details).toHaveProperty('sd_type', 'documentation');
      expect(result.details).toHaveProperty('skipped', true);
    });
  });
});

// ────────────────────────────────────────────────
// 3. GATE FACTORY SHAPE VALIDATION
// ────────────────────────────────────────────────

describe('Semantic Validation Gates — Factory Shape Validation', () => {
  const mockSupabase = {};

  const gateFactories = [
    { name: 'scope-audit', importPath: '../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js', fnName: 'createScopeAuditGate', expectedName: 'SCOPE_AUDIT' },
    { name: 'deliverables-completeness', importPath: '../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js', fnName: 'createDeliverablesCompletenessGate', expectedName: 'DELIVERABLES_COMPLETENESS' },
    { name: 'child-scope-coverage', importPath: '../../scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js', fnName: 'createChildScopeCoverageGate', expectedName: 'CHILD_SCOPE_COVERAGE' },
    { name: 'vision-dimension-completeness', importPath: '../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js', fnName: 'createVisionDimensionCompletenessGate', expectedName: 'VISION_DIMENSION_COMPLETENESS' },
    { name: 'smoke-test-validation', importPath: '../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js', fnName: 'createSmokeTestValidationGate', expectedName: 'SMOKE_TEST_VALIDATION' },
    { name: 'scope-reduction-verification', importPath: '../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js', fnName: 'createScopeReductionVerificationGate', expectedName: 'SCOPE_REDUCTION_VERIFICATION' },
    { name: 'architecture-requirement-trace', importPath: '../../scripts/modules/handoff/executors/plan-to-exec/gates/architecture-requirement-trace.js', fnName: 'createArchitectureRequirementTraceGate', expectedName: 'ARCHITECTURE_REQUIREMENT_TRACE' },
    { name: 'user-story-coverage', importPath: '../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js', fnName: 'createUserStoryCoverageGate', expectedName: 'USER_STORY_COVERAGE' },
    { name: 'sd-type-compatibility', importPath: '../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-compatibility.js', fnName: 'createSdTypeCompatibilityGate', expectedName: 'SD_TYPE_COMPATIBILITY' },
    { name: 'overlapping-scope-detection', importPath: '../../scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js', fnName: 'createOverlappingScopeDetectionGate', expectedName: 'OVERLAPPING_SCOPE_DETECTION' },
  ];

  for (const gf of gateFactories) {
    describe(`${gf.name} gate factory`, () => {
      let gate;

      beforeAll(async () => {
        const mod = await import(gf.importPath);
        gate = mod[gf.fnName](mockSupabase);
      });

      it('returns an object with name property', () => {
        expect(gate).toHaveProperty('name', gf.expectedName);
      });

      it('returns an object with validator as async function', () => {
        expect(gate).toHaveProperty('validator');
        expect(gate.validator).toBeTypeOf('function');
      });

      it('returns an object with required as boolean', () => {
        expect(gate).toHaveProperty('required');
        expect(gate.required).toBeTypeOf('boolean');
      });

      it('returns an object with weight as number between 0 and 1', () => {
        expect(gate).toHaveProperty('weight');
        expect(gate.weight).toBeTypeOf('number');
        expect(gate.weight).toBeGreaterThan(0);
        expect(gate.weight).toBeLessThanOrEqual(1.0);
      });
    });
  }
});

// ────────────────────────────────────────────────
// 4. GATE VALIDATOR — RESULT CONTRACT TESTS
// ────────────────────────────────────────────────

describe('Semantic Validation Gates — Result Contract', () => {

  describe('gates with no supabase (fallback behavior)', () => {
    it('scope-audit returns valid result with no supabase', async () => {
      const { createScopeAuditGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js');
      const gate = createScopeAuditGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('deliverables-completeness returns valid result with no supabase', async () => {
      const { createDeliverablesCompletenessGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js');
      const gate = createDeliverablesCompletenessGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('smoke-test-validation returns valid result with no supabase', async () => {
      const { createSmokeTestValidationGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js');
      const gate = createSmokeTestValidationGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('user-story-coverage returns valid result with no supabase', async () => {
      const { createUserStoryCoverageGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js');
      const gate = createUserStoryCoverageGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('overlapping-scope-detection returns valid result with no supabase', async () => {
      const { createOverlappingScopeDetectionGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js');
      const gate = createOverlappingScopeDetectionGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('scope-reduction-verification returns valid result with no supabase', async () => {
      const { createScopeReductionVerificationGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js');
      const gate = createScopeReductionVerificationGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('vision-dimension-completeness returns valid result with no supabase', async () => {
      const { createVisionDimensionCompletenessGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js');
      const gate = createVisionDimensionCompletenessGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('architecture-requirement-trace returns valid result with no supabase', async () => {
      const { createArchitectureRequirementTraceGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/architecture-requirement-trace.js');
      const gate = createArchitectureRequirementTraceGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });

    it('child-scope-coverage returns valid result with no supabase', async () => {
      const { createChildScopeCoverageGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js');
      const gate = createChildScopeCoverageGate(null);
      const result = await gate.validator({ sd: { sd_type: 'orchestrator' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('gates with skip behavior for non-applicable SD types', () => {
    it('scope-audit skips for documentation type', async () => {
      const { createScopeAuditGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js');
      const gate = createScopeAuditGate(null);
      const result = await gate.validator({ sd: { sd_type: 'documentation' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    });

    it('child-scope-coverage skips for feature type', async () => {
      const { createChildScopeCoverageGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/child-scope-coverage.js');
      const gate = createChildScopeCoverageGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    });

    it('smoke-test-validation skips for documentation type', async () => {
      const { createSmokeTestValidationGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js');
      const gate = createSmokeTestValidationGate(null);
      const result = await gate.validator({ sd: { sd_type: 'documentation' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    });

    it('vision-dimension-completeness skips for documentation type', async () => {
      const { createVisionDimensionCompletenessGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js');
      const gate = createVisionDimensionCompletenessGate(null);
      const result = await gate.validator({ sd: { sd_type: 'documentation' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    });
  });

  describe('sd-type-compatibility — special skip for standalone SDs', () => {
    it('skips when no parent_sd_id in context', async () => {
      const { createSdTypeCompatibilityGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-compatibility.js');
      const gate = createSdTypeCompatibilityGate(null);
      const result = await gate.validator({ sd: { sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.skipReason).toBe('NON_APPLICABLE_SD_TYPE');
    });
  });
});

// ────────────────────────────────────────────────
// 5. GATE VALIDATORS WITH MOCK SUPABASE
// ────────────────────────────────────────────────

describe('Semantic Validation Gates — Mock Supabase Integration', () => {

  describe('scope-audit with mock data', () => {
    it('returns passing result when deliverables are completed', async () => {
      const { createScopeAuditGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { scope: 'Build auth', key_changes: ['Add login', 'Add signup'], success_criteria: ['Users can login'] },
        sd_scope_deliverables: [
          { title: 'Login page', completion_status: 'completed', category: 'ui' },
          { title: 'Signup page', completion_status: 'completed', category: 'ui' },
        ],
        product_requirements_v2: { functional_requirements: ['Login flow', 'Signup flow'], acceptance_criteria: [] }
      });
      const gate = createScopeAuditGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('returns failing result when deliverables are mostly incomplete', async () => {
      const { createScopeAuditGate } = await import('../../scripts/modules/handoff/executors/plan-to-lead/gates/scope-audit.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { scope: 'Build auth', key_changes: ['Add login', 'Add signup', 'Add reset', 'Add profile', 'Add dashboard'], success_criteria: ['Users can login', 'Users can signup'] },
        sd_scope_deliverables: [
          { title: 'Login page', completion_status: 'completed', category: 'ui' },
          { title: 'Signup page', completion_status: 'pending', category: 'ui' },
          { title: 'Reset page', completion_status: 'pending', category: 'ui' },
          { title: 'Profile page', completion_status: 'pending', category: 'ui' },
          { title: 'Dashboard', completion_status: 'pending', category: 'ui' },
        ],
        product_requirements_v2: { functional_requirements: ['Login flow', 'Signup flow', 'Reset flow'], acceptance_criteria: [] }
      });
      const gate = createScopeAuditGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(20); // 1/5 = 20%
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.passed).toBe(false);
    });
  });

  describe('deliverables-completeness with mock data', () => {
    it('excludes auto-generated deliverables from scoring', async () => {
      const { createDeliverablesCompletenessGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js');
      const mockSb = createMockSupabase({
        sd_scope_deliverables: [
          { id: 1, title: 'Real deliverable', completion_status: 'completed', metadata: {}, created_by: 'human' },
          { id: 2, title: 'Auto deliverable', completion_status: 'completed', metadata: {}, created_by: 'auto-fix-guardian' },
        ]
      });
      const gate = createDeliverablesCompletenessGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.details.autoGenerated).toBe(1);
      expect(result.details.completed).toBe(1);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('returns no-deliverables result when table is empty', async () => {
      const { createDeliverablesCompletenessGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js');
      const mockSb = createMockSupabase({ sd_scope_deliverables: [] });
      const gate = createDeliverablesCompletenessGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(false); // REQ level + no deliverables
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('scope-reduction-verification with mock data', () => {
    it('passes when reduction meets threshold', async () => {
      const { createScopeReductionVerificationGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { scope_reduction_percentage: 15, scope: 'test', metadata: {} }
      });
      const gate = createScopeReductionVerificationGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('fails when reduction is below threshold', async () => {
      const { createScopeReductionVerificationGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { scope_reduction_percentage: 5, scope: 'test', metadata: {} }
      });
      const gate = createScopeReductionVerificationGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(50);
      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('handles null scope_reduction_percentage', async () => {
      const { createScopeReductionVerificationGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/scope-reduction-verification.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { scope_reduction_percentage: null, scope: 'test', metadata: {} }
      });
      const gate = createScopeReductionVerificationGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.issues.length + result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('smoke-test-validation with mock data', () => {
    it('passes with substantive test scenarios', async () => {
      const { createSmokeTestValidationGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js');
      const mockSb = createMockSupabase({
        product_requirements_v2: {
          test_scenarios: [
            'Verify that users can log in with valid credentials and are redirected to dashboard',
            'Verify that invalid login attempts show an error message within 2 seconds',
            'Verify that the signup form validates email format before submission'
          ],
          exec_checklist: ['Check build', 'Check tests']
        }
      });
      const gate = createSmokeTestValidationGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('scores zero with overly brief test scenarios', async () => {
      const { createSmokeTestValidationGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/smoke-test-validation.js');
      const mockSb = createMockSupabase({
        product_requirements_v2: {
          test_scenarios: ['Test login', 'Test signup', 'Test reset'],
          exec_checklist: []
        }
      });
      const gate = createSmokeTestValidationGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(0);
    });
  });

  describe('user-story-coverage with mock data', () => {
    it('passes when stories are validated with acceptance criteria', async () => {
      const { createUserStoryCoverageGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js');
      const mockSb = createMockSupabase({
        user_stories: [
          { id: 1, story_key: '001:US-001', title: 'Login flow', status: 'completed', validation_status: 'validated', acceptance_criteria: ['AC1'], created_by: 'human', metadata: {} },
          { id: 2, story_key: '001:US-002', title: 'Signup flow', status: 'testing', validation_status: 'in_progress', acceptance_criteria: ['AC2'], created_by: 'human', metadata: {} },
        ]
      });
      const gate = createUserStoryCoverageGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });

    it('detects uncovered stories without acceptance criteria', async () => {
      const { createUserStoryCoverageGate } = await import('../../scripts/modules/handoff/executors/exec-to-plan/gates/user-story-coverage.js');
      const mockSb = createMockSupabase({
        user_stories: [
          { id: 1, story_key: '001:US-001', title: 'Login', status: 'draft', validation_status: null, acceptance_criteria: [], created_by: 'human', metadata: {} },
        ]
      });
      const gate = createUserStoryCoverageGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(0);
    });
  });

  describe('vision-dimension-completeness with mock data', () => {
    it('passes with high vision score', async () => {
      const { createVisionDimensionCompletenessGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js');
      const mockSb = createMockSupabase({
        eva_vision_scores: [
          { score: 85, dimensions: { clarity: 90, feasibility: 80, alignment: 85 }, scored_at: '2026-03-08' }
        ]
      });
      const gate = createVisionDimensionCompletenessGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(85);
    });

    it('fails with low vision score for REQ type', async () => {
      const { createVisionDimensionCompletenessGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/vision-dimension-completeness.js');
      const mockSb = createMockSupabase({
        eva_vision_scores: [
          { score: 40, dimensions: { clarity: 30, feasibility: 50 }, scored_at: '2026-03-08' }
        ]
      });
      const gate = createVisionDimensionCompletenessGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(40);
      expect(result.passed).toBe(false);
    });
  });

  describe('architecture-requirement-trace with mock data', () => {
    it('passes with complete architecture traces', async () => {
      const { createArchitectureRequirementTraceGate } = await import('../../scripts/modules/handoff/executors/plan-to-exec/gates/architecture-requirement-trace.js');
      const mockSb = createMockSupabase({
        eva_architecture_plans: [
          { plan_key: 'ARCH-001', dimensions: { scalability: 80, security: 90 }, status: 'approved' }
        ],
        product_requirements_v2: {
          functional_requirements: ['FR-1: User login', 'FR-2: User registration'],
          system_architecture: { components: ['AuthService', 'UserStore'], patterns: ['CQRS'] },
          technical_requirements: ['Node.js 20+', 'PostgreSQL 15+']
        }
      });
      const gate = createArchitectureRequirementTraceGate(mockSb);
      const result = await gate.validator({ sd: { id: 'test-id', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
    });
  });

  describe('sd-type-compatibility with mock data', () => {
    it('passes for compatible parent-child types', async () => {
      const { createSdTypeCompatibilityGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-compatibility.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { sd_type: 'orchestrator', title: 'Parent SD' }
      });
      const gate = createSdTypeCompatibilityGate(mockSb);
      const result = await gate.validator({
        sd: { id: 'child-id', sd_type: 'feature', parent_sd_id: 'parent-id' }
      });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(100);
    });

    it('fails for incompatible parent-child types', async () => {
      const { createSdTypeCompatibilityGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/sd-type-compatibility.js');
      const mockSb = createMockSupabase({
        strategic_directives_v2: { sd_type: 'security', title: 'Security Parent' }
      });
      const gate = createSdTypeCompatibilityGate(mockSb);
      const result = await gate.validator({
        sd: { id: 'child-id', sd_type: 'documentation', parent_sd_id: 'parent-id' }
      });
      assertValidResult(result);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('overlapping-scope-detection with mock data', () => {
    it('returns a valid semantic result with overlap detection data', async () => {
      const { createOverlappingScopeDetectionGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js');
      // Note: The simplified mock returns the same data for both the "this SD" and
      // "other active SDs" queries, so the gate will see the current SD comparing
      // against itself. This test validates the result contract rather than specific
      // pass/fail logic (which requires a filtering-capable mock).
      const mockSb = createMockSupabase({
        strategic_directives_v2: [
          { id: 'sd-1', title: 'Authentication System Redesign', scope: 'Login signup password reset', description: 'Rebuild auth module', key_changes: ['OAuth support'] },
        ]
      });
      const gate = createOverlappingScopeDetectionGate(mockSb);
      const result = await gate.validator({ sd: { id: 'sd-1', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.details).toHaveProperty('activeSDs');
      expect(result.semantic).toBe(true);
    });

    it('returns valid fallback result with no supabase', async () => {
      const { createOverlappingScopeDetectionGate } = await import('../../scripts/modules/handoff/executors/lead-to-plan/gates/overlapping-scope-detection.js');
      const gate = createOverlappingScopeDetectionGate(null);
      const result = await gate.validator({ sd: { id: 'sd-1', sd_type: 'feature' } });
      assertValidResult(result);
      expect(result.passed).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });
  });
});
