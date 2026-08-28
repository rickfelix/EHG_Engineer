/**
 * SD-LEO-INFRA-STAGE-RENUMBER-DRIFT-001 (FR-1 mutation-kill): _pollForWork and _processVenture
 * derive their stage ceiling from getStageGovernance(supabase).maxStageNumber rather than a
 * hardcoded MAX_STAGE literal. maxStageNumber resolves to 0 (not an error) when venture_stages
 * reads back empty, which would otherwise silently exclude every venture from
 * `.lt('current_lifecycle_stage', 0)` / never enter `while (currentStage <= 0)` for the whole
 * governance-cache TTL. Both call sites must fail LOUD instead (TESTING evidence
 * c3379b28-decd-4117-847e-72a0707f5c06: the original guard had zero assertions and survived
 * deletion byte-identically).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/eva/eva-orchestrator.js', () => ({ processStage: vi.fn() }));
vi.mock('../../../lib/eva/orchestrator-state-machine.js', () => ({
  acquireProcessingLock: vi.fn().mockResolvedValue({ acquired: false }),
  releaseProcessingLock: vi.fn().mockResolvedValue({}),
  markCompleted: vi.fn().mockResolvedValue({}),
  ORCHESTRATOR_STATES: { IDLE: 'idle', PROCESSING: 'processing', BLOCKED: 'blocked', FAILED: 'failed', COMPLETED: 'completed' },
}));
vi.mock('../../../lib/eva/chairman-decision-watcher.js', () => ({
  createOrReusePendingDecision: vi.fn(), waitForDecision: vi.fn(),
}));
vi.mock('../../../lib/eva/shared-services.js', () => ({ emit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../lib/eva/stage-governance.js', () => ({
  getStageGovernance: vi.fn().mockResolvedValue({ maxStageNumber: 0 }),
}));

import { StageExecutionWorker } from '../../../lib/eva/stage-execution-worker.js';

const silentLogger = { log() {}, warn() {}, error() {} };

describe('zero-ceiling guard (maxStageNumber=0 means empty/unavailable governance read, not a 0-stage pipeline)', () => {
  it('_pollForWork: aborts loudly (logs + returns []) instead of silently polling zero ventures', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [{ id: 'v-1', current_lifecycle_stage: 3, metadata: {} }], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };
    const worker = new StageExecutionWorker({ supabase, logger: silentLogger });
    const loggedError = vi.spyOn(silentLogger, 'error');

    const ready = await worker._pollForWork();

    expect(ready).toEqual([]);
    expect(loggedError).toHaveBeenCalledWith(expect.stringContaining('maxStageNumber=0'));
    // Never reached the ventures query — the abort fires before .lt() is called with a bogus 0.
    expect(chain.lt).not.toHaveBeenCalled();
  });

  it('_processVenture (via processOneStage): throws rather than silently no-oping the advancement loop', async () => {
    const supabase = { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) };
    const worker = new StageExecutionWorker({ supabase, logger: silentLogger });

    await expect(worker.processOneStage('v-1')).rejects.toThrow(/maxStageNumber=0/);
  });
});
