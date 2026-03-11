/**
 * First Experiment Runner Tests
 *
 * SD-MAN-ORCH-STAGE-ZERO-COLD-001-E
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runFirstExperiment } from '../../../lib/eva/experiments/first-experiment-runner.js';

// Mock all dependency modules
vi.mock('../../../lib/eva/experiments/experiment-manager.js', () => ({
  createExperiment: vi.fn(),
  startExperiment: vi.fn(),
  stopExperiment: vi.fn(),
}));

vi.mock('../../../lib/eva/experiments/experiment-assignment.js', () => ({
  assignVariant: vi.fn(),
}));

vi.mock('../../../lib/eva/experiments/dual-evaluator.js', () => ({
  evaluateDual: vi.fn(),
  promptAwareEvaluator: vi.fn(),
  getExperimentOutcomes: vi.fn(),
}));

vi.mock('../../../lib/eva/experiments/bayesian-analyzer.js', () => ({
  analyzeExperiment: vi.fn(),
  generateReport: vi.fn(),
}));

// proxy-metric-engine is NOT mocked — real deterministic scores

import { createExperiment, startExperiment, stopExperiment } from '../../../lib/eva/experiments/experiment-manager.js';
import { assignVariant } from '../../../lib/eva/experiments/experiment-assignment.js';
import { evaluateDual, getExperimentOutcomes } from '../../../lib/eva/experiments/dual-evaluator.js';
import { analyzeExperiment, generateReport } from '../../../lib/eva/experiments/bayesian-analyzer.js';

// ── Fixtures ──────────────────────────────────────────

const VENTURE_A = '550e8400-e29b-41d4-a716-446655440000';
const VENTURE_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const mockExperiment = {
  id: 'exp-001',
  name: 'stage-zero-first-ab-test',
  variants: [
    { key: 'control', label: 'Default Evaluation', weight: 0.5 },
    { key: 'variant_a', label: 'Alternative Prompt', weight: 0.5, prompt_name: 'stage-00-acquirability-v2' },
  ],
};

const mockDeps = {
  supabase: {},
  logger: { log: vi.fn(), warn: vi.fn() },
};

// ── Setup ─────────────────────────────────────────────

function setupHappyPath() {
  createExperiment.mockResolvedValue(mockExperiment);
  startExperiment.mockResolvedValue(mockExperiment);
  stopExperiment.mockResolvedValue({ ...mockExperiment, status: 'stopped' });

  assignVariant.mockImplementation((_deps, { ventureId }) => Promise.resolve({
    variant_key: 'control',
    assignment: { id: `assign-${ventureId.slice(0, 8)}`, venture_id: ventureId, variant_key: 'control' },
    cached: false,
  }));

  evaluateDual.mockResolvedValue({
    results: { control: { venture_score: 75 }, variant_a: { venture_score: 80, prompt_loaded: true } },
    errors: {},
    recorded: true,
    variants_evaluated: 2,
    variants_failed: 0,
  });

  getExperimentOutcomes.mockResolvedValue([
    { variant_key: 'control', scores: { venture_score: 75 } },
    { variant_key: 'variant_a', scores: { venture_score: 80 } },
  ]);

  analyzeExperiment.mockReturnValue({
    status: 'running',
    total_samples: 2,
    per_variant: {
      control: { count: 1, mean_score: 75 },
      variant_a: { count: 1, mean_score: 80 },
    },
    comparisons: [{ variantA: 'control', variantB: 'variant_a', probABetterThanB: 0.4 }],
    recommendation: 'CONTINUE: 2 samples collected',
  });

  generateReport.mockReturnValue('═══ EXPERIMENT REPORT ═══');
}

// ── Tests ─────────────────────────────────────────────

describe('runFirstExperiment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
  });

  test('executes full experiment lifecycle', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A, VENTURE_B],
    });

    expect(createExperiment).toHaveBeenCalledOnce();
    expect(startExperiment).toHaveBeenCalledWith(mockDeps, 'exp-001');
    expect(assignVariant).toHaveBeenCalledTimes(2);
    expect(evaluateDual).toHaveBeenCalledTimes(2);
    expect(getExperimentOutcomes).toHaveBeenCalledWith(mockDeps, 'exp-001');
    expect(analyzeExperiment).toHaveBeenCalledOnce();
    expect(stopExperiment).toHaveBeenCalledWith(mockDeps, 'exp-001');
    expect(generateReport).toHaveBeenCalledOnce();
  });

  test('returns complete result structure', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    expect(result).toHaveProperty('experiment_id', 'exp-001');
    expect(result).toHaveProperty('experiment_name', 'stage-zero-first-ab-test');
    expect(result).toHaveProperty('ventures_count', 1);
    expect(result).toHaveProperty('assignments');
    expect(result).toHaveProperty('evaluations');
    expect(result).toHaveProperty('analysis');
    expect(result).toHaveProperty('report', '═══ EXPERIMENT REPORT ═══');
    expect(result).toHaveProperty('provenance');
    expect(result).toHaveProperty('timeline');
  });

  test('tracks provenance for proxy scores', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A, VENTURE_B],
    });

    expect(result.provenance.proxy).toBe(2);
    expect(result.provenance.real).toBe(0);
  });

  test('records timeline for all phases', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    expect(result.timeline).toHaveProperty('started_at');
    expect(result.timeline).toHaveProperty('experiment_created');
    expect(result.timeline).toHaveProperty('experiment_started');
    expect(result.timeline).toHaveProperty('assignments_complete');
    expect(result.timeline).toHaveProperty('evaluations_complete');
    expect(result.timeline).toHaveProperty('analysis_complete');
    expect(result.timeline).toHaveProperty('experiment_stopped');
  });

  test('creates experiment with correct variant configuration', async () => {
    await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
      promptName: 'custom-prompt-v3',
    });

    const createCall = createExperiment.mock.calls[0];
    expect(createCall[1].variants[0]).toEqual({ key: 'control', label: 'Default Evaluation', weight: 1 });
    expect(createCall[1].variants[1]).toMatchObject({
      key: 'variant_a',
      prompt_name: 'custom-prompt-v3',
    });
  });

  test('assigns each venture to the experiment', async () => {
    await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A, VENTURE_B],
    });

    const calls = assignVariant.mock.calls;
    expect(calls[0][1].ventureId).toBe(VENTURE_A);
    expect(calls[1][1].ventureId).toBe(VENTURE_B);
  });

  test('passes promptAwareEvaluator to evaluateDual', async () => {
    await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    const evalCall = evaluateDual.mock.calls[0];
    // evaluateFn should be passed as a parameter
    expect(evalCall[1]).toHaveProperty('evaluateFn');
  });

  test('throws when no ventureIds provided', async () => {
    await expect(runFirstExperiment(mockDeps, { ventureIds: [] }))
      .rejects.toThrow('At least one ventureId is required');

    await expect(runFirstExperiment(mockDeps, {}))
      .rejects.toThrow('At least one ventureId is required');
  });

  test('passes analysis config to Bayesian analyzer', async () => {
    const customConfig = { minSamples: 5, maxSamples: 50 };

    await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
      analysisConfig: customConfig,
    });

    const analyzeCall = analyzeExperiment.mock.calls[0];
    expect(analyzeCall[1].config).toEqual(customConfig);
  });

  test('uses proxy-metric-engine for synthesis results', async () => {
    await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    const evalCall = evaluateDual.mock.calls[0];
    const synthesisResult = evalCall[1].synthesisResult;

    // Should have metadata from proxy scores
    expect(synthesisResult.metadata).toHaveProperty('venture_score');
    expect(synthesisResult.metadata).toHaveProperty('chairman_confidence');
    expect(synthesisResult.metadata).toHaveProperty('synthesis_quality');
    expect(synthesisResult.metadata).toHaveProperty('provenance', 'proxy');
    // Scores should be deterministic numbers in valid range
    expect(synthesisResult.metadata.venture_score).toBeGreaterThanOrEqual(0);
    expect(synthesisResult.metadata.venture_score).toBeLessThanOrEqual(100);
  });

  test('includes evaluation summary in results', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    expect(result.evaluations).toHaveLength(1);
    expect(result.evaluations[0]).toHaveProperty('venture_id', VENTURE_A);
    expect(result.evaluations[0]).toHaveProperty('variants_evaluated', 2);
    expect(result.evaluations[0]).toHaveProperty('variants_failed', 0);
  });

  test('includes assignment details in results', async () => {
    const result = await runFirstExperiment(mockDeps, {
      ventureIds: [VENTURE_A],
    });

    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0]).toHaveProperty('venture_id', VENTURE_A);
    expect(result.assignments[0]).toHaveProperty('variant_key', 'control');
    expect(result.assignments[0]).toHaveProperty('cached', false);
  });
});
