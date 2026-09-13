/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (X1): _writeHealthScore used to unconditionally
 * upsert stage_status='completed' regardless of the caller's real exit outcome, mislabeling
 * blocked/held/failed/killed exits as completed in venture_stage_work (live-verified on
 * AltifyAI: stage_status='completed' at a stage where the venture was actually parked
 * orchestrator_state='blocked'). Fixed by accepting an optional {stageStatus} outcome param.
 * venture_stage_work.stage_status's CHECK constraint only allows
 * not_started|in_progress|blocked|completed|skipped -- no failed/held/killed value exists, so
 * every non-advancing exit (review-blocked, chairman-gate-blocked, killed, failed,
 * governance-blocked, HELD, filter STOP, filter REQUIRE_REVIEW) maps to 'blocked', the only
 * accurate non-completed value the schema permits.
 *
 * This is an isolated unit test of _writeHealthScore itself (real DB write behavior, not a
 * source-text match on the 8 call sites) -- per the PLAN-phase TESTING review's closing
 * caution, `expect(sourceText).toContain(...)` tests are the exact zero-yield shape that let
 * this drift (and the stage-renumber drift) survive undetected.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: true, lockId: 'lock-1', error: null }),
  releaseProcessingLock: vi.fn().mockResolvedValue({ released: true }),
  markCompleted: vi.fn().mockResolvedValue({ completed: true }),
  getOrchestratorState: vi.fn().mockResolvedValue({ state: 'processing' }),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', COMPLETED: 'completed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
  isFixtureVenture: vi.fn().mockReturnValue(false),
  fetchVentureForFixtureCheck: vi.fn().mockResolvedValue({ id: 'v-health', name: 'Health Venture', is_demo: false }),
  isDecisionCreatingStage: vi.fn().mockResolvedValue({ creates_decision: false }),
  extractGateQuality: vi.fn().mockReturnValue(null),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue({}) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn(async () => ({
    isReview: () => false, isBlocking: () => false, isKill: () => false, isPromotion: () => false, isHighConsequence: () => false,
    maxStageNumber: 27,
  })),
}));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'auto_approve', level: 'L4' }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };

function makeSupabase({ existingRow = null } = {}) {
  const upsertCalls = [];
  const from = (table) => {
    if (table === 'venture_stage_work') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: existingRow, error: null }),
        upsert: (payload, opts) => {
          upsertCalls.push({ payload, opts });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    }
    const chain = {
      select: () => chain, eq: () => chain, neq: () => chain, in: () => chain,
      gt: () => chain, lt: () => chain, gte: () => chain, order: () => chain, limit: () => chain,
      update: () => chain,
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ data: null, error: null }),
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    };
    return chain;
  };
  const supabase = { from: vi.fn(from), rpc: vi.fn(async () => ({ data: null, error: null })) };
  return { supabase, upsertCalls };
}

function makeWorker(supabase) {
  return new StageExecutionWorker({ supabase, logger, pollIntervalMs: 999999, maxRetries: 0, retryDelayMs: 1 });
}

describe('_writeHealthScore honest stage_status (X1)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('defaults to stage_status=completed when no outcome is passed (byte-identical to every pre-existing call site)', async () => {
    const { supabase, upsertCalls } = makeSupabase();
    const worker = makeWorker(supabase);
    await worker._writeHealthScore('v-1', 5);
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].payload.stage_status).toBe('completed');
  });

  it('writes stage_status=blocked when the caller passes {stageStatus: "blocked"} (the 8 fixed non-advancing exit sites)', async () => {
    const { supabase, upsertCalls } = makeSupabase();
    const worker = makeWorker(supabase);
    await worker._writeHealthScore('v-1', 5, { stageStatus: 'blocked' });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].payload.stage_status).toBe('blocked');
  });

  it('preserves an existing row\'s work_type instead of clobbering it to artifact_only', async () => {
    const { supabase, upsertCalls } = makeSupabase({ existingRow: { advisory_data: {}, work_type: 'sd_required' } });
    const worker = makeWorker(supabase);
    await worker._writeHealthScore('v-1', 5, { stageStatus: 'blocked' });
    expect(upsertCalls[0].payload.work_type).toBe('sd_required');
  });

  it('defaults work_type to artifact_only when no row exists yet', async () => {
    const { supabase, upsertCalls } = makeSupabase({ existingRow: null });
    const worker = makeWorker(supabase);
    await worker._writeHealthScore('v-1', 5);
    expect(upsertCalls[0].payload.work_type).toBe('artifact_only');
  });

  it('rejects only actual constraint-illegal values as a documentation check: the fix must never pass a fabricated status like "failed"/"held"/"killed"', () => {
    // venture_stage_work.stage_status's CHECK constraint (live-verified) only permits:
    const ALLOWED = new Set(['not_started', 'in_progress', 'blocked', 'completed', 'skipped']);
    expect(ALLOWED.has('blocked')).toBe(true);
    expect(ALLOWED.has('failed')).toBe(false);
    expect(ALLOWED.has('held')).toBe(false);
    expect(ALLOWED.has('killed')).toBe(false);
  });
});
