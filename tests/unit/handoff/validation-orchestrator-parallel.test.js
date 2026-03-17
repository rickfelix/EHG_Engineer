/**
 * Unit tests for ValidationOrchestrator parallel gate execution
 * SD-LEO-INFRA-PARALLEL-GATE-EXECUTION-001
 *
 * Covers:
 * - Parallel execution within tiers via Promise.all()
 * - Early-exit between tiers for required gate failures
 * - Backward compatibility (gates without tier default to tier 1)
 * - Error isolation in parallel execution
 * - validateGatesAll parallel execution without early-exit
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock telemetry
vi.mock('../../../lib/telemetry/workflow-timer.js', () => ({
  startSpan: vi.fn(),
  endSpan: vi.fn()
}));

// Mock sd-type-validation
vi.mock('../../../lib/utils/sd-type-validation.js', () => ({
  shouldSkipCodeValidation: vi.fn(() => false)
}));

// Mock sd-type-applicability-policy
vi.mock('../../../scripts/modules/handoff/validation/sd-type-applicability-policy.js', () => ({
  createSkippedResult: vi.fn(),
  isSkippedResult: vi.fn(() => false),
  ValidatorStatus: { PASS: 'PASS', FAIL: 'FAIL', SKIPPED: 'SKIPPED' },
  SkipReasonCode: { NON_APPLICABLE_SD_TYPE: 'NON_APPLICABLE_SD_TYPE' }
}));

// Mock sd-type-checker
vi.mock('../../../scripts/modules/sd-type-checker.js', () => ({
  THRESHOLD_PROFILES: {
    default: { gateThreshold: 70 },
    infrastructure: { gateThreshold: 80 }
  }
}));

// Mock gate-result-schema
vi.mock('../../../scripts/modules/handoff/validation/gate-result-schema.js', () => ({
  validateGateResult: vi.fn((result, _name, _opts) => ({
    passed: result.passed ?? true,
    score: result.score ?? 100,
    maxScore: result.maxScore ?? 100,
    issues: result.issues || [],
    warnings: result.warnings || []
  }))
}));

// Mock ValidatorRegistry
vi.mock('../../../scripts/modules/handoff/validation/ValidatorRegistry.js', () => ({
  validatorRegistry: {
    getOrCreateFallback: vi.fn(),
    normalizeResult: vi.fn(r => r)
  }
}));

// Mock OIV
vi.mock('../../../scripts/modules/handoff/validation/oiv/index.js', () => {
  class MockOIVGate {
    constructor() {
      this.validateHandoff = vi.fn(() => ({ passed: true, score: 100, issues: [] }));
    }
  }
  return { OIVGate: MockOIVGate, OIV_GATE_WEIGHT: 0.15 };
});

// Mock gate-context-preloader
vi.mock('../../../scripts/modules/handoff/validation/validator-registry/gate-context-preloader.js', () => ({
  preloadGateContext: vi.fn(() => ({})),
  getGateNumberForRule: vi.fn(() => null)
}));

// Mock ResultBuilder
vi.mock('../../../scripts/modules/handoff/ResultBuilder.js', () => ({
  default: {
    logGateResult: vi.fn()
  }
}));

import { ValidationOrchestrator } from '../../../scripts/modules/handoff/validation/ValidationOrchestrator.js';

// Helper to create a gate that records execution order and timing
function createTimedGate(name, { tier, delayMs = 10, passed = true, score = 100, required = true, weight } = {}) {
  const execLog = [];
  const gate = {
    name,
    tier,
    required,
    weight,
    validator: async () => {
      const start = Date.now();
      execLog.push({ name, start });
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return { passed, score, maxScore: 100, issues: passed ? [] : [`${name} failed`], warnings: [] };
    },
    _execLog: execLog
  };
  return gate;
}

describe('ValidationOrchestrator - Parallel Gate Execution', () => {
  let orchestrator;
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
            })),
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          })),
          order: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      }))
    };
    orchestrator = new ValidationOrchestrator(mockSupabase);
    // Suppress console output in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  describe('validateGates - parallel within tiers', () => {
    it('runs gates without tier property in tier 1 (backward compat)', async () => {
      const gates = [
        createTimedGate('gate-a'),
        createTimedGate('gate-b'),
        createTimedGate('gate-c')
      ];

      const results = await orchestrator.validateGates(gates, {});

      expect(results.passed).toBe(true);
      expect(results.gateCount).toBe(3);
      expect(results.gateResults['gate-a']).toBeDefined();
      expect(results.gateResults['gate-b']).toBeDefined();
      expect(results.gateResults['gate-c']).toBeDefined();
    });

    it('executes gates within the same tier concurrently', async () => {
      // Three gates in tier 1, each taking 50ms
      // Sequential would take ~150ms, parallel should take ~50ms
      const gates = [
        createTimedGate('gate-a', { tier: 1, delayMs: 50 }),
        createTimedGate('gate-b', { tier: 1, delayMs: 50 }),
        createTimedGate('gate-c', { tier: 1, delayMs: 50 })
      ];

      const start = Date.now();
      const results = await orchestrator.validateGates(gates, {});
      const elapsed = Date.now() - start;

      expect(results.passed).toBe(true);
      expect(results.gateCount).toBe(3);
      // Parallel execution: should be ~50ms, not ~150ms
      // Allow generous margin for CI, but should be well under sequential time
      expect(elapsed).toBeLessThan(130);
    });

    it('preserves early-exit between tiers', async () => {
      const gateT0 = createTimedGate('tier0-gate', { tier: 0, passed: false, score: 0, required: true });
      const gateT1 = createTimedGate('tier1-gate', { tier: 1, delayMs: 10 });

      const results = await orchestrator.validateGates([gateT0, gateT1], {});

      expect(results.passed).toBe(false);
      expect(results.failedGate).toBe('tier0-gate');
      expect(results.gateCount).toBe(1); // tier 1 gate should not have run
      expect(results.gateResults['tier1-gate']).toBeUndefined();
    });

    it('does not early-exit for non-required gate failures', async () => {
      const gateT0 = createTimedGate('tier0-optional', { tier: 0, passed: false, score: 0, required: false });
      const gateT1 = createTimedGate('tier1-gate', { tier: 1 });

      const results = await orchestrator.validateGates([gateT0, gateT1], {});

      expect(results.passed).toBe(true); // non-required failure doesn't block
      expect(results.gateCount).toBe(2); // both gates ran
    });

    it('handles multiple tiers in order', async () => {
      const executionOrder = [];
      const makeGate = (name, tier, delayMs = 5) => ({
        name,
        tier,
        required: true,
        validator: async () => {
          await new Promise(r => setTimeout(r, delayMs));
          executionOrder.push(name);
          return { passed: true, score: 100, maxScore: 100, issues: [], warnings: [] };
        }
      });

      const gates = [
        makeGate('t2-gate', 2),
        makeGate('t0-gate', 0),
        makeGate('t1-a', 1),
        makeGate('t1-b', 1)
      ];

      const results = await orchestrator.validateGates(gates, {});

      expect(results.passed).toBe(true);
      expect(results.gateCount).toBe(4);
      // t0 should complete before t1, t1 before t2
      expect(executionOrder.indexOf('t0-gate')).toBeLessThan(executionOrder.indexOf('t1-a'));
      expect(executionOrder.indexOf('t0-gate')).toBeLessThan(executionOrder.indexOf('t1-b'));
      expect(executionOrder.indexOf('t1-a')).toBeLessThan(executionOrder.indexOf('t2-gate'));
    });

    it('produces identical scores to sequential (weighted average)', async () => {
      const gates = [
        createTimedGate('gate-a', { tier: 0, score: 80, weight: 2.0 }),
        createTimedGate('gate-b', { tier: 1, score: 100, weight: 1.0 }),
        createTimedGate('gate-c', { tier: 1, score: 60, weight: 1.0 })
      ];

      const results = await orchestrator.validateGates(gates, {});

      // Weighted average: (80*2 + 100*1 + 60*1) / (2+1+1) = 320/4 = 80
      expect(results.normalizedScore).toBe(80);
      expect(results.gateCount).toBe(3);
      expect(results.totalScore).toBe(240); // 80+100+60
    });

    it('isolates errors between gates in same tier', async () => {
      const errorGate = {
        name: 'error-gate',
        tier: 1,
        required: false,
        validator: async () => {
          throw new Error('Gate exploded');
        }
      };
      const goodGate = createTimedGate('good-gate', { tier: 1, score: 100 });

      const results = await orchestrator.validateGates([errorGate, goodGate], {});

      // Error gate should return score 0, good gate unaffected
      expect(results.gateResults['error-gate']).toBeDefined();
      expect(results.gateResults['error-gate'].score).toBe(0);
      expect(results.gateResults['good-gate']).toBeDefined();
      expect(results.gateResults['good-gate'].score).toBe(100);
      expect(results.gateCount).toBe(2);
    });

    it('skips gates with unmet conditions', async () => {
      const gates = [
        {
          name: 'conditional-gate',
          tier: 1,
          required: true,
          condition: async () => false,
          validator: async () => ({ passed: true, score: 100, maxScore: 100, issues: [], warnings: [] })
        },
        createTimedGate('normal-gate', { tier: 1 })
      ];

      const results = await orchestrator.validateGates(gates, {});

      expect(results.gateCount).toBe(1);
      expect(results.gateResults['conditional-gate']).toBeUndefined();
      expect(results.gateResults['normal-gate']).toBeDefined();
    });
  });

  describe('validateGatesAll - parallel without early-exit', () => {
    it('runs all gates even when required gates fail', async () => {
      const gates = [
        createTimedGate('fail-gate', { tier: 0, passed: false, score: 0, required: true }),
        createTimedGate('pass-gate', { tier: 1, score: 100 })
      ];

      const results = await orchestrator.validateGatesAll(gates, {});

      expect(results.passed).toBe(false);
      expect(results.gateCount).toBe(2); // both ran despite tier 0 failure
      expect(results.failedGates.length).toBe(1);
      expect(results.passedGates).toContain('pass-gate');
    });

    it('runs gates within tiers concurrently', async () => {
      const gates = [
        createTimedGate('gate-a', { tier: 1, delayMs: 50 }),
        createTimedGate('gate-b', { tier: 1, delayMs: 50 }),
        createTimedGate('gate-c', { tier: 1, delayMs: 50 })
      ];

      const start = Date.now();
      const results = await orchestrator.validateGatesAll(gates, {});
      const elapsed = Date.now() - start;

      expect(results.gateCount).toBe(3);
      expect(elapsed).toBeLessThan(130);
    });

    it('collects all issues from all tiers', async () => {
      const gates = [
        createTimedGate('fail-1', { tier: 0, passed: false, score: 0, required: true }),
        createTimedGate('fail-2', { tier: 1, passed: false, score: 0, required: true })
      ];

      const results = await orchestrator.validateGatesAll(gates, {});

      expect(results.passed).toBe(false);
      expect(results.failedGates.length).toBe(2);
      expect(results.issues.length).toBe(2);
    });
  });
});
