/**
 * Dual Evaluator Tests — promptAwareEvaluator and defaultEvaluator
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-B
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  defaultEvaluator,
  promptAwareEvaluator,
  evaluateDual,
} from '../../../lib/eva/experiments/dual-evaluator.js';

// Mock PromptLoader
vi.mock('../../../lib/eva/prompt-loader.js', () => ({
  getPrompt: vi.fn(),
  clearCache: vi.fn(),
  getCacheSize: vi.fn(() => 0),
}));

import { getPrompt } from '../../../lib/eva/prompt-loader.js';

// ── Fixtures ──────────────────────────────────────────

const baseSynthesisResult = {
  metadata: {
    venture_score: 75,
    chairman_confidence: 60,
    synthesis_quality: 80,
  },
};

const controlVariant = { key: 'control', label: 'Control' };
const variantWithPrompt = { key: 'variant_a', label: 'Variant A', prompt_name: 'stage-00-experiment-v2' };
const variantWithoutPrompt = { key: 'variant_b', label: 'Variant B' };

const mockDeps = { supabase: {}, logger: { log: vi.fn(), warn: vi.fn() } };

// ── defaultEvaluator ──────────────────────────────────

describe('defaultEvaluator', () => {
  test('extracts scores from synthesis metadata', () => {
    const result = defaultEvaluator(baseSynthesisResult, controlVariant, mockDeps);

    expect(result).toEqual({
      venture_score: 75,
      chairman_confidence: 60,
      synthesis_quality: 80,
      variant_key: 'control',
    });
  });

  test('returns 0 for missing metadata fields', () => {
    const result = defaultEvaluator({ metadata: {} }, controlVariant, mockDeps);

    expect(result.venture_score).toBe(0);
    expect(result.chairman_confidence).toBe(0);
    expect(result.synthesis_quality).toBe(0);
  });

  test('handles null synthesisResult gracefully', () => {
    const result = defaultEvaluator(null, controlVariant, mockDeps);

    expect(result.venture_score).toBe(0);
    expect(result.variant_key).toBe('control');
  });
});

// ── promptAwareEvaluator ──────────────────────────────

describe('promptAwareEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('falls back to defaultEvaluator when variant has no prompt_name', async () => {
    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithoutPrompt, mockDeps);

    expect(getPrompt).not.toHaveBeenCalled();
    expect(result).toEqual({
      venture_score: 75,
      chairman_confidence: 60,
      synthesis_quality: 80,
      variant_key: 'variant_b',
    });
  });

  test('loads prompt via PromptLoader when prompt_name is present', async () => {
    getPrompt.mockResolvedValue('Evaluate with quality and rigor standards');

    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    expect(getPrompt).toHaveBeenCalledWith('stage-00-experiment-v2');
    expect(result.prompt_loaded).toBe(true);
    expect(result.prompt_name).toBe('stage-00-experiment-v2');
    expect(result.variant_key).toBe('variant_a');
  });

  test('falls back to default when PromptLoader returns null', async () => {
    getPrompt.mockResolvedValue(null);

    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    expect(getPrompt).toHaveBeenCalledWith('stage-00-experiment-v2');
    expect(result.prompt_loaded).toBeUndefined();
    expect(result.variant_key).toBe('variant_a');
    // Should match defaultEvaluator output
    expect(result.venture_score).toBe(75);
  });

  test('falls back to default when PromptLoader throws', async () => {
    getPrompt.mockRejectedValue(new Error('DB connection failed'));

    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    expect(mockDeps.logger.warn).toHaveBeenCalled();
    expect(result.prompt_loaded).toBeUndefined();
    expect(result.venture_score).toBe(75);
  });

  test('quality keywords in prompt boost synthesis_quality score', async () => {
    getPrompt.mockResolvedValue('Assess the quality and rigor of the analysis thoroughly');

    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    expect(result.synthesis_quality).toBeGreaterThanOrEqual(baseSynthesisResult.metadata.synthesis_quality);
    expect(result.prompt_loaded).toBe(true);
  });

  test('confidence keywords in prompt boost chairman_confidence score', async () => {
    getPrompt.mockResolvedValue('Measure confidence and certainty of the venture assessment');

    const result = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    expect(result.chairman_confidence).toBeGreaterThanOrEqual(baseSynthesisResult.metadata.chairman_confidence);
    expect(result.prompt_loaded).toBe(true);
  });

  test('control and variant produce distinct scores with different prompts', async () => {
    // Control: no prompt_name → uses default
    const controlResult = await promptAwareEvaluator(baseSynthesisResult, controlVariant, mockDeps);

    // Variant: loads prompt with quality keywords
    getPrompt.mockResolvedValue('Evaluate quality and rigor with high confidence and certainty standards');
    const variantResult = await promptAwareEvaluator(baseSynthesisResult, variantWithPrompt, mockDeps);

    // Variant should have prompt-influenced scores
    expect(variantResult.prompt_loaded).toBe(true);
    expect(controlResult.prompt_loaded).toBeUndefined();

    // At least one score should differ between control and variant
    const scoresDiffer =
      controlResult.venture_score !== variantResult.venture_score ||
      controlResult.chairman_confidence !== variantResult.chairman_confidence ||
      controlResult.synthesis_quality !== variantResult.synthesis_quality;
    expect(scoresDiffer).toBe(true);
  });
});

// ── evaluateDual with promptAwareEvaluator ────────────

describe('evaluateDual with promptAwareEvaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('runs both control and variant evaluations', async () => {
    getPrompt.mockResolvedValue('Quality evaluation prompt');

    const mockSupabase = {
      from: () => ({
        insert: () => ({ error: null }),
      }),
    };

    const result = await evaluateDual(
      { supabase: mockSupabase, logger: mockDeps.logger },
      {
        assignment: { id: 'assign-1', venture_id: 'v-1' },
        experiment: {
          id: 'exp-1',
          variants: [controlVariant, variantWithPrompt],
        },
        synthesisResult: baseSynthesisResult,
        evaluateFn: promptAwareEvaluator,
      },
    );

    expect(result.variants_evaluated).toBe(2);
    expect(result.results.control).toBeDefined();
    expect(result.results.variant_a).toBeDefined();
    expect(result.results.variant_a.prompt_loaded).toBe(true);
  });
});
