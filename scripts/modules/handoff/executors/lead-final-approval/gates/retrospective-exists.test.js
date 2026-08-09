import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock upstream helpers used inside gates.js before importing it.
vi.mock('../../../../sd-type-checker.js', () => ({
  getTierForSD: vi.fn(() => 3),
}));
vi.mock('../../../retro-filters.js', () => ({
  getFilteredRetrospective: vi.fn(),
}));
// SD-LEO-INFRA-RETRO-INTEGRITY-RUN-001 FR-3 — CROSS-AUTHOR EDIT, ANNOUNCED.
// The tier-3 arm no longer gates on retrospectives.quality_score (a diagnostic gauge that a lint
// rule forbids citing as a threshold, and which this SD measured to be writer-fabricated). It now
// gates on the MEASURED assessment, so this suite must supply that signal. The FR5 intent is
// UNCHANGED and both directions are still asserted — a good tier-3 retro passes, a bad one fails;
// only the signal being trusted has changed. The mock's un-stubbed default is undefined, which
// makes the gate fail closed — correct, so each test states its precondition explicitly.
vi.mock('../../../../sd-quality-validation.js', () => ({
  validateSDCompletionReadiness: vi.fn(),
}));

import { getFilteredRetrospective } from '../../../retro-filters.js';
import { validateSDCompletionReadiness } from '../../../../sd-quality-validation.js';
import { createRetrospectiveExistsGate } from '../gates.js';

/**
 * SD-LEO-INFRA-RETROSPECTIVE-GATES-FAIL-001 AC5 + AC6: Mirror tests for the
 * LEAD-FINAL-APPROVAL retrospective gate. Previously this gate had zero test
 * coverage; this file establishes parity with the PLAN-TO-LEAD gate tests so
 * both gates enforce the same three invariants (existence, retro_type, freshness).
 */

const makeCtx = (overrides = {}) => ({
  sd: {
    id: 'test-sd-uuid',
    sd_key: 'SD-LEAD-FINAL-TEST-001',
    sd_type: 'infrastructure',
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  },
  sdId: 'test-sd-uuid',
});

describe('createRetrospectiveExistsGate (LEAD-FINAL-APPROVAL)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('has correct gate metadata', () => {
    const gate = createRetrospectiveExistsGate({});
    expect(gate.name).toBe('RETROSPECTIVE_EXISTS');
    expect(gate.required).toBe(true);
  });

  it('hard-fails when helper returns null (zero rows)', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: null,
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toMatch(/No SD-completion retrospective found for SD-LEAD-FINAL-TEST-001/);
    expect(result.remediation).toMatch(/handoff-time retrospective does not satisfy this gate/);
    expect(result.remediation).toMatch(/retro_type='SD_COMPLETION'/);
  });

  it('hard-fails for pre-LEAD (handoff-time) retro — helper returns null after timestamp filter', async () => {
    // The timestamp filter runs inside the helper; at the gate level the behaviour is
    // identical to "zero rows". Freshness filter is covered in retro-filters.test.js.
    getFilteredRetrospective.mockResolvedValue({
      retrospective: null,
      leadToPlanAcceptedAt: '2026-04-10T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx({ sd_key: 'SD-PRE-LEAD-RETRO-001' }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/must be retro_type=SD_COMPLETION with created_at > 2026-04-10T00:00:00\.000Z/);
  });

  it('hard-fails for wrong retro_type — helper returns null after type filter', async () => {
    getFilteredRetrospective.mockResolvedValue({
      retrospective: null,
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx({ sd_key: 'SD-WRONG-TYPE-001' }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/No SD-completion retrospective found for SD-WRONG-TYPE-001/);
  });

  it('passes for tier-1/2 SDs when a valid retro exists (regression for tier exemption)', async () => {
    // createRetrospectiveExistsGate short-circuits tier<=2 after finding a retro.
    // Mock getTierForSD to return 2 for this case via a local re-mock.
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(2);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r1', quality_score: 80, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('passes for tier-3 SDs whose retrospective ASSESSES at >= 60 (FR5 no-regression check)', async () => {
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r2', quality_score: 75, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    // FR-3: the gate now trusts the measured assessment, not the stored gauge.
    validateSDCompletionReadiness.mockResolvedValue({ passed: true, score: 75, issues: [], warnings: [] });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(75);
  });

  it('fails for tier-3 SDs whose retrospective ASSESSES below 60', async () => {
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      // A HIGH stored gauge that would have passed the old predicate...
      retrospective: { id: 'r3', quality_score: 95, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    // ...but the MEASURED assessment says no. This is strictly stronger than the original test:
    // it now proves the fabricated gauge cannot buy a pass.
    validateSDCompletionReadiness.mockResolvedValue({ passed: false, score: 45, issues: ['thin'], warnings: [] });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/below minimum 60%/);
  });

  it('gates on the MEASURED SCORE against the stated 60 floor, NOT on the evaluator own pass flag', async () => {
    // DELIBERATE, PINNED SO IT IS NOT "FIXED" BACK. Requiring assessment.passed would import the
    // rubric's internal unstated threshold as the fleet-wide tier-3 bar — observed live, a
    // retrospective scoring 86 was refused by that flag alone, far above the 60 the contract
    // states. The original contract was quality_score >= 60; the faithful translation keeps the
    // threshold and changes only where the number comes from (measured, not writer-supplied).
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r5', quality_score: 10, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    validateSDCompletionReadiness.mockResolvedValue({ passed: false, score: 79, issues: [], warnings: [] });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(79);
  });

  it('FAILS CLOSED when the evaluator cannot run at all (manual review required)', async () => {
    // Added by FR-3: a gate that cannot run has NOT passed. Previously an evaluator outage
    // fell back to the stored gauge and could auto-pass.
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r4', quality_score: 100, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    validateSDCompletionReadiness.mockResolvedValue({ passed: false, score: 0, manual_review_required: true, issues: [], warnings: [] });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/MANUAL REVIEW REQUIRED/);
  });
});
