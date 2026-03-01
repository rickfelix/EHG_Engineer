/**
 * Tests for chairman role gating on force overrides in DFE escalation gate
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V02: chairman_governance_model)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDFEEscalationGate } from '../../../scripts/modules/handoff/gates/dfe-escalation-gate.js';

function createMockSupabase({ escalationStatus = 'pending' } = {}) {
  return {
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'esc-123', decision_type: 'dfe_escalation', status: escalationStatus, blocking: false },
            error: null,
          }),
        }),
      }),
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }),
  };
}

describe('DFE Escalation Gate — Chairman Role Verification (GAP-012)', () => {
  let mockSupabase;

  beforeEach(() => {
    mockSupabase = createMockSupabase();
  });

  it('rejects force override without chairman role', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    // Low score triggers escalation, force=true but no chairman role
    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 50,
      force: true,
      role: 'developer', // Not a chairman
    });

    expect(result.passed).toBe(false);
    expect(result.gate_status).toBe('UNAUTHORIZED_OVERRIDE');
    expect(result.issues[0]).toMatch(/chairman role/i);
  });

  it('accepts force override with chairman role', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 50,
      force: true,
      role: 'chairman',
    });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('FORCE_OVERRIDE');
    expect(result.warnings[0]).toMatch(/chairman/i);
  });

  it('accepts force override with admin role', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 50,
      force: true,
      role: 'admin',
    });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('FORCE_OVERRIDE');
  });

  it('accepts force override with owner role', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 50,
      force: true,
      role: 'owner',
    });

    expect(result.passed).toBe(true);
    expect(result.gate_status).toBe('FORCE_OVERRIDE');
  });

  it('rejects force override with no role context', async () => {
    const gate = createDFEEscalationGate(mockSupabase, 'test-gate');

    const result = await gate.validator({
      sdId: 'test-sd',
      sdKey: 'SD-TEST-001',
      qualityScore: 50,
      force: true,
      // No role provided at all
    });

    expect(result.passed).toBe(false);
    expect(result.gate_status).toBe('UNAUTHORIZED_OVERRIDE');
    expect(result.issues[0]).toMatch(/none/); // role: none
  });
});
