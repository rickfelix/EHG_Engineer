import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock upstream helpers used inside gates.js before importing it.
vi.mock('../../../../sd-type-checker.js', () => ({
  getTierForSD: vi.fn(() => 3),
}));
vi.mock('../../../retro-filters.js', () => ({
  getFilteredRetrospective: vi.fn(),
}));

import { getFilteredRetrospective } from '../../../retro-filters.js';
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

  it('passes for tier-3 SDs with quality_score >= 60 (FR5 no-regression check)', async () => {
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r2', quality_score: 75, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(75);
  });

  it('fails for tier-3 SDs whose quality_score is below 60', async () => {
    const { getTierForSD } = await import('../../../../sd-type-checker.js');
    getTierForSD.mockReturnValueOnce(3);
    getFilteredRetrospective.mockResolvedValue({
      retrospective: { id: 'r3', quality_score: 45, status: 'PUBLISHED', retro_type: 'SD_COMPLETION', created_at: '2026-04-20T00:00:00.000Z' },
      leadToPlanAcceptedAt: '2026-04-01T00:00:00.000Z',
      error: null,
    });
    const gate = createRetrospectiveExistsGate({});
    const result = await gate.validator(makeCtx());
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/below minimum 60%/);
  });
});
