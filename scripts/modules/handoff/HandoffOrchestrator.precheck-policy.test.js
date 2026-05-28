/**
 * QF-20260508-515: precheckHandoff applies gate policies (writer/consumer asymmetry).
 * Verifies precheck honors validation_gate_registry DISABLED rows.
 *
 * SD-FDBK-INFRA-PLAN-LEAD-PRECHECK-001: precheck also merges DB-only validation
 * rules via validationOrchestrator.buildGatesFromRules (parity with execute +
 * dryRun), so dual-namespace gates like 3:subAgentOrchestration are surfaced.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyGatePoliciesMock = vi.fn();
const validateGatesAllMock = vi.fn().mockResolvedValue({
  passed: true, gateResults: {}, failedGates: [], passedGates: [], normalizedScore: 100
});
// Default: passthrough (no DB rules) — returns the policy-filtered gates unchanged.
const buildGatesFromRulesMock = vi.fn(async (gates) => gates);

vi.mock('./gate-policy-resolver.js', () => ({ applyGatePolicies: applyGatePoliciesMock }));
vi.mock('./gates/dfe-escalation-gate.js', () => ({
  createDFEEscalationGate: () => ({ name: 'DFE_ESCALATION_GATE' })
}));
vi.mock('./pre-checks/prerequisite-preflight.js', () => ({
  runPrerequisitePreflight: vi.fn().mockResolvedValue({ passed: true, issues: [] })
}));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({}) }));

const { HandoffOrchestrator } = await import('./HandoffOrchestrator.js');

function makeOrchestrator(sdRow, requiredGates) {
  return new HandoffOrchestrator({
    supabase: { mock: true },
    sdRepo: { getById: vi.fn().mockResolvedValue(sdRow) },
    validationOrchestrator: {
      validateGatesAll: validateGatesAllMock,
      buildGatesFromRules: buildGatesFromRulesMock
    },
    executors: { 'PLAN-TO-LEAD': { getRequiredGates: vi.fn().mockResolvedValue(requiredGates) } }
  });
}

const INFRA_SD = { id: 'X', sd_key: 'X', sd_type: 'infrastructure', title: 't' };

beforeEach(() => {
  applyGatePoliciesMock.mockReset();
  validateGatesAllMock.mockClear();
  buildGatesFromRulesMock.mockClear();
  buildGatesFromRulesMock.mockImplementation(async (gates) => gates);
});

describe('HandoffOrchestrator.precheckHandoff applies gate policies', () => {
  it('calls applyGatePolicies and passes filteredGates through buildGatesFromRules to validateGatesAll', async () => {
    applyGatePoliciesMock.mockResolvedValue({
      filteredGates: [{ name: 'GATE_KEEP' }], resolutions: [], fallbackUsed: false
    });
    const orchestrator = makeOrchestrator(INFRA_SD, [{ name: 'GATE_KEEP' }, { name: 'GATE_VISION_SCORE' }]);
    await orchestrator.precheckHandoff('PLAN-TO-LEAD', 'X');

    expect(applyGatePoliciesMock).toHaveBeenCalledTimes(1);
    expect(applyGatePoliciesMock.mock.calls[0][2].sdType).toBe('infrastructure');
    // buildGatesFromRules receives the policy-filtered gates (passthrough mock => unchanged)
    expect(buildGatesFromRulesMock).toHaveBeenCalledTimes(1);
    expect(buildGatesFromRulesMock.mock.calls[0][0].map(g => g.name)).toEqual(['GATE_KEEP']);
    const finalNames = validateGatesAllMock.mock.calls[0][0].map(g => g.name);
    expect(finalNames).toEqual(['GATE_KEEP']);
  });

  it('surfaces DB-only rule gates (e.g. 3:subAgentOrchestration) by passing buildGatesFromRules output to validateGatesAll', async () => {
    applyGatePoliciesMock.mockResolvedValue({
      filteredGates: [{ name: 'GATE_KEEP' }], resolutions: [], fallbackUsed: false
    });
    // Simulate the DB-rule merge: buildGatesFromRules appends a dual-namespace gate.
    buildGatesFromRulesMock.mockImplementation(async (gates) => [...gates, { name: '3:subAgentOrchestration' }]);
    const orchestrator = makeOrchestrator(INFRA_SD, [{ name: 'GATE_KEEP' }]);
    await orchestrator.precheckHandoff('PLAN-TO-LEAD', 'X');

    const finalNames = validateGatesAllMock.mock.calls[0][0].map(g => g.name);
    expect(finalNames).toContain('3:subAgentOrchestration');
    // Wiring: the merged set (not the raw filteredGates) reaches validateGatesAll.
    expect(finalNames).toEqual(['GATE_KEEP', '3:subAgentOrchestration']);
  });

  it('forwards sd + precheckMode in the context so buildGatesFromRules can apply orchestrator-child policy and stay write-free', async () => {
    applyGatePoliciesMock.mockResolvedValue({
      filteredGates: [{ name: 'GATE_KEEP' }], resolutions: [], fallbackUsed: false
    });
    const childSd = { id: 'C', sd_key: 'C', sd_type: 'infrastructure', title: 'child', metadata: { parent_orchestrator: 'ORCH-1' } };
    const orchestrator = makeOrchestrator(childSd, [{ name: 'GATE_KEEP' }]);
    await orchestrator.precheckHandoff('PLAN-TO-LEAD', 'C');

    // buildGatesFromRules (the real impl) early-returns hardcoded gates for children;
    // precheck must hand it the sd + handoffType + precheckMode so it can decide.
    const [, handoffType, ctx] = buildGatesFromRulesMock.mock.calls[0];
    expect(handoffType).toBe('PLAN-TO-LEAD');
    expect(ctx.sd).toBe(childSd);
    expect(ctx.precheckMode).toBe(true);
  });
});
