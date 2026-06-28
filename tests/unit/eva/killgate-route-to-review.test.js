/**
 * Kill-gate route-to-review HOLD vs genuine KILL
 * SD-LEO-INFRA-KILLGATE-ROUTE-TO-REVIEW-HOLD-001
 *
 * Completes SD-LEO-INFRA-S5-KILL-GATE-DEMAND-FEASIBILITY-001's missing half: the orchestrator must
 * EXECUTE a route-to-review verdict (stageOutput.decision==='conditional_pass') as a HOLD — keep the
 * vision intact, mint a pending chairman_decision, return STATUS.HELD — NOT as a genuine KILL
 * (archive vision + BLOCKED). A structural failure (reality gate) is never downgraded to HOLD.
 */
import { describe, it, expect, vi } from 'vitest';

// Transitive deps with shebangs / IO that vitest can't transform (mirrors eva-orchestrator.test.js)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));
vi.mock('../../../lib/eva/stage-templates/index.js', () => ({
  getTemplate: vi.fn().mockReturnValue(null),
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
// The HOLD path mints via createOrReusePendingDecision — mock it to record the call.
// vi.hoisted so the spy exists before the hoisted vi.mock factory runs.
const { mintSpy } = vi.hoisted(() => ({ mintSpy: vi.fn() }));
mintSpy.mockResolvedValue({ id: 'dec-hold-1', health_score: 'red' });
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: mintSpy,
  waitForDecision: vi.fn(),
  createAdvisoryNotification: vi.fn(),
}));

import { processStage, _internal } from '../../../lib/eva/eva-orchestrator.js';
const { STATUS } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// A table-aware mock supabase: returns a vision doc for eva_vision_documents (so visionKey resolves
// at stage 5) and records every .update() payload so we can detect a vision archive.
function makeSupabase() {
  const updates = []; // { table, payload }
  const inserts = [];
  const ventureRow = {
    id: 'v-1', name: 'TestVenture', status: 'active',
    current_lifecycle_stage: 5, archetype: 'saas', created_at: '2026-01-01', autonomy_level: 'L0',
  };
  const visionRow = { vision_key: 'VISION-TestVenture-L2-001', status: 'active' };
  const from = (table) => {
    const isVision = table === 'eva_vision_documents';
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      single: async () => ({ data: isVision ? visionRow : ventureRow, error: null }),
      maybeSingle: async () => ({ data: isVision ? visionRow : ventureRow, error: null }),
      insert: (payload) => { inserts.push({ table, payload }); return builder; },
      update: (payload) => { updates.push({ table, payload }); return builder; },
    };
    return builder;
  };
  return { client: { from: vi.fn(from) }, updates, inserts };
}

// Build options.stageTemplate whose single analysis step emits an artifact payload carrying the
// kill-gate verdict (mergeArtifactOutputs spreads payload → stageOutput.decision).
function templateWithDecision(decision) {
  return {
    analysisSteps: [
      {
        id: 'kill-gate-step',
        execute: async () => ({
          artifactType: 'financial_model',
          payload: { decision, reasons: [{ message: 'demand unvalidated' }], remediationRoute: 'review' },
          source: 'test-killgate',
        }),
      },
    ],
  };
}

function visionArchived(updates) {
  return updates.some(u => u.table === 'eva_vision_documents' && u.payload && u.payload.status === 'archived');
}

const baseDeps = (supabase) => ({
  supabase,
  logger: silentLogger,
  evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
  evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
  validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
});

describe('Kill-gate route-to-review HOLD (SD-LEO-INFRA-KILLGATE-ROUTE-TO-REVIEW-HOLD-001)', () => {
  it('exports STATUS.HELD', () => {
    expect(STATUS.HELD).toBe('HELD');
  });

  it('route-to-review @ S5 → HELD, vision NOT archived, pending decision minted', async () => {
    mintSpy.mockClear();
    const { client, updates } = makeSupabase();
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { stageTemplate: templateWithDecision('conditional_pass') } },
      baseDeps(client),
    );
    expect(result.status).toBe(STATUS.HELD);
    expect(visionArchived(updates)).toBe(false);
    expect(mintSpy).toHaveBeenCalledTimes(1);
    expect(mintSpy.mock.calls[0][0]).toMatchObject({ stageNumber: 5, decisionType: 'stage_gate' });
  });

  it('genuine kill @ S5 (gate fails, not conditional_pass) → vision archived + BLOCKED', async () => {
    const { client, updates } = makeSupabase();
    const deps = baseDeps(client);
    deps.validateStageGateFn = vi.fn().mockResolvedValue({ passed: false, summary: 'financial viability fail' });
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { stageTemplate: templateWithDecision('kill') } },
      deps,
    );
    expect(result.status).toBe(STATUS.BLOCKED);
    expect(visionArchived(updates)).toBe(true);
  });

  it('backward-compat: a normal pass → COMPLETED, no archive, no HOLD mint', async () => {
    mintSpy.mockClear();
    const { client, updates } = makeSupabase();
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { stageTemplate: templateWithDecision('pass') } },
      baseDeps(client),
    );
    expect(result.status).toBe(STATUS.COMPLETED);
    expect(visionArchived(updates)).toBe(false);
    expect(mintSpy).not.toHaveBeenCalled();
  });

  it('HOLD respects dry-run: HELD with NO mint and NO vision update', async () => {
    mintSpy.mockClear();
    const { client, updates } = makeSupabase();
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { dryRun: true, stageTemplate: templateWithDecision('conditional_pass') } },
      baseDeps(client),
    );
    expect(result.status).toBe(STATUS.HELD);
    expect(mintSpy).not.toHaveBeenCalled();
    expect(visionArchived(updates)).toBe(false);
  });

  it('mis-route guard: conditional_pass + reality-gate hard fail → BLOCKED + archived (not HELD)', async () => {
    const { client, updates } = makeSupabase();
    const deps = baseDeps(client);
    deps.evaluateRealityGateFn = vi.fn().mockResolvedValue({ passed: false, error: 'artifacts missing' });
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { stageTemplate: templateWithDecision('conditional_pass') } },
      deps,
    );
    expect(result.status).toBe(STATUS.BLOCKED);
    expect(visionArchived(updates)).toBe(true);
  });
});
