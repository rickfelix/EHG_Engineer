/**
 * Tests for Chairman SLA Enforcer — V02 blocking mode
 * SD-MAN-ORCH-VISION-GOVERNANCE-ENFORCEMENT-001-D
 */

import { describe, it, expect, vi } from 'vitest';
import {
  enforceDecisionSLAs,
  escalateDecision,
  getDecisionSLAStatus,
  DEFAULT_SLA_MATRIX,
} from '../../../lib/eva/chairman-sla-enforcer.js';

function createMockSupabase(pendingDecisions = []) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: pendingDecisions, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
  };

  return {
    from: vi.fn(() => chainable),
    _chain: chainable,
  };
}

describe('Chairman SLA Enforcer — DEFAULT_SLA_MATRIX', () => {
  it('includes stakeholder_response SLA (V02)', () => {
    expect(DEFAULT_SLA_MATRIX.stakeholder_response).toBe(2 * 60 * 60 * 1000);
  });

  it('includes all standard decision types', () => {
    expect(DEFAULT_SLA_MATRIX.gate_decision).toBeDefined();
    expect(DEFAULT_SLA_MATRIX.budget_review).toBeDefined();
    expect(DEFAULT_SLA_MATRIX.advisory).toBeDefined();
  });
});

describe('Chairman SLA Enforcer — enforceDecisionSLAs', () => {
  it('returns empty result when no pending decisions', async () => {
    const supabase = createMockSupabase([]);
    const result = await enforceDecisionSLAs(supabase);
    expect(result.checked).toBe(0);
    expect(result.escalated).toBe(0);
    expect(result.blocked).toBe(0);
  });

  it('returns error when no supabase client', async () => {
    const result = await enforceDecisionSLAs(null);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('No supabase client');
  });

  it('skips blocking decisions (chairman authority)', async () => {
    const supabase = createMockSupabase([
      { id: 'dec-1', decision_type: 'gate_decision', created_at: '2020-01-01T00:00:00Z', blocking: true, metadata: {} },
    ]);
    const result = await enforceDecisionSLAs(supabase, { logger: { warn: vi.fn() } });
    expect(result.skipped).toBe(1);
    expect(result.escalated).toBe(0);
  });

  it('skips already-escalated decisions', async () => {
    const supabase = createMockSupabase([
      { id: 'dec-2', decision_type: 'advisory', created_at: '2020-01-01T00:00:00Z', blocking: false, metadata: { escalation: { escalated_at: '2020-01-02T00:00:00Z' } } },
    ]);
    const result = await enforceDecisionSLAs(supabase, { logger: { warn: vi.fn() } });
    expect(result.skipped).toBe(1);
    expect(result.escalated).toBe(0);
  });

  it('returns blocked count when blockOnViolation is true (V02: default)', async () => {
    const overdue = { id: 'dec-3', decision_type: 'stakeholder_response', created_at: '2020-01-01T00:00:00Z', blocking: false, metadata: {} };
    const supabase = createMockSupabase([overdue]);
    const result = await enforceDecisionSLAs(supabase, { logger: { warn: vi.fn() } });
    expect(result.escalated).toBe(1);
    expect(result.blocked).toBe(1);
  });

  it('does not block when blockOnViolation is false', async () => {
    const overdue = { id: 'dec-4', decision_type: 'advisory', created_at: '2020-01-01T00:00:00Z', blocking: false, metadata: {} };
    const supabase = createMockSupabase([overdue]);
    const result = await enforceDecisionSLAs(supabase, { blockOnViolation: false, logger: { warn: vi.fn() } });
    expect(result.escalated).toBe(1);
    expect(result.blocked).toBe(0);
  });
});

describe('Chairman SLA Enforcer — escalateDecision', () => {
  it('sets blocking=true in decision update when blockOnViolation=true', async () => {
    const supabase = createMockSupabase();
    const decision = { id: 'dec-5', metadata: {}, venture_id: 'v1' };

    await escalateDecision(supabase, decision, {
      slaMs: 7200000,
      ageMs: 14400000,
      blockOnViolation: true,
      logger: { warn: vi.fn() },
    });

    const updateCall = supabase._chain.update;
    expect(updateCall).toHaveBeenCalled();
    const payload = updateCall.mock.calls[0][0];
    expect(payload.blocking).toBe(true);
    expect(payload.metadata.sla_violated).toBe(true);
    expect(payload.metadata.escalation.strategy).toBe('block_and_escalate');
  });

  it('uses escalate_notify strategy when blockOnViolation=false', async () => {
    const supabase = createMockSupabase();
    const decision = { id: 'dec-6', metadata: {}, venture_id: 'v1' };

    const result = await escalateDecision(supabase, decision, {
      slaMs: 7200000,
      ageMs: 14400000,
      blockOnViolation: false,
      logger: { warn: vi.fn() },
    });

    expect(result.blocked).toBe(false);
    const payload = supabase._chain.update.mock.calls[0][0];
    expect(payload.blocking).toBeUndefined();
    expect(payload.metadata.escalation.strategy).toBe('escalate_notify');
  });

  it('returns blocked=true when blocking mode active', async () => {
    const supabase = createMockSupabase();
    const decision = { id: 'dec-7', metadata: {}, venture_id: 'v1' };

    const result = await escalateDecision(supabase, decision, {
      slaMs: 7200000,
      ageMs: 14400000,
      blockOnViolation: true,
      logger: { warn: vi.fn() },
    });

    expect(result.escalated).toBe(true);
    expect(result.blocked).toBe(true);
  });
});

describe('Chairman SLA Enforcer — getDecisionSLAStatus', () => {
  it('returns overdue=true when past SLA', () => {
    const decision = { decision_type: 'stakeholder_response', created_at: '2020-01-01T00:00:00Z' };
    const status = getDecisionSLAStatus(decision);
    expect(status.overdue).toBe(true);
    expect(status.slaMs).toBe(DEFAULT_SLA_MATRIX.stakeholder_response);
  });

  it('returns overdue=false when within SLA', () => {
    const decision = { decision_type: 'advisory', created_at: new Date().toISOString() };
    const status = getDecisionSLAStatus(decision);
    expect(status.overdue).toBe(false);
  });

  it('uses fallback SLA for unknown decision types', () => {
    const decision = { decision_type: 'unknown_type', created_at: '2020-01-01T00:00:00Z' };
    const status = getDecisionSLAStatus(decision);
    expect(status.slaMs).toBe(24 * 60 * 60 * 1000); // Fallback: 24h
  });
});
