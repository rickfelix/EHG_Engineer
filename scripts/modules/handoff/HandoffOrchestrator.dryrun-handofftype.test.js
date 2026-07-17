/**
 * SD-FDBK-INFRA-FIX-GATE-SUBAGENT-001 (FR-3): dryRunHandoff's --evaluate path must
 * populate validationContext.handoffType, or subagent-evidence-gate.js's
 * REQUIRED_SUBAGENTS[ctx.handoffType] silently resolves to [] (fail-open) regardless
 * of the actual handoff type.
 */

import { describe, it, expect, vi } from 'vitest';

const validateGatesAllMock = vi.fn().mockResolvedValue({
  passed: true, gateResults: {}, failedGates: [], passedGates: [], normalizedScore: 100
});
const buildGatesFromRulesMock = vi.fn(async (gates) => gates);

vi.mock('./gate-policy-resolver.js', () => ({
  applyGatePolicies: vi.fn().mockResolvedValue({
    filteredGates: [{ name: 'GATE_KEEP' }], resolutions: [], fallbackUsed: false
  })
}));
vi.mock('./gates/dfe-escalation-gate.js', () => ({
  createDFEEscalationGate: () => ({ name: 'DFE_ESCALATION_GATE' })
}));
vi.mock('../../../lib/supabase-client.js', () => ({ createSupabaseServiceClient: () => ({}) }));

const { HandoffOrchestrator } = await import('./HandoffOrchestrator.js');

const INFRA_SD = { id: 'X', sd_key: 'X', sd_type: 'infrastructure', title: 't' };

function makeOrchestrator() {
  return new HandoffOrchestrator({
    supabase: { mock: true },
    sdRepo: { getById: vi.fn().mockResolvedValue(INFRA_SD) },
    prdRepo: { getBySdId: vi.fn().mockResolvedValue(null) },
    validationOrchestrator: {
      loadValidationRules: vi.fn().mockResolvedValue([]),
      buildGatesFromRules: buildGatesFromRulesMock,
      validateGatesAll: validateGatesAllMock
    },
    executors: { 'PLAN-TO-LEAD': { getRequiredGates: vi.fn().mockResolvedValue([{ name: 'GATE_KEEP' }]) } }
  });
}

describe('HandoffOrchestrator.dryRunHandoff --evaluate populates handoffType', () => {
  it('passes handoffType through to buildGatesFromRules and validateGatesAll', async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.dryRunHandoff('PLAN-TO-LEAD', 'X', { evaluate: true });

    const buildCtx = buildGatesFromRulesMock.mock.calls[0][2];
    expect(buildCtx.handoffType).toBe('PLAN-TO-LEAD');

    const validateCtx = validateGatesAllMock.mock.calls[0][1];
    expect(validateCtx.handoffType).toBe('PLAN-TO-LEAD');
  });

  it('normalizes lowercase handoff type input to the canonical uppercase REQUIRED_SUBAGENTS key', async () => {
    const orchestrator = makeOrchestrator();
    await orchestrator.dryRunHandoff('plan-to-lead', 'X', { evaluate: true });

    expect(validateGatesAllMock.mock.calls[0][1].handoffType).toBe('PLAN-TO-LEAD');
  });
});
