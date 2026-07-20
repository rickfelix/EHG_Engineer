/**
 * Fail-open coverage for the capture-forward hook added to StageAdvanceWorker.
 * SD-LEO-INFRA-CAPTURE-FORWARD-GATE-001 (TS-5, flagged by TESTING sub-agent review).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/eva/artifact-persistence-service.js', () => ({
  advanceStage: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../lib/eva/venture-capture-forward.js', () => ({
  captureVentureStage: vi.fn().mockRejectedValue(new Error('capture boom')),
}));

vi.mock('../../../lib/eva/template-extractor.js', () => ({
  resolveMinExtractStage: () => 15,
}));

const { StageAdvanceWorker } = await import('../../../lib/eva/workers/stage-advance-worker.js');
const { advanceStage } = await import('../../../lib/eva/artifact-persistence-service.js');
const { captureVentureStage } = await import('../../../lib/eva/venture-capture-forward.js');

function createMockSupabase() {
  // 1st stage_executions query per exec = "is current stage completed?" (non-empty); 2nd = "does
  // next stage already exist?" (empty, so the loop body proceeds instead of skipping via `continue`).
  let stageExecutionsCall = 0;

  return {
    from: vi.fn((table) => {
      if (table === 'workflow_executions') {
        // fetch-all-paginated (FR-6) appends .order() and awaits .range() as the
        // resolving terminal for the in_progress poll.
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: () => Promise.resolve({
            data: [{ id: 'exec-1', venture_id: 'v1', current_stage: 19 }],
            error: null,
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
        return q;
      }
      if (table === 'stage_executions') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: () => {
            stageExecutionsCall += 1;
            return Promise.resolve({ data: stageExecutionsCall === 1 ? [{ status: 'completed' }] : [] });
          },
        };
        return chain;
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe('StageAdvanceWorker capture-forward hook (fail-open)', () => {
  it('does not throw and still advances the stage when captureVentureStage rejects', async () => {
    const supabase = createMockSupabase();
    const worker = new StageAdvanceWorker({ supabase });

    await expect(worker.execute()).resolves.not.toThrow();

    expect(advanceStage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ ventureId: 'v1', fromStage: 19, toStage: 20 })
    );
    expect(captureVentureStage).toHaveBeenCalledWith(supabase, 'v1', 19);
  });
});
