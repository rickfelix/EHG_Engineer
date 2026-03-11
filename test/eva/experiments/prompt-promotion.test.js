/**
 * Prompt Promotion Tests
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-F
 */

import { describe, test, expect, vi } from 'vitest';
import {
  evaluatePromotion,
  createPromotionRecord,
  getWinnerConfidence,
} from '../../../lib/eva/experiments/prompt-promotion.js';

// ── Fixtures ──────────────────────────────────────────

const mockDeps = {
  supabase: {},
  logger: { log: vi.fn(), warn: vi.fn() },
};

const conclusiveAnalysis = {
  status: 'conclusive',
  total_samples: 50,
  per_variant: {
    control: { count: 25, mean_score: 65.0 },
    variant_a: { count: 25, mean_score: 78.0 },
  },
  comparisons: [
    { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.05, probBBetterThanA: 0.95 },
  ],
  stopping: { shouldStop: true, reason: "'variant_a' beats 'control'", winner: 'variant_a' },
};

const mockExperiment = {
  id: 'exp-001',
  variants: [
    { key: 'control', label: 'Default Evaluation', weight: 0.5 },
    { key: 'variant_a', label: 'Alternative Prompt', weight: 0.5, prompt_name: 'stage-00-acquirability-v2' },
  ],
};

// ── evaluatePromotion ────────────────────────────────

describe('evaluatePromotion', () => {
  test('throws when experimentId is missing', async () => {
    await expect(evaluatePromotion(mockDeps, { analysis: {} }))
      .rejects.toThrow('experimentId is required');
  });

  test('throws when analysis is missing', async () => {
    await expect(evaluatePromotion(mockDeps, { experimentId: 'exp-001' }))
      .rejects.toThrow('analysis is required');
  });

  test('returns not promoted for non-conclusive experiments', async () => {
    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: { status: 'running', total_samples: 10 },
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('experiment_not_conclusive');
  });

  test('returns not promoted when no winner', async () => {
    const noWinnerAnalysis = {
      ...conclusiveAnalysis,
      stopping: { shouldStop: true, reason: 'Max samples', winner: null },
    };

    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: noWinnerAnalysis,
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('no_winner');
  });

  test('returns not promoted for insufficient samples', async () => {
    const fewSamples = { ...conclusiveAnalysis, total_samples: 5 };

    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: fewSamples,
      promotionConfig: { minSamples: 20 },
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('insufficient_samples');
    expect(result.samples).toBe(5);
  });

  test('returns not promoted when confidence below threshold', async () => {
    const lowConf = {
      ...conclusiveAnalysis,
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.3, probBBetterThanA: 0.7 },
      ],
    };

    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: lowConf,
      promotionConfig: { confidenceThreshold: 0.90 },
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('below_confidence_threshold');
  });

  test('returns not promoted when winner has no prompt_name', async () => {
    const noPromptExperiment = {
      variants: [
        { key: 'control', label: 'Default' },
        { key: 'variant_a', label: 'Alt' },
      ],
    };

    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: conclusiveAnalysis,
      experiment: noPromptExperiment,
    });

    expect(result.promoted).toBe(false);
    expect(result.reason).toBe('no_prompt_name');
  });

  test('promotes when all criteria met', async () => {
    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: conclusiveAnalysis,
      experiment: mockExperiment,
    });

    expect(result.promoted).toBe(true);
    expect(result.winner).toBe('variant_a');
    expect(result.promptName).toBe('stage-00-acquirability-v2');
    expect(result.confidence).toBe(0.95);
    expect(result.promotion).toHaveProperty('experiment_id', 'exp-001');
  });

  test('skips conclusive status check when disabled', async () => {
    const runningWithWinner = {
      status: 'running',
      total_samples: 50,
      per_variant: conclusiveAnalysis.per_variant,
      comparisons: conclusiveAnalysis.comparisons,
      stopping: conclusiveAnalysis.stopping,
    };

    const result = await evaluatePromotion(mockDeps, {
      experimentId: 'exp-001',
      analysis: runningWithWinner,
      experiment: mockExperiment,
      promotionConfig: { requireConclusiveStatus: false },
    });

    expect(result.promoted).toBe(true);
  });
});

// ── createPromotionRecord ────────────────────────────

describe('createPromotionRecord', () => {
  test('creates record with correct fields', () => {
    const record = createPromotionRecord({
      experimentId: 'exp-001',
      winner: 'variant_a',
      promptName: 'test-prompt',
      confidence: 0.95,
      analysis: conclusiveAnalysis,
      config: { confidenceThreshold: 0.90 },
    });

    expect(record.experiment_id).toBe('exp-001');
    expect(record.promoted_variant).toBe('variant_a');
    expect(record.prompt_name).toBe('test-prompt');
    expect(record.status).toBe('pending_review');
    expect(record.confidence).toBe(0.95);
    expect(record.confidence_threshold).toBe(0.90);
    expect(record.total_samples).toBe(50);
    expect(record).toHaveProperty('created_at');
  });

  test('includes effect summary with differences', () => {
    const record = createPromotionRecord({
      experimentId: 'exp-001',
      winner: 'variant_a',
      promptName: 'test-prompt',
      confidence: 0.95,
      analysis: conclusiveAnalysis,
      config: { confidenceThreshold: 0.90 },
    });

    expect(record.effect_summary.winner_mean).toBe(78.0);
    expect(record.effect_summary.loser_mean).toBe(65.0);
    expect(record.effect_summary.absolute_diff).toBe(13);
    expect(record.effect_summary.relative_pct).toBe(20);
  });
});

// ── getWinnerConfidence ──────────────────────────────

describe('getWinnerConfidence', () => {
  test('returns confidence for variantA winner', () => {
    const analysis = {
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.95, probBBetterThanA: 0.05 },
      ],
    };

    expect(getWinnerConfidence(analysis, 'control')).toBe(0.95);
  });

  test('returns confidence for variantB winner', () => {
    const analysis = {
      comparisons: [
        { variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.05, probBBetterThanA: 0.95 },
      ],
    };

    expect(getWinnerConfidence(analysis, 'variant_a')).toBe(0.95);
  });

  test('returns 0 for unknown winner', () => {
    expect(getWinnerConfidence({ comparisons: [] }, 'unknown')).toBe(0);
  });
});
