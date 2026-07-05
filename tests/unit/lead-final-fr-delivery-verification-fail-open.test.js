// QF-20260704-468: pattern-port of SD-LEO-FIX-RECONCILE-DEAD-ARRIVAL-001's FR-2
// fail-open fix from the EXEC-TO-PLAN FR_DELIVERY_TRACEABILITY gate onto the
// LEAD-FINAL FR_DELIVERY_VERIFICATION gate (Gate 6, CONST-012).
//
// ValidationOrchestrator blocks on the STATIC gate.required=true whenever a
// validator THROWS (ValidationOrchestrator.js: `!gateResult.passed && gate.required
// !== false`) -- so a transient error (e.g. prdRepo/classifier DB hiccup) would
// hard-fail every LEAD-FINAL even in warn-only mode. This SD lives on the live
// chairman-facing critical path (every SD crosses LEAD-FINAL).
//
// Acceptance is BOTH-DIRECTIONS: (1) a thrown/transient failure degrades to a
// passing warn result when enforcement is OFF; (2) a genuine FR-delivery failure
// (no throw, classifier legitimately reports undelivered FRs) still FAILS the gate.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../scripts/modules/handoff/gates/fr-delivery-classifier.js', () => ({
  classifyFrDelivery: vi.fn(),
  projectGateResult: vi.fn(),
  isFrTraceabilityEnforced: vi.fn(() => process.env.LEO_FR_TRACEABILITY_ENFORCE === 'true'),
}));

const { classifyFrDelivery, projectGateResult } = await import('../../scripts/modules/handoff/gates/fr-delivery-classifier.js');
const { createFRDeliveryVerificationGate } = await import('../../scripts/modules/handoff/executors/lead-final-approval/gates.js');

function throwingPrdRepo() {
  return { getBySdUuid: vi.fn(() => { throw new Error('transient db error'); }) };
}

function fakeSupabase() {
  return { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }) }) }) };
}

describe('QF-20260704-468: FR_DELIVERY_VERIFICATION fail-open contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
  });

  it('thrown validator body with enforcement OFF => passing warn result (never blocks)', async () => {
    delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
    const gate = createFRDeliveryVerificationGate(fakeSupabase(), throwingPrdRepo());
    const result = await gate.validator({ sd: { id: 'sd-1' } });
    expect(result.passed).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/fail-open/);
  });

  it('thrown validator body with enforcement ON => error propagates (strict)', async () => {
    process.env.LEO_FR_TRACEABILITY_ENFORCE = 'true';
    const gate = createFRDeliveryVerificationGate(fakeSupabase(), throwingPrdRepo());
    await expect(gate.validator({ sd: { id: 'sd-1' } })).rejects.toThrow('transient db error');
  });

  it('a genuine FR-delivery failure (no throw) still FAILS the gate', async () => {
    const prd = { getBySdUuid: vi.fn(() => Promise.resolve({ functional_requirements: [{ id: 'FR-1' }] })) };
    classifyFrDelivery.mockResolvedValue({ frs: [{ id: 'FR-1', status: 'undelivered' }], delivered: 0, descoped: 0, undelivered: 1, total: 1 });
    projectGateResult.mockReturnValue({ passed: false, score: 0, max_score: 100, issues: ['FR-1 undelivered'], warnings: [] });
    const gate = createFRDeliveryVerificationGate(fakeSupabase(), prd);
    const result = await gate.validator({ sd: { id: 'sd-2' } });
    expect(result.passed).toBe(false);
  });
});
