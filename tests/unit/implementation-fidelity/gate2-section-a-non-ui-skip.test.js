/**
 * QF-20260712-805 — GATE2 sub-validator 2A:uiComponentsImplemented hard-blocked
 * API-only/data/test-layer architecture-decomposed children even when the aggregate
 * GATE2 score was high (specimen: SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-A2 burned
 * both retries before shipping via a verified --force).
 *
 * Fix: scope 2A to children whose metadata.architecture_layer indicates a UI layer.
 * Non-UI layers (api/data/tests) skip with a logged reason instead of hard-blocking;
 * an UNSET layer (legacy/pre-decomposition SDs) must NOT be silently exempted — only
 * an EXPLICIT non-UI layer skips.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ sd: null, throwOnResolve: false }));

vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({
  resolveSdInputOrNull: async () => {
    if (h.throwOnResolve) throw new Error('simulated resolver failure');
    return { sd: h.sd };
  },
}));

const gate2Result = vi.hoisted(() => ({ value: null }));
vi.mock('../../../scripts/modules/implementation-fidelity-validation.js', () => ({
  validateGate2ExecToPlan: async () => gate2Result.value,
}));

const { registerGate2Validators } = await import(
  '../../../scripts/modules/handoff/validation/validator-registry/gates/gate-2-implementation-fidelity.js'
);
const { ValidatorRegistry } = await import(
  '../../../scripts/modules/handoff/validation/validator-registry/core.js'
);

function makeRegistry() {
  const registry = new ValidatorRegistry();
  registerGate2Validators(registry);
  return registry;
}

function makeContext(sdId = 'SD-X') {
  return { sd_id: sdId, supabase: {}, gateContext: {} };
}

describe('QF-20260712-805: 2A:uiComponentsImplemented non-UI-layer skip', () => {
  beforeEach(() => {
    h.sd = null;
    h.throwOnResolve = false;
    // A low aggregate Section A score -- if the skip did NOT fire, this would hard-fail.
    gate2Result.value = { sections: { A: { score: 0, issues: ['no UI found'] } } };
  });

  it('skips (passes) an api-layer child without touching the aggregate result', async () => {
    h.sd = { metadata: { architecture_layer: 'api' } };
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings[0]).toMatch(/2A skipped/i);
    expect(result.details.architecture_layer).toBe('api');
  });

  it('skips a data-layer child', async () => {
    h.sd = { metadata: { architecture_layer: 'data' } };
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(true);
    expect(result.details.architecture_layer).toBe('data');
  });

  it('skips a tests-layer child', async () => {
    h.sd = { metadata: { architecture_layer: 'tests' } };
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(true);
    expect(result.details.architecture_layer).toBe('tests');
  });

  it('does NOT skip a ui-layer child -- falls through to the normal aggregate check (and fails on a genuine gap)', async () => {
    h.sd = { metadata: { architecture_layer: 'ui' } };
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(false); // aggregate Section A score is 0 -- a real UI gap must still block
    expect(result.score).toBe(0);
  });

  it('does NOT skip when architecture_layer is unset (legacy/pre-decomposition SD) -- never silently exempts', async () => {
    h.sd = { metadata: {} };
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('fails open to the pre-QF hard-check behavior if the resolver throws', async () => {
    h.throwOnResolve = true;
    const registry = makeRegistry();
    const result = await registry.get('uiComponentsImplemented')(makeContext());
    expect(result.passed).toBe(false); // resolver failure never silently passes a real gap
    expect(result.score).toBe(0);
  });

  it('userWorkflowsImplemented and userActionsSupported inherit the same skip (they delegate to 2A)', async () => {
    h.sd = { metadata: { architecture_layer: 'api' } };
    const registry = makeRegistry();
    const workflows = await registry.get('userWorkflowsImplemented')(makeContext());
    const actions = await registry.get('userActionsSupported')(makeContext());
    expect(workflows.passed).toBe(true);
    expect(actions.passed).toBe(true);
  });
});
