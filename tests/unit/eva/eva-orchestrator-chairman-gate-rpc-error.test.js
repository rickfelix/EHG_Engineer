/**
 * SD-LEO-FIX-RETRO-ACTION-ITEMS-001 (FR-2) — chairman-gate auto-approve RPC error handling
 * in eva-orchestrator.js processStage().
 *
 * Bug: the `if (autonomy.action === 'auto_approve')` branch called
 * `supabase.rpc('fn_chairman_decide', {...})` WITHOUT capturing the return value, then
 * unconditionally marked `stageOutput.chairmanGate = { status: 'approved', ... }` (and patched
 * it into every artifact payload). When the DB trigger reject_s16_programmatic_approval (or any
 * other DB-side rejection) returned an error, it was silently swallowed and the gate was marked
 * approved anyway — a code/DB state divergence (code believes "approved", DB row stays "pending").
 *
 * Fix: destructure `{ error: approveError }`; on a truthy error, log a warning and set
 * chairmanGate to `{ status: 'pending', decision_id, error }` instead of approved. The success
 * path (no error) is unchanged.
 *
 * These tests drive the REAL processStage() with the chairman gate armed (onBeforeAnalysis returns
 * a chairmanDecisionId + autonomyPreCheck → auto_approve) and assert the two RPC outcomes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mirror the mocks from tests/unit/eva/eva-orchestrator.test.js so the same minimal harness works.
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

vi.mock('../../../lib/eva/dependency-manager.js', () => ({
  checkDependencies: vi.fn().mockResolvedValue([]),
  getDependencyGraph: vi.fn().mockResolvedValue({ dependsOn: [], providesTo: [] }),
  wouldCreateCycle: vi.fn().mockResolvedValue(false),
  addDependency: vi.fn(),
  resolveDependency: vi.fn(),
  removeDependency: vi.fn(),
  MODULE_VERSION: '1.0.0',
}));

vi.mock('../../../lib/eva/shared-services.js', async () => {
  const actual = await vi.importActual('../../../lib/eva/shared-services.js');
  return { ...actual, emit: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../../lib/eva/devils-advocate.js', async (importOriginal) => ({
  ...(await importOriginal()),
  isDevilsAdvocateGate: vi.fn().mockReturnValue({ isGate: false, gateType: null }),
  getDevilsAdvocateReview: vi.fn(),
  buildArtifactRecord: vi.fn().mockReturnValue({}),
}));

// getTemplate supplies the onBeforeAnalysis hook that arms the chairman gate (returns a decision id).
vi.mock('../../../lib/eva/stage-templates/index.js', () => ({
  getTemplate: vi.fn(),
}));

// autonomyPreCheck → auto_approve so the chairman gate (and the downstream stage/reality gates)
// take the auto-approve path. Spread importOriginal so other consumers keep the real exports.
vi.mock('../../../lib/eva/autonomy-model.js', async (importOriginal) => ({
  ...(await importOriginal()),
  autonomyPreCheck: vi.fn(),
}));

import { processStage, _internal } from '../../../lib/eva/eva-orchestrator.js';
import { getTemplate } from '../../../lib/eva/stage-templates/index.js';
import { autonomyPreCheck } from '../../../lib/eva/autonomy-model.js';

const { STATUS } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() };

function createMockSupabase(rpcResult) {
  const ventureRow = {
    id: 'v-1', name: 'Test Venture', status: 'active',
    current_lifecycle_stage: 1, archetype: 'saas',
    created_at: '2026-01-01', autonomy_level: 'L0',
  };
  const mockFrom = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };
  return {
    from: vi.fn(() => ({ ...mockFrom })),
    // Only fn_chairman_decide is invoked in the reachable path; return the configured result.
    rpc: vi.fn(async (fn) => (fn === 'fn_chairman_decide' ? rpcResult : { data: null, error: null })),
  };
}

// A single analysis step that yields one artifact with an object payload, so the chairman gate's
// artifact-patch loop has something to patch and we can assert on result.artifacts[0].payload.
const artifactStep = {
  id: 'produce-artifact',
  artifactType: 'test_output',
  execute: async () => ({ artifactType: 'test_output', payload: { score: 7, cost: 100 }, source: 'test-step' }),
};

function runChairmanGateStage(mockSupabase) {
  return processStage(
    { ventureId: 'v-1', options: { dryRun: true, stageTemplate: { analysisSteps: [artifactStep] } } },
    {
      supabase: mockSupabase,
      logger: silentLogger,
      evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
      evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
      validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
    },
  );
}

describe('processStage chairman-gate auto-approve RPC error handling (FR-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Arm the chairman gate: onBeforeAnalysis returns a decision id.
    getTemplate.mockReturnValue({
      onBeforeAnalysis: async () => ({ chairmanDecisionId: 'dec-1' }),
    });
    autonomyPreCheck.mockResolvedValue({ action: 'auto_approve', level: 'L3' });
  });

  it('RPC error → chairmanGate is pending (NOT approved) and carries the error', async () => {
    const supabase = createMockSupabase({ data: null, error: { message: 'reject_s16_programmatic_approval' } });

    const result = await runChairmanGateStage(supabase);

    // The auto-approve RPC was attempted via the canonical path.
    expect(supabase.rpc).toHaveBeenCalledWith('fn_chairman_decide', expect.objectContaining({
      p_decision_id: 'dec-1',
      p_action: 'approved',
    }));

    // The gate divergence is closed: a rejected RPC must NOT mark the gate approved.
    const gate = result.artifacts[0].payload.chairmanGate;
    expect(gate.status).toBe('pending');
    expect(gate.status).not.toBe('approved');
    expect(gate.decision_id).toBe('dec-1');
    expect(gate.error).toBe('reject_s16_programmatic_approval');
  });

  it('RPC success → chairmanGate is approved (regression pin, unchanged behavior)', async () => {
    const supabase = createMockSupabase({ data: { ok: true }, error: null });

    const result = await runChairmanGateStage(supabase);

    expect(supabase.rpc).toHaveBeenCalledWith('fn_chairman_decide', expect.objectContaining({
      p_decision_id: 'dec-1',
      p_action: 'approved',
    }));

    const gate = result.artifacts[0].payload.chairmanGate;
    expect(gate.status).toBe('approved');
    expect(gate.decision_id).toBe('dec-1');
    expect(gate.rationale).toContain('Auto-approved');
    // Success path never sets an error field.
    expect(gate.error).toBeUndefined();
  });

  it('either way the overall stage still COMPLETES (chairman gate does not itself block)', async () => {
    const errSb = createMockSupabase({ data: null, error: { message: 'reject_s16_programmatic_approval' } });
    const okSb = createMockSupabase({ data: { ok: true }, error: null });

    const errResult = await runChairmanGateStage(errSb);
    const okResult = await runChairmanGateStage(okSb);

    expect(errResult.status).toBe(STATUS.COMPLETED);
    expect(okResult.status).toBe(STATUS.COMPLETED);
  });
});
