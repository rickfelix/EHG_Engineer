/**
 * Synthesis Engine - Components 1-3 Tests
 *
 * Tests the first 3 synthesis components:
 * - Cross-Reference Intellectual Capital + Outcome History
 * - Portfolio-Aware Evaluation
 * - Active Problem Reframing
 * - Combined runSynthesis
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F
 */

import { describe, test, expect, vi } from 'vitest';
import {
  runSynthesis,
  crossReferenceIntellectualCapital,
  evaluatePortfolioFit,
  reframeProblem,
} from '../../lib/eva/stage-zero/synthesis/index.js';

// ── Test Data ──────────────────────────────────────────

const SAMPLE_PATH_OUTPUT = {
  origin_type: 'competitor_teardown',
  suggested_name: 'AutoReview AI',
  suggested_problem: 'Businesses struggle to manage online reviews',
  suggested_solution: 'AI-powered review management platform',
  target_market: 'Small businesses',
  raw_material: {},
  metadata: { path: 'competitor_teardown' },
  competitor_urls: ['https://example.com'],
  blueprint_id: null,
  discovery_strategy: null,
};

// ── Mock LLM Client ──────────────────────────────────────────

function createMockLLMClient(response = null) {
  const defaultResponse = {
    matches: [{ source_type: 'nursery_item', source_name: 'Prior Review Tool', relevance: 'high', connection: 'Similar problem space' }],
    lessons: [{ lesson: 'Review tools need real-time processing', source: 'retro-123', applicability: 'Direct' }],
    relevance_score: 72,
    summary: 'Strong connection to prior nursery item about review management.',
  };

  return {
    _model: 'mock-model',
    messages: {
      create: vi.fn().mockImplementation(async ({ messages }) => {
        const prompt = messages[0]?.content || '';

        if (response) {
          return { content: [{ text: JSON.stringify(response) }] };
        }

        if (prompt.includes('Cross-reference') || prompt.includes('prior knowledge')) {
          return { content: [{ text: JSON.stringify(defaultResponse) }] };
        }

        if (prompt.includes('portfolio') || prompt.includes('5 portfolio dimensions')) {
          return {
            content: [{ text: JSON.stringify({
              dimensions: {
                data_synergy: { score: 7, rationale: 'Review data useful for other ventures' },
                capability_building: { score: 6, rationale: 'NLP pipeline is reusable' },
                customer_cross_sell: { score: 8, rationale: 'SMBs are core customer base' },
                portfolio_gaps: { score: 9, rationale: 'No review management in portfolio' },
                redundancy_check: { score: 10, rationale: 'Completely unique offering' },
              },
              composite_score: 80,
              recommendation: 'proceed',
              synergies: [{ venture: 'ContentForge', synergy: 'Shared NLP capabilities' }],
              conflicts: [],
              summary: 'Strong portfolio fit with high gap-filling potential.',
            }) }],
          };
        }

        if (prompt.includes('CHALLENGE') || prompt.includes('reframing')) {
          return {
            content: [{ text: JSON.stringify({
              assumptions_challenged: [
                { assumption: 'Reviews need human management', challenge: 'AI can handle 90% of responses', validity: 'weak' },
              ],
              reframings: [
                { framing: 'Businesses lose revenue from unmanaged reputation signals', market_size: 'large', defensibility: 'high', automation_potential: 'high', strategic_score: 90, rationale: 'Broader than just reviews' },
                { framing: 'SMBs cannot afford reputation management teams', market_size: 'medium', defensibility: 'medium', automation_potential: 'high', strategic_score: 75, rationale: 'Cost-focused angle' },
                { framing: 'Customer feedback is scattered across platforms', market_size: 'large', defensibility: 'medium', automation_potential: 'medium', strategic_score: 65, rationale: 'Aggregation play' },
              ],
              recommended_framing: { framing: 'Businesses lose revenue from unmanaged reputation signals', reason: 'Largest market with highest defensibility' },
              summary: 'Original framing is too narrow. Reframing to reputation management captures larger market.',
            }) }],
          };
        }

        return { content: [{ text: '{}' }] };
      }),
    },
  };
}

// ── Mock Supabase ──────────────────────────────────────────

function createMockSupabase({ nurseryItems = [], brainstorms = [], retros = [], patterns = [], ventures = [], nurseryError = null, ventureError = null } = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'venture_nursery') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: nurseryError ? null : nurseryItems, error: nurseryError }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: brainstorms, error: null }),
            }),
          }),
        };
      }
      if (table === 'retrospectives') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: retros, error: null }),
            }),
          }),
        };
      }
      if (table === 'issue_patterns') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: patterns, error: null }),
            }),
          }),
        };
      }
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: ventureError ? null : ventures, error: ventureError }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    }),
  };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Cross-Reference Tests ──────────────────────────────

describe('Synthesis - crossReferenceIntellectualCapital', () => {
  test('requires supabase', async () => {
    await expect(
      crossReferenceIntellectualCapital(SAMPLE_PATH_OUTPUT, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('returns empty enrichment when no prior knowledge', async () => {
    const supabase = createMockSupabase();
    const result = await crossReferenceIntellectualCapital(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient: createMockLLMClient() }
    );

    expect(result.component).toBe('cross_reference');
    expect(result.relevance_score).toBe(0);
    expect(result.matches).toHaveLength(0);
  });

  test('cross-references with nursery items and retros', async () => {
    const supabase = createMockSupabase({
      nurseryItems: [{ id: 'n1', name: 'Prior Review Tool', problem_statement: 'Review management', solution: 'Manual tool', parked_reason: 'Too manual' }],
      retros: [{ id: 'r1', sd_id: 'sd-1', improvements: ['Automate more'], what_went_well: ['Fast iteration'], what_went_wrong: ['Manual steps'] }],
    });
    const llmClient = createMockLLMClient();

    const result = await crossReferenceIntellectualCapital(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.component).toBe('cross_reference');
    expect(result.relevance_score).toBe(72);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].source_name).toBe('Prior Review Tool');
    expect(result.lessons).toHaveLength(1);
    expect(result.related_items_count).toBe(2);
  });

  test('handles LLM error gracefully', async () => {
    const supabase = createMockSupabase({
      nurseryItems: [{ id: 'n1', name: 'Item', problem_statement: 'P', solution: 'S', parked_reason: 'R' }],
    });
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Rate limited')) },
    };

    const result = await crossReferenceIntellectualCapital(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.relevance_score).toBe(0);
    expect(result.summary).toContain('Rate limited');
  });
});

// ── Portfolio Evaluation Tests ──────────────────────────────

describe('Synthesis - evaluatePortfolioFit', () => {
  test('requires supabase', async () => {
    await expect(
      evaluatePortfolioFit(SAMPLE_PATH_OUTPUT, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('returns opportunity scores for empty portfolio', async () => {
    const supabase = createMockSupabase();
    const result = await evaluatePortfolioFit(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient: createMockLLMClient() }
    );

    expect(result.component).toBe('portfolio_evaluation');
    expect(result.portfolio_size).toBe(0);
    expect(result.dimensions.portfolio_gaps.score).toBe(10);
    expect(result.dimensions.redundancy_check.score).toBe(10);
    expect(result.recommendation).toBe('proceed');
  });

  test('evaluates against existing ventures', async () => {
    const supabase = createMockSupabase({
      ventures: [
        { id: 'v1', name: 'ContentForge', problem_statement: 'Content is expensive', solution: 'AI content factory', target_market: 'SMBs', status: 'active', metadata: {} },
      ],
    });
    const llmClient = createMockLLMClient();

    const result = await evaluatePortfolioFit(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.component).toBe('portfolio_evaluation');
    expect(result.portfolio_size).toBe(1);
    expect(result.composite_score).toBe(80);
    expect(result.recommendation).toBe('proceed');
    expect(result.synergies).toHaveLength(1);
    expect(result.dimensions.data_synergy.score).toBe(7);
  });

  test('handles LLM error gracefully', async () => {
    const supabase = createMockSupabase({
      ventures: [{ id: 'v1', name: 'V', problem_statement: 'P', solution: 'S', target_market: 'M', status: 'active', metadata: {} }],
    });
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Timeout')) },
    };

    const result = await evaluatePortfolioFit(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.composite_score).toBe(0);
    expect(result.summary).toContain('Timeout');
  });
});

// ── Problem Reframing Tests ──────────────────────────────

describe('Synthesis - reframeProblem', () => {
  test('returns empty when no problem statement', async () => {
    const emptyOutput = { ...SAMPLE_PATH_OUTPUT, suggested_problem: '' };
    const result = await reframeProblem(emptyOutput, { logger: silentLogger });

    expect(result.component).toBe('problem_reframing');
    expect(result.reframings).toHaveLength(0);
    expect(result.recommended_framing).toBeNull();
  });

  test('generates 3+ alternative framings', async () => {
    const llmClient = createMockLLMClient();
    const result = await reframeProblem(
      SAMPLE_PATH_OUTPUT,
      { logger: silentLogger, llmClient }
    );

    expect(result.component).toBe('problem_reframing');
    expect(result.original_problem).toBe('Businesses struggle to manage online reviews');
    expect(result.reframings.length).toBeGreaterThanOrEqual(3);
    expect(result.reframings[0].strategic_score).toBeGreaterThanOrEqual(result.reframings[1].strategic_score);
    expect(result.assumptions_challenged.length).toBeGreaterThanOrEqual(1);
    expect(result.recommended_framing).toBeDefined();
    expect(result.recommended_framing.framing).toContain('reputation');
  });

  test('sorts reframings by strategic score', async () => {
    const llmClient = createMockLLMClient();
    const result = await reframeProblem(
      SAMPLE_PATH_OUTPUT,
      { logger: silentLogger, llmClient }
    );

    for (let i = 1; i < result.reframings.length; i++) {
      expect(result.reframings[i - 1].strategic_score).toBeGreaterThanOrEqual(result.reframings[i].strategic_score);
    }
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Context too long')) },
    };

    const result = await reframeProblem(
      SAMPLE_PATH_OUTPUT,
      { logger: silentLogger, llmClient }
    );

    expect(result.reframings).toHaveLength(0);
    expect(result.summary).toContain('Context too long');
  });

  test('handles non-JSON LLM response', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot reframe this problem in a structured way.' }],
        }),
      },
    };

    const result = await reframeProblem(
      SAMPLE_PATH_OUTPUT,
      { logger: silentLogger, llmClient }
    );

    expect(result.reframings).toHaveLength(0);
    expect(result.summary).toContain('Could not parse');
  });
});

// ── Combined Synthesis Tests ──────────────────────────────

describe('Synthesis - runSynthesis', () => {
  test('runs all 3 components and returns enriched brief', async () => {
    const supabase = createMockSupabase({
      nurseryItems: [{ id: 'n1', name: 'Prior Item', problem_statement: 'P', solution: 'S', parked_reason: 'R' }],
      ventures: [{ id: 'v1', name: 'ExistingVenture', problem_statement: 'P', solution: 'S', target_market: 'M', status: 'active', metadata: {} }],
    });
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    // Check enriched brief structure
    expect(result.name).toBe('AutoReview AI');
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.raw_chairman_intent).toBe('Businesses struggle to manage online reviews');
    expect(result.maturity).toBe('ready');

    // Check synthesis metadata
    expect(result.metadata.synthesis).toBeDefined();
    expect(result.metadata.synthesis.components_run).toBe(3);
    expect(result.metadata.synthesis.cross_reference).toBeDefined();
    expect(result.metadata.synthesis.portfolio_evaluation).toBeDefined();
    expect(result.metadata.synthesis.problem_reframing).toBeDefined();
  });

  test('uses recommended reframing for problem_statement', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    // Problem should be reframed (recommended framing)
    expect(result.problem_statement).toContain('reputation');
    // Original preserved as raw_chairman_intent
    expect(result.raw_chairman_intent).toBe('Businesses struggle to manage online reviews');
  });

  test('handles component failures gracefully', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Database down');
      }),
    };
    const llmClient = createMockLLMClient();

    // Should not throw - each component catches errors
    const result = await runSynthesis(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.name).toBe('AutoReview AI');
    expect(result.metadata.synthesis.components_run).toBe(3);
  });

  test('preserves path output metadata', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(
      SAMPLE_PATH_OUTPUT,
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.metadata.path).toBe('competitor_teardown');
    expect(result.competitor_ref).toEqual(['https://example.com']);
  });
});
