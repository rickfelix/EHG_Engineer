/**
 * Synthesis Engine - Components 4-8 Tests
 *
 * Tests the remaining 5 synthesis components:
 * - Component 4: Moat Architecture (designMoat)
 * - Component 5: Chairman Constraints (applyChairmanConstraints)
 * - Component 6: Time-Horizon Positioning (assessTimeHorizon)
 * - Component 7: Venture Archetype Recognition (classifyArchetype)
 * - Component 8: Build Cost Estimation (estimateBuildCost)
 * - Updated runSynthesis (all 8 components)
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-G/H
 */

import { describe, test, expect, vi } from 'vitest';
import {
  designMoat,
  applyChairmanConstraints,
  assessTimeHorizon,
  classifyArchetype,
  estimateBuildCost,
  runSynthesis,
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

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Mock LLM Client Factory ──────────────────────────────

function createMockLLMClient(overrideResponse = null) {
  return {
    _model: 'mock-model',
    messages: {
      create: vi.fn().mockImplementation(async ({ messages }) => {
        if (overrideResponse) {
          return { content: [{ text: JSON.stringify(overrideResponse) }] };
        }

        const prompt = messages[0]?.content || '';

        // Component 4: Moat (check before portfolio - moat prompt contains 'portfolio')
        if (prompt.includes('moat architect') || prompt.includes('MOAT TYPES')) {
          return { content: [{ text: JSON.stringify({
            primary_moat: { type: 'data_moat', strategy: 'Collect review data at scale', compounding: { month_1: 'Initial data', month_6: 'Pattern detection', month_12: 'Predictive', month_24: 'Unmatched dataset' } },
            secondary_moats: [{ type: 'automation_speed', strategy: 'AI ops compounding', confidence: 75 }],
            moat_score: 82,
            portfolio_moat_synergy: 'Shares NLP pipeline with ContentForge',
            vulnerabilities: ['Large platforms could replicate'],
            summary: 'Strong data moat with automation speed secondary.',
          }) }] };
        }

        // Component 7: Archetypes (check before portfolio - archetype prompt contains 'portfolio_connector')
        if (prompt.includes('venture classifier') || prompt.includes('EHG ARCHETYPES')) {
          return { content: [{ text: JSON.stringify({
            primary_archetype: 'automator',
            primary_confidence: 88,
            primary_rationale: 'Automates review management',
            secondary_archetypes: [{ key: 'democratizer', fit_score: 7, rationale: 'Makes reputation management accessible' }],
            archetype_scores: { democratizer: 7, automator: 9, capability_productizer: 3, first_principles_rebuilder: 2, vertical_specialist: 6, portfolio_connector: 4 },
            execution_implications: ['Focus on pipeline automation first', 'Build data collection early'],
            summary: 'Primary automator with democratizer secondary.',
          }) }] };
        }

        // Component 1: Cross-reference
        if (prompt.includes('Cross-reference') || prompt.includes('prior knowledge')) {
          return { content: [{ text: JSON.stringify({
            matches: [{ source_type: 'nursery_item', source_name: 'Prior Review Tool', relevance: 'high', connection: 'Similar' }],
            lessons: [{ lesson: 'Review tools need real-time', source: 'retro-1', applicability: 'Direct' }],
            relevance_score: 72,
            summary: 'Strong connection.',
          }) }] };
        }

        // Component 2: Portfolio
        if (prompt.includes('portfolio') || prompt.includes('5 portfolio dimensions')) {
          return { content: [{ text: JSON.stringify({
            dimensions: {
              data_synergy: { score: 7, rationale: 'Good' },
              capability_building: { score: 6, rationale: 'OK' },
              customer_cross_sell: { score: 8, rationale: 'Great' },
              portfolio_gaps: { score: 9, rationale: 'Fills gap' },
              redundancy_check: { score: 10, rationale: 'Unique' },
            },
            composite_score: 80,
            recommendation: 'proceed',
            synergies: [{ venture: 'ContentForge', synergy: 'NLP' }],
            conflicts: [],
            summary: 'Strong fit.',
          }) }] };
        }

        // Component 3: Reframing
        if (prompt.includes('CHALLENGE') || prompt.includes('reframing')) {
          return { content: [{ text: JSON.stringify({
            assumptions_challenged: [{ assumption: 'Need human mgmt', challenge: 'AI handles 90%', validity: 'weak' }],
            reframings: [
              { framing: 'Businesses lose revenue from unmanaged reputation signals', market_size: 'large', defensibility: 'high', automation_potential: 'high', strategic_score: 90, rationale: 'Broader' },
              { framing: 'SMBs cannot afford reputation management', market_size: 'medium', defensibility: 'medium', automation_potential: 'high', strategic_score: 75, rationale: 'Cost' },
              { framing: 'Customer feedback scattered', market_size: 'large', defensibility: 'medium', automation_potential: 'medium', strategic_score: 65, rationale: 'Aggregation' },
            ],
            recommended_framing: { framing: 'Businesses lose revenue from unmanaged reputation signals', reason: 'Largest market' },
            summary: 'Original too narrow.',
          }) }] };
        }

        // Component 6: Time horizon
        if (prompt.includes('market timing') || prompt.includes('temporal position')) {
          return { content: [{ text: JSON.stringify({
            position: 'build_now',
            confidence: 85,
            market_readiness: { score: 8, rationale: 'Reviews are already digital' },
            technology_maturity: { score: 9, rationale: 'NLP is mature' },
            competitive_density: { score: 6, rationale: 'Some competitors' },
            adoption_stage: 'early_majority',
            trigger_conditions: [],
            urgency_factors: [],
            summary: 'Market ready, build now.',
          }) }] };
        }

        // Component 8: Build cost
        if (prompt.includes('technical estimator') || prompt.includes('build cost')) {
          return { content: [{ text: JSON.stringify({
            complexity: 'moderate',
            loc_estimate: { min: 3000, max: 6000, breakdown: { backend: 2500, frontend: 2000, tests: 1000, config: 500 } },
            sd_count: { min: 10, max: 18, breakdown: { infrastructure: 3, core_features: 8, testing: 4, documentation: 3 } },
            infrastructure: { required: ['supabase', 'vercel'], optional: ['redis'], estimated_monthly_cost: 45 },
            token_budget: { development_tokens_monthly: 400000, production_tokens_monthly: 150000, estimated_monthly_cost: 25 },
            timeline_weeks: { optimistic: 5, realistic: 9, pessimistic: 16 },
            risk_factors: ['NLP accuracy for non-English reviews', 'API rate limits from review platforms'],
            summary: 'Moderate complexity, ~9 week timeline.',
          }) }] };
        }

        return { content: [{ text: '{}' }] };
      }),
    },
  };
}

// ── Mock Supabase (for cross-ref, portfolio, constraints) ──

function createMockSupabase({ nurseryItems = [], ventures = [], constraintsData = null } = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'venture_nursery') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: nurseryItems, error: null }),
            }),
          }),
        };
      }
      if (table === 'brainstorm_sessions') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'retrospectives') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'issue_patterns') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'ventures') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: ventures, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'chairman_constraints') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue(
                constraintsData
                  ? { data: constraintsData, error: null }
                  : { data: null, error: null }
              ),
            }),
          }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    }),
  };
}

// ── Component 4: Moat Architecture Tests ──────────────────

describe('Synthesis - designMoat', () => {
  test('returns moat analysis with primary and secondary moats', async () => {
    const llmClient = createMockLLMClient();
    const result = await designMoat(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.component).toBe('moat_architecture');
    expect(result.primary_moat).toBeDefined();
    expect(result.primary_moat.type).toBe('data_moat');
    expect(result.primary_moat.compounding).toBeDefined();
    expect(result.secondary_moats).toHaveLength(1);
    expect(result.moat_score).toBe(82);
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.summary).toContain('data moat');
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Rate limited')) },
    };

    const result = await designMoat(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.component).toBe('moat_architecture');
    expect(result.moat_score).toBe(0);
    expect(result.primary_moat).toBeNull();
    expect(result.summary).toContain('Rate limited');
  });

  test('handles non-JSON response', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot produce a structured analysis.' }],
        }),
      },
    };

    const result = await designMoat(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.moat_score).toBe(0);
    expect(result.summary).toContain('Could not parse');
  });
});

// ── Component 5: Chairman Constraints Tests ──────────────────

describe('Synthesis - applyChairmanConstraints', () => {
  test('applies default constraints when no supabase', async () => {
    const result = await applyChairmanConstraints(SAMPLE_PATH_OUTPUT, { logger: silentLogger });

    expect(result.component).toBe('chairman_constraints');
    expect(result.total_constraints).toBe(10);
    expect(result.verdict).toBeDefined();
    expect(['pass', 'review', 'fail']).toContain(result.verdict);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test('detects automation keywords for fully_automatable', async () => {
    const autoOutput = {
      ...SAMPLE_PATH_OUTPUT,
      suggested_solution: 'AI-powered automated pipeline',
    };
    const result = await applyChairmanConstraints(autoOutput, { logger: silentLogger });

    const autoEval = result.evaluations.find(e => e.key === 'fully_automatable');
    expect(autoEval.status).toBe('pass');
  });

  test('warns when no automation keywords', async () => {
    const noAutoOutput = {
      ...SAMPLE_PATH_OUTPUT,
      suggested_name: 'Manual Report',
      suggested_problem: 'Reports take long',
      suggested_solution: 'Better templates',
      target_market: 'offices',
    };
    const result = await applyChairmanConstraints(noAutoOutput, { logger: silentLogger });

    const autoEval = result.evaluations.find(e => e.key === 'fully_automatable');
    expect(autoEval.status).toBe('warning');
  });

  test('loads constraints from database when available', async () => {
    const supabase = createMockSupabase({
      constraintsData: [
        { key: 'custom_constraint', label: 'Custom', weight: 10, is_active: true },
      ],
    });

    const result = await applyChairmanConstraints(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger });

    expect(result.total_constraints).toBe(1);
    expect(result.evaluations[0].key).toBe('custom_constraint');
  });

  test('falls back to defaults on database error', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Connection lost');
      }),
    };

    const result = await applyChairmanConstraints(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger });

    expect(result.total_constraints).toBe(10);
  });

  test('identifies critical failures (weight >= 8)', async () => {
    // Create a venture that would fail high-weight constraints
    const badOutput = {
      ...SAMPLE_PATH_OUTPUT,
      suggested_name: 'Generic Thing',
      suggested_problem: 'Something vague',
      suggested_solution: 'Something generic',
      target_market: '',
    };
    const result = await applyChairmanConstraints(badOutput, { logger: silentLogger });

    // narrow_specialization should warn (market empty, length <= 5)
    const narrowEval = result.evaluations.find(e => e.key === 'narrow_specialization');
    expect(narrowEval.status).toBe('warning');
  });
});

// ── Component 6: Time-Horizon Tests ──────────────────

describe('Synthesis - assessTimeHorizon', () => {
  test('returns time-horizon assessment', async () => {
    const llmClient = createMockLLMClient();
    const result = await assessTimeHorizon(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.component).toBe('time_horizon');
    expect(result.position).toBe('build_now');
    expect(result.confidence).toBe(85);
    expect(result.market_readiness.score).toBe(8);
    expect(result.technology_maturity.score).toBe(9);
    expect(result.adoption_stage).toBe('early_majority');
  });

  test('validates position to known values', async () => {
    const llmClient = createMockLLMClient({ position: 'invalid_value', confidence: 50 });
    const result = await assessTimeHorizon(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.position).toBe('build_now'); // Falls back to default
  });

  test('handles park_and_build_later with trigger conditions', async () => {
    const llmClient = createMockLLMClient({
      position: 'park_and_build_later',
      confidence: 70,
      market_readiness: { score: 4, rationale: 'Market not ready' },
      technology_maturity: { score: 8, rationale: 'Tech exists' },
      competitive_density: { score: 2, rationale: 'No competitors' },
      adoption_stage: 'early_adopter',
      trigger_conditions: ['Market adoption reaches 15%', 'Key regulation passes'],
      urgency_factors: [],
      summary: 'Park for now.',
    });
    const result = await assessTimeHorizon(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.position).toBe('park_and_build_later');
    expect(result.trigger_conditions).toHaveLength(2);
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Timeout')) },
    };

    const result = await assessTimeHorizon(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.position).toBe('build_now');
    expect(result.confidence).toBe(0);
    expect(result.summary).toContain('Timeout');
  });
});

// ── Component 7: Archetype Tests ──────────────────

describe('Synthesis - classifyArchetype', () => {
  test('returns archetype classification', async () => {
    const llmClient = createMockLLMClient();
    const result = await classifyArchetype(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.component).toBe('archetypes');
    expect(result.primary_archetype).toBe('automator');
    expect(result.primary_confidence).toBe(88);
    expect(result.secondary_archetypes).toHaveLength(1);
    expect(result.secondary_archetypes[0].key).toBe('democratizer');
    expect(result.archetype_scores.automator).toBe(9);
    expect(result.execution_implications.length).toBeGreaterThanOrEqual(1);
  });

  test('validates archetype to known values', async () => {
    const llmClient = createMockLLMClient({ primary_archetype: 'unknown_type', primary_confidence: 50 });
    const result = await classifyArchetype(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.primary_archetype).toBe('automator'); // Falls back to default
  });

  test('filters secondary archetypes to valid keys', async () => {
    const llmClient = createMockLLMClient({
      primary_archetype: 'democratizer',
      primary_confidence: 80,
      secondary_archetypes: [
        { key: 'automator', fit_score: 7, rationale: 'Good' },
        { key: 'invalid_key', fit_score: 5, rationale: 'Bad' },
        { key: 'democratizer', fit_score: 9, rationale: 'Same as primary' }, // should be excluded
      ],
      archetype_scores: {},
      execution_implications: [],
      summary: 'Test.',
    });
    const result = await classifyArchetype(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.primary_archetype).toBe('democratizer');
    // Should only include automator (invalid_key filtered, democratizer=primary filtered)
    expect(result.secondary_archetypes).toHaveLength(1);
    expect(result.secondary_archetypes[0].key).toBe('automator');
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Model overloaded')) },
    };

    const result = await classifyArchetype(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.primary_archetype).toBe('automator');
    expect(result.primary_confidence).toBe(0);
    expect(result.summary).toContain('Model overloaded');
  });
});

// ── Component 8: Build Cost Tests ──────────────────

describe('Synthesis - estimateBuildCost', () => {
  test('returns build cost estimation', async () => {
    const llmClient = createMockLLMClient();
    const result = await estimateBuildCost(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.component).toBe('build_cost');
    expect(result.complexity).toBe('moderate');
    expect(result.loc_estimate.min).toBe(3000);
    expect(result.loc_estimate.max).toBe(6000);
    expect(result.sd_count.min).toBe(10);
    expect(result.infrastructure.required).toContain('supabase');
    expect(result.timeline_weeks.realistic).toBe(9);
    expect(result.risk_factors).toHaveLength(2);
  });

  test('validates complexity to known values', async () => {
    const llmClient = createMockLLMClient({ complexity: 'impossible' });
    const result = await estimateBuildCost(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.complexity).toBe('moderate'); // Falls back to default
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Context too long')) },
    };

    const result = await estimateBuildCost(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.complexity).toBe('moderate');
    expect(result.loc_estimate.min).toBe(0);
    expect(result.summary).toContain('Context too long');
  });

  test('handles non-JSON response', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'Cannot estimate without more details.' }],
        }),
      },
    };

    const result = await estimateBuildCost(SAMPLE_PATH_OUTPUT, { logger: silentLogger, llmClient });

    expect(result.summary).toContain('Could not parse');
  });
});

// ── Full Synthesis (8 components) Tests ──────────────────

describe('Synthesis - runSynthesis (8 components)', () => {
  test('runs all 8 components and returns enriched brief', async () => {
    const supabase = createMockSupabase({
      nurseryItems: [{ id: 'n1', name: 'Prior Item', problem_statement: 'P', solution: 'S', parked_reason: 'R' }],
      ventures: [{ id: 'v1', name: 'ExistingVenture', problem_statement: 'P', solution: 'S', target_market: 'M', status: 'active', metadata: {} }],
    });
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger, llmClient });

    // Check enriched brief structure
    expect(result.name).toBe('AutoReview AI');
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.raw_chairman_intent).toBe('Businesses struggle to manage online reviews');
    expect(result.maturity).toBe('ready');

    // Check all 8 synthesis components present
    const syn = result.metadata.synthesis;
    expect(syn.components_run).toBe(8);
    expect(syn.components_total).toBe(8);
    expect(syn.cross_reference).toBeDefined();
    expect(syn.portfolio_evaluation).toBeDefined();
    expect(syn.problem_reframing).toBeDefined();
    expect(syn.moat_architecture).toBeDefined();
    expect(syn.chairman_constraints).toBeDefined();
    expect(syn.time_horizon).toBeDefined();
    expect(syn.archetypes).toBeDefined();
    expect(syn.build_cost).toBeDefined();
  });

  test('uses recommended reframing for problem_statement', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger, llmClient });

    expect(result.problem_statement).toContain('reputation');
    expect(result.raw_chairman_intent).toBe('Businesses struggle to manage online reviews');
  });

  test('sets maturity to nursery when park_and_build_later', async () => {
    // Override time horizon to return park_and_build_later
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockImplementation(async ({ messages }) => {
          const prompt = messages[0]?.content || '';
          if (prompt.includes('market timing') || prompt.includes('temporal position')) {
            return { content: [{ text: JSON.stringify({
              position: 'park_and_build_later',
              confidence: 70,
              market_readiness: { score: 3, rationale: 'Not ready' },
              technology_maturity: { score: 8, rationale: 'Tech exists' },
              competitive_density: { score: 2, rationale: 'Empty' },
              adoption_stage: 'early_adopter',
              trigger_conditions: ['Market maturity reaches threshold'],
              urgency_factors: [],
              summary: 'Park for now.',
            }) }] };
          }
          // Default responses for other components
          return { content: [{ text: '{}' }] };
        }),
      },
    };

    const supabase = createMockSupabase();
    const result = await runSynthesis(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger, llmClient });

    expect(result.maturity).toBe('nursery');
  });

  test('handles component failures gracefully', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('Database down');
      }),
    };
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('All models busy')) },
    };

    // Should not throw - each component catches errors
    const result = await runSynthesis(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger, llmClient });

    expect(result.name).toBe('AutoReview AI');
    expect(result.metadata.synthesis.components_run).toBe(8);
  });

  test('preserves path output metadata', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await runSynthesis(SAMPLE_PATH_OUTPUT, { supabase, logger: silentLogger, llmClient });

    expect(result.metadata.path).toBe('competitor_teardown');
    expect(result.competitor_ref).toEqual(['https://example.com']);
  });
});
