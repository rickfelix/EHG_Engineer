/**
 * Unit tests: ValidationOrchestrator max-wait ceiling guard (FR-5 / TR-4)
 * SD-LEO-INFRA-EXTEND-WAIT-VERDICT-001
 *
 * A WAIT-returning gate must escalate to FAIL after N=10 consecutive WAITs
 * (WAIT_LIMIT_EXCEEDED) AND after 24h wall-clock (WAIT_TIMEOUT_EXCEEDED). The
 * guard protects ALL wait gates including the PR #4021 prerequisite-check.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Telemetry no-op
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
  THRESHOLD_PROFILES: { default: { gateThreshold: 0 } },
}));

// CRITICAL: this mock PRESERVES the wait discriminators (wait/wait_reason) and
// normalizes max_score -> maxScore so the orchestrator's wait branch sees them.
vi.mock('../../../scripts/modules/handoff/validation/gate-result-schema.js', () => ({
  validateGateResult: vi.fn((result) => ({
    passed: result.passed ?? true,
    score: result.score ?? 100,
    maxScore: result.maxScore ?? result.max_score ?? 100,
    issues: result.issues || [],
    warnings: result.warnings || [],
    wait: result.wait,
    wait_reason: result.wait_reason,
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

/** A gate that always returns a WAIT verdict. */
function waitGate(name = 'PREREQUISITE_HANDOFF_CHECK') {
  return {
    name,
    required: true,
    validator: async () => ({
      passed: false,
      wait: true,
      score: 0,
      max_score: 100,
      issues: [],
      wait_reason: 'parent orchestrator waiting on children',
      warnings: ['WAIT: parent orchestrator waiting on children'],
    }),
  };
}

const mockSupabase = { from: vi.fn(() => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) })) };

describe('ValidationOrchestrator — FR-5 max-wait ceiling', () => {
  let orch;
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    orch = new ValidationOrchestrator(mockSupabase);
  });

  it('first WAIT (no prior state) → waitVerdict (not failure), waitMetadata advances to 1', async () => {
    const r = await orch.validateGates([waitGate()], { sd: {} });
    expect(r.passed).toBe(false);
    expect(r.waitVerdict).toBe(true);
    expect(r.failedGate).toBe(null);
    expect(r.waitMetadata.wait_attempts).toBe(1);
    expect(typeof r.waitMetadata.first_wait_at).toBe('string');
  });

  it('9 prior waits → still WAIT (not yet at ceiling), advances to 10', async () => {
    const r = await orch.validateGates([waitGate()], {
      sd: {},
      waitState: { wait_attempts: 9, first_wait_at: new Date().toISOString() },
    });
    expect(r.waitVerdict).toBe(true);
    expect(r.failedGate).toBe(null);
    expect(r.waitMetadata.wait_attempts).toBe(10);
  });

  // FR-5 acceptance: 10 WAITs → FAIL on the 11th attempt
  it('10 prior waits → escalate to FAIL (WAIT_LIMIT_EXCEEDED)', async () => {
    const r = await orch.validateGates([waitGate()], {
      sd: {},
      waitState: { wait_attempts: 10, first_wait_at: new Date().toISOString() },
    });
    expect(r.passed).toBe(false);
    expect(r.waitVerdict).toBe(false);
    expect(r.failedGate).toBe('PREREQUISITE_HANDOFF_CHECK');
    expect(r.issues.some(i => /WAIT_LIMIT_EXCEEDED/.test(i))).toBe(true);
  });

  // FR-5 acceptance: 24h elapsed → FAIL
  it('first_wait_at 25h ago → escalate to FAIL (WAIT_TIMEOUT_EXCEEDED)', async () => {
    const first = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const r = await orch.validateGates([waitGate()], {
      sd: {},
      waitState: { wait_attempts: 2, first_wait_at: first },
    });
    expect(r.passed).toBe(false);
    expect(r.waitVerdict).toBe(false);
    expect(r.failedGate).toBe('PREREQUISITE_HANDOFF_CHECK');
    expect(r.issues.some(i => /WAIT_TIMEOUT_EXCEEDED/.test(i))).toBe(true);
  });

  // TR-4: guard applies to ANY wait gate, including non-prerequisite gates
  it('TR-4: ceiling also protects a non-prerequisite wait gate (e.g. SUB_AGENT)', async () => {
    const r = await orch.validateGates([waitGate('GATE_SUBAGENT_EVIDENCE')], {
      sd: {},
      waitState: { wait_attempts: 10, first_wait_at: new Date().toISOString() },
    });
    expect(r.passed).toBe(false);
    expect(r.waitVerdict).toBe(false);
    expect(r.failedGate).toBe('GATE_SUBAGENT_EVIDENCE');
  });
});
