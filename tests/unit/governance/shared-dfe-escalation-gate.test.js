/**
 * Shared DFE Escalation Gate Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-003
 *
 * Verifies the shared gate works with custom source parameter
 * and is used by all handoff executors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDFEEscalationGate } from '../../../scripts/modules/handoff/gates/dfe-escalation-gate.js';

function createMockSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'esc-shared-123', decision_type: 'dfe_escalation', status: 'pending', blocking: false },
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe('Shared DFE Escalation Gate', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  it('creates gate with custom source parameter', () => {
    const gate = createDFEEscalationGate(mockSupabase, 'lead-to-plan-gate');
    expect(gate.name).toBe('DFE_ESCALATION_GATE');
    expect(gate.required).toBe(true); // V04: blocking mode
    expect(typeof gate.validator).toBe('function');
  });

  it('uses default source when not provided', () => {
    const gate = createDFEEscalationGate(mockSupabase);
    expect(gate.name).toBe('DFE_ESCALATION_GATE');
  });

  it('fails closed on error (V04: blocking mode)', async () => {
    const brokenSupabase = {
      from: vi.fn().mockImplementation(() => { throw new Error('DB down'); }),
    };
    const gate = createDFEEscalationGate(brokenSupabase, 'test-gate');

    // Use low qualityScore (60) to trigger ESCALATE decision, which calls supabase and throws
    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 60,
    });

    expect(result.passed).toBe(false); // V04: fail-closed
    expect(result.gate_status).toBe('ERROR');
    expect(result.issues).toHaveLength(1);
  });

  it('returns PASS when confidence is high', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 90,
      gateResults: { normalizedScore: 90 },
    });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.gate_status).toBe('PASS');
  });
});
