/**
 * SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A — StageAdvanceWorker:
 *   TS-2: GATE_STAGES now includes 19 (was missing — this worker would
 *         auto-advance past Stage 19 while the daemon's own chokepoints held).
 *   Ordering: the RPC result (advanceStage()) is checked BEFORE
 *         workflow_executions.current_stage is mutated, so a blocked/failed
 *         advance leaves the observability pointer untouched.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  advanceStage: vi.fn(),
}));

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
