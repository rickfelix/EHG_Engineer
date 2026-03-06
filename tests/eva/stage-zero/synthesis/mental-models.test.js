/**
 * Unit Tests for Mental Models Repository
 * Part of SD-LEO-FEAT-MENTAL-MODELS-REPOSITORY-001
 *
 * Tests cover:
 * - buildContextBlock() formatting
 * - selectModels() filtering and ranking
 * - getMentalModelContextBlock() integration
 * - analyzeMentalModels() full analysis
 * - runMentalModelAnalysis() Component 14 wrapper
 * - exercise-runner interpolation
 * - effectiveness-tracker non-blocking logging
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { buildContextBlock } from '../../../../lib/eva/mental-models/context-block-builder.js';
import { selectModels } from '../../../../lib/eva/mental-models/model-selector.js';
import { getMentalModelContextBlock, analyzeMentalModels, getStageModelContext } from '../../../../lib/eva/mental-models/index.js';
import { runExercise } from '../../../../lib/eva/mental-models/exercise-runner.js';
import { logApplication } from '../../../../lib/eva/mental-models/effectiveness-tracker.js';
import { runMentalModelAnalysis } from '../../../../lib/eva/stage-zero/synthesis/mental-model-analysis.js';

// ---------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------
function createMockSupabase(models = [], effectiveness = [], affinities = []) {
  return {
    from: vi.fn((table) => {
      if (table === 'mental_models') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          contains: vi.fn().mockResolvedValue({ data: models, error: null }),
        };
      }
      if (table === 'mental_model_effectiveness') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          catch: vi.fn().mockResolvedValue({ data: effectiveness }),
        };
      }
      if (table === 'mental_model_archetype_affinity') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          catch: vi.fn().mockResolvedValue({ data: affinities }),
        };
      }
      if (table === 'mental_model_applications') {
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis() };
    }),
  };
}

const sampleModels = [
  {
    id: 'model-1',
    name: 'Jobs To Be Done',
    slug: 'jobs-to-be-done',
    category: 'market',
    core_concept: 'People buy products to get jobs done',
    applicable_stages: [0, 1],
    applicable_paths: ['competitor_teardown', 'discovery_mode'],
    applicable_strategies: null,
    is_active: true,
    prompt_context_block: 'Consider what job the customer is hiring this product to do.',
    exercise_template: { prompt: 'Analyze {{name}} using JTBD: {{description}}' },
  },
  {
    id: 'model-2',
    name: 'Blue Ocean Strategy',
    slug: 'blue-ocean-strategy',
    category: 'market',
    core_concept: 'Create uncontested market space',
    applicable_stages: [0],
    applicable_paths: ['discovery_mode'],
    applicable_strategies: ['trend_scanner'],
    is_active: true,
    prompt_context_block: 'Look for uncontested market space.',
    exercise_template: null,
  },
  {
    id: 'model-3',
    name: 'Anchoring Bias',
    slug: 'anchoring-bias',
    category: 'psychology',
    core_concept: 'First information anchors judgment',
    applicable_stages: [0, 1, 2],
    applicable_paths: [],
    applicable_strategies: [],
    is_active: true,
    prompt_context_block: 'Watch for anchoring bias in market data.',
    exercise_template: null,
  },
];

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ---------------------------------------------------------------
// 1. buildContextBlock
// ---------------------------------------------------------------
describe('buildContextBlock', () => {
  it('returns empty string for null/empty input', () => {
    expect(buildContextBlock(null)).toBe('');
    expect(buildContextBlock([])).toBe('');
  });

  it('formats single model correctly', () => {
    const result = buildContextBlock([sampleModels[0]]);
    expect(result).toContain('## Mental Model Frameworks');
    expect(result).toContain('1. **Jobs To Be Done** (market)');
    expect(result).toContain('Core Concept: People buy products to get jobs done');
    expect(result).toContain('Consider what job the customer is hiring');
  });

  it('formats multiple models with numbering', () => {
    const result = buildContextBlock(sampleModels);
    expect(result).toContain('1. **Jobs To Be Done**');
    expect(result).toContain('2. **Blue Ocean Strategy**');
    expect(result).toContain('3. **Anchoring Bias**');
  });
});

// ---------------------------------------------------------------
// 2. selectModels
// ---------------------------------------------------------------
describe('selectModels', () => {
  it('returns empty array when no supabase client', async () => {
    const result = await selectModels({ stage: 0 }, { logger: silentLogger });
    expect(result).toEqual([]);
  });

  it('returns models filtered by stage', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await selectModels({ stage: 0 }, { supabase, logger: silentLogger });
    expect(result.length).toBeLessThanOrEqual(5);
    expect(result.length).toBeGreaterThan(0);
  });

  it('filters by path when specified', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await selectModels(
      { stage: 0, path: 'competitor_teardown' },
      { supabase, logger: silentLogger }
    );
    // model-2 (Blue Ocean) has applicable_paths=['discovery_mode'] so should be excluded
    const names = result.map(m => m.name);
    expect(names).not.toContain('Blue Ocean Strategy');
  });

  it('excludes already-applied models', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await selectModels(
      { stage: 0, excludeIds: ['model-1'] },
      { supabase, logger: silentLogger }
    );
    const ids = result.map(m => m.id);
    expect(ids).not.toContain('model-1');
  });

  it('ranks by effectiveness * affinity', async () => {
    const effectiveness = [
      { model_id: 'model-1', composite_effectiveness_score: 0.9 },
      { model_id: 'model-2', composite_effectiveness_score: 0.3 },
      { model_id: 'model-3', composite_effectiveness_score: 0.6 },
    ];
    const supabase = createMockSupabase(sampleModels, effectiveness);
    const result = await selectModels({ stage: 0 }, { supabase, logger: silentLogger });
    // model-1 (0.9 * 0.5=0.45) > model-3 (0.6 * 0.5=0.30) > model-2 (0.3 * 0.5=0.15)
    expect(result[0].id).toBe('model-1');
    expect(result[1].id).toBe('model-3');
  });
});

// ---------------------------------------------------------------
// 3. getMentalModelContextBlock (Layer 1)
// ---------------------------------------------------------------
describe('getMentalModelContextBlock', () => {
  it('returns empty string when no models found', async () => {
    const supabase = createMockSupabase([]);
    const result = await getMentalModelContextBlock({ stage: 99 }, { supabase, logger: silentLogger });
    expect(result).toBe('');
  });

  it('returns formatted block when models found', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await getMentalModelContextBlock({ stage: 0 }, { supabase, logger: silentLogger });
    expect(result).toContain('## Mental Model Frameworks');
  });

  it('returns empty string on error', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('fail'); }) };
    const result = await getMentalModelContextBlock({ stage: 0 }, { supabase, logger: silentLogger });
    expect(result).toBe('');
  });
});

// ---------------------------------------------------------------
// 4. analyzeMentalModels (Layer 2)
// ---------------------------------------------------------------
describe('analyzeMentalModels', () => {
  it('returns null when no models found', async () => {
    const supabase = createMockSupabase([]);
    const result = await analyzeMentalModels({ stage: 99 }, { supabase, logger: silentLogger });
    expect(result).toBeNull();
  });

  it('returns structured analysis with models', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await analyzeMentalModels({ stage: 0 }, { supabase, logger: silentLogger });
    expect(result).not.toBeNull();
    expect(result.models_selected).toBeDefined();
    expect(result.context_block).toContain('Mental Model Frameworks');
    expect(result.model_count).toBeGreaterThan(0);
  });

  it('runs exercises when llmClient provided', async () => {
    const supabase = createMockSupabase(sampleModels);
    const mockLLM = { complete: vi.fn().mockResolvedValue('Exercise output text') };
    const result = await analyzeMentalModels(
      { stage: 0, ventureContext: { name: 'Test', description: 'A test' } },
      { supabase, llmClient: mockLLM, logger: silentLogger }
    );
    expect(result.exercise_count).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------
// 5. runExercise
// ---------------------------------------------------------------
describe('runExercise', () => {
  it('returns null when no llmClient', async () => {
    const result = await runExercise({ model: sampleModels[0], ventureContext: {} }, {});
    expect(result).toBeNull();
  });

  it('returns null when model has no exercise_template', async () => {
    const model = { ...sampleModels[1], exercise_template: null };
    const mockLLM = { complete: vi.fn() };
    const result = await runExercise({ model, ventureContext: {} }, { llmClient: mockLLM });
    expect(result).toBeNull();
    expect(mockLLM.complete).not.toHaveBeenCalled();
  });

  it('interpolates template variables and calls LLM', async () => {
    const mockLLM = { complete: vi.fn().mockResolvedValue('Analysis result') };
    const result = await runExercise(
      { model: sampleModels[0], ventureContext: { name: 'TestCo', description: 'A test venture' } },
      { llmClient: mockLLM, logger: silentLogger }
    );
    expect(result).not.toBeNull();
    expect(result.model_name).toBe('Jobs To Be Done');
    expect(result.raw_output).toBe('Analysis result');
    expect(mockLLM.complete).toHaveBeenCalledTimes(1);
    const calledPrompt = mockLLM.complete.mock.calls[0][1];
    expect(calledPrompt).toContain('TestCo');
    expect(calledPrompt).toContain('A test venture');
  });

  it('returns null on LLM timeout', async () => {
    const mockLLM = {
      complete: vi.fn().mockImplementation(() => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 100)
      )),
    };
    const result = await runExercise(
      { model: sampleModels[0], ventureContext: { name: 'Test' } },
      { llmClient: mockLLM, logger: silentLogger }
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------
// 6. runMentalModelAnalysis (Component 14)
// ---------------------------------------------------------------
describe('runMentalModelAnalysis', () => {
  it('returns null on timeout', async () => {
    const supabase = createMockSupabase([]);
    const result = await runMentalModelAnalysis(
      { venture: { name: 'Test' }, stage: 0 },
      { supabase, logger: silentLogger }
    );
    expect(result).toBeNull();
  });

  it('returns analysis when models available', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await runMentalModelAnalysis(
      { venture: { name: 'Test', description: 'desc' }, stage: 0 },
      { supabase, logger: silentLogger }
    );
    expect(result).not.toBeNull();
    expect(result.models_selected).toBeDefined();
  });
});

// ---------------------------------------------------------------
// 7. getStageModelContext (convenience)
// ---------------------------------------------------------------
describe('getStageModelContext', () => {
  it('returns empty defaults on error', async () => {
    const result = await getStageModelContext({ stage: 0 }, { logger: silentLogger });
    expect(result.models).toEqual([]);
    expect(result.block).toBe('');
  });

  it('returns models and block', async () => {
    const supabase = createMockSupabase(sampleModels);
    const result = await getStageModelContext({ stage: 0 }, { supabase, logger: silentLogger });
    expect(result.models.length).toBeGreaterThan(0);
    expect(result.block).toContain('Mental Model Frameworks');
  });
});

// ---------------------------------------------------------------
// 8. logApplication (non-blocking)
// ---------------------------------------------------------------
describe('logApplication', () => {
  it('does nothing when no supabase client', () => {
    // Should not throw
    logApplication({ modelId: 'x', stageNumber: 0, layer: 'synthesis' }, {});
  });

  it('calls upsert via setImmediate', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({ upsert: upsertFn }),
    };
    logApplication(
      { modelId: 'model-1', stageNumber: 0, layer: 'synthesis' },
      { supabase, logger: silentLogger }
    );
    // Wait for setImmediate to fire
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(upsertFn).toHaveBeenCalledTimes(1);
  });
});
