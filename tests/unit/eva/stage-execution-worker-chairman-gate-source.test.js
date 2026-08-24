/**
 * SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 (FR-1a, TS-1) -- _handleChairmanGate() has
 * 5 distinct return points that previously all produced the identical
 * {blocked:false,killed:false,approved:true} shape, with no way to distinguish a genuine
 * chairman decision (2 branches) from an automated bypass (3 branches). Each branch below is
 * exercised independently against the real _handleChairmanGate() (not a reimplementation),
 * asserting the new `source` tag is correct -- this is the primary defense against FR-1's
 * recordGateAttempt() call mislabeling automated approvals as chairman-adjudicated.
 *
 * Mocking pattern mirrors the existing, passing
 * tests/unit/eva/stage-execution-worker-fixture-venture-gate.test.js file.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
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
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/eva/autonomy-model.js', () => ({ checkAutonomy: vi.fn() }));
vi.mock('../../../lib/eva/governance/can-auto-advance.js', () => ({ canAutoAdvance: vi.fn().mockResolvedValue(false) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({
    isKill: () => false,
    isPromotion: () => false,
    isReview: () => false,
    isBlocking: () => false,
    isReserved: () => false,
    isHighConsequence: () => false,
    gateTypeForAutonomy: () => 'stage_gate',
  }),
  _resetCacheForTest: vi.fn(),
}));

import { createOrReusePendingDecision, waitForDecision } from '../../../lib/eva/chairman-decision-watcher.js';
import { checkAutonomy } from '../../../lib/eva/autonomy-model.js';
import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

function createMockSupabase() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

describe('SD-LEO-INFRA-ALTIFYAI-INSTRUMENTATION-RETROFIT-001 FR-1a (TS-1): _handleChairmanGate() decision-source tagging', () => {
  let supabase, logger, worker;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    worker = new StageExecutionWorker({ supabase, logger, maxRetries: 0, retryDelayMs: 1 });
    checkAutonomy.mockResolvedValue({ action: 'require_approval', level: 'L0' });
  });

  it("source='autonomy_auto_approve' when checkAutonomy grants auto-approval", async () => {
    checkAutonomy.mockResolvedValue({ action: 'auto_approve', level: 'L4' });
    const result = await worker._handleChairmanGate('v-1', 10);
    expect(result).toEqual({ blocked: false, killed: false, approved: true, source: 'autonomy_auto_approve' });
    // MUTATION: this is one of 3 NON-chairman sources -- FR-1's recordGateAttempt() call must
    // NEVER fire for this source. If a future edit collapses this into 'chairman_decision', an
    // automated auto-approval would be mislabeled as chairman-adjudicated fleet-wide.
    expect(result.source).not.toBe('chairman_decision');
  });

  it("source='fixture_venture_skip' when the decision is skipped for a fixture venture", async () => {
    createOrReusePendingDecision.mockResolvedValue({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });
    const result = await worker._handleChairmanGate('fixture-v-1', 10);
    expect(result).toEqual({ blocked: false, killed: false, approved: true, source: 'fixture_venture_skip' });
    expect(result.source).not.toBe('chairman_decision');
  });

  it("source='chairman_decision' for an ALREADY-resolved chairman_decisions row found on re-entry", async () => {
    createOrReusePendingDecision.mockResolvedValue({ id: 'decision-1', isNew: false });
    supabase.from = vi.fn((table) => {
      if (table === 'chairman_decisions') {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { status: 'approved', decision: 'proceed' }, error: null }) };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }), single: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });
    const result = await worker._handleChairmanGate('v-2', 10);
    expect(result).toEqual({ blocked: false, killed: false, approved: true, source: 'chairman_decision' });
  });

  it("source='chairman_decision' for a FRESHLY-resolved decision via waitForDecision", async () => {
    createOrReusePendingDecision.mockResolvedValue({ id: 'decision-2', isNew: true });
    waitForDecision.mockResolvedValue({ status: 'approved' });
    worker._gateTimeoutMs = 1000; // non-zero so waitForDecision path is actually taken
    const result = await worker._handleChairmanGate('v-3', 10);
    expect(result).toEqual({ blocked: false, killed: false, approved: true, source: 'chairman_decision' });
    expect(waitForDecision).toHaveBeenCalled();
  });

  it('governance_auto_approve branch also tags a non-chairman source (via canAutoAdvance)', async () => {
    // _canAutoAdvance is the worker's own method (governance layers), not the mocked
    // can-auto-advance.js module directly -- exercised indirectly by leaving checkAutonomy at
    // require_approval and letting the governance layer approve instead.
    const canAdvanceSpy = vi.spyOn(worker, '_canAutoAdvance').mockResolvedValue(true);
    const result = await worker._handleChairmanGate('v-4', 10);
    expect(result).toEqual({ blocked: false, killed: false, approved: true, source: 'governance_auto_approve' });
    expect(result.source).not.toBe('chairman_decision');
    canAdvanceSpy.mockRestore();
  });
});
