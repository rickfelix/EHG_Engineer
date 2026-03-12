import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PipelineExecutor } from '../../../../lib/eva/pipeline-runner/pipeline-executor.js';

describe('PipelineExecutor', () => {
  let executor;
  let mockSupabase;
  let mockExecuteStageZero;
  let mockRecordGateSignal;
  let sampleVenture;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'venture-123' },
              error: null,
            }),
          }),
        }),
      }),
    };

    mockExecuteStageZero = vi.fn().mockResolvedValue({
      success: true,
      decision: 'ready',
      duration_ms: 1500,
    });

    mockRecordGateSignal = vi.fn().mockResolvedValue(undefined);

    executor = new PipelineExecutor({
      supabase: mockSupabase,
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      executeStageZero: mockExecuteStageZero,
      recordGateSignal: mockRecordGateSignal,
    });

    sampleVenture = {
      name: 'Synthetic-Democratizer-healthcare-1234',
      description: 'Test problem statement',
      problem_statement: 'Test problem statement',
      target_market: 'underserved consumer',
      origin_type: 'synthetic_pipeline',
      current_lifecycle_stage: 0,
      status: 'active',
      archetype: 'democratizer',
      is_synthetic: true,
      metadata: { stage_zero: { solution: 'AI solution' } },
      synthetic_metadata: {
        archetype_key: 'democratizer',
        seed: 42,
        batch_id: 'BATCH-1',
        batch_index: 0,
      },
    };
  });

  describe('execute', () => {
    it('returns success on successful pipeline run', async () => {
      const result = await executor.execute(sampleVenture);
      expect(result.success).toBe(true);
      expect(result.ventureId).toBe('venture-123');
      expect(result.archetype).toBe('democratizer');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('inserts venture into database', async () => {
      await executor.execute(sampleVenture);
      expect(mockSupabase.from).toHaveBeenCalledWith('ventures');
    });

    it('calls executeStageZero with nonInteractive flag', async () => {
      await executor.execute(sampleVenture);
      expect(mockExecuteStageZero).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'discovery_mode',
          options: expect.objectContaining({ nonInteractive: true }),
        }),
        expect.objectContaining({ supabase: mockSupabase })
      );
    });

    it('records gate signal after successful stage 0', async () => {
      await executor.execute(sampleVenture);
      expect(mockRecordGateSignal).toHaveBeenCalledWith(
        expect.objectContaining({ supabase: mockSupabase }),
        expect.objectContaining({
          ventureId: 'venture-123',
          gateBoundary: 'stage_0_synthetic',
          outcome: 'pass',
        })
      );
    });

    it('returns failure when venture insert fails', async () => {
      mockSupabase.from.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'insert failed' },
            }),
          }),
        }),
      });

      const result = await executor.execute(sampleVenture);
      expect(result.success).toBe(false);
      expect(result.error).toContain('insert failed');
    });

    it('returns failure when stage 0 throws', async () => {
      mockExecuteStageZero.mockRejectedValue(new Error('stage 0 crashed'));
      const result = await executor.execute(sampleVenture);
      expect(result.success).toBe(false);
      expect(result.error).toBe('stage 0 crashed');
    });

    it('succeeds even when gate signal fails (non-blocking)', async () => {
      mockRecordGateSignal.mockRejectedValue(new Error('signal failed'));
      const result = await executor.execute(sampleVenture);
      expect(result.success).toBe(true);
    });

    it('skips stage 0 when executeStageZero not provided', async () => {
      const simpleExecutor = new PipelineExecutor({
        supabase: mockSupabase,
        logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      });
      const result = await simpleExecutor.execute(sampleVenture);
      expect(result.success).toBe(true);
      expect(result.stageZeroResult).toBeUndefined();
    });
  });
});
