/**
 * QF-20260521-812: _syncStageWork advisory_data construction.
 *
 * Studio-style stages (e.g. S18 Marketing Copy Studio) read advisory_data[section]
 * for per-section content and advisory_data.completedSections/totalSections for the
 * counter. The legacy flat Object.assign collapsed multiple typed artifacts whose
 * payloads share keys (marketing sections all carry persona_target/text/...), so only
 * the last survived and the counter read 0/9. This verifies the additive fix:
 * per-section keys (prefix-stripped artifactType) + populated counts, with the legacy
 * flat merge preserved for back-compat.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(), releaseProcessingLock: vi.fn(), markCompleted: vi.fn(),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({ createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn() }));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn().mockResolvedValue({ action: 'block', level: 'L0' }) }));
// Non-gate stage governance so stageStatus is not forced and no extra branches run.
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ isBlocking: () => false, isReview: () => false }),
}));

function createMockSupabase() {
  const upsertCalls = [];
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    // lifecycle_stage_config work_type lookup + _isInHardGateStages → benign nulls
    single: vi.fn().mockResolvedValue({ data: { work_type: 'artifact_only' }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn((payload) => { upsertCalls.push(payload); return Promise.resolve({ data: null, error: null }); }),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  return { from: vi.fn().mockReturnValue(chain), _upsertCalls: upsertCalls };
}

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

describe('_syncStageWork advisory_data (QF-20260521-812)', () => {
  let supabase; let worker;
  beforeEach(() => {
    supabase = createMockSupabase();
    worker = new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999 });
  });

  const marketingResult = {
    status: 'BLOCKED',
    startedAt: '2026-05-21T00:00:00.000Z',
    artifacts: [
      { artifactType: 'marketing_tagline', payload: { text: 'Tag', persona_target: 'Alex' } },
      { artifactType: 'marketing_app_store_desc', payload: { text: 'Desc', persona_target: 'Alex' } },
      { artifactType: 'marketing_landing_hero', payload: { headline: 'Hero', persona_target: 'Alex' } },
    ],
  };

  it('exposes each artifact under its prefix-stripped section key', async () => {
    await worker._syncStageWork('v1', 18, marketingResult);
    const ad = supabase._upsertCalls.at(-1).advisory_data;
    expect(ad.tagline).toEqual({ text: 'Tag', persona_target: 'Alex' });
    expect(ad.app_store_desc).toEqual({ text: 'Desc', persona_target: 'Alex' });
    expect(ad.landing_hero).toEqual({ headline: 'Hero', persona_target: 'Alex' });
  });

  it('records populated counts so the studio counter works', async () => {
    await worker._syncStageWork('v1', 18, marketingResult);
    const ad = supabase._upsertCalls.at(-1).advisory_data;
    expect(ad.totalSections).toBe(3);
    expect(ad.completedSections).toBe(3);
  });

  it('preserves the legacy flat merge for back-compat', async () => {
    await worker._syncStageWork('v1', 18, marketingResult);
    const ad = supabase._upsertCalls.at(-1).advisory_data;
    // Object.assign still ran (last-wins) — top-level keys remain present.
    expect(ad.persona_target).toBe('Alex');
    expect(typeof ad.text).toBe('string');
  });

  it('is a no-op for single-artifact / non-section payloads (does not invent keys)', async () => {
    await worker._syncStageWork('v1', 19, {
      status: 'COMPLETED',
      startedAt: '2026-05-21T00:00:00.000Z',
      artifacts: [{ artifactType: 'blueprint_sprint_plan', payload: { sprints: [1, 2] } }],
    });
    const ad = supabase._upsertCalls.at(-1).advisory_data;
    expect(ad.sprint_plan).toEqual({ sprints: [1, 2] }); // prefix-stripped key
    expect(ad.sprints).toEqual([1, 2]); // legacy flat merge preserved
    expect(ad.totalSections).toBe(1);
  });
});
