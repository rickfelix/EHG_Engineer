/**
 * Unit Tests: Archetype x Profile Interaction Matrix
 * SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-E
 *
 * Test Coverage:
 * - getArchetypeProfileMatrix (valid pair, null profile, invalid archetype, db error)
 * - applyMatrixAdjustments (normal, clamping, null inputs)
 * - getCompatibilityReport (ranked results, empty, error)
 * - clampMultiplier (bounds, NaN, normal)
 */

import { describe, test, expect, vi } from 'vitest';
import {
  getArchetypeProfileMatrix,
  applyMatrixAdjustments,
  getCompatibilityReport,
  clampMultiplier,
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
} from '../../../../lib/eva/stage-zero/archetype-profile-matrix.js';

// --- Mock helpers ---

function createMockSupabase(singleResponse = { data: null, error: null }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(singleResponse),
    order: vi.fn().mockResolvedValue(singleResponse),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain), _chain: chain };
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// --- Tests ---

describe('clampMultiplier', () => {
  test('returns value when within bounds', () => {
    expect(clampMultiplier(1.0)).toBe(1.0);
    expect(clampMultiplier(1.5)).toBe(1.5);
    expect(clampMultiplier(0.5)).toBe(0.5);
    expect(clampMultiplier(2.0)).toBe(2.0);
  });

  test('clamps values below minimum', () => {
    expect(clampMultiplier(0.1)).toBe(MIN_MULTIPLIER);
    expect(clampMultiplier(0)).toBe(MIN_MULTIPLIER);
    expect(clampMultiplier(-1)).toBe(MIN_MULTIPLIER);
  });

  test('clamps values above maximum', () => {
    expect(clampMultiplier(3.0)).toBe(MAX_MULTIPLIER);
    expect(clampMultiplier(5.0)).toBe(MAX_MULTIPLIER);
  });

  test('returns 1.0 for NaN and non-numbers', () => {
    expect(clampMultiplier(NaN)).toBe(1.0);
    expect(clampMultiplier(undefined)).toBe(1.0);
    expect(clampMultiplier('abc')).toBe(1.0);
  });
});

describe('getArchetypeProfileMatrix', () => {
  test('returns matrix entry for valid archetype-profile pair', async () => {
    const matrixRow = {
      weight_adjustments: { virality: 1.5, moat: 0.7 },
      execution_guidance: ['Prioritize viral growth', 'Speed over perfection'],
      compatibility_score: 0.85,
    };
    const supabase = createMockSupabase({ data: matrixRow, error: null });

    const result = await getArchetypeProfileMatrix(
      { supabase, logger: silentLogger },
      'democratizer',
      { id: 'profile-uuid', name: 'aggressive_growth' }
    );

    expect(result.archetype_key).toBe('democratizer');
    expect(result.profile_name).toBe('aggressive_growth');
    expect(result.adjusted_weights).toEqual({ virality: 1.5, moat: 0.7 });
    expect(result.execution_modifiers).toHaveLength(2);
    expect(result.compatibility_score).toBe(0.85);
    expect(result._default).toBeUndefined();
  });

  test('returns default matrix when profile is null', async () => {
    const supabase = createMockSupabase();

    const result = await getArchetypeProfileMatrix(
      { supabase, logger: silentLogger },
      'automator',
      null
    );

    expect(result.archetype_key).toBe('automator');
    expect(result.profile_name).toBeNull();
    expect(result.adjusted_weights).toEqual({});
    expect(result.compatibility_score).toBe(0.5);
    expect(result._default).toBe(true);
  });

  test('returns default matrix for invalid archetype key', async () => {
    const supabase = createMockSupabase();

    const result = await getArchetypeProfileMatrix(
      { supabase, logger: silentLogger },
      'invalid_type',
      { id: 'profile-uuid', name: 'balanced' }
    );

    expect(result._default).toBe(true);
    expect(result.archetype_key).toBe('invalid_type');
  });

  test('returns default matrix on database error', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'connection error' },
    });

    const result = await getArchetypeProfileMatrix(
      { supabase, logger: silentLogger },
      'democratizer',
      { id: 'profile-uuid', name: 'balanced' }
    );

    expect(result._default).toBe(true);
    expect(silentLogger.warn).toHaveBeenCalled();
  });

  test('returns default matrix when no supabase client', async () => {
    const result = await getArchetypeProfileMatrix(
      { supabase: null, logger: silentLogger },
      'automator',
      { id: 'profile-uuid', name: 'balanced' }
    );

    expect(result._default).toBe(true);
  });
});

describe('applyMatrixAdjustments', () => {
  test('applies multipliers to raw scores', () => {
    const rawScores = { virality: 0.8, moat: 0.6, market_size: 0.5 };
    const matrixData = {
      adjusted_weights: { virality: 1.3, moat: 0.7, market_size: 1.0 },
    };

    const result = applyMatrixAdjustments(rawScores, matrixData);

    expect(result.virality).toBe(1.04); // 0.8 * 1.3
    expect(result.moat).toBe(0.42); // 0.6 * 0.7
    expect(result.market_size).toBe(0.5); // 0.5 * 1.0
  });

  test('clamps extreme multipliers to bounds', () => {
    const rawScores = { virality: 0.5 };
    const matrixData = {
      adjusted_weights: { virality: 5.0 }, // Should be clamped to 2.0
    };

    const result = applyMatrixAdjustments(rawScores, matrixData);
    expect(result.virality).toBe(1.0); // 0.5 * 2.0 (clamped)
  });

  test('uses 1.0 multiplier for components not in matrix', () => {
    const rawScores = { virality: 0.8, unknown_component: 0.6 };
    const matrixData = {
      adjusted_weights: { virality: 1.2 },
    };

    const result = applyMatrixAdjustments(rawScores, matrixData);
    expect(result.virality).toBe(0.96); // 0.8 * 1.2
    expect(result.unknown_component).toBe(0.6); // 0.6 * 1.0 (default)
  });

  test('returns copy of raw scores when no matrix data', () => {
    const rawScores = { virality: 0.8 };

    const result = applyMatrixAdjustments(rawScores, null);
    expect(result).toEqual({ virality: 0.8 });
  });

  test('returns empty object when no raw scores', () => {
    const result = applyMatrixAdjustments(null, { adjusted_weights: {} });
    expect(result).toEqual({});
  });
});

describe('getCompatibilityReport', () => {
  test('returns ranked profiles for archetype', async () => {
    const interactions = [
      { profile_id: 'p1', compatibility_score: 0.85, execution_guidance: ['tip1'] },
      { profile_id: 'p2', compatibility_score: 0.70, execution_guidance: ['tip2'] },
      { profile_id: 'p3', compatibility_score: 0.55, execution_guidance: ['tip3'] },
    ];
    const profiles = [
      { id: 'p1', name: 'aggressive_growth' },
      { id: 'p2', name: 'balanced' },
      { id: 'p3', name: 'capital_efficient' },
    ];

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: interactions, error: null }),
      in: vi.fn().mockResolvedValue({ data: profiles, error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getCompatibilityReport({ supabase }, 'democratizer');

    expect(result).toHaveLength(3);
    expect(result[0].profile_name).toBe('aggressive_growth');
    expect(result[0].compatibility_score).toBe(0.85);
    expect(result[1].profile_name).toBe('balanced');
    expect(result[2].profile_name).toBe('capital_efficient');
  });

  test('returns empty array when no data', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    const result = await getCompatibilityReport({ supabase }, 'automator');
    expect(result).toEqual([]);
  });

  test('returns empty array when no supabase', async () => {
    const result = await getCompatibilityReport({ supabase: null }, 'automator');
    expect(result).toEqual([]);
  });

  test('throws on database error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'db fail' } }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await expect(
      getCompatibilityReport({ supabase }, 'automator')
    ).rejects.toThrow('Failed to fetch compatibility report: db fail');
  });
});
