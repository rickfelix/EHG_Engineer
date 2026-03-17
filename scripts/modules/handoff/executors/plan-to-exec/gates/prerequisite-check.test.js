/**
 * Unit tests for PREREQUISITE_HANDOFF_CHECK
 * Validates LEAD-TO-PLAN handoff exists before PLAN-TO-EXEC.
 *
 * Part of SD-LEO-INFRA-HANDOFF-VALIDATOR-REGISTRY-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the auto-resolve dependency before importing
vi.mock('../../../gates/auto-resolve-failures.js', () => ({
  autoResolveFailedHandoffs: vi.fn().mockResolvedValue({ resolved: 0, error: null }),
}));

import { createPrerequisiteCheckGate } from './prerequisite-check.js';
import { autoResolveFailedHandoffs } from '../../../gates/auto-resolve-failures.js';
import { createMockSD } from '../../../../../../tests/factories/validator-context-factory.js';

// Helper: build mock Supabase that returns given handoff data
function buildHandoffSupabase({ data = [], error = null, updateError = null } = {}) {
  const chainable = {
    select: () => chainable,
    eq: () => chainable,
    in: () => chainable,
    is: () => chainable,
    order: () => chainable,
    limit: () => chainable,
    then: (fn) => Promise.resolve({ data, error }).then(fn),
  };
  Object.defineProperty(chainable, 'then', {
    value: (fn) => Promise.resolve({ data, error }).then(fn),
    writable: true,
  });

  return {
    from: vi.fn(() => ({
      select: () => chainable,
      update: () => ({ in: () => Promise.resolve({ error: updateError }) }),
    })),
  };
}

describe('PREREQUISITE_HANDOFF_CHECK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct gate shape', () => {
    const gate = createPrerequisiteCheckGate({});
    expect(gate.name).toBe('PREREQUISITE_HANDOFF_CHECK');
    expect(gate.required).toBe(true);
    expect(typeof gate.validator).toBe('function');
  });

  it('passes when accepted LEAD-TO-PLAN handoff exists', async () => {
    const handoff = {
      id: 'handoff-001',
      status: 'accepted',
      created_at: '2026-03-01T00:00:00Z',
      validation_score: 92,
    };
    const supabase = buildHandoffSupabase({ data: [handoff] });
    const gate = createPrerequisiteCheckGate(supabase);
    const sd = createMockSD();

    const result = await gate.validator({ sd, sdId: sd.id });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
    expect(result.details.prerequisite_handoff_id).toBe('handoff-001');
    expect(result.details.prerequisite_score).toBe(92);
  });

  it('fails when no LEAD-TO-PLAN handoff exists', async () => {
    const supabase = buildHandoffSupabase({ data: [] });
    const gate = createPrerequisiteCheckGate(supabase);
    const sd = createMockSD();

    const result = await gate.validator({ sd, sdId: sd.id });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('ERR_CHAIN_INCOMPLETE');
    expect(result.remediation).toContain('LEAD-TO-PLAN');
  });

  it('fails when handoff data is null', async () => {
    const supabase = buildHandoffSupabase({ data: null });
    const gate = createPrerequisiteCheckGate(supabase);

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(false);
    expect(result.issues[0]).toContain('ERR_CHAIN_INCOMPLETE');
  });

  it('fails on database error', async () => {
    const supabase = buildHandoffSupabase({ error: { message: 'Connection timeout' } });
    const gate = createPrerequisiteCheckGate(supabase);

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues[0]).toContain('Connection timeout');
  });

  it('calls autoResolveFailedHandoffs before checking prerequisite', async () => {
    const supabase = buildHandoffSupabase({ data: [{ id: 'h-1', status: 'accepted', created_at: '2026-01-01', validation_score: 80 }] });
    const gate = createPrerequisiteCheckGate(supabase);
    const sd = createMockSD({ id: 'uuid-123' });

    await gate.validator({ sd, sdId: sd.id });

    expect(autoResolveFailedHandoffs).toHaveBeenCalledWith(supabase, 'uuid-123', 'PLAN-TO-EXEC');
  });

  it('proceeds even when auto-resolve reports an error', async () => {
    autoResolveFailedHandoffs.mockResolvedValue({ resolved: 0, error: 'RPC failed' });
    const handoff = { id: 'h-1', status: 'accepted', created_at: '2026-01-01', validation_score: 85 };
    const supabase = buildHandoffSupabase({ data: [handoff] });
    const gate = createPrerequisiteCheckGate(supabase);

    const result = await gate.validator({ sd: createMockSD(), sdId: 'test' });

    // Should still pass — auto-resolve failure is non-blocking
    expect(result.passed).toBe(true);
  });
});
