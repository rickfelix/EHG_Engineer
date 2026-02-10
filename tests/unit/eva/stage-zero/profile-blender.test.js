/**
 * Profile Blending Engine Tests
 *
 * Tests for vector validation, normalization, blending,
 * hashing, preset resolution, and persistence.
 *
 * Part of SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-K
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateWeightVector,
  normalizeVector,
  blendProfiles,
  blendByPresetIds,
  resolvePresetToVector,
  computeVectorHash,
  vectorsEqual,
  saveBlendAsPreset,
  getProfile,
  updateProfile,
  PRECISION,
  TOLERANCE,
} from '../../../../lib/eva/stage-zero/profile-blender.js';
import { VALID_COMPONENTS } from '../../../../lib/eva/stage-zero/profile-service.js';

// --- Test fixtures ---

const BALANCED_WEIGHTS = {
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

const AGGRESSIVE_WEIGHTS = {
  cross_reference: 0.05,
  portfolio_evaluation: 0.05,
  problem_reframing: 0.05,
  moat_architecture: 0.20,
  chairman_constraints: 0.10,
  time_horizon: 0.05,
  archetypes: 0.05,
  build_cost: 0.10,
  virality: 0.35,
};

// --- Tests ---

describe('profile-blender', () => {
  describe('validateWeightVector', () => {
    it('accepts valid weight vector', () => {
      const result = validateWeightVector(BALANCED_WEIGHTS);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null input', () => {
      const result = validateWeightVector(null);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('non-null');
    });

    it('rejects negative weights', () => {
      const result = validateWeightVector({
        ...BALANCED_WEIGHTS,
        virality: -0.1,
        moat_architecture: -0.05,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Negative'))).toBe(true);
      expect(result.errors.some(e => e.includes('virality'))).toBe(true);
    });

    it('rejects all-zero weights', () => {
      const zeros = {};
      for (const comp of VALID_COMPONENTS) zeros[comp] = 0;
      const result = validateWeightVector(zeros);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('> 0'))).toBe(true);
    });

    it('rejects unknown dimensions', () => {
      const result = validateWeightVector({
        ...BALANCED_WEIGHTS,
        unknown_dim: 0.5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Unknown'))).toBe(true);
    });

    it('rejects non-number values', () => {
      const result = validateWeightVector({
        ...BALANCED_WEIGHTS,
        virality: 'high',
      });
      expect(result.valid).toBe(false);
    });

    it('accepts partial vector (missing components)', () => {
      const result = validateWeightVector({ virality: 0.5, moat_architecture: 0.5 });
      expect(result.valid).toBe(true);
    });
  });

  describe('normalizeVector', () => {
    it('normalizes to sum 1.0', () => {
      const result = normalizeVector(BALANCED_WEIGHTS);
      const sum = Object.values(result).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
    });

    it('preserves relative proportions', () => {
      const input = { virality: 3, moat_architecture: 2, build_cost: 1 };
      const result = normalizeVector(input);
      // virality should be ~0.5, moat ~0.333, build ~0.167
      expect(result.virality).toBeCloseTo(0.5, 3);
      expect(result.moat_architecture).toBeCloseTo(0.333333, 3);
    });

    it('returns sorted keys', () => {
      const result = normalizeVector(BALANCED_WEIGHTS);
      const keys = Object.keys(result);
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });

    it('includes all VALID_COMPONENTS', () => {
      const result = normalizeVector({ virality: 1 });
      expect(Object.keys(result)).toHaveLength(VALID_COMPONENTS.length);
      for (const comp of VALID_COMPONENTS) {
        expect(result).toHaveProperty(comp);
      }
    });

    it('fills missing components with 0', () => {
      const result = normalizeVector({ virality: 1 });
      expect(result.virality).toBe(1);
      expect(result.cross_reference).toBe(0);
    });

    it('rounds to 6 decimal places', () => {
      const result = normalizeVector({ virality: 1, moat_architecture: 2 });
      for (const val of Object.values(result)) {
        const decimals = val.toString().split('.')[1]?.length ?? 0;
        expect(decimals).toBeLessThanOrEqual(PRECISION);
      }
    });

    it('throws on invalid input', () => {
      expect(() => normalizeVector({ virality: -1 })).toThrow('Invalid weight vector');
    });

    it('throws on all-zero input', () => {
      const zeros = {};
      for (const comp of VALID_COMPONENTS) zeros[comp] = 0;
      expect(() => normalizeVector(zeros)).toThrow();
    });

    it('already-normalized vector unchanged', () => {
      const result = normalizeVector(BALANCED_WEIGHTS);
      const result2 = normalizeVector(result);
      expect(result).toEqual(result2);
    });
  });

  describe('blendProfiles', () => {
    it('ratio=1.0 returns profile A', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 1.0);
      const normalA = normalizeVector(BALANCED_WEIGHTS);
      expect(vectorsEqual(result, normalA)).toBe(true);
    });

    it('ratio=0.0 returns profile B', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 0.0);
      const normalB = normalizeVector(AGGRESSIVE_WEIGHTS);
      expect(vectorsEqual(result, normalB)).toBe(true);
    });

    it('ratio=0.5 returns midpoint', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 0.5);
      // Virality: (0.5*0.15 + 0.5*0.35) = 0.25 → after normalization should be 0.25
      // Both sum to 1.0, so blend also sums to 1.0
      const sum = Object.values(result).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
      // Virality should be between the two values
      expect(result.virality).toBeGreaterThan(normalizeVector(BALANCED_WEIGHTS).virality);
      expect(result.virality).toBeLessThan(normalizeVector(AGGRESSIVE_WEIGHTS).virality);
    });

    it('result is normalized', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 0.7);
      const sum = Object.values(result).reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
    });

    it('result has sorted keys', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 0.5);
      const keys = Object.keys(result);
      expect(keys).toEqual([...keys].sort());
    });

    it('throws on invalid ratio', () => {
      expect(() => blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, -0.1)).toThrow('ratio');
      expect(() => blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 1.1)).toThrow('ratio');
      expect(() => blendProfiles(BALANCED_WEIGHTS, AGGRESSIVE_WEIGHTS, 'half')).toThrow('ratio');
    });

    it('throws on invalid profile A', () => {
      expect(() => blendProfiles({ virality: -1 }, AGGRESSIVE_WEIGHTS, 0.5)).toThrow('Profile A');
    });

    it('throws on invalid profile B', () => {
      expect(() => blendProfiles(BALANCED_WEIGHTS, null, 0.5)).toThrow('Profile B');
    });

    it('blending identical profiles returns same profile', () => {
      const result = blendProfiles(BALANCED_WEIGHTS, BALANCED_WEIGHTS, 0.5);
      const normalB = normalizeVector(BALANCED_WEIGHTS);
      expect(vectorsEqual(result, normalB)).toBe(true);
    });
  });

  describe('computeVectorHash', () => {
    it('returns 64-char hex string', () => {
      const hash = computeVectorHash(normalizeVector(BALANCED_WEIGHTS));
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('same vector produces same hash', () => {
      const v = normalizeVector(BALANCED_WEIGHTS);
      expect(computeVectorHash(v)).toBe(computeVectorHash(v));
    });

    it('different vectors produce different hashes', () => {
      const hashA = computeVectorHash(normalizeVector(BALANCED_WEIGHTS));
      const hashB = computeVectorHash(normalizeVector(AGGRESSIVE_WEIGHTS));
      expect(hashA).not.toBe(hashB);
    });

    it('key order does not affect hash (canonical ordering)', () => {
      const v1 = { archetypes: 0.1, build_cost: 0.1, virality: 0.8 };
      const v2 = { virality: 0.8, archetypes: 0.1, build_cost: 0.1 };
      expect(computeVectorHash(v1)).toBe(computeVectorHash(v2));
    });
  });

  describe('vectorsEqual', () => {
    it('identical vectors are equal', () => {
      const v = normalizeVector(BALANCED_WEIGHTS);
      expect(vectorsEqual(v, v)).toBe(true);
    });

    it('different vectors are not equal', () => {
      const vA = normalizeVector(BALANCED_WEIGHTS);
      const vB = normalizeVector(AGGRESSIVE_WEIGHTS);
      expect(vectorsEqual(vA, vB)).toBe(false);
    });

    it('vectors within tolerance are equal', () => {
      const v1 = normalizeVector(BALANCED_WEIGHTS);
      const v2 = { ...v1 };
      v2.virality += 0.00005; // Within TOLERANCE
      expect(vectorsEqual(v1, v2)).toBe(true);
    });

    it('vectors beyond tolerance are not equal', () => {
      const v1 = normalizeVector(BALANCED_WEIGHTS);
      const v2 = { ...v1 };
      v2.virality += 0.001; // Beyond TOLERANCE
      expect(vectorsEqual(v1, v2)).toBe(false);
    });
  });

  describe('resolvePresetToVector', () => {
    it('resolves by UUID', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'uuid-1', name: 'balanced', weights: BALANCED_WEIGHTS },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      };

      const result = await resolvePresetToVector({ supabase }, '7037129a-5b29-49d3-917c-f38b324fba5d');
      expect(result).not.toBeNull();
      expect(result.name).toBe('balanced');
      expect(result.weights).toEqual(BALANCED_WEIGHTS);
    });

    it('resolves by name', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'uuid-1', name: 'balanced', weights: BALANCED_WEIGHTS },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
        }),
      };

      const result = await resolvePresetToVector({ supabase }, 'balanced');
      expect(result).not.toBeNull();
      expect(result.name).toBe('balanced');
    });

    it('returns null when not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
        }),
      };
      const logger = { warn: vi.fn() };

      const result = await resolvePresetToVector({ supabase, logger }, 'nonexistent');
      expect(result).toBeNull();
    });

    it('returns null with no supabase', async () => {
      const result = await resolvePresetToVector({}, 'balanced');
      expect(result).toBeNull();
    });
  });

  describe('blendByPresetIds', () => {
    it('blends two presets by ID', async () => {
      const uuidA = '7037129a-5b29-49d3-917c-f38b324fba5d';
      const uuidB = '4c4917f7-974f-4761-89f2-dccb541a796d';
      const profiles = {
        [uuidA]: { id: uuidA, name: 'balanced', weights: BALANCED_WEIGHTS },
        [uuidB]: { id: uuidB, name: 'aggressive', weights: AGGRESSIVE_WEIGHTS },
      };

      // UUID path: .select().eq().single()
      let queryId = null;
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((col, val) => {
              queryId = val;
              return {
                single: vi.fn().mockImplementation(() => {
                  const profile = profiles[queryId];
                  if (profile) return Promise.resolve({ data: profile, error: null });
                  return Promise.resolve({ data: null, error: { message: 'not found' } });
                }),
              };
            }),
          }),
        }),
      };

      const result = await blendByPresetIds({ supabase }, uuidA, uuidB, 0.5);
      expect(result.vector).toBeDefined();
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.source.preset_a.name).toBe('balanced');
      expect(result.source.preset_b.name).toBe('aggressive');
      expect(result.source.ratio).toBe(0.5);
    });

    it('throws when preset A not found', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } }),
                }),
              }),
            }),
          }),
        }),
      };
      const logger = { warn: vi.fn() };

      await expect(blendByPresetIds({ supabase, logger }, 'bad', 'bad2', 0.5))
        .rejects.toThrow('Preset not found');
    });
  });

  describe('saveBlendAsPreset', () => {
    it('saves normalized vector as new preset', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'new-uuid', name: 'my_blend', weights: normalizeVector(BALANCED_WEIGHTS) },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      };

      const result = await saveBlendAsPreset({ supabase }, {
        name: 'my_blend',
        weights: BALANCED_WEIGHTS,
      });

      expect(result.name).toBe('my_blend');
      expect(result.weight_vector_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws without supabase', async () => {
      await expect(saveBlendAsPreset({}, { name: 'x', weights: BALANCED_WEIGHTS }))
        .rejects.toThrow('supabase client is required');
    });

    it('throws without name', async () => {
      await expect(saveBlendAsPreset({ supabase: {} }, { weights: BALANCED_WEIGHTS }))
        .rejects.toThrow('name is required');
    });
  });

  describe('getProfile', () => {
    it('returns profile with hash', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'uuid-1', name: 'balanced', version: 1, description: 'test',
          weights: BALANCED_WEIGHTS, is_active: true, gate_thresholds: {},
          created_at: '2026-01-01', updated_at: '2026-01-01', created_by: 'test',
        },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      };

      const result = await getProfile({ supabase }, 'uuid-1');
      expect(result).not.toBeNull();
      expect(result.weight_vector_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('returns null when not found', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSingle,
            }),
          }),
        }),
      };

      const result = await getProfile({ supabase }, 'bad-uuid');
      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('normalizes weights on update', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'uuid-1', name: 'updated', weights: normalizeVector({ virality: 0.5, moat_architecture: 0.5 }) },
        error: null,
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: mockSingle,
              }),
            }),
          }),
        }),
      };

      const result = await updateProfile({ supabase }, 'uuid-1', {
        weights: { virality: 3, moat_architecture: 2 },
      });
      expect(result.weight_vector_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('throws with no fields to update', async () => {
      await expect(updateProfile({ supabase: {} }, 'uuid-1', {}))
        .rejects.toThrow('No valid fields');
    });
  });
});
