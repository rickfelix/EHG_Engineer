/**
 * Tests for Chairman Escalation Routing (V02: chairman_governance_model)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-071
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createEscalationRecord,
  routeEscalation,
  requiresEscalation,
  evaluateAndEscalate,
  DECISION_TYPES,
  ESCALATION_STATUS,
} from '../../../lib/governance/chairman-escalation.js';

describe('Chairman Escalation - createEscalationRecord()', () => {
  it('creates record for ESCALATE decision', () => {
    const dfeResult = {
      decision: 'ESCALATE',
      confidence: 0.6,
      reasoning: 'Medium confidence requires review',
    };
    const record = createEscalationRecord(dfeResult, { sdKey: 'SD-TEST-001' });

    expect(record).not.toBeNull();
    expect(record.decision_type).toBe(DECISION_TYPES.DFE_ESCALATION);
    expect(record.status).toBe(ESCALATION_STATUS.PENDING);
    expect(record.blocking).toBe(false);
    expect(record.context.confidence).toBe(0.6);
    expect(record.context.sd_key).toBe('SD-TEST-001');
    expect(record.context.source).toBe('decision-filter-engine');
  });

  it('returns null for GO decision', () => {
    const dfeResult = { decision: 'GO', confidence: 0.9 };
    const record = createEscalationRecord(dfeResult);
    expect(record).toBeNull();
  });

  it('returns null for BLOCK decision', () => {
    const dfeResult = { decision: 'BLOCK', confidence: 0.2 };
    const record = createEscalationRecord(dfeResult);
    expect(record).toBeNull();
  });

  it('returns null for null input', () => {
    expect(createEscalationRecord(null)).toBeNull();
    expect(createEscalationRecord(undefined)).toBeNull();
  });

  it('uses custom decision type from context', () => {
    const dfeResult = { decision: 'ESCALATE', confidence: 0.5 };
    const record = createEscalationRecord(dfeResult, {
      decisionType: DECISION_TYPES.GATE_REVIEW,
    });
    expect(record.decision_type).toBe('gate_review');
  });

  it('includes cost evaluation when present', () => {
    const dfeResult = {
      decision: 'ESCALATE',
      confidence: 0.6,
      costEvaluation: { level: 'warn', cost: 150 },
    };
    const record = createEscalationRecord(dfeResult);
    expect(record.context.cost_evaluation).toEqual({ level: 'warn', cost: 150 });
  });

  it('sets blocking flag from context', () => {
    const dfeResult = { decision: 'ESCALATE', confidence: 0.5 };
    const record = createEscalationRecord(dfeResult, { blocking: true });
    expect(record.blocking).toBe(true);
  });

  it('includes gate type in context', () => {
    const dfeResult = { decision: 'ESCALATE', confidence: 0.6 };
    const record = createEscalationRecord(dfeResult, { gateType: 'KILL_GATE' });
    expect(record.context.gate_type).toBe('KILL_GATE');
  });
});

describe('Chairman Escalation - routeEscalation()', () => {
  function createMockSupabase(returnData = null, returnError = null) {
    return {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: returnData,
              error: returnError,
            }),
          }),
        }),
      }),
    };
  }

  it('inserts escalation record via supabase', async () => {
    const mockData = { id: 'uuid-1', decision_type: 'dfe_escalation', status: 'pending', blocking: false };
    const supabase = createMockSupabase(mockData);

    const result = await routeEscalation(
      { decision: 'ESCALATE', confidence: 0.6 },
      supabase,
      { sdKey: 'SD-TEST-001' }
    );

    expect(result).toEqual(mockData);
    expect(supabase.from).toHaveBeenCalledWith('chairman_decisions');
  });

  it('returns null for non-ESCALATE decisions', async () => {
    const supabase = createMockSupabase();
    const result = await routeEscalation({ decision: 'GO', confidence: 0.9 }, supabase);
    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('throws when supabase is null for ESCALATE', async () => {
    await expect(
      routeEscalation({ decision: 'ESCALATE', confidence: 0.6 }, null)
    ).rejects.toThrow('Supabase client required');
  });

  it('throws on supabase insert error', async () => {
    const supabase = createMockSupabase(null, { message: 'Insert failed' });
    await expect(
      routeEscalation({ decision: 'ESCALATE', confidence: 0.6 }, supabase)
    ).rejects.toThrow('Chairman escalation insert failed: Insert failed');
  });
});

describe('Chairman Escalation - requiresEscalation()', () => {
  it('returns true for ESCALATE', () => {
    expect(requiresEscalation({ decision: 'ESCALATE' })).toBe(true);
  });

  it('returns false for GO', () => {
    expect(requiresEscalation({ decision: 'GO' })).toBe(false);
  });

  it('returns false for BLOCK', () => {
    expect(requiresEscalation({ decision: 'BLOCK' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(requiresEscalation(null)).toBe(false);
  });
});

describe('Chairman Escalation - evaluateAndEscalate()', () => {
  it('evaluates and routes escalation when supabase provided', async () => {
    const mockDfeEvaluate = vi.fn().mockReturnValue({
      decision: 'ESCALATE',
      confidence: 0.6,
    });
    const mockData = { id: 'uuid-1', decision_type: 'dfe_escalation', status: 'pending', blocking: false };
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      }),
    };

    const result = await evaluateAndEscalate(
      { confidence: 0.6, gateType: 'QUALITY_GATE', sdKey: 'SD-TEST-001' },
      mockDfeEvaluate,
      supabase
    );

    expect(result.dfeResult.decision).toBe('ESCALATE');
    expect(result.escalation).toEqual(mockData);
  });

  it('skips DB insert when supabase is null', async () => {
    const mockDfeEvaluate = vi.fn().mockReturnValue({
      decision: 'ESCALATE',
      confidence: 0.6,
    });

    const result = await evaluateAndEscalate(
      { confidence: 0.6 },
      mockDfeEvaluate,
      null
    );

    expect(result.dfeResult.decision).toBe('ESCALATE');
    expect(result.escalation).toBeNull();
  });

  it('returns null escalation for GO decisions', async () => {
    const mockDfeEvaluate = vi.fn().mockReturnValue({
      decision: 'GO',
      confidence: 0.9,
    });

    const result = await evaluateAndEscalate(
      { confidence: 0.9 },
      mockDfeEvaluate
    );

    expect(result.dfeResult.decision).toBe('GO');
    expect(result.escalation).toBeNull();
  });
});

describe('Chairman Escalation - Constants', () => {
  it('exports DECISION_TYPES', () => {
    expect(DECISION_TYPES.DFE_ESCALATION).toBe('dfe_escalation');
    expect(DECISION_TYPES.GATE_REVIEW).toBe('gate_review');
    expect(DECISION_TYPES.OVERRIDE_REQUEST).toBe('override_request');
  });

  it('exports ESCALATION_STATUS', () => {
    expect(ESCALATION_STATUS.PENDING).toBe('pending');
    expect(ESCALATION_STATUS.REVIEWED).toBe('reviewed');
    expect(ESCALATION_STATUS.APPROVED).toBe('approved');
    expect(ESCALATION_STATUS.REJECTED).toBe('rejected');
  });
});
