/**
 * QF-20260508-515: precheckHandoff applies gate policies (writer/consumer asymmetry).
 * Verifies precheck honors validation_gate_registry DISABLED rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyGatePoliciesMock = vi.fn();
const validateGatesAllMock = vi.fn().mockResolvedValue({
  passed: true, gateResults: {}, failedGates: [], passedGates: [], normalizedScore: 100
});

vi.mock('./gate-policy-resolver.js', () => ({ applyGatePolicies: applyGatePoliciesMock }));
vi.mock('./gates/dfe-escalation-gate.js', () => ({
  createDFEEscalationGate: () => ({ name: 'DFE_ESCALATION_GATE' })
}));
vi.mock('./pre-checks/prerequisite-preflight.js', () => ({
  runPrerequisitePreflight: vi.fn().mockResolvedValue({ passed: true, issues: [] })
}));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({}) }));

const { HandoffOrchestrator } = await import('./HandoffOrchestrator.js');

beforeEach(() => { applyGatePoliciesMock.mockReset(); validateGatesAllMock.mockClear(); });

describe('HandoffOrchestrator.precheckHandoff applies gate policies', () => {
  it('calls applyGatePolicies and passes filteredGates to validateGatesAll', async () => {
    applyGatePoliciesMock.mockResolvedValue({
      filteredGates: [{ name: 'GATE_KEEP' }], resolutions: [], fallbackUsed: false
    });
    const orchestrator = new HandoffOrchestrator({
      supabase: { mock: true },
      sdRepo: { getById: vi.fn().mockResolvedValue({ id: 'X', sd_key: 'X', sd_type: 'infrastructure', title: 't' }) },
      validationOrchestrator: { validateGatesAll: validateGatesAllMock },
      executors: { 'LEAD-TO-PLAN': { getRequiredGates: vi.fn().mockResolvedValue([{ name: 'GATE_KEEP' }, { name: 'GATE_VISION_SCORE' }]) } }
    });
    await orchestrator.precheckHandoff('LEAD-TO-PLAN', 'X');
    expect(applyGatePoliciesMock).toHaveBeenCalledTimes(1);
    expect(applyGatePoliciesMock.mock.calls[0][2].sdType).toBe('infrastructure');
    const filteredNames = validateGatesAllMock.mock.calls[0][0].map(g => g.name);
    expect(filteredNames).toEqual(['GATE_KEEP']);
  });
});
