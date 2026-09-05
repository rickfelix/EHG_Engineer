/**
 * Unit test: ValidationOrchestrator SD_TYPE_THRESHOLD gate2-yellow-zone accept (FR-9)
 * SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-A
 *
 * Specimen: SD-ALTIFYAI-LEO-FEAT-STAGE-BUILD-ELEVEN-001-A scored 907/1100=82.45% overall
 * (feature threshold 85%), while GATE2_IMPLEMENTATION_FIDELITY independently scored 82% and
 * PASSED via its own adaptive YELLOW zone over the SAME reduced gate set. SD_TYPE_THRESHOLD
 * must accept in exactly this shape, and reject on either negative fixture the PRD names:
 * GATE2 genuinely FAILED, or GATE2's result is a stale gate-verdict-cache reuse (a different
 * run's reduced gate set).
 *
 * Deliberately does NOT mock gate-result-schema.js's validateGateResult -- it is the real,
 * dependency-free function, and its shallow-spread field preservation (extra fields like
 * `zone`/`cache_hit` survive normalization) is exactly the behavior this accept path depends
 * on, so exercising the real implementation is load-bearing, not incidental.
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

vi.mock('../../../scripts/modules/sd-type-checker.js', () => ({
  // bugfix's real THRESHOLD_PROFILES.gateThreshold is also 85 (matching feature) -- using it
  // for the negative-scoping fixture below makes that test an honest negative. An earlier
  // 'infrastructure' fixture asserted against a mocked fiction: infrastructure's REAL threshold
  // is 75, so an 82%-scoring infrastructure SD never reaches the below-threshold block at all in
  // production and would pass this test for the wrong reason (validation-lead-gate-003a F6).
  THRESHOLD_PROFILES: { default: { gateThreshold: 85 }, feature: { gateThreshold: 85 }, bugfix: { gateThreshold: 85 } },
}));

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

// A second weighted gate so GATE2's own 82% score doesn't have to single-handedly BE the
// overall normalizedScore -- mirrors the real specimen where GATE2 is one gate among many.
function otherGate(score = 82) {
  return {
    name: 'OTHER_WEIGHTED_GATE',
    required: true,
    weight: 1,
    validator: async () => ({ passed: true, score, max_score: 100, issues: [], warnings: [] }),
  };
}

function gate2Gate({ score = 82, zone = 'YELLOW', passed = true } = {}) {
  return {
    name: 'GATE2_IMPLEMENTATION_FIDELITY',
    required: true,
    weight: 1,
    validator: async () => ({ passed, score, max_score: 100, zone, issues: [], warnings: [] }),
  };
}

describe('ValidationOrchestrator — FR-9 GATE2 yellow-zone accept for SD_TYPE_THRESHOLD', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('POSITIVE: feature SD below threshold, GATE2 PASSED in-run YELLOW over the same gate set -> accepted, stamped', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    const r = await orch.validateGates([otherGate(82), gate2Gate({ score: 82, zone: 'YELLOW' })], { sd: { sd_type: 'feature' } });

    expect(r.normalizedScore).toBeLessThan(85);
    expect(r.passed).toBe(true);
    expect(r.failedGate).not.toBe('SD_TYPE_THRESHOLD');
    expect(r.thresholdViolation).toBeUndefined();
    expect(r.yellowZoneAccept).toEqual({
      gate: 'SD_TYPE_THRESHOLD',
      sd_type: 'feature',
      sd_type_threshold_score: r.normalizedScore,
      sd_type_threshold_required: 85,
      gate2_score: 82,
      gate2_zone: 'YELLOW',
    });
  });

  it('NEGATIVE: GATE2 genuinely FAILED (RED zone, not YELLOW) -> SD_TYPE_THRESHOLD still blocks', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    const r = await orch.validateGates(
      [otherGate(82), gate2Gate({ score: 60, zone: 'RED', passed: false })],
      { sd: { sd_type: 'feature' } },
    );

    // A required gate (GATE2_IMPLEMENTATION_FIDELITY) failing blocks the handoff on its own
    // account before SD_TYPE_THRESHOLD is ever evaluated -- that block itself IS the correct
    // "still blocks" outcome the PRD's negative fixture asks for.
    expect(r.passed).toBe(false);
    expect(r.failedGate).toBe('GATE2_IMPLEMENTATION_FIDELITY');
    expect(r.yellowZoneAccept).toBeUndefined();
  });

  it('NEGATIVE: GATE2 result is a stale gate-verdict-cache reuse (different reduced set / different run) -> SD_TYPE_THRESHOLD still blocks', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    // Simulate a cache-hit reuse by injecting cache_hit:true onto what GATE2's validator
    // returns -- the accept path must not trust a verdict this run did not itself compute.
    const cachedGate2 = {
      name: 'GATE2_IMPLEMENTATION_FIDELITY',
      required: true,
      weight: 1,
      validator: async () => ({ passed: true, score: 82, max_score: 100, zone: 'YELLOW', cache_hit: true, issues: [], warnings: [] }),
    };
    const r = await orch.validateGates([otherGate(82), cachedGate2], { sd: { sd_type: 'feature' } });

    expect(r.passed).toBe(false);
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
    expect(r.yellowZoneAccept).toBeUndefined();
  });

  it('scoped to feature type only: a bugfix SD in the identical shape does NOT get the accept', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    const r = await orch.validateGates(
      [otherGate(82), gate2Gate({ score: 82, zone: 'YELLOW' })],
      { sd: { sd_type: 'bugfix' } },
    );

    // bugfix's REAL THRESHOLD_PROFILES.gateThreshold is 85 (same as feature), so this
    // reproduces the identical below-threshold shape on a genuinely-85%-threshold type,
    // without a feature-type accept path -- an honest negative (validation-lead-gate-003a F6).
    expect(r.yellowZoneAccept).toBeUndefined();
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
  });

  it('NEGATIVE: GATE2 is not registered in the gate set at all (undefined) -> SD_TYPE_THRESHOLD still blocks (testing-plan-to-exec-003a gap a)', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    // GATE2_IMPLEMENTATION_FIDELITY is registered only in exec-to-plan/index.js -- every OTHER
    // handoff type's gate set genuinely lacks it, so gate2Result is undefined in production, not
    // just a hypothetical. Optional chaining (gate2Result?.passed) must fail closed here.
    const r = await orch.validateGates([otherGate(82)], { sd: { sd_type: 'feature' } });

    expect(r.passed).toBe(false);
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
    expect(r.yellowZoneAccept).toBeUndefined();
  });

  it('NEGATIVE: GATE2 passed with zone undefined (reachable via implementation-fidelity/index.js early-return paths that never assign .zone) -> SD_TYPE_THRESHOLD still blocks (testing-plan-to-exec-003a gap b)', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    const gate2NoZone = {
      name: 'GATE2_IMPLEMENTATION_FIDELITY',
      required: true,
      weight: 1,
      validator: async () => ({ passed: true, score: 82, max_score: 100, issues: [], warnings: [] }), // no `zone` key
    };
    const r = await orch.validateGates([otherGate(82), gate2NoZone], { sd: { sd_type: 'feature' } });

    expect(r.passed).toBe(false);
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
    expect(r.yellowZoneAccept).toBeUndefined();
  });

  it('control: GATE2 PASSED in GREEN (not YELLOW) while overall score is still below threshold -> no accept, zone must be exactly YELLOW', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    // otherGate(70) + gate2Gate(95) averages to 82.5%, genuinely below the 85% feature
    // threshold -- this exercises the below-threshold branch (unlike a 90/90 real pass) and
    // confirms GREEN specifically does not qualify, only YELLOW does.
    const r = await orch.validateGates(
      [otherGate(70), gate2Gate({ score: 95, zone: 'GREEN' })],
      { sd: { sd_type: 'feature' } },
    );

    expect(r.normalizedScore).toBeLessThan(85);
    expect(r.passed).toBe(false);
    expect(r.failedGate).toBe('SD_TYPE_THRESHOLD');
    expect(r.yellowZoneAccept).toBeUndefined();
  });

  it('control: GATE2 PASSED in GREEN with the overall score genuinely above threshold is a real pass, no accept needed', async () => {
    const orch = new ValidationOrchestrator(mockSupabase);
    const r = await orch.validateGates(
      [otherGate(90), gate2Gate({ score: 90, zone: 'GREEN' })],
      { sd: { sd_type: 'feature' } },
    );

    expect(r.passed).toBe(true);
    expect(r.yellowZoneAccept).toBeUndefined();
    expect(r.failedGate).toBeFalsy();
  });
});
