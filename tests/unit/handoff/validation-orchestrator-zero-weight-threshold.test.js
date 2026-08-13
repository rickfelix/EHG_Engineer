/**
 * Unit test: ValidationOrchestrator SD_TYPE_THRESHOLD skip when totalWeight=0
 * QF-20260812-365
 *
 * When an SD's applicable gate set has zero total weight (no weighted gates
 * registered for the phase/sd_type combination), normalizedScore synthetically
 * defaults to 0 -- that means "no weighted gate content ran", not "content
 * scored zero". SD_TYPE_THRESHOLD must skip in that case instead of hard-
 * blocking with a misleading "requires 85%, got 0%" message.
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

// Realistic, NONZERO threshold -- if the fix regresses (threshold re-applied against a
// synthetic 0), this test must observe a real SD_TYPE_THRESHOLD block, not an incidental pass.
vi.mock('../../../scripts/modules/sd-type-checker.js', () => ({
  THRESHOLD_PROFILES: { default: { gateThreshold: 85 }, feature: { gateThreshold: 85 } },
}));

vi.mock('../../../scripts/modules/handoff/validation/gate-result-schema.js', () => ({
  validateGateResult: vi.fn((result) => ({
    passed: result.passed ?? true,
    score: result.score ?? 100,
    maxScore: result.maxScore ?? result.max_score ?? 100,
    issues: result.issues || [],
    warnings: result.warnings || [],
  })),
}));

vi.mock('../../../scripts/modules/handoff/validation/ValidatorRegistry.js', () => ({
  validatorRegistry: { getOrCreateFallback: vi.fn(), normalizeResult: vi.fn(r => r) },
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

describe('ValidationOrchestrator — QF-20260812-365 zero-weight SD_TYPE_THRESHOLD skip', () => {
  let orch;
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    orch = new ValidationOrchestrator(mockSupabase);
  });

  it('an empty applicable gate list (totalWeight=0) skips SD_TYPE_THRESHOLD instead of blocking on a synthetic 0%', async () => {
    const r = await orch.validateGates([], { sd: { sd_type: 'feature' } });
    expect(r.normalizedScore).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.failedGate).not.toBe('SD_TYPE_THRESHOLD');
    expect(r.thresholdViolation).toBeUndefined();
    expect(r.issues.some((i) => /requires \d+% gate score/.test(i))).toBe(false);
  });

  it('control: a real weighted gate scoring below threshold still blocks (fix does not disable the real check)', async () => {
    const lowScoreGate = {
      name: 'SOME_GATE',
      required: true,
      weight: 1,
      validator: async () => ({ passed: true, score: 10, max_score: 100, issues: [], warnings: [] }),
    };
    const r = await orch.validateGates([lowScoreGate], { sd: { sd_type: 'feature' } });
    expect(r.normalizedScore).toBeLessThan(85);
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
    expect(r.thresholdViolation).toEqual({ sdType: 'feature', required: 85, actual: r.normalizedScore });
  });
});
