/**
 * Stage 0 - CLI Entry Framework and Path Router Tests
 *
 * Tests the core Stage 0 functionality:
 * - Interface validation (PathOutput, SynthesisInput, VentureBrief)
 * - Path routing (3-way routing)
 * - Chairman review flow
 * - Stage 0 orchestrator
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-B
 */

import { describe, test, expect, vi } from 'vitest';
import {
  validatePathOutput,
  validateVentureBrief,
  createPathOutput,
} from '../../lib/eva/stage-zero/interfaces.js';
import {
  routePath,
  ENTRY_PATHS,
  PATH_OPTIONS,
} from '../../lib/eva/stage-zero/path-router.js';
import { conductChairmanReview } from '../../lib/eva/stage-zero/chairman-review.js';
import { executeStageZero } from '../../lib/eva/stage-zero/stage-zero-orchestrator.js';

// ── Mock Supabase ──────────────────────────────────────────

function createMockSupabase(overrides = {}) {
  const mockFrom = (table) => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    // Table-specific mocks
    if (table === 'venture_blueprints') {
      chain.eq = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: overrides.blueprints || [
            { id: 'bp-1', name: 'SaaS Blueprint', category: 'software', description: 'Standard SaaS', template_data: { name: 'SaaS Venture', problem_statement: 'test problem', solution: 'test solution', target_market: 'SMBs' }, is_active: true },
          ],
          error: null,
        }),
      });
    }

    if (table === 'discovery_strategies') {
      chain.eq = vi.fn().mockImplementation((field, value) => {
        if (field === 'strategy_key') {
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { strategy_key: value, name: 'Trend Scanner', description: 'Scan trends', is_active: true },
                error: null,
              }),
            }),
          };
        }
        return chain;
      });
    }

    if (table === 'ventures') {
      chain.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'venture-uuid-1', name: 'Test Venture', status: 'active' },
            error: null,
          }),
        }),
      });
    }

    if (table === 'venture_nursery') {
      chain.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'nursery-uuid-1', name: 'Parked Idea', maturity: 'seed' },
            error: null,
          }),
        }),
      });
    }

    if (table === 'venture_briefs') {
      chain.insert = vi.fn().mockResolvedValue({ error: null });
    }

    return chain;
  };

  return { from: vi.fn(mockFrom) };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Interface Validation Tests ──────────────────────────────

describe('Stage 0 Interfaces', () => {
  describe('validatePathOutput', () => {
    test('accepts valid PathOutput', () => {
      const output = createPathOutput({
        origin_type: 'competitor_teardown',
        raw_material: { urls: ['https://example.com'] },
        suggested_name: 'Test Venture',
        suggested_problem: 'Market gap',
        suggested_solution: 'Automated solution',
        target_market: 'SMBs',
      });

      const result = validatePathOutput(output);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('rejects null input', () => {
      const result = validatePathOutput(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('PathOutput must be a non-null object');
    });

    test('rejects missing required fields', () => {
      const result = validatePathOutput({});
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('rejects invalid origin_type', () => {
      const output = createPathOutput({
        origin_type: 'invalid_type',
        raw_material: {},
        suggested_name: 'Test',
        suggested_problem: 'Test',
        suggested_solution: 'Test',
        target_market: 'Test',
      });

      const result = validatePathOutput(output);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('origin_type'))).toBe(true);
    });

    test('accepts all valid origin types', () => {
      for (const type of ['competitor_teardown', 'blueprint', 'discovery', 'manual']) {
        const output = createPathOutput({
          origin_type: type,
          raw_material: {},
          suggested_name: 'Test',
          suggested_problem: 'Test',
          suggested_solution: 'Test',
          target_market: 'Test',
        });
        expect(validatePathOutput(output).valid).toBe(true);
      }
    });
  });

  describe('validateVentureBrief', () => {
    test('accepts valid brief', () => {
      const brief = {
        name: 'Test Venture',
        problem_statement: 'A problem',
        solution: 'A solution',
        target_market: 'SMBs',
        origin_type: 'discovery',
        raw_chairman_intent: 'Build something great',
        maturity: 'ready',
      };
      const result = validateVentureBrief(brief);
      expect(result.valid).toBe(true);
    });

    test('rejects missing required fields', () => {
      const result = validateVentureBrief({ name: 'Test' });
      expect(result.valid).toBe(false);
    });

    test('rejects invalid maturity', () => {
      const brief = {
        name: 'Test',
        problem_statement: 'Test',
        solution: 'Test',
        target_market: 'Test',
        origin_type: 'manual',
        raw_chairman_intent: 'Test',
        maturity: 'invalid',
      };
      const result = validateVentureBrief(brief);
      expect(result.valid).toBe(false);
    });
  });

  describe('createPathOutput', () => {
    test('creates defaults', () => {
      const output = createPathOutput();
      expect(output.origin_type).toBe('manual');
      expect(output.raw_material).toEqual({});
      expect(output.competitor_urls).toEqual([]);
    });

    test('applies overrides', () => {
      const output = createPathOutput({ origin_type: 'blueprint', suggested_name: 'Test' });
      expect(output.origin_type).toBe('blueprint');
      expect(output.suggested_name).toBe('Test');
    });
  });
});

// ── Path Router Tests ──────────────────────────────────────

describe('Path Router', () => {
  test('exposes 3 entry paths', () => {
    expect(Object.keys(ENTRY_PATHS)).toHaveLength(3);
    expect(ENTRY_PATHS.COMPETITOR_TEARDOWN).toBe('competitor_teardown');
    expect(ENTRY_PATHS.BLUEPRINT_BROWSE).toBe('blueprint_browse');
    expect(ENTRY_PATHS.DISCOVERY_MODE).toBe('discovery_mode');
  });

  test('PATH_OPTIONS has display metadata for all paths', () => {
    expect(PATH_OPTIONS).toHaveLength(3);
    for (const option of PATH_OPTIONS) {
      expect(option.key).toBeDefined();
      expect(option.label).toBeDefined();
      expect(option.description).toBeDefined();
      expect(option.shortcut).toBeDefined();
    }
  });

  test('routes to competitor teardown', async () => {
    const result = await routePath(
      ENTRY_PATHS.COMPETITOR_TEARDOWN,
      { urls: ['https://competitor.com'] },
      { logger: silentLogger }
    );
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.competitor_urls).toEqual(['https://competitor.com']);
  });

  test('routes to blueprint browse', async () => {
    const supabase = createMockSupabase();
    const result = await routePath(
      ENTRY_PATHS.BLUEPRINT_BROWSE,
      {},
      { supabase, logger: silentLogger }
    );
    expect(result.origin_type).toBe('blueprint');
    expect(result.blueprint_id).toBe('bp-1');
  });

  test('routes to discovery mode', async () => {
    const supabase = createMockSupabase();
    const result = await routePath(
      ENTRY_PATHS.DISCOVERY_MODE,
      { strategy: 'trend_scanner' },
      { supabase, logger: silentLogger }
    );
    expect(result.origin_type).toBe('discovery');
    expect(result.discovery_strategy).toBe('trend_scanner');
  });

  test('rejects unknown path', async () => {
    await expect(
      routePath('unknown_path', {}, { logger: silentLogger })
    ).rejects.toThrow('Unknown entry path');
  });
});

// ── Chairman Review Tests ──────────────────────────────────

describe('Chairman Review', () => {
  test('captures raw_chairman_intent', async () => {
    const supabase = createMockSupabase();
    const brief = {
      name: 'Test Venture',
      problem_statement: 'Original problem framing',
      solution: 'Test solution',
      target_market: 'SMBs',
      origin_type: 'manual',
    };

    const result = await conductChairmanReview(brief, { supabase, logger: silentLogger });
    expect(result.brief.raw_chairman_intent).toBe('Original problem framing');
    expect(result.reviewed_at).toBeDefined();
  });

  test('defaults to ready maturity', async () => {
    const supabase = createMockSupabase();
    const brief = {
      name: 'Test',
      problem_statement: 'Test',
      solution: 'Test',
      target_market: 'Test',
      origin_type: 'manual',
    };

    const result = await conductChairmanReview(brief, { supabase, logger: silentLogger });
    expect(result.decision).toBe('ready');
  });

  test('preserves explicit maturity', async () => {
    const supabase = createMockSupabase();
    const brief = {
      name: 'Test',
      problem_statement: 'Test',
      solution: 'Test',
      target_market: 'Test',
      origin_type: 'manual',
      maturity: 'seed',
    };

    const result = await conductChairmanReview(brief, { supabase, logger: silentLogger });
    expect(result.decision).toBe('seed');
  });
});

// ── Stage 0 Orchestrator Tests ──────────────────────────────

describe('Stage 0 Orchestrator', () => {
  test('executes full flow with competitor teardown path', async () => {
    const supabase = createMockSupabase();
    const result = await executeStageZero(
      {
        path: ENTRY_PATHS.COMPETITOR_TEARDOWN,
        pathParams: { urls: ['https://competitor.com'] },
        options: { dryRun: true },
      },
      { supabase, logger: silentLogger }
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.brief.origin_type).toBe('competitor_teardown');
  });

  test('executes full flow with blueprint path', async () => {
    const supabase = createMockSupabase();
    const result = await executeStageZero(
      {
        path: ENTRY_PATHS.BLUEPRINT_BROWSE,
        pathParams: {},
        options: { dryRun: true },
      },
      { supabase, logger: silentLogger }
    );

    expect(result.success).toBe(true);
    expect(result.brief.origin_type).toBe('blueprint');
  });

  test('executes full flow with discovery path', async () => {
    const supabase = createMockSupabase();
    const result = await executeStageZero(
      {
        path: ENTRY_PATHS.DISCOVERY_MODE,
        pathParams: { strategy: 'trend_scanner' },
        options: { dryRun: true },
      },
      { supabase, logger: silentLogger }
    );

    expect(result.success).toBe(true);
    expect(result.brief.origin_type).toBe('discovery');
  });

  test('requires supabase client', async () => {
    await expect(
      executeStageZero(
        { path: ENTRY_PATHS.COMPETITOR_TEARDOWN, pathParams: { urls: ['https://test.com'] } },
        { logger: silentLogger }
      )
    ).rejects.toThrow('supabase client is required');
  });

  test('supports custom synthesis function', async () => {
    const supabase = createMockSupabase();
    const customSynthesize = vi.fn().mockResolvedValue({
      name: 'Synthesized Venture',
      problem_statement: 'Reframed problem',
      solution: 'Enhanced solution',
      target_market: 'Enterprise',
      origin_type: 'competitor_teardown',
      raw_chairman_intent: 'Original intent',
      archetype: 'automator',
      moat_strategy: { type: 'data_moat' },
    });

    const result = await executeStageZero(
      {
        path: ENTRY_PATHS.COMPETITOR_TEARDOWN,
        pathParams: { urls: ['https://test.com'] },
        options: { dryRun: true },
      },
      { supabase, logger: silentLogger, synthesize: customSynthesize }
    );

    expect(customSynthesize).toHaveBeenCalled();
    expect(result.brief.name).toBe('Synthesized Venture');
    expect(result.brief.archetype).toBe('automator');
  });
});
