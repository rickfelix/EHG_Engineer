/**
 * DFE Escalation Gate Integration Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-001
 *
 * Verifies the full escalation pipeline:
 * gate validator → DFE evaluate → chairman escalation routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDFEEscalationGate } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/dfe-escalation-gate.js';

function createMockSupabase(insertResult = {}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'esc-123', decision_type: 'dfe_escalation', status: 'pending', blocking: false, ...insertResult },
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe('DFE Escalation Gate', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  it('returns passed=true when DFE decides GO (high confidence)', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = {
      sdId: 'SD-TEST-001',
      sdKey: 'SD-TEST-001',
      qualityScore: 90, // 0.90 confidence → above PHASE_GATE goThreshold of 0.80
    };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.dfe_decision).toBe('GO');
    expect(result.issues).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    // No supabase insert should happen for GO decisions
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('returns passed=true with warning when DFE decides ESCALATE (medium confidence)', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = {
      sdId: 'SD-TEST-002',
      sdKey: 'SD-TEST-002',
      sdUuid: 'uuid-test-002',
      qualityScore: 60, // 0.60 confidence → between escalate (0.4) and go (0.80) for PHASE_GATE
    };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true); // Advisory — never blocks
    expect(result.score).toBe(80);
    expect(result.dfe_decision).toBe('ESCALATE');
    expect(result.gate_status).toBe('ADVISORY_ESCALATION');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('DFE escalated to chairman');
    expect(result.escalation_id).toBe('esc-123');
    // Supabase should have been called to insert escalation
    expect(mockSupabase.from).toHaveBeenCalledWith('chairman_decisions');
  });

  it('returns passed=true with warning when DFE decides BLOCK (low confidence, non-critical)', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = {
      sdId: 'SD-TEST-003',
      sdKey: 'SD-TEST-003',
      qualityScore: 30, // 0.30 confidence → below escalate (0.4) for PHASE_GATE, but non-critical → ESCALATE
    };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true); // Advisory — never blocks
    expect(result.dfe_decision).toBe('ESCALATE'); // Non-critical context → ESCALATE not BLOCK
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns passed=true when supabase insert fails (graceful degradation)', async () => {
    const failingSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Connection refused' },
            }),
          }),
        }),
      }),
    };

    const gate = createDFEEscalationGate(failingSupabase);
    const ctx = {
      sdId: 'SD-TEST-004',
      qualityScore: 60, // Would trigger ESCALATE
    };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true); // Advisory — errors don't block
    expect(result.gate_status).toBe('SKIPPED');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('DFE escalation gate skipped');
  });

  it('uses gateResults.normalizedScore when available', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = {
      sdId: 'SD-TEST-005',
      gateResults: { normalizedScore: 95 }, // High score → GO
    };

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.dfe_decision).toBe('GO');
  });

  it('defaults to 85 confidence when no score context is available', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = { sdId: 'SD-TEST-006' }; // No score data

    const result = await gate.validator(ctx);

    expect(result.passed).toBe(true);
    expect(result.dfe_decision).toBe('GO'); // 0.85 >= 0.80 goThreshold for PHASE_GATE
  });

  it('gate is marked as not required (advisory)', () => {
    const gate = createDFEEscalationGate(mockSupabase);
    expect(gate.required).toBe(false);
    expect(gate.name).toBe('DFE_ESCALATION_GATE');
  });

  it('verifies chairman_decisions insert payload structure', async () => {
    const gate = createDFEEscalationGate(mockSupabase);
    const ctx = {
      sdId: 'SD-TEST-007',
      sdKey: 'SD-TEST-007',
      sdUuid: 'uuid-007',
      qualityScore: 55, // ESCALATE range
    };

    await gate.validator(ctx);

    // Verify the insert was called with correct structure
    const fromCall = mockSupabase.from;
    expect(fromCall).toHaveBeenCalledWith('chairman_decisions');

    const insertCall = fromCall.mock.results[0].value.insert;
    const insertPayload = insertCall.mock.calls[0][0];

    expect(insertPayload).toHaveProperty('decision_type', 'dfe_escalation');
    expect(insertPayload).toHaveProperty('status', 'pending');
    expect(insertPayload).toHaveProperty('blocking', false);
    expect(insertPayload.context).toHaveProperty('gate_type', 'PHASE_GATE');
    expect(insertPayload.context).toHaveProperty('sd_id', 'uuid-007');
    expect(insertPayload.context).toHaveProperty('sd_key', 'SD-TEST-007');
    expect(insertPayload.context).toHaveProperty('source', 'decision-filter-engine');
  });
});
