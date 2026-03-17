/**
 * Unit tests for GATE_PRD_EXISTS and GATE_ARCHITECTURE_VERIFICATION
 * Validates PRD existence and architecture checks for PLAN-TO-EXEC handoff.
 *
 * Part of SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPrdExistsGate, createArchitectureVerificationGate } from './prd-gates.js';
import { createMockSD, createMockPRD } from '../../../../../../tests/factories/validator-context-factory.js';

describe('GATE_PRD_EXISTS', () => {
  let gate;
  let mockPrdRepo;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrdRepo = { getBySdId: vi.fn() };
    gate = createPrdExistsGate(mockPrdRepo);
  });

  it('has correct gate shape', () => {
    expect(gate.name).toBe('GATE_PRD_EXISTS');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('passes with valid approved PRD', async () => {
    const prd = createMockPRD({ status: 'approved' });
    mockPrdRepo.getBySdId.mockResolvedValue(prd);
    const sd = createMockSD();

    const result = await gate.validator({ sd, sdId: sd.id });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.prd_id).toBe(prd.id);
  });

  it('passes with ready_for_exec status', async () => {
    mockPrdRepo.getBySdId.mockResolvedValue(createMockPRD({ status: 'ready_for_exec' }));

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
  });

  it('fails when no PRD exists', async () => {
    mockPrdRepo.getBySdId.mockResolvedValue(null);

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.some(i => i.includes('ERR_NO_PRD'))).toBe(true);
    expect(result.remediation).toContain('add-prd-to-database.js');
  });

  it('fails when PRD has invalid status', async () => {
    mockPrdRepo.getBySdId.mockResolvedValue(createMockPRD({ status: 'draft' }));

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.some(i => i.includes('draft'))).toBe(true);
  });

  it('exempts SD types where requires_prd is false', async () => {
    const chainable = {
      select: () => chainable,
      eq: () => chainable,
      maybeSingle: () => Promise.resolve({ data: { requires_prd: false }, error: null }),
    };
    const mockSupabase = { from: () => ({ select: () => chainable }) };
    const sd = createMockSD({ sd_type: 'documentation' });

    const result = await gate.validator({ sd, sdId: sd.id, supabase: mockSupabase });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.details.exemption_reason).toBe('validation_profile_requires_prd_false');
  });

  it('stores PRD on ctx._prd for downstream gates', async () => {
    const prd = createMockPRD();
    mockPrdRepo.getBySdId.mockResolvedValue(prd);
    const ctx = { sd: createMockSD(), sdId: 'test' };

    await gate.validator(ctx);

    expect(ctx._prd).toBe(prd);
  });

  it('handles prdRepo errors gracefully', async () => {
    mockPrdRepo.getBySdId.mockRejectedValue(new Error('DB connection lost'));

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toContain('DB connection lost');
  });
});

describe('GATE_ARCHITECTURE_VERIFICATION', () => {
  it('has correct gate shape', () => {
    const gate = createArchitectureVerificationGate(null, () => '/app');
    expect(gate.name).toBe('GATE_ARCHITECTURE_VERIFICATION');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });
});
