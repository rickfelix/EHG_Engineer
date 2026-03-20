/**
 * Tests for lib/eva/exit/separation-rehearsal.js
 *
 * Covers: rehearseSeparation, getDefaultDimensionWeights, DIMENSIONS, PASS_THRESHOLD
 * Focus: Rule-based scoring across 5 dimensions, Supabase query mocking,
 *        dry_run vs full mode, graceful degradation on missing data
 */

import { describe, it, expect, vi } from 'vitest';
import {
  rehearseSeparation,
  getDefaultDimensionWeights,
  DIMENSIONS,
  PASS_THRESHOLD,
} from '../../../../lib/eva/exit/separation-rehearsal.js';

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

function createMockSupabase(overrides = {}) {
  const defaultData = {
    assets: overrides.assets || [],
    scores: overrides.scores || [],
    profiles: overrides.profiles || { data: null, error: null },
  };

  // Build chainable mock for a given table
  function buildChain(table) {
    if (table === 'venture_asset_registry') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: defaultData.assets,
            error: overrides.assetError || null,
          }),
        }),
      };
    }

    if (table === 'venture_separability_scores') {
      const singleResult =
        defaultData.scores.length > 0
          ? { data: defaultData.scores[0], error: null }
          : { data: null, error: { message: 'No rows found' } };

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                  overrides.scoresError
                    ? { data: null, error: overrides.scoresError }
                    : singleResult,
                ),
              }),
            }),
          }),
        }),
      };
    }

    if (table === 'venture_exit_profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue(
                overrides.profileError
                  ? { data: null, error: overrides.profileError }
                  : defaultData.profiles,
              ),
            }),
          }),
        }),
      };
    }

    // Fallback for unknown tables
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
  }

  return {
    from: vi.fn((table) => buildChain(table)),
  };
}

// ---------------------------------------------------------------------------
// Test data fixtures
// ---------------------------------------------------------------------------

const VENTURE_ID = 'v-test-001';

function makeAsset(overrides = {}) {
  return {
    id: overrides.id || 'asset-1',
    asset_name: overrides.asset_name || 'Test Asset',
    asset_type: overrides.asset_type || 'software',
    estimated_value: overrides.estimated_value ?? 10000,
    description: overrides.description || '',
    metadata: overrides.metadata || {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('separation-rehearsal', () => {
  // =========================================================================
  // Exported constants
  // =========================================================================

  describe('exported constants', () => {
    it('DIMENSIONS has exactly 5 dimensions', () => {
      expect(DIMENSIONS).toHaveLength(5);
      expect(DIMENSIONS).toEqual([
        'technical',
        'data',
        'operational',
        'financial',
        'legal',
      ]);
    });

    it('PASS_THRESHOLD is 70', () => {
      expect(PASS_THRESHOLD).toBe(70);
    });
  });

  // =========================================================================
  // getDefaultDimensionWeights
  // =========================================================================

  describe('getDefaultDimensionWeights', () => {
    it('returns weights for all 5 dimensions', () => {
      const weights = getDefaultDimensionWeights();
      expect(Object.keys(weights)).toHaveLength(5);
      for (const dim of DIMENSIONS) {
        expect(weights).toHaveProperty(dim);
        expect(typeof weights[dim]).toBe('number');
      }
    });

    it('weights sum to 1.0', () => {
      const weights = getDefaultDimensionWeights();
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('returns correct individual weights', () => {
      const weights = getDefaultDimensionWeights();
      expect(weights.technical).toBe(0.25);
      expect(weights.data).toBe(0.25);
      expect(weights.operational).toBe(0.20);
      expect(weights.financial).toBe(0.15);
      expect(weights.legal).toBe(0.15);
    });
  });

  // =========================================================================
  // rehearseSeparation - input validation
  // =========================================================================

  describe('rehearseSeparation - input validation', () => {
    it('returns error result when ventureId is missing', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(null, 'dry_run', supabase);

      expect(result.overall_separable).toBe(false);
      expect(result.overall_score).toBe(0);
      expect(result.warnings).toContain('ventureId is required');
      expect(result.dimension_results).toEqual([]);
    });

    it('returns error result when supabase client is missing', async () => {
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', null);

      expect(result.overall_separable).toBe(false);
      expect(result.overall_score).toBe(0);
      expect(result.warnings).toContain('supabase client is required');
    });
  });

  // =========================================================================
  // rehearseSeparation - dry_run mode
  // =========================================================================

  describe('rehearseSeparation - dry_run mode', () => {
    it('returns mode as dry_run', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.mode).toBe('dry_run');
    });

    it('defaults to dry_run when mode is not specified', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, undefined, supabase);

      expect(result.mode).toBe('dry_run');
    });

    it('returns dimension results with scores for all 5 dimensions', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.dimension_results).toHaveLength(5);
      const dimNames = result.dimension_results.map((d) => d.dimension);
      expect(dimNames).toEqual(DIMENSIONS);
    });

    it('each dimension score is between 0 and 100', async () => {
      // Provide assets that will cause score deductions
      const assets = [];
      for (let i = 0; i < 10; i++) {
        assets.push(
          makeAsset({
            id: `asset-${i}`,
            asset_type: 'software',
            metadata: { shared: true },
          }),
        );
      }
      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      for (const dim of result.dimension_results) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }
    });

    it('does not write to the database in dry_run mode', async () => {
      const supabase = createMockSupabase();
      await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      // from() should only be called for read operations (the 3 data sources)
      const calledTables = supabase.from.mock.calls.map((c) => c[0]);
      expect(calledTables).not.toContain('venture_exit_profiles_update');
      // Verify only query tables were accessed
      for (const t of calledTables) {
        expect([
          'venture_asset_registry',
          'venture_separability_scores',
          'venture_exit_profiles',
        ]).toContain(t);
      }
    });

    it('computes correct overall score with no assets (high scores)', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      // With no assets: technical=100, data=100, operational=100, financial=80, legal=100
      // financial gets -20 for no financial assets
      // Weighted: 100*0.25 + 100*0.25 + 100*0.20 + 80*0.15 + 100*0.15 = 25+25+20+12+15 = 97
      expect(result.overall_score).toBe(97);
      expect(result.overall_separable).toBe(true);
    });
  });

  // =========================================================================
  // rehearseSeparation - full mode
  // =========================================================================

  describe('rehearseSeparation - full mode', () => {
    it('returns mode as full', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'full', supabase);

      expect(result.mode).toBe('full');
    });

    it('passes when overall score >= PASS_THRESHOLD (70)', async () => {
      // No assets = high score (97)
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'full', supabase);

      expect(result.overall_score).toBeGreaterThanOrEqual(PASS_THRESHOLD);
      expect(result.overall_separable).toBe(true);
    });

    it('fails when overall score < PASS_THRESHOLD (70)', async () => {
      // Create many shared assets across all types to drive scores down
      const assets = [];
      // 10 shared tech assets
      for (let i = 0; i < 10; i++) {
        assets.push(
          makeAsset({
            id: `tech-${i}`,
            asset_type: 'software',
            metadata: { shared: true, shared_dependency: true },
          }),
        );
      }
      // 5 shared data assets
      for (let i = 0; i < 5; i++) {
        assets.push(
          makeAsset({
            id: `data-${i}`,
            asset_type: 'data',
            metadata: { shared_source: true },
          }),
        );
      }
      // 5 partnerships
      for (let i = 0; i < 5; i++) {
        assets.push(
          makeAsset({
            id: `partner-${i}`,
            asset_type: 'partnership',
          }),
        );
      }
      // 3 shared financial assets
      for (let i = 0; i < 3; i++) {
        assets.push(
          makeAsset({
            id: `fin-${i}`,
            asset_type: 'financial',
            metadata: { shared: true },
            estimated_value: 0,
          }),
        );
      }
      // 4 restrictive licenses
      for (let i = 0; i < 4; i++) {
        assets.push(
          makeAsset({
            id: `lic-${i}`,
            asset_type: 'license',
            description: 'Exclusive non-transferable license',
            metadata: { restrictive: true },
          }),
        );
      }

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'full', supabase);

      expect(result.overall_score).toBeLessThan(PASS_THRESHOLD);
      expect(result.overall_separable).toBe(false);
    });

    it('returns passed=true/false based on threshold comparison', async () => {
      // Create a scenario that should result in a score right around the threshold
      // Use moderate assets that lower scores but not catastrophically
      const assets = [
        // 6 tech assets (just over threshold for tech deduction)
        ...Array.from({ length: 6 }, (_, i) =>
          makeAsset({ id: `tech-${i}`, asset_type: 'infrastructure' }),
        ),
        // 1 shared data asset
        makeAsset({
          id: 'data-shared',
          asset_type: 'data',
          metadata: { shared_source: true },
        }),
        // 3 partnerships
        ...Array.from({ length: 3 }, (_, i) =>
          makeAsset({ id: `partner-${i}`, asset_type: 'partnership' }),
        ),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'full', supabase);

      expect(typeof result.overall_separable).toBe('boolean');
      if (result.overall_score >= PASS_THRESHOLD) {
        expect(result.overall_separable).toBe(true);
      } else {
        expect(result.overall_separable).toBe(false);
      }
    });
  });

  // =========================================================================
  // Missing Phase 2 data - graceful degradation
  // =========================================================================

  describe('missing Phase 2 data', () => {
    it('adds warning when venture_separability_scores returns error', async () => {
      const supabase = createMockSupabase({
        scoresError: { message: 'relation does not exist' },
      });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.warnings).toContain(
        'Phase 2 separability scores unavailable -- using asset-based analysis only',
      );
      // Should still produce valid dimension results
      expect(result.dimension_results).toHaveLength(5);
    });

    it('adds warning when venture_separability_scores has no rows', async () => {
      // scores array empty => single() returns error
      const supabase = createMockSupabase({ scores: [] });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.warnings).toContain(
        'Phase 2 separability scores unavailable -- using asset-based analysis only',
      );
    });

    it('still computes valid scores without Phase 2 data', async () => {
      const assets = [
        makeAsset({ id: 'a1', asset_type: 'software' }),
        makeAsset({ id: 'a2', asset_type: 'data' }),
      ];
      const supabase = createMockSupabase({ assets, scores: [] });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.overall_score).toBeGreaterThan(0);
      expect(result.dimension_results).toHaveLength(5);
      for (const dim of result.dimension_results) {
        expect(dim.score).toBeGreaterThanOrEqual(0);
        expect(dim.score).toBeLessThanOrEqual(100);
      }
    });
  });

  // =========================================================================
  // Missing asset data - graceful degradation
  // =========================================================================

  describe('missing asset data', () => {
    it('handles empty venture_asset_registry gracefully', async () => {
      const supabase = createMockSupabase({ assets: [] });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.dimension_results).toHaveLength(5);
      expect(result.overall_score).toBeGreaterThan(0);
      // No shared resources when no assets
      expect(result.shared_resources).toEqual([]);
    });

    it('populates warnings when asset query fails', async () => {
      const supabase = createMockSupabase({
        assetError: { message: 'permission denied' },
      });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const assetWarning = result.warnings.find((w) =>
        w.includes('venture_asset_registry'),
      );
      expect(assetWarning).toBeDefined();
    });

    it('populates warnings when exit profile query fails', async () => {
      const supabase = createMockSupabase({
        profileError: { message: 'table not found' },
      });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const profileWarning = result.warnings.find((w) =>
        w.includes('venture_exit_profiles'),
      );
      expect(profileWarning).toBeDefined();
    });
  });

  // =========================================================================
  // Overall score computation
  // =========================================================================

  describe('overall score computation', () => {
    it('weighted score matches manual calculation with known assets', async () => {
      // 3 tech assets (no deduction), 1 shared data, no ops, no financial, no legal
      const assets = [
        makeAsset({ id: 't1', asset_type: 'software' }),
        makeAsset({ id: 't2', asset_type: 'infrastructure' }),
        makeAsset({ id: 't3', asset_type: 'domain' }),
        makeAsset({
          id: 'd1',
          asset_type: 'data',
          metadata: { shared_source: true },
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const _weights = getDefaultDimensionWeights();

      // Manual calculation:
      // technical: 3 tech assets (<=5), no shared deps => 100. Has assets, no shared => +recommendation.
      // data: 1 shared data asset => 100 - 15 = 85
      // operational: no ops assets => 100
      // financial: no financial assets => 100 - 20 = 80
      // legal: no legal assets => 100
      // Weighted: 100*0.25 + 85*0.25 + 100*0.20 + 80*0.15 + 100*0.15
      //         = 25 + 21.25 + 20 + 12 + 15 = 93.25
      expect(result.overall_score).toBe(93.25);
    });

    it('shared resources are correctly detected', async () => {
      const assets = [
        makeAsset({
          id: 'shared-1',
          asset_name: 'Shared DB',
          asset_type: 'infrastructure',
          metadata: { shared: true },
        }),
        makeAsset({
          id: 'shared-2',
          asset_name: 'Shared API',
          asset_type: 'software',
          metadata: { shared_dependency: true },
        }),
        makeAsset({
          id: 'normal-1',
          asset_name: 'Normal Service',
          asset_type: 'software',
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.shared_resources).toHaveLength(2);
      expect(result.shared_resources.map((r) => r.id)).toEqual(
        expect.arrayContaining(['shared-1', 'shared-2']),
      );
    });

    it('critical dependencies include partnerships', async () => {
      const assets = [
        makeAsset({
          id: 'p1',
          asset_name: 'Partner Alpha',
          asset_type: 'partnership',
        }),
        makeAsset({
          id: 'crit-1',
          asset_name: 'Critical System',
          asset_type: 'software',
          metadata: { critical: true },
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result.critical_dependencies.length).toBeGreaterThanOrEqual(2);
      const depNames = result.critical_dependencies.map((d) => d.name);
      expect(depNames).toContain('Partner Alpha');
      expect(depNames).toContain('Critical System');
    });

    it('strategic acquisition exit type adds a critical dependency', async () => {
      const profile = {
        data: {
          id: 'prof-1',
          notes: 'Strategic exit',
          target_buyer_type: 'strategic',
          exit_type: 'strategic_acquisition',
          target_timeline: '2027-Q2',
        },
        error: null,
      };

      const supabase = createMockSupabase({ profiles: profile });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const stratDep = result.critical_dependencies.find(
        (d) => d.type === 'engine_exit_strategy',
      );
      expect(stratDep).toBeDefined();
      expect(stratDep.name).toBe('Strategic Acquisition Alignment');
    });
  });

  // =========================================================================
  // Dimension-specific scoring edge cases
  // =========================================================================

  describe('dimension scoring edge cases', () => {
    it('technical score caps deduction at 40 for many tech assets', async () => {
      // 15 tech assets: deduction = min(40, (15-5)*8) = min(40, 80) = 40
      const assets = Array.from({ length: 15 }, (_, i) =>
        makeAsset({ id: `tech-${i}`, asset_type: 'software' }),
      );

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const techResult = result.dimension_results.find(
        (d) => d.dimension === 'technical',
      );
      // 100 - 40 = 60 (no shared deps in these assets)
      expect(techResult.score).toBe(60);
    });

    it('data score handles shared source assets', async () => {
      // 2 shared data assets: deduction = min(50, 2*15) = 30
      const assets = [
        makeAsset({
          id: 'd1',
          asset_type: 'data',
          metadata: { shared_source: true },
        }),
        makeAsset({
          id: 'd2',
          asset_type: 'dataset',
          metadata: { provenance: 'shared' },
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const dataResult = result.dimension_results.find(
        (d) => d.dimension === 'data',
      );
      expect(dataResult.score).toBe(70); // 100 - 30
      expect(dataResult.blockers.length).toBeGreaterThan(0);
    });

    it('operational score gets +5 bonus when exit profile has target_buyer_type', async () => {
      const profile = {
        data: {
          id: 'prof-1',
          notes: '',
          target_buyer_type: 'financial',
          exit_type: 'acquisition',
          target_timeline: '2027-Q4',
        },
        error: null,
      };

      const supabase = createMockSupabase({ profiles: profile });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const opsResult = result.dimension_results.find(
        (d) => d.dimension === 'operational',
      );
      // No ops assets, but profile bonus: min(100, 100+5) = 100
      expect(opsResult.score).toBe(100);
      expect(opsResult.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringContaining('financial'),
        ]),
      );
    });

    it('financial score penalizes single revenue stream', async () => {
      const assets = [
        makeAsset({
          id: 'rev-1',
          asset_type: 'revenue_stream',
          estimated_value: 50000,
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const finResult = result.dimension_results.find(
        (d) => d.dimension === 'financial',
      );
      // 100 - 15 (single revenue stream) = 85
      expect(finResult.score).toBe(85);
      expect(finResult.blockers).toContain(
        'Single revenue stream creates financial dependency risk',
      );
    });

    it('legal score penalizes restrictive licenses', async () => {
      const assets = [
        makeAsset({
          id: 'lic-1',
          asset_type: 'license',
          metadata: { restrictive: true },
        }),
        makeAsset({
          id: 'lic-2',
          asset_type: 'license',
          description: 'An exclusive arrangement',
        }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const legalResult = result.dimension_results.find(
        (d) => d.dimension === 'legal',
      );
      // 2 restrictive licenses: deduction = min(40, 2*15) = 30
      // 100 - 30 = 70
      expect(legalResult.score).toBe(70);
      expect(legalResult.blockers.length).toBeGreaterThan(0);
    });

    it('legal score gives +5 bonus for patents/trademarks', async () => {
      const assets = [
        makeAsset({ id: 'pat-1', asset_type: 'patent' }),
        makeAsset({ id: 'tm-1', asset_type: 'trademark' }),
      ];

      const supabase = createMockSupabase({ assets });
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      const legalResult = result.dimension_results.find(
        (d) => d.dimension === 'legal',
      );
      // No deductions, patents bonus: min(100, 100+5) = 100
      expect(legalResult.score).toBe(100);
    });
  });

  // =========================================================================
  // Result structure validation
  // =========================================================================

  describe('result structure', () => {
    it('contains all expected top-level fields', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(result).toHaveProperty('mode');
      expect(result).toHaveProperty('overall_separable');
      expect(result).toHaveProperty('overall_score');
      expect(result).toHaveProperty('dimension_results');
      expect(result).toHaveProperty('shared_resources');
      expect(result).toHaveProperty('critical_dependencies');
      expect(result).toHaveProperty('warnings');
    });

    it('dimension results each have score, blockers, and recommendations', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      for (const dim of result.dimension_results) {
        expect(dim).toHaveProperty('dimension');
        expect(dim).toHaveProperty('score');
        expect(dim).toHaveProperty('blockers');
        expect(dim).toHaveProperty('recommendations');
        expect(Array.isArray(dim.blockers)).toBe(true);
        expect(Array.isArray(dim.recommendations)).toBe(true);
      }
    });

    it('warnings is always an array', async () => {
      const supabase = createMockSupabase();
      const result = await rehearseSeparation(VENTURE_ID, 'dry_run', supabase);

      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
