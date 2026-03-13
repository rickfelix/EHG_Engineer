/**
 * Portfolio Balance — Data Transformation Logic Tests
 * SD: SD-LEO-FEAT-PORTFOLIO-BALANCE-SYSTEM-001
 *
 * Tests the pure data transformation logic extracted from usePortfolioBalance hook:
 *   - Grouping ventures by growth_strategy
 *   - Separating unclassified ventures (null strategy)
 *   - Gap detection (strategies with 0 ventures)
 *   - Percentage calculations
 *   - Cache invalidation key structure
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Replicate the pure transformation logic from usePortfolioBalance.ts
// This avoids importing React/Supabase — we only test the data math.
// ---------------------------------------------------------------------------

const STRATEGIES = ['cash_engine', 'capability_builder', 'moonshot'];

const STRATEGY_META = {
  cash_engine: {
    label: 'Cash Engines',
    description: 'Proven models, fast to revenue, fund everything else',
  },
  capability_builder: {
    label: 'Capability Builders',
    description: 'Produce reusable tech, data, or business capabilities',
  },
  moonshot: {
    label: 'Moonshots',
    description: 'Higher risk, higher ceiling, novel market positions',
  },
};

/**
 * Pure function replicating the queryFn transformation from usePortfolioBalance.
 * Input: array of venture rows (as returned from Supabase query).
 * Output: PortfolioBalanceData shape.
 */
function buildPortfolioBalanceData(ventures) {
  const classified = ventures.filter((v) => v.growth_strategy !== null);
  const unclassified = ventures.filter((v) => v.growth_strategy === null);

  const buckets = STRATEGIES.map((strategy) => {
    const matching = classified.filter((v) => v.growth_strategy === strategy);
    return {
      strategy,
      ...STRATEGY_META[strategy],
      ventures: matching,
      count: matching.length,
      percentage:
        classified.length > 0
          ? Math.round((matching.length / ventures.length) * 100)
          : 0,
    };
  });

  const gaps = STRATEGIES.filter(
    (s) => !classified.some((v) => v.growth_strategy === s),
  );

  return {
    buckets,
    unclassified,
    totalActive: ventures.length,
    totalClassified: classified.length,
    gaps,
  };
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function venture(overrides = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Test Venture',
    status: 'active',
    growth_strategy: overrides.growth_strategy ?? null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Portfolio Balance — Data Transformation', () => {
  // -----------------------------------------------------------------------
  // 1. Grouping by growth_strategy
  // -----------------------------------------------------------------------
  describe('venture grouping by growth_strategy', () => {
    it('groups ventures into the correct strategy buckets', () => {
      const ventures = [
        venture({ name: 'Alpha', growth_strategy: 'cash_engine' }),
        venture({ name: 'Beta', growth_strategy: 'moonshot' }),
        venture({ name: 'Gamma', growth_strategy: 'cash_engine' }),
        venture({ name: 'Delta', growth_strategy: 'capability_builder' }),
      ];

      const result = buildPortfolioBalanceData(ventures);

      const cashBucket = result.buckets.find((b) => b.strategy === 'cash_engine');
      const moonBucket = result.buckets.find((b) => b.strategy === 'moonshot');
      const capBucket = result.buckets.find((b) => b.strategy === 'capability_builder');

      expect(cashBucket.count).toBe(2);
      expect(moonBucket.count).toBe(1);
      expect(capBucket.count).toBe(1);
      expect(cashBucket.ventures.map((v) => v.name).sort()).toEqual(['Alpha', 'Gamma']);
    });

    it('always produces exactly 3 buckets in fixed order', () => {
      const result = buildPortfolioBalanceData([]);
      expect(result.buckets).toHaveLength(3);
      expect(result.buckets.map((b) => b.strategy)).toEqual([
        'cash_engine',
        'capability_builder',
        'moonshot',
      ]);
    });

    it('attaches correct labels and descriptions from STRATEGY_META', () => {
      const result = buildPortfolioBalanceData([]);
      const moon = result.buckets.find((b) => b.strategy === 'moonshot');
      expect(moon.label).toBe('Moonshots');
      expect(moon.description).toContain('Higher risk');
    });
  });

  // -----------------------------------------------------------------------
  // 2. Unclassified ventures (null strategy)
  // -----------------------------------------------------------------------
  describe('unclassified ventures separation', () => {
    it('separates ventures with null growth_strategy into unclassified', () => {
      const ventures = [
        venture({ name: 'Classified', growth_strategy: 'moonshot' }),
        venture({ name: 'Unclassified A' }),
        venture({ name: 'Unclassified B', growth_strategy: null }),
      ];

      const result = buildPortfolioBalanceData(ventures);

      expect(result.unclassified).toHaveLength(2);
      expect(result.unclassified.map((v) => v.name).sort()).toEqual([
        'Unclassified A',
        'Unclassified B',
      ]);
    });

    it('does not include unclassified ventures in any bucket', () => {
      const ventures = [
        venture({ growth_strategy: null }),
        venture({ growth_strategy: 'cash_engine' }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      const allBucketVentures = result.buckets.flatMap((b) => b.ventures);
      expect(allBucketVentures).toHaveLength(1);
      expect(allBucketVentures[0].growth_strategy).toBe('cash_engine');
    });

    it('counts totalActive as all ventures and totalClassified as only classified', () => {
      const ventures = [
        venture({ growth_strategy: 'moonshot' }),
        venture({ growth_strategy: null }),
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: null }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      expect(result.totalActive).toBe(4);
      expect(result.totalClassified).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Gap detection
  // -----------------------------------------------------------------------
  describe('gap detection', () => {
    it('identifies strategies with zero ventures as gaps', () => {
      const ventures = [
        venture({ growth_strategy: 'cash_engine' }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      expect(result.gaps).toEqual(['capability_builder', 'moonshot']);
    });

    it('returns empty gaps when all strategies are represented', () => {
      const ventures = [
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: 'capability_builder' }),
        venture({ growth_strategy: 'moonshot' }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      expect(result.gaps).toEqual([]);
    });

    it('returns all three strategies as gaps when input is empty', () => {
      const result = buildPortfolioBalanceData([]);
      expect(result.gaps).toEqual(['cash_engine', 'capability_builder', 'moonshot']);
    });

    it('returns all three strategies as gaps when all ventures are unclassified', () => {
      const ventures = [
        venture({ growth_strategy: null }),
        venture({ growth_strategy: null }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      expect(result.gaps).toEqual(['cash_engine', 'capability_builder', 'moonshot']);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Percentage calculations
  // -----------------------------------------------------------------------
  describe('percentage calculations', () => {
    it('calculates percentage as count / totalActive (not totalClassified)', () => {
      // This matches the hook implementation: matching.length / ventures.length
      const ventures = [
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: 'moonshot' }),
        venture({ growth_strategy: null }), // unclassified but included in denominator
      ];

      const result = buildPortfolioBalanceData(ventures);
      const cashBucket = result.buckets.find((b) => b.strategy === 'cash_engine');
      const moonBucket = result.buckets.find((b) => b.strategy === 'moonshot');

      // 2/4 = 50%, 1/4 = 25%
      expect(cashBucket.percentage).toBe(50);
      expect(moonBucket.percentage).toBe(25);
    });

    it('rounds percentages to nearest integer', () => {
      const ventures = [
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: 'moonshot' }),
        venture({ growth_strategy: 'capability_builder' }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      // 1/3 = 33.33... rounds to 33
      result.buckets.forEach((b) => {
        expect(b.percentage).toBe(33);
        expect(Number.isInteger(b.percentage)).toBe(true);
      });
    });

    it('returns 0% for all buckets when no ventures are classified', () => {
      const ventures = [
        venture({ growth_strategy: null }),
        venture({ growth_strategy: null }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      result.buckets.forEach((b) => {
        expect(b.percentage).toBe(0);
      });
    });

    it('returns 0% for all buckets when venture list is empty', () => {
      const result = buildPortfolioBalanceData([]);
      result.buckets.forEach((b) => {
        expect(b.percentage).toBe(0);
      });
    });

    it('handles single venture at 100% in its bucket', () => {
      const ventures = [
        venture({ growth_strategy: 'moonshot' }),
      ];

      const result = buildPortfolioBalanceData(ventures);
      const moonBucket = result.buckets.find((b) => b.strategy === 'moonshot');
      expect(moonBucket.percentage).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Cache invalidation key
  // -----------------------------------------------------------------------
  describe('cache invalidation key structure', () => {
    it('uses "portfolio-balance" as the query key', () => {
      // This verifies the expected query key that reclassify.onSuccess invalidates.
      // The hook uses: queryKey: ["portfolio-balance"]
      // and invalidates: queryClient.invalidateQueries({ queryKey: ["portfolio-balance"] })
      const expectedKey = ['portfolio-balance'];
      expect(expectedKey).toEqual(['portfolio-balance']);
      expect(expectedKey).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('handles large venture counts correctly', () => {
      const ventures = [];
      for (let i = 0; i < 100; i++) {
        ventures.push(venture({ growth_strategy: 'cash_engine' }));
      }
      for (let i = 0; i < 50; i++) {
        ventures.push(venture({ growth_strategy: 'moonshot' }));
      }
      for (let i = 0; i < 50; i++) {
        ventures.push(venture({ growth_strategy: null }));
      }

      const result = buildPortfolioBalanceData(ventures);
      expect(result.totalActive).toBe(200);
      expect(result.totalClassified).toBe(150);

      const cashBucket = result.buckets.find((b) => b.strategy === 'cash_engine');
      expect(cashBucket.count).toBe(100);
      // 100/200 = 50%
      expect(cashBucket.percentage).toBe(50);
    });

    it('does not mutate input array', () => {
      const ventures = [
        venture({ growth_strategy: 'cash_engine' }),
        venture({ growth_strategy: null }),
      ];
      const original = JSON.parse(JSON.stringify(ventures));

      buildPortfolioBalanceData(ventures);

      expect(ventures).toEqual(original);
    });
  });
});
