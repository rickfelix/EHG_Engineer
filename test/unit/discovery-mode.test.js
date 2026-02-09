/**
 * Discovery Mode Path - Full Implementation Tests
 *
 * Tests the AI-driven discovery pipeline:
 * - Strategy validation and config loading
 * - Trend Scanner strategy
 * - Democratization Finder strategy
 * - Capability Overhang strategy
 * - Nursery Re-evaluation strategy
 * - Candidate ranking
 * - Error handling and graceful degradation
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-E
 */

import { describe, test, expect, vi } from 'vitest';
import {
  executeDiscoveryMode,
  rankCandidates,
  listDiscoveryStrategies,
} from '../../lib/eva/stage-zero/paths/discovery-mode.js';

// ── Mock LLM Client ──────────────────────────────────────────

function createMockLLMClient(candidates = null) {
  const defaultCandidates = [
    {
      name: 'AutoReview AI',
      problem_statement: 'Businesses struggle to manage online reviews',
      solution: 'AI-powered review management platform',
      target_market: 'Small businesses',
      revenue_model: 'Monthly subscription',
      automation_approach: 'LLM-driven response generation',
      automation_feasibility: 9,
      competition_level: 'medium',
    },
    {
      name: 'DataClean Pro',
      problem_statement: 'Data quality is poor across enterprises',
      solution: 'Automated data cleansing pipeline',
      target_market: 'Mid-market enterprises',
      revenue_model: 'Usage-based pricing',
      automation_approach: 'ML-powered data validation',
      automation_feasibility: 8,
      competition_level: 'low',
    },
    {
      name: 'ContentForge',
      problem_statement: 'Content creation is expensive and slow',
      solution: 'AI content factory for marketing teams',
      target_market: 'Marketing agencies',
      revenue_model: 'Per-piece pricing',
      automation_approach: 'Multi-modal content generation',
      automation_feasibility: 7,
      competition_level: 'high',
    },
  ];

  return {
    _model: 'mock-model',
    messages: {
      create: vi.fn().mockImplementation(async () => ({
        content: [{ text: JSON.stringify(candidates || defaultCandidates) }],
      })),
    },
  };
}

// ── Mock Supabase ──────────────────────────────────────────

const STRATEGY_CONFIGS = {
  trend_scanner: { strategy_key: 'trend_scanner', name: 'Trend Scanner', description: 'Scan trending products', is_active: true },
  democratization_finder: { strategy_key: 'democratization_finder', name: 'Democratization Finder', description: 'Find premium services to democratize', is_active: true },
  capability_overhang: { strategy_key: 'capability_overhang', name: 'Capability Overhang', description: 'Exploit capability gaps', is_active: true },
  nursery_reeval: { strategy_key: 'nursery_reeval', name: 'Nursery Re-evaluation', description: 'Re-score parked ideas', is_active: true },
};

const DEFAULT_NURSERY_ITEMS = [
  { id: 'n-1', name: 'OldVenture A', problem_statement: 'Problem A', solution: 'Solution A', target_market: 'Market A', parked_reason: 'Market not ready', original_score: 60, parked_at: '2025-06-01', metadata: {} },
  { id: 'n-2', name: 'OldVenture B', problem_statement: 'Problem B', solution: 'Solution B', target_market: 'Market B', parked_reason: 'Tech limitations', original_score: 45, parked_at: '2025-03-01', metadata: {} },
];

function createMockSupabase({ strategies = STRATEGY_CONFIGS, nurseryItems = DEFAULT_NURSERY_ITEMS, dbError = null, nurseryError = null, strategyError = null } = {}) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'discovery_strategies') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((field, value) => {
              if (field === 'strategy_key') {
                const config = strategies[value];
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: config || null,
                      error: strategyError || (config ? null : { message: 'Not found' }),
                    }),
                  }),
                };
              }
              if (field === 'is_active') {
                return {
                  order: vi.fn().mockResolvedValue({
                    data: Object.values(strategies),
                    error: dbError,
                  }),
                };
              }
              return { single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Unknown filter' } }) };
            }),
          }),
        };
      }
      if (table === 'venture_nursery') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: nurseryError ? null : nurseryItems,
                  error: nurseryError,
                }),
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

// ── Core Functionality Tests ──────────────────────────────

describe('Discovery Mode - executeDiscoveryMode', () => {
  test('requires supabase client', async () => {
    await expect(
      executeDiscoveryMode({ strategy: 'trend_scanner' }, { logger: silentLogger })
    ).rejects.toThrow('supabase client is required');
  });

  test('rejects invalid strategy', async () => {
    const supabase = createMockSupabase();
    await expect(
      executeDiscoveryMode({ strategy: 'invalid' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('Invalid strategy: invalid');
  });

  test('throws when strategy not found in database', async () => {
    const supabase = createMockSupabase({ strategies: {} });
    await expect(
      executeDiscoveryMode({ strategy: 'trend_scanner' }, { supabase, logger: silentLogger })
    ).rejects.toThrow('Strategy not found or inactive: trend_scanner');
  });

  test('returns null when no candidates generated', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([]);

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).toBeNull();
  });

  test('runs trend_scanner and returns PathOutput', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.origin_type).toBe('discovery');
    expect(result.discovery_strategy).toBe('trend_scanner');
    expect(result.suggested_name).toBeTruthy();
    expect(result.suggested_problem).toBeTruthy();
    expect(result.raw_material.candidates).toHaveLength(3);
    expect(result.raw_material.top_candidate).toBeDefined();
    expect(result.metadata.path).toBe('discovery_mode');
    expect(result.metadata.strategy_key).toBe('trend_scanner');
    expect(result.metadata.candidates_generated).toBe(3);
  });

  test('runs democratization_finder strategy', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'democratization_finder' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.origin_type).toBe('discovery');
    expect(result.discovery_strategy).toBe('democratization_finder');
    expect(result.metadata.strategy_name).toBe('Democratization Finder');
  });

  test('runs capability_overhang strategy', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'capability_overhang' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.origin_type).toBe('discovery');
    expect(result.discovery_strategy).toBe('capability_overhang');
    expect(result.metadata.strategy_name).toBe('Capability Overhang');
  });

  test('passes constraints to strategy', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner', constraints: { industries: ['fintech'], budget_range: '$10K-$50K' } },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.raw_material.constraints).toEqual({ industries: ['fintech'], budget_range: '$10K-$50K' });
    expect(result.metadata.constraints_applied).toContain('industries');
    expect(result.metadata.constraints_applied).toContain('budget_range');
    // Verify LLM was called with constraints in the prompt
    const callArgs = llmClient.messages.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain('fintech');
  });

  test('selects highest-scored candidate as top', async () => {
    const supabase = createMockSupabase();
    // DataClean Pro has feasibility=8 + competition_level=low bonus=10 → score=90
    // AutoReview AI has feasibility=9 + medium bonus=5 → score=95
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.raw_material.top_candidate.name).toBe('AutoReview AI');
    expect(result.metadata.top_score).toBe(95);
  });

  test('includes analyzed_at timestamp', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.raw_material.analyzed_at).toBeDefined();
  });

  test('logs progress during execution', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient();
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger, llmClient }
    );

    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Trend Scanner'));
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('3 candidate'));
  });
});

// ── Nursery Re-evaluation Tests ──────────────────────────────

describe('Discovery Mode - nursery_reeval strategy', () => {
  test('loads parked ventures from venture_nursery table', async () => {
    const supabase = createMockSupabase();
    const revivedCandidates = [
      { nursery_id: 'n-1', name: 'OldVenture A Revived', problem_statement: 'Updated problem', solution: 'Updated solution', target_market: 'Market A', revival_reason: 'New AI capabilities', new_score: 8, automation_feasibility: 8 },
    ];
    const llmClient = createMockLLMClient(revivedCandidates);

    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result.origin_type).toBe('discovery');
    expect(result.discovery_strategy).toBe('nursery_reeval');
    expect(result.raw_material.candidates).toHaveLength(1);
    expect(supabase.from).toHaveBeenCalledWith('venture_nursery');
  });

  test('returns null when no parked ventures exist', async () => {
    const supabase = createMockSupabase({ nurseryItems: [] });
    const llmClient = createMockLLMClient();

    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).toBeNull();
  });

  test('handles nursery database error', async () => {
    const supabase = createMockSupabase({ nurseryError: { message: 'Connection failed' } });
    await expect(
      executeDiscoveryMode(
        { strategy: 'nursery_reeval' },
        { supabase, logger: silentLogger, llmClient: createMockLLMClient() }
      )
    ).rejects.toThrow('Failed to load nursery items: Connection failed');
  });

  test('handles LLM returning empty array for re-evaluation', async () => {
    const supabase = createMockSupabase();
    const llmClient = createMockLLMClient([]);

    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).toBeNull();
  });
});

// ── Error Handling Tests ──────────────────────────────────

describe('Discovery Mode - Error Handling', () => {
  test('handles LLM returning non-JSON gracefully', async () => {
    const supabase = createMockSupabase();
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I cannot generate venture candidates right now.' }],
        }),
      },
    };

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger, llmClient }
    );

    expect(result).toBeNull();
  });

  test('handles LLM error gracefully', async () => {
    const supabase = createMockSupabase();
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockRejectedValue(new Error('Rate limited')),
      },
    };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await executeDiscoveryMode(
      { strategy: 'trend_scanner' },
      { supabase, logger, llmClient }
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limited'));
  });

  test('handles LLM error in nursery_reeval gracefully', async () => {
    const supabase = createMockSupabase();
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockRejectedValue(new Error('Context too long')),
      },
    };
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await executeDiscoveryMode(
      { strategy: 'nursery_reeval' },
      { supabase, logger, llmClient }
    );

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Context too long'));
  });
});

// ── Ranking Tests ──────────────────────────────────────────

describe('Discovery Mode - rankCandidates', () => {
  test('ranks by automation_feasibility * 10', () => {
    const ranked = rankCandidates([
      { name: 'Low', automation_feasibility: 3 },
      { name: 'High', automation_feasibility: 9 },
      { name: 'Mid', automation_feasibility: 6 },
    ]);

    expect(ranked[0].name).toBe('High');
    expect(ranked[0].score).toBe(90);
    expect(ranked[1].name).toBe('Mid');
    expect(ranked[2].name).toBe('Low');
  });

  test('adds competition bonus for low competition', () => {
    const ranked = rankCandidates([
      { name: 'Low Comp', automation_feasibility: 7, competition_level: 'low' },
      { name: 'High Comp', automation_feasibility: 8, competition_level: 'high' },
    ]);

    // Low Comp: 7*10 + 10 = 80, High Comp: 8*10 + 0 = 80 → tied, original order preserved
    expect(ranked[0].score).toBe(80);
    expect(ranked[1].score).toBe(80);
  });

  test('adds medium competition bonus', () => {
    const ranked = rankCandidates([
      { name: 'A', automation_feasibility: 5, competition_level: 'medium' },
    ]);
    expect(ranked[0].score).toBe(55); // 5*10 + 5
  });

  test('handles missing automation_feasibility', () => {
    const ranked = rankCandidates([
      { name: 'No Score' },
    ]);
    expect(ranked[0].score).toBe(50); // default 5 * 10
  });

  test('handles empty array', () => {
    expect(rankCandidates([])).toHaveLength(0);
  });
});

// ── List Strategies Tests ──────────────────────────────────

describe('Discovery Mode - listDiscoveryStrategies', () => {
  test('lists active strategies', async () => {
    const supabase = createMockSupabase();
    const strategies = await listDiscoveryStrategies({ supabase });

    expect(strategies.length).toBeGreaterThanOrEqual(4);
    expect(strategies[0].strategy_key).toBeDefined();
    expect(strategies[0].name).toBeDefined();
  });

  test('requires supabase', async () => {
    await expect(listDiscoveryStrategies()).rejects.toThrow('supabase client is required');
  });

  test('handles database error', async () => {
    const supabase = createMockSupabase({ dbError: { message: 'Connection failed' } });
    await expect(
      listDiscoveryStrategies({ supabase })
    ).rejects.toThrow('Failed to load strategies: Connection failed');
  });
});
