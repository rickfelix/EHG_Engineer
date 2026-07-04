/**
 * QF-20260703-236 round-2 fix: createOrReusePendingDecision now returns
 * {id: null, skipped: true} for fixture ventures. These tests verify the 3
 * stage-execution-worker.js call sites that consume that return value no
 * longer throw / permanently block / silently misreport success when the
 * decision is skipped (found by deep-tier adversarial review on PR #5510).
 *
 * Deliberately a fresh, minimal file rather than extending
 * tests/unit/eva/stage-execution-worker.test.js, which is quarantined for an
 * unrelated, pre-existing reason (stale processOneStage mock assertions,
 * SD-LEO-INFRA-BASELINE-QUARANTINE-SWEEP-001) and would not reliably run in CI.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn(),
  releaseProcessingLock: vi.fn(),
  markCompleted: vi.fn(),
  getOrchestratorState: vi.fn().mockResolvedValue({ state: 'processing' }),
  ORCHESTRATOR_STATES: {
    IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked',
    FAILED: 'failed', COMPLETED: 'completed', KILLED_AT_REALITY_GATE: 'killed_at_reality_gate',
  },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(),
  waitForDecision: vi.fn(),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({
  emit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({
  checkAutonomy: vi.fn().mockResolvedValue({ action: 'require_approval', level: 'L0' }),
}));
vi.mock('../../../lib/eva/governance/can-auto-advance.js', () => ({
  canAutoAdvance: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({
    isKill: () => false,
    isPromotion: () => false,
    isReview: () => false,
    isBlocking: () => false,
    isReserved: () => false,
    gateTypeForAutonomy: () => 'stage_gate',
  }),
  _resetCacheForTest: vi.fn(),
}));
vi.mock('../../../lib/eva/stage-17/strategy-recommender.js', () => ({
  recommendStrategies: vi.fn().mockResolvedValue({
    ranked_strategies: [{ strategy: 'top-recommended-strategy' }],
  }),
}));

import { createOrReusePendingDecision, waitForDecision } from '../../../lib/eva/chairman-decision-watcher.js';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

function createMockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

function createLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('stage-execution-worker.js: fixture-venture skipped-decision consumers (QF-20260703-236 round 2)', () => {
  let supabase, logger, worker;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    logger = createLogger();
    worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });
  });

  describe('_handleChairmanGate', () => {
    it('auto-advances (approved:true) instead of blocking forever when the decision is skipped for a fixture venture', async () => {
      createOrReusePendingDecision.mockResolvedValue({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });

      const result = await worker._handleChairmanGate('fixture-venture-1', 10);

      expect(result).toEqual({ blocked: false, killed: false, approved: true });
      expect(waitForDecision).not.toHaveBeenCalled();
    });
  });

  describe('_ensureS17StrategySelected', () => {
    it('auto-selects the top-ranked recommended strategy instead of blocking/throwing when the decision is skipped', async () => {
      createOrReusePendingDecision.mockResolvedValue({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });

      const strategy = await worker._ensureS17StrategySelected('parity-test-venture-1');

      expect(strategy).toBe('top-recommended-strategy');
      expect(waitForDecision).not.toHaveBeenCalled();
    });

    it('still blocks on waitForDecision normally when the decision is NOT skipped (real venture)', async () => {
      createOrReusePendingDecision.mockResolvedValue({ id: 'real-decision-id', isNew: true, skipped: undefined });
      waitForDecision.mockResolvedValue({ status: 'approved' });
      supabase._chain.single.mockResolvedValue({ data: { metadata: { strategy: 'chairman-picked-strategy' } }, error: null });

      const strategy = await worker._ensureS17StrategySelected('real-venture-1');

      expect(waitForDecision).toHaveBeenCalledWith(
        expect.objectContaining({ decisionId: 'real-decision-id' }),
      );
      expect(strategy).toBe('chairman-picked-strategy');
    });
  });
});
