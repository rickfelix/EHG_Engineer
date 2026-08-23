/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A — StageAdvanceWorker:
 *   TS-2: GATE_STAGES now includes 19 (was missing — this worker would
 *         auto-advance past Stage 19 while the daemon's own chokepoints held).
 *   Ordering: the RPC result (advanceStage()) is checked BEFORE
 *         workflow_executions.current_stage is mutated, so a blocked/failed
 *         advance leaves the observability pointer untouched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  advanceStage: vi.fn(),
}));

// SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-4): later describe block asserts advanceStage was NOT
// called -- without a per-test reset, mock.calls would accumulate across the whole file.
beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock('../../../lib/eva/venture-capture-forward.js', () => ({
  captureVentureStage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/eva/template-extractor.js', () => ({
  resolveMinExtractStage: () => 999, // above every stage in these tests — skip capture-forward
}));

const { StageAdvanceWorker } = await import('../../../lib/eva/workers/stage-advance-worker.js');
const { advanceStage } = await import('../../../lib/eva/artifact-persistence-service.js');

/**
 * Table-aware supabase fake. workflow_executions.update(...) calls are recorded so tests
 * can assert whether the observability pointer was mutated.
 */
function createMockSupabase({ currentStage }) {
  const workflowUpdates = [];
  let stageExecutionsCall = 0;

  const from = vi.fn((table) => {
    if (table === 'workflow_executions') {
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              range: () => Promise.resolve({
                data: [{ id: 'exec-1', venture_id: 'v1', current_stage: currentStage }],
                error: null,
              }),
            }),
          }),
        }),
        update: (payload) => ({
          eq: () => {
            workflowUpdates.push(payload);
            return Promise.resolve({ error: null });
          },
        }),
      };
    }
    if (table === 'stage_executions') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => {
          stageExecutionsCall += 1;
          // 1st call ("is current stage completed?") -> yes; 2nd ("next stage already
          // exists?") -> no, so the loop body proceeds instead of `continue`-ing early.
          return Promise.resolve({ data: stageExecutionsCall % 2 === 1 ? [{ status: 'completed' }] : [] });
        },
      };
      return chain;
    }
    // SD-LEO-INFRA-MINUS-GATE-SSOT-001 (FR-4): GATE_STAGES is now SSOT-derived
    // (blockingStagesRaw + an explicit 21/22 carve-out) via lib/eva/stage-governance.js.
    if (table === 'venture_stages') {
      const rows = Array.from({ length: 26 }, (_, i) => {
        const stage_number = i + 1;
        const gate_type = [3, 5, 13, 23].includes(stage_number) ? 'kill'
          : [10, 16, 17, 18, 19, 24, 25].includes(stage_number) ? 'promotion'
          : 'none';
        return { stage_number, gate_type, work_type: 'decision_gate', review_mode: 'auto', is_high_consequence: false };
      });
      return { select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, workflowUpdates };
}

describe('StageAdvanceWorker GATE_STAGES + advance-before-mutate ordering (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A)', () => {
  it('does NOT advance past Stage 19 (GATE_STAGES now includes 19)', async () => {
    // current_stage=18 -> nextStage=19, which must now be gated (was missing before this SD).
    const supabase = createMockSupabase({ currentStage: 18 });
    const worker = new StageAdvanceWorker({ supabase });

    await worker.execute();

    expect(advanceStage).not.toHaveBeenCalled();
    expect(supabase.workflowUpdates).toHaveLength(0);
  });

  it('checks the RPC result BEFORE mutating workflow_executions.current_stage: a blocked advance leaves the pointer untouched', async () => {
    advanceStage.mockRejectedValueOnce(new Error('[artifact-persistence-service] advanceStage RPC returned failure: high_consequence_gate_blocked'));
    // current_stage=19 -> nextStage=20 (not a GATE_STAGES member), so the loop body is
    // reached and advanceStage() itself is what blocks.
    const supabase = createMockSupabase({ currentStage: 19 });
    const worker = new StageAdvanceWorker({ supabase });

    await expect(worker.execute()).resolves.not.toThrow();

    expect(advanceStage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ ventureId: 'v1', fromStage: 19, toStage: 20 }),
    );
    // The critical assertion: workflow_executions.current_stage must NEVER be written
    // when the RPC blocked/failed the advance.
    expect(supabase.workflowUpdates).toHaveLength(0);
  });

  it('advances workflow_executions.current_stage only AFTER a successful RPC result', async () => {
    advanceStage.mockResolvedValueOnce({ success: true });
    const supabase = createMockSupabase({ currentStage: 19 });
    const worker = new StageAdvanceWorker({ supabase });

    await worker.execute();

    expect(advanceStage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ ventureId: 'v1', fromStage: 19, toStage: 20 }),
    );
    expect(supabase.workflowUpdates).toHaveLength(1);
    expect(supabase.workflowUpdates[0]).toMatchObject({ current_stage: 20 });
  });
});

describe('StageAdvanceWorker GATE_STAGES is now SSOT-derived (SD-LEO-INFRA-MINUS-GATE-SSOT-001 FR-4/TR-8)', () => {
  // Stages 10/18/25 (gate_type='promotion' in the SSOT) were OMITTED from the old hardcoded
  // set -- an active bypass this SD's raw-gate_type SSOT derivation now closes.
  it.each([10, 18, 25])('newly gates promotion stage %i (was omitted from the old hardcoded set)', async (gateStage) => {
    const supabase = createMockSupabase({ currentStage: gateStage - 1 });
    const worker = new StageAdvanceWorker({ supabase });

    await worker.execute();

    expect(advanceStage).not.toHaveBeenCalled();
    expect(supabase.workflowUpdates).toHaveLength(0);
  });

  // Stages 21/22 (gate_type='none', review_mode='review') remain gated via an EXPLICIT
  // carve-out -- not derived from the SSOT, since deriving from review_mode generically
  // would also sweep in stages 7/8/9/11 (out of this SD's investigated scope).
  it.each([21, 22])('keeps carve-out stage %i gated (review_mode stage, not gate_type-derived)', async (gateStage) => {
    const supabase = createMockSupabase({ currentStage: gateStage - 1 });
    const worker = new StageAdvanceWorker({ supabase });

    await worker.execute();

    expect(advanceStage).not.toHaveBeenCalled();
    expect(supabase.workflowUpdates).toHaveLength(0);
  });
});
