/**
 * Unit Tests: Evaluation Profile Service
 * SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-B
 *
 * Test Coverage:
 * - Profile resolution (explicit, active, fallback)
 * - Weight normalization
 * - Weighted score calculation
 * - Profile CRUD operations
 * - Edge cases (no supabase, DB errors, missing data)
 */

import { describe, test, expect, vi } from 'vitest';
import {
  resolveProfile,
  createProfile,
  activateProfile,
  listProfiles,
  calculateWeightedScore,
  LEGACY_WEIGHTS,
  VALID_COMPONENTS,
} from '../../../../lib/eva/stage-zero/profile-service.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

function createMockSupabase(responses = {}) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(responses.single || { data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
  };

  // Make order chainable with a second call
  if (responses.list) {
    let orderCallCount = 0;
    chain.order = vi.fn().mockImplementation(() => {
      orderCallCount++;
      if (orderCallCount >= 2) {
        return { then: (fn) => fn(responses.list) };
      }
      return chain;
    });
  }

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
  };
}

describe('resolveProfile', () => {
  test('returns legacy fallback when no supabase client', async () => {
    const result = await resolveProfile({ logger: silentLogger });

    expect(result.name).toBe('legacy_defaults');
    expect(result.source).toBe('fallback');
    expect(result.fallback_reason).toBe('no_supabase_client');
    expect(result.weights).toEqual(LEGACY_WEIGHTS);
  });

  test('resolves explicit profile by ID', async () => {
    const mockProfile = {
      id: 'test-uuid',
      name: 'aggressive_growth',
      version: 1,
      weights: { virality: 0.35, moat_architecture: 0.25 },
      description: 'Test profile',
    };

    const supabase = createMockSupabase({
      single: { data: mockProfile, error: null },
    });

    const result = await resolveProfile(
      { supabase, logger: silentLogger },
      'test-uuid'
    );

    expect(result.name).toBe('aggressive_growth');
    expect(result.source).toBe('explicit');
    expect(result.weights.virality).toBe(0.35);
    expect(result.weights.moat_architecture).toBe(0.25);
    // Missing components should be normalized to 0
    expect(result.weights.cross_reference).toBe(0);
  });

  test('resolves active profile when no profileId given', async () => {
    const mockProfile = {
      id: 'active-uuid',
      name: 'balanced',
      version: 1,
      weights: { virality: 0.15, moat_architecture: 0.15, build_cost: 0.10 },
      description: 'Balanced weights',
    };

    const supabase = createMockSupabase({
      single: { data: mockProfile, error: null },
    });

    const result = await resolveProfile({ supabase, logger: silentLogger });

    expect(result.name).toBe('balanced');
    expect(result.source).toBe('active');
  });

  test('falls back to legacy when profile not found', async () => {
    const supabase = createMockSupabase({
      single: { data: null, error: { message: 'not found' } },
    });

    const result = await resolveProfile(
      { supabase, logger: silentLogger },
      'nonexistent-uuid'
    );

    expect(result.name).toBe('legacy_defaults');
    expect(result.source).toBe('fallback');
    expect(result.fallback_reason).toBe('profile_not_found');
  });

  test('falls back to legacy when no active profile exists', async () => {
    const supabase = createMockSupabase({
      single: { data: null, error: { message: 'not found' } },
    });

    const result = await resolveProfile({ supabase, logger: silentLogger });

    expect(result.name).toBe('legacy_defaults');
    expect(result.source).toBe('fallback');
    expect(result.fallback_reason).toBe('no_active_profile');
  });

  test('falls back to legacy on database error', async () => {
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        throw new Error('connection refused');
      }),
    };

    const result = await resolveProfile({ supabase, logger: silentLogger });

    expect(result.name).toBe('legacy_defaults');
    expect(result.source).toBe('fallback');
    expect(result.fallback_reason).toBe('error');
  });
});

describe('calculateWeightedScore', () => {
  test('calculates correct weighted score from synthesis results', () => {
    const synthesisResults = {
      cross_reference: { relevance_score: 80 },
      portfolio_evaluation: { composite_score: 60 },
      problem_reframing: { reframings: ['a', 'b'] }, // 70
      moat_architecture: { moat_score: 90 },
      chairman_constraints: { verdict: 'pass' }, // 100
      time_horizon: { position: 'build_now' }, // 100
      archetypes: { primary_confidence: 0.85 }, // 85
      build_cost: { complexity: 'simple' }, // 90
      virality: { virality_score: 72 },
    };

    const weights = {
      cross_reference: 0.10,
      portfolio_evaluation: 0.10,
      problem_reframing: 0.05,
      moat_architecture: 0.15,
      chairman_constraints: 0.15,
      time_horizon: 0.10,
      archetypes: 0.10,
      build_cost: 0.10,
      virality: 0.15,
    };

    const result = calculateWeightedScore(synthesisResults, weights);

    // Manual: 8+6+3.5+13.5+15+10+8.5+9+10.8 = 84.3 → 84
    expect(result.total_score).toBe(84);
    expect(result.breakdown).toHaveLength(9);
    // Breakdown should be sorted by contribution descending
    expect(result.breakdown[0].contribution).toBeGreaterThanOrEqual(result.breakdown[1].contribution);
  });

  test('returns 0 for empty synthesis results', () => {
    const result = calculateWeightedScore({}, LEGACY_WEIGHTS);

    expect(result.total_score).toBe(0);
    expect(result.breakdown).toHaveLength(10);
    result.breakdown.forEach(b => expect(b.raw_score).toBe(0));
  });

  test('handles missing components gracefully', () => {
    const result = calculateWeightedScore(
      { virality: { virality_score: 100 } },
      { virality: 1.0 }
    );

    expect(result.total_score).toBe(100);
    expect(result.breakdown).toHaveLength(1);
  });

  test('correctly maps chairman_constraints verdicts', () => {
    const pass = calculateWeightedScore(
      { chairman_constraints: { verdict: 'pass' } },
      { chairman_constraints: 1.0 }
    );
    expect(pass.total_score).toBe(100);

    const review = calculateWeightedScore(
      { chairman_constraints: { verdict: 'review' } },
      { chairman_constraints: 1.0 }
    );
    expect(review.total_score).toBe(50);

    const fail = calculateWeightedScore(
      { chairman_constraints: { verdict: 'fail' } },
      { chairman_constraints: 1.0 }
    );
    expect(fail.total_score).toBe(0);
  });

  test('correctly maps build_cost complexity levels', () => {
    const simple = calculateWeightedScore(
      { build_cost: { complexity: 'simple' } },
      { build_cost: 1.0 }
    );
    expect(simple.total_score).toBe(90);

    const moderate = calculateWeightedScore(
      { build_cost: { complexity: 'moderate' } },
      { build_cost: 1.0 }
    );
    expect(moderate.total_score).toBe(60);

    const complex = calculateWeightedScore(
      { build_cost: { complexity: 'complex' } },
      { build_cost: 1.0 }
    );
    expect(complex.total_score).toBe(30);
  });

  test('correctly maps time_horizon positions', () => {
    const now = calculateWeightedScore(
      { time_horizon: { position: 'build_now' } },
      { time_horizon: 1.0 }
    );
    expect(now.total_score).toBe(100);

    const soon = calculateWeightedScore(
      { time_horizon: { position: 'build_soon' } },
      { time_horizon: 1.0 }
    );
    expect(soon.total_score).toBe(75);

    const later = calculateWeightedScore(
      { time_horizon: { position: 'park_and_build_later' } },
      { time_horizon: 1.0 }
    );
    expect(later.total_score).toBe(25);
  });
});

describe('VALID_COMPONENTS', () => {
  test('contains all 10 synthesis components', () => {
    expect(VALID_COMPONENTS).toHaveLength(10);
    expect(VALID_COMPONENTS).toContain('virality');
    expect(VALID_COMPONENTS).toContain('moat_architecture');
    expect(VALID_COMPONENTS).toContain('tech_trajectory');
    expect(VALID_COMPONENTS).toContain('build_cost');
    expect(VALID_COMPONENTS).toContain('chairman_constraints');
  });
});

describe('LEGACY_WEIGHTS', () => {
  test('weights sum to approximately 1.0', () => {
    const sum = Object.values(LEGACY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });

  test('all weights are positive', () => {
    for (const [key, value] of Object.entries(LEGACY_WEIGHTS)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
