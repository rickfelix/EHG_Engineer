import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoIterationLoop } from '../../../../lib/eva/experiments/auto-iteration.js';

// Mock the imports
vi.mock('../../../../lib/eva/experiments/meta-optimizer.js', () => ({
  generateNextChallenger: vi.fn().mockResolvedValue({
    prompt_name: 'test_prompt_challenger_123',
    prompt_content: 'modified prompt content',
    hypothesis: 'rephrase perturbation should improve scores',
    perturbation_used: 'rephrase',
  }),
}));

vi.mock('../../../../lib/eva/experiments/prompt-promotion.js', () => ({
  evaluatePromotion: vi.fn(),
}));

import { evaluatePromotion } from '../../../../lib/eva/experiments/prompt-promotion.js';

describe('AutoIterationLoop', () => {
  let loop;
  let mockSupabase;
  let mockDemandEstimator;
  let mockLogger;

  const mockAnalysis = {
    status: 'conclusive',
    total_samples: 30,
    stopping: { winner: 'champion' },
    per_variant: {
      champion: { mean_score: 0.85, posterior: { alpha: 25, beta: 5 } },
      challenger: { mean_score: 0.70, posterior: { alpha: 20, beta: 10 } },
    },
    comparisons: [{ variantA: 'champion', probABetterThanB: 0.95 }],
  };

  const mockExperiment = {
    id: 'exp-1',
    name: 'test_experiment',
    variants: [
      { key: 'champion', prompt_name: 'stage_zero_synthesis_v1' },
      { key: 'challenger', prompt_name: 'stage_zero_synthesis_v1_challenger_old' },
    ],
    config: { version: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    mockDemandEstimator = {
      emit: vi.fn(),
      config: { minSamplesPerExperiment: 20, burstBatchSize: 12 },
    };
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'exp-2', name: 'test_experiment_v2' },
              error: null,
            }),
          }),
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { content: 'champion prompt text', prompt_text: 'champion prompt text', metadata: {} },
              error: null,
            }),
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    };
  });

  describe('processCompletion', () => {
    it('should skip iteration when not promoted', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: false,
        reason: 'experiment_not_conclusive',
      });

      loop = new AutoIterationLoop({}, {
        supabase: mockSupabase,
        demandEstimator: mockDemandEstimator,
        logger: mockLogger,
      });

      const result = await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      expect(result.iterated).toBe(false);
      expect(result.reason).toBe('experiment_not_conclusive');
    });

    it('should create successor experiment on promotion', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: true,
        winner: 'champion',
        promptName: 'stage_zero_synthesis_v1',
        confidence: 0.95,
      });

      loop = new AutoIterationLoop({}, {
        supabase: mockSupabase,
        demandEstimator: mockDemandEstimator,
        logger: mockLogger,
      });

      const result = await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      expect(result.iterated).toBe(true);
      expect(result.iteration).toBe(1);
      expect(result.successorExperiment.id).toBe('exp-2');
    });

    it('should trigger pipeline burst via DemandEstimator', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: true,
        winner: 'champion',
        promptName: 'stage_zero_synthesis_v1',
        confidence: 0.95,
      });

      loop = new AutoIterationLoop({}, {
        supabase: mockSupabase,
        demandEstimator: mockDemandEstimator,
        logger: mockLogger,
      });

      await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      expect(mockDemandEstimator.emit).toHaveBeenCalledWith(
        'burst-needed',
        expect.objectContaining({
          experimentId: 'exp-2',
          source: 'auto-iteration',
        })
      );
    });

    it('should respect max iterations safety limit', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: true,
        winner: 'champion',
        promptName: 'stage_zero_synthesis_v1',
        confidence: 0.95,
      });

      loop = new AutoIterationLoop({ maxIterations: 1 }, {
        supabase: mockSupabase,
        demandEstimator: mockDemandEstimator,
        logger: mockLogger,
      });

      // First iteration succeeds
      await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      // Second iteration blocked by max limit
      const result = await loop.processCompletion({
        experimentId: 'exp-2',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      expect(result.iterated).toBe(false);
      expect(result.reason).toBe('max_iterations_reached');
    });

    it('should respect cooldown between iterations', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: true,
        winner: 'champion',
        promptName: 'stage_zero_synthesis_v1',
        confidence: 0.95,
      });

      loop = new AutoIterationLoop(
        { maxIterations: 10, cooldownMs: 60_000 },
        {
          supabase: mockSupabase,
          demandEstimator: mockDemandEstimator,
          logger: mockLogger,
        }
      );

      await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      // Immediate second attempt — should be blocked by cooldown
      const result = await loop.processCompletion({
        experimentId: 'exp-2',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      expect(result.iterated).toBe(false);
      expect(result.reason).toBe('cooldown_active');
    });
  });

  describe('resetCounter', () => {
    it('should reset iteration count', async () => {
      evaluatePromotion.mockResolvedValue({
        promoted: true,
        winner: 'champion',
        promptName: 'stage_zero_synthesis_v1',
        confidence: 0.95,
      });

      loop = new AutoIterationLoop({ maxIterations: 1, cooldownMs: 0 }, {
        supabase: mockSupabase,
        demandEstimator: mockDemandEstimator,
        logger: mockLogger,
      });

      await loop.processCompletion({
        experimentId: 'exp-1',
        analysis: mockAnalysis,
        experiment: mockExperiment,
      });

      loop.resetCounter();

      const status = loop.status();
      expect(status.iterationCount).toBe(0);
    });
  });

  describe('status', () => {
    it('should return current iteration status', () => {
      loop = new AutoIterationLoop({ maxIterations: 5 }, { logger: mockLogger });
      const status = loop.status();
      expect(status.iterationCount).toBe(0);
      expect(status.maxIterations).toBe(5);
      expect(status.lastIterationAt).toBeNull();
    });
  });
});
