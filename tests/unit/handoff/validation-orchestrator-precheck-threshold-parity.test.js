/**
 * Unit test: precheck (validateGatesAll) and execute (validateGates) agree on the
 * SD_TYPE_THRESHOLD verdict for the same synthetic gate set.
 * QF-20260905-405
 *
 * MEASURED defect: validateGates() (the execute path) evaluated SD_TYPE_THRESHOLD; the
 * batch/precheck path, validateGatesAll(), did not -- precheck could report every gate
 * green and "safe to execute" for any threshold-bearing sd_type, then execute failed the
 * identical SD on this exact check moments later. Both paths now call the same
 * _evaluateSdTypeThreshold() helper.
 *
 * A fixture per sd_type (feature, security, bugfix, infrastructure, documentation,
 * orchestrator) asserts precheck and execute agree on the threshold verdict for the same
 * gate set, both when the score is below threshold (both block) and at/above it (both pass).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../lib/telemetry/workflow-timer.js', () => ({
  startSpan: vi.fn(),
  endSpan: vi.fn(),
}));

vi.mock('../../../lib/utils/sd-type-validation.js', () => ({
  shouldSkipCodeValidation: vi.fn(() => false),
}));

vi.mock('../../../scripts/modules/handoff/validation/sd-type-applicability-policy.js', () => ({
  createSkippedResult: vi.fn(),
  isSkippedResult: vi.fn(() => false),
  ValidatorStatus: { PASS: 'PASS', FAIL: 'FAIL', SKIPPED: 'SKIPPED' },
  SkipReasonCode: { NON_APPLICABLE_SD_TYPE: 'NON_APPLICABLE_SD_TYPE' },
}));

// Fixed, deterministic thresholds for the six sd_types the QF's acceptance criteria name --
// distinct per type so a fixture accidentally hitting the wrong profile fails loudly.
// Inlined directly in the factory (not a shared top-level const) because vi.mock factories are
// hoisted above the module's own top-level statements -- referencing an outer const here would
// throw a temporal-dead-zone ReferenceError at hoist time.
vi.mock('../../../scripts/modules/sd-type-checker.js', () => ({
  THRESHOLD_PROFILES: {
    default: { gateThreshold: 85 },
    feature: { gateThreshold: 85 },
    security: { gateThreshold: 90 },
    bugfix: { gateThreshold: 85 },
    infrastructure: { gateThreshold: 75 },
    documentation: { gateThreshold: 60 },
    orchestrator: { gateThreshold: 80 },
  },
}));

// Local copy (not passed into vi.mock -- see hoisting note above) used only to compute
// per-fixture expected thresholds within test bodies. Must stay byte-identical to the mock.
const FIXTURE_THRESHOLDS = {
  default: { gateThreshold: 85 },
  feature: { gateThreshold: 85 },
  security: { gateThreshold: 90 },
  bugfix: { gateThreshold: 85 },
  infrastructure: { gateThreshold: 75 },
  documentation: { gateThreshold: 60 },
  orchestrator: { gateThreshold: 80 },
};

vi.mock('../../../scripts/modules/handoff/validation/ValidatorRegistry.js', () => ({
  validatorRegistry: { getOrCreateFallback: vi.fn(), normalizeResult: vi.fn((r) => r) },
}));

vi.mock('../../../scripts/modules/handoff/validation/oiv/index.js', () => {
  class MockOIVGate { constructor() { this.validateHandoff = vi.fn(() => ({ passed: true, score: 100, issues: [] })); } }
  return { OIVGate: MockOIVGate, OIV_GATE_WEIGHT: 0.15 };
});

vi.mock('../../../scripts/modules/handoff/validation/validator-registry/gate-context-preloader.js', () => ({
  preloadGateContext: vi.fn(() => ({})),
  getGateNumberForRule: vi.fn(() => null),
}));

vi.mock('../../../scripts/modules/handoff/ResultBuilder.js', () => ({
  default: { logGateResult: vi.fn() },
}));

import { ValidationOrchestrator } from '../../../scripts/modules/handoff/validation/ValidationOrchestrator.js';

const mockSupabase = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) })) };

// A single required, weighted gate whose score IS the normalizedScore (no GATE2 present in
// any fixture, so the yellow-zone accept path never engages -- this test is about the base
// threshold check agreeing, not the accept carve-out, which the sibling gate2-yellow-zone
// suite already covers).
function scoredGate(score) {
  return {
    name: 'SOME_WEIGHTED_GATE',
    required: true,
    weight: 1,
    validator: async () => ({ passed: true, score, max_score: 100, issues: [], warnings: [] }),
  };
}

describe('ValidationOrchestrator — precheck/execute SD_TYPE_THRESHOLD parity (QF-20260905-405)', () => {
  let orch;
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    orch = new ValidationOrchestrator(mockSupabase);
  });

  const sdTypes = ['feature', 'security', 'bugfix', 'infrastructure', 'documentation', 'orchestrator'];

  for (const sdType of sdTypes) {
    const threshold = FIXTURE_THRESHOLDS[sdType].gateThreshold;

    it(`${sdType} (threshold ${threshold}%): BELOW threshold -- precheck (validateGatesAll) blocks exactly as execute (validateGates) does`, async () => {
      const belowScore = threshold - 5;
      const gates = [scoredGate(belowScore)];
      const context = { sd: { sd_type: sdType } };

      const execResult = await orch.validateGates(gates, context);
      const precheckResult = await orch.validateGatesAll(gates, context);

      // The defect this QF fixes: precheck used to pass here while execute failed.
      expect(execResult.passed).toBe(false);
      expect(execResult.failedGate).toBe('SD_TYPE_THRESHOLD');

      expect(precheckResult.passed).toBe(false);
      expect(precheckResult.failedGates.some((g) => g.name === 'SD_TYPE_THRESHOLD')).toBe(true);
      expect(precheckResult.issues.some((i) => i.gate === 'SD_TYPE_THRESHOLD')).toBe(true);
      expect(precheckResult.thresholdViolation).toEqual({ sdType, required: threshold, actual: precheckResult.normalizedScore });

      // Both paths must agree on the actual score and required threshold, not just "blocked".
      expect(precheckResult.normalizedScore).toBe(execResult.normalizedScore);
      expect(precheckResult.thresholdViolation.required).toBe(execResult.thresholdViolation.required);
    });

    it(`${sdType} (threshold ${threshold}%): AT/ABOVE threshold -- precheck and execute both pass`, async () => {
      const passingScore = threshold;
      const gates = [scoredGate(passingScore)];
      const context = { sd: { sd_type: sdType } };

      const execResult = await orch.validateGates(gates, context);
      const precheckResult = await orch.validateGatesAll(gates, context);

      expect(execResult.passed).toBe(true);
      expect(execResult.failedGate).toBeFalsy();
      expect(execResult.thresholdViolation).toBeUndefined();

      expect(precheckResult.passed).toBe(true);
      expect(precheckResult.failedGates.some((g) => g.name === 'SD_TYPE_THRESHOLD')).toBe(false);
      expect(precheckResult.thresholdViolation).toBeUndefined();
    });
  }

  it('totalWeight=0 (no applicable weighted gates): precheck skips SD_TYPE_THRESHOLD exactly as execute does (QF-20260812-365 parity)', async () => {
    const context = { sd: { sd_type: 'feature' } };

    const execResult = await orch.validateGates([], context);
    const precheckResult = await orch.validateGatesAll([], context);

    expect(execResult.passed).toBe(true);
    expect(execResult.thresholdViolation).toBeUndefined();

    expect(precheckResult.passed).toBe(true);
    expect(precheckResult.thresholdViolation).toBeUndefined();
    expect(precheckResult.failedGates.some((g) => g.name === 'SD_TYPE_THRESHOLD')).toBe(false);
  });
});
