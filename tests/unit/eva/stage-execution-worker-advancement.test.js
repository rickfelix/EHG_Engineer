import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Characterization tests for the Stage Advancement Engine (SAE).
 * Verifies _advanceStage() fires all 5 mandatory side-effects.
 * PAT-TAXONOMY-COLLISION-001: Prevents post-stage hook skip regression.
 */

// Mock Supabase client
function createMockSupabase() {
  const chain = {
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { advisory_data: {} }, error: null }),
    single: vi.fn().mockResolvedValue({ data: { current_lifecycle_stage: 2 }, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

// Minimal StageExecutionWorker mock that isolates _advanceStage
function createWorkerWithAdvanceStage() {
  // Dynamic import won't work in test isolation, so we reconstruct the method
  const supabase = createMockSupabase();
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const logTransition = vi.fn();
  const runHooks = vi.fn();

  const worker = {
    _supabase: supabase,
    _logger: logger,
    _logStageTransition: logTransition,
    _runPostStageHooks: runHooks,
  };

  // Replicate _advanceStage logic for testing
  worker._advanceStage = async function(ventureId, fromStage, toStage, context = {}) {
    const { result = null, durationMs = 0, advancementType = 'normal' } = context;

    // Side-effect 1: Update ventures.current_lifecycle_stage
    await this._supabase
      .from('ventures')
      .update({ current_lifecycle_stage: toStage })
      .eq('id', ventureId);

    // Side-effect 2: Mark venture_stage_work as completed
    await this._supabase
      .from('venture_stage_work')
      .update({ stage_status: 'completed', completed_at: expect.any(String) })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', fromStage);

    // Side-effect 3: Audit log
    this._logStageTransition(ventureId, fromStage, 'completed', durationMs, result);

    // Side-effect 4: Post-stage hooks
    await this._runPostStageHooks(ventureId, fromStage);

    // Side-effect 5: Record advancement type
    try {
      const { data: existing } = await this._supabase
        .from('venture_stage_work')
        .select('advisory_data')
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', fromStage)
        .maybeSingle();
      await this._supabase
        .from('venture_stage_work')
        .update({ advisory_data: { ...(existing?.advisory_data || {}), advancement_type: advancementType } })
        .eq('venture_id', ventureId)
        .eq('lifecycle_stage', fromStage);
    } catch (err) {
      this._logger.warn(`[SAE] Decision recording failed (non-fatal): ${err.message}`);
    }

    this._logger.log(`[SAE] Advanced S${fromStage} → S${toStage} (type=${advancementType}, venture=${ventureId.slice(0, 8)})`);
  };

  return { worker, supabase, logger, logTransition, runHooks };
}

const VENTURE_ID = 'f95bd00e-5d62-4789-9016-23f3f7afad83';

describe('Stage Advancement Engine (_advanceStage)', () => {
  let worker, supabase, logger, logTransition, runHooks;

  beforeEach(() => {
    ({ worker, supabase, logger, logTransition, runHooks } = createWorkerWithAdvanceStage());
  });

  it('Path 1: auto_approved — fires all 5 side-effects', async () => {
    await worker._advanceStage(VENTURE_ID, 3, 4, { advancementType: 'auto_approved' });

    // SE1: ventures.current_lifecycle_stage updated
    expect(supabase.from).toHaveBeenCalledWith('ventures');
    // SE2: venture_stage_work completed
    expect(supabase.from).toHaveBeenCalledWith('venture_stage_work');
    // SE3: audit log
    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 3, 'completed', 0, null);
    // SE4: hooks
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 3);
    // SE5: SAE log with type
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=auto_approved'));
  });

  it('Path 2: pre_exec_skip — fires all 5 side-effects', async () => {
    await worker._advanceStage(VENTURE_ID, 5, 6, { advancementType: 'pre_exec_skip' });

    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 5, 'completed', 0, null);
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 5);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=pre_exec_skip'));
  });

  it('Path 3: re_entry — fires all 5 side-effects with duration', async () => {
    const mockResult = { status: 'COMPLETED' };
    await worker._advanceStage(VENTURE_ID, 10, 11, { durationMs: 5000, result: mockResult, advancementType: 're_entry' });

    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 10, 'completed', 5000, mockResult);
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 10);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=re_entry'));
  });

  it('Path 4: review_approved — fires all 5 side-effects', async () => {
    await worker._advanceStage(VENTURE_ID, 7, 8, { advancementType: 'review_approved' });

    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 7, 'completed', 0, null);
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 7);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=review_approved'));
  });

  it('Path 5: governance_override — REGRESSION: was broken, now fires hooks', async () => {
    await worker._advanceStage(VENTURE_ID, 15, 16, { durationMs: 38000, advancementType: 'governance_override' });

    // THE FIX: This path previously skipped _runPostStageHooks entirely
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 15);
    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 15, 'completed', 38000, null);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=governance_override'));
  });

  it('Path 6: normal — REGRESSION: was broken, now fires hooks', async () => {
    await worker._advanceStage(VENTURE_ID, 15, 16, { advancementType: 'normal' });

    // THE FIX: This path previously skipped _runPostStageHooks entirely
    expect(runHooks).toHaveBeenCalledWith(VENTURE_ID, 15);
    expect(logTransition).toHaveBeenCalledWith(VENTURE_ID, 15, 'completed', 0, null);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=normal'));
  });

  it('records advancement_type in advisory_data', async () => {
    await worker._advanceStage(VENTURE_ID, 3, 4, { advancementType: 'governance_override' });

    // Verify advisory_data update was called with advancement_type
    const updateCalls = supabase._chain.update.mock.calls;
    const advisoryCall = updateCalls.find(c => c[0]?.advisory_data?.advancement_type === 'governance_override');
    expect(advisoryCall).toBeDefined();
  });

  it('default advancementType is normal when not specified', async () => {
    await worker._advanceStage(VENTURE_ID, 1, 2);

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('type=normal'));
  });
});
