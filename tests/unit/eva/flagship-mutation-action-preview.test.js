/**
 * Flagship-mutation action-preview verify gate
 * SD-LEO-INFRA-FLAGSHIP-MUTATION-VERIFY-GATE-001
 *
 * Generalizes the KILLGATE route-to-review fix: a flagship/irreversible venture mutation must
 * surface the would-be EXECUTION ACTION (would-advance / would-hold-for-review / would-archive /
 * would-fail) on its dry-run AND real result, and a consequential mutation must pass a
 * deterministic adversarial consistency check (refute-it-is-safe) + a presence guard before
 * executing. Pure helpers are tested directly; processStage dry-run surfacing reuses the
 * killgate harness.
 */
import { describe, it, expect, vi } from 'vitest';

// Transitive deps with shebangs / IO vitest can't transform (mirrors killgate-route-to-review.test.js)
vi.mock('../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));
vi.mock('../../../lib/eva/stage-templates/index.js', () => ({ getTemplate: vi.fn().mockReturnValue(null) }));
vi.mock('../../../lib/eva/dependency-manager.js', () => ({
  checkDependencies: vi.fn().mockResolvedValue([]),
  getDependencyGraph: vi.fn().mockResolvedValue({ dependsOn: [], providesTo: [] }),
  wouldCreateCycle: vi.fn().mockResolvedValue(false),
  addDependency: vi.fn(), resolveDependency: vi.fn(), removeDependency: vi.fn(), MODULE_VERSION: '1.0.0',
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
const { mintSpy } = vi.hoisted(() => ({ mintSpy: vi.fn() }));
mintSpy.mockResolvedValue({ id: 'dec-hold-1', health_score: 'red' });
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: mintSpy,
  waitForDecision: vi.fn(),
  createAdvisoryNotification: vi.fn(),
}));

import { processStage, _internal } from '../../../lib/eva/eva-orchestrator.js';
const { STATUS, FILTER_ACTION, buildResult, computeActionPreview, assertActionPreviewConsistent } = _internal;

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

function makeSupabase() {
  const updates = [];
  const ventureRow = { id: 'v-1', name: 'TestVenture', status: 'active', current_lifecycle_stage: 5, archetype: 'saas', created_at: '2026-01-01', autonomy_level: 'L0' };
  const visionRow = { vision_key: 'VISION-TestVenture-L2-001', status: 'active' };
  const from = (table) => {
    const isVision = table === 'eva_vision_documents';
    const b = {
      select: () => b, eq: () => b, in: () => b, is: () => b, order: () => b, limit: () => b,
      single: async () => ({ data: isVision ? visionRow : ventureRow, error: null }),
      maybeSingle: async () => ({ data: isVision ? visionRow : ventureRow, error: null }),
      insert: () => b, update: (payload) => { updates.push({ table, payload }); return b; },
    };
    return b;
  };
  return { client: { from: vi.fn(from) }, updates };
}
function templateWithDecision(decision) {
  return { analysisSteps: [{ id: 'kill-gate-step', execute: async () => ({ artifactType: 'financial_model', payload: { decision, reasons: [{ message: 'demand unvalidated' }], remediationRoute: 'review' }, source: 'test' }) }] };
}
const baseDeps = (supabase) => ({
  supabase, logger: silentLogger,
  evaluateDecisionFn: vi.fn().mockReturnValue({ auto_proceed: true, triggers: [], recommendation: 'AUTO_PROCEED' }),
  evaluateRealityGateFn: vi.fn().mockResolvedValue({ passed: true, status: 'PASS' }),
  validateStageGateFn: vi.fn().mockResolvedValue({ passed: true }),
});

describe('FR-1 computeActionPreview — mirrors the real decision branches', () => {
  it('route-to-review -> would-hold-for-review', () => {
    expect(computeActionPreview({ resolvedStage: 5, isRouteToReview: true }).action).toBe('would-hold-for-review');
  });
  it('gate-blocked at a kill stage -> would-archive', () => {
    expect(computeActionPreview({ resolvedStage: 5, gateBlocked: true }).action).toBe('would-archive');
    expect(computeActionPreview({ resolvedStage: 3, gateBlocked: true }).action).toBe('would-archive');
  });
  it('gate-blocked at a non-kill stage -> would-fail', () => {
    expect(computeActionPreview({ resolvedStage: 12, gateBlocked: true }).action).toBe('would-fail');
  });
  it('auto-proceed pass -> would-advance (or would-complete when advance suppressed)', () => {
    expect(computeActionPreview({ resolvedStage: 8, filterDecision: { action: FILTER_ACTION.AUTO_PROCEED }, autoProceed: true }).action).toBe('would-advance');
    expect(computeActionPreview({ resolvedStage: 8, filterDecision: { action: FILTER_ACTION.AUTO_PROCEED }, autoProceed: false }).action).toBe('would-complete');
  });
  it('require-review / stop filter -> would-require-review / would-stop', () => {
    expect(computeActionPreview({ resolvedStage: 8, filterDecision: { action: FILTER_ACTION.REQUIRE_REVIEW } }).action).toBe('would-require-review');
    expect(computeActionPreview({ resolvedStage: 8, filterDecision: { action: FILTER_ACTION.STOP } }).action).toBe('would-stop');
  });
});

describe('FR-3/FR-4 assertActionPreviewConsistent — adversarial cross-check + presence guard', () => {
  it('passes when the previewed action matches the terminal status', () => {
    expect(() => assertActionPreviewConsistent({ action: 'would-archive' }, STATUS.BLOCKED)).not.toThrow();
    expect(() => assertActionPreviewConsistent({ action: 'would-hold-for-review' }, STATUS.HELD)).not.toThrow();
    expect(() => assertActionPreviewConsistent({ action: 'would-advance' }, STATUS.COMPLETED)).not.toThrow();
  });
  it('refutes a contradiction (action implies a different status)', () => {
    expect(() => assertActionPreviewConsistent({ action: 'would-advance' }, STATUS.BLOCKED)).toThrow(/INCONSISTENT/);
    expect(() => assertActionPreviewConsistent({ action: 'would-archive' }, STATUS.COMPLETED)).toThrow(/INCONSISTENT/);
  });
  it('presence guard: a missing/empty action_preview is rejected (fail-loud)', () => {
    expect(() => assertActionPreviewConsistent(null, STATUS.BLOCKED)).toThrow(/NO_ACTION_PREVIEW/);
    expect(() => assertActionPreviewConsistent({}, STATUS.HELD)).toThrow(/NO_ACTION_PREVIEW/);
  });
  it('rejects an unknown action value', () => {
    expect(() => assertActionPreviewConsistent({ action: 'would-teleport' }, STATUS.COMPLETED)).toThrow(/INCONSISTENT/);
  });
});

describe('FR-2 buildResult carries action_preview (default null)', () => {
  it('attaches action_preview when provided', () => {
    const r = buildResult({ ventureId: 'v', stageId: 5, startedAt: 'now', correlationId: 'c', status: STATUS.HELD, actionPreview: { action: 'would-hold-for-review', reason: 'x' } });
    expect(r.action_preview.action).toBe('would-hold-for-review');
  });
  it('defaults to null when omitted', () => {
    const r = buildResult({ ventureId: 'v', stageId: 5, startedAt: 'now', correlationId: 'c', status: STATUS.COMPLETED });
    expect(r.action_preview).toBeNull();
  });
});

describe('FR-2 dry-run surfaces the would-be action (no side-effects)', () => {
  it('route-to-review dry-run -> HELD + action_preview would-hold-for-review, no mint', async () => {
    mintSpy.mockClear();
    const { client, updates } = makeSupabase();
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { dryRun: true, stageTemplate: templateWithDecision('conditional_pass') } },
      baseDeps(client),
    );
    expect(result.status).toBe(STATUS.HELD);
    expect(result.action_preview.action).toBe('would-hold-for-review');
    expect(mintSpy).not.toHaveBeenCalled();
    expect(updates.some(u => u.table === 'eva_vision_documents' && u.payload?.status === 'archived')).toBe(false);
  });

  it('genuine kill dry-run -> BLOCKED + action_preview would-archive, no vision archive', async () => {
    const { client, updates } = makeSupabase();
    const deps = baseDeps(client);
    deps.validateStageGateFn = vi.fn().mockResolvedValue({ passed: false, summary: 'financial viability fail' });
    const result = await processStage(
      { ventureId: 'v-1', stageId: 5, options: { dryRun: true, stageTemplate: templateWithDecision('kill') } },
      deps,
    );
    expect(result.status).toBe(STATUS.BLOCKED);
    expect(result.action_preview.action).toBe('would-archive');
    expect(updates.some(u => u.table === 'eva_vision_documents' && u.payload?.status === 'archived')).toBe(false);
  });
});
