/**
 * Tests for Portfolio Optimizer
 * SD-EVA-FEAT-PORTFOLIO-OPT-001 + SD-MAN-ORCH-EVA-PORTFOLIO-INTELLIGENCE-001-C
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../lib/eva/dependency-manager.js', () => ({
  getDependencyGraph: vi.fn().mockResolvedValue({ dependsOn: [], providesTo: [] }),
}));

import { optimize, MODULE_VERSION } from '../../../lib/eva/portfolio-optimizer.js';
import { ServiceError } from '../../../lib/eva/shared-services.js';
import { getDependencyGraph } from '../../../lib/eva/dependency-manager.js';

// ── Mock Supabase builder ──────────────────────────────────

function createMockDb(config = {}) {
  return {
    from: vi.fn((table) => {
      const chainable = {};

      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn().mockReturnValue(chainable);
      chainable.in = vi.fn().mockReturnValue(chainable);

      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });

      // For select queries that return arrays (ventures query uses .in())
      chainable.then = function (resolve) {
        const key = `${table}:select`;
        return Promise.resolve(config[key] || { data: [], error: null }).then(resolve);
      };

      chainable.insert = vi.fn(() => {
        const insertChain = {
          select: vi.fn().mockReturnValue({
            single: vi.fn(() => Promise.resolve(
              config[`${table}:insert`] || { data: { id: 'evt-1', event_type: 'test', created_at: '2026-02-14T00:00:00Z' }, error: null },
            )),
          }),
        };
        return insertChain;
      });

      return chainable;
    }),
  };
}

function createVenture(overrides = {}) {
  return {
    id: 'v1',
    name: 'Venture Alpha',
    created_at: '2026-01-01T00:00:00Z',
    metadata: {
      scheduling: { deadline_days: 14, time_sensitive: false },
      financials: { revenue_growth: 20, margin_trajectory: 5 },
      resources: { engineering: 3, design: 1, total_allocation: 100 },
    },
    ...overrides,
  };
}

// All 5 signals with equal weight for testing
const EQUAL_WEIGHTS = { urgency: 0.20, roi: 0.20, financial: 0.20, market: 0.20, health: 0.20 };

// ── MODULE_VERSION ──────────────────────────────────

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── optimize ──────────────────────────────────

describe('optimize', () => {
  it('returns empty result for empty ventureIds', async () => {
    const db = createMockDb();
    const result = await optimize(db, []);

    expect(result.ventureCount).toBe(0);
    expect(result.rankings).toEqual([]);
    expect(result.resolutions).toEqual([]);
    expect(result.contention.hasContention).toBe(false);
    expect(result.balance.rebalanced).toBe(false);
    expect(result.applied).toBe(false);
  });

  it('scores and ranks ventures by priority', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'Urgent', metadata: { scheduling: { deadline_days: 5, time_sensitive: true }, financials: { revenue_growth: 10 }, resources: { total_allocation: 50 } } }),
      createVenture({ id: 'v2', name: 'Steady', metadata: { scheduling: { deadline_days: 60 }, financials: { revenue_growth: 35 }, resources: { total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    expect(result.ventureCount).toBe(2);
    expect(result.rankings).toHaveLength(2);
    // Urgent venture (5 days, time_sensitive) should have high urgency
    const urgent = result.rankings.find(r => r.ventureId === 'v1');
    expect(urgent.urgencyScore).toBeGreaterThan(80);
  });

  it('detects resource contention across ventures', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'A', metadata: { resources: { engineering: 5, total_allocation: 60 } } }),
      createVenture({ id: 'v2', name: 'B', metadata: { resources: { engineering: 3, total_allocation: 40 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    expect(result.contention.hasContention).toBe(true);
    const engConflict = result.contention.conflicts.find(c => c.resourceType === 'engineering');
    expect(engConflict).toBeDefined();
    expect(engConflict.ventureIds).toContain('v1');
    expect(engConflict.ventureIds).toContain('v2');
    expect(engConflict.totalDemand).toBe(8);
    expect(engConflict.severity).toBeDefined();
    expect(engConflict.capacity).toBe(1.0);

    // Should produce resolutions for the contention
    expect(result.resolutions.length).toBeGreaterThan(0);
    expect(result.resolutions[0].strategy).toBeDefined();
  });

  it('reports no contention when resources are unique', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { engineering: 5, total_allocation: 50 } } }),
      createVenture({ id: 'v2', metadata: { resources: { design: 3, total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    // engineering and design are unique per venture, total_allocation is skipped
    expect(result.contention.conflicts).toHaveLength(0);
  });

  it('enforces portfolio balance cap', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'Big', metadata: { scheduling: { deadline_days: 5 }, financials: { revenue_growth: 30 }, resources: { total_allocation: 800 } } }),
      createVenture({ id: 'v2', name: 'Small', metadata: { scheduling: { deadline_days: 30 }, financials: { revenue_growth: 10 }, resources: { total_allocation: 200 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    // v1 has 80% allocation (800/1000), exceeds 40% cap
    expect(result.balance.rebalanced).toBe(true);
    expect(result.balance.after.v1).toBeLessThanOrEqual(0.40);
  });

  it('does not rebalance when all within cap', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { total_allocation: 30 } } }),
      createVenture({ id: 'v2', metadata: { resources: { total_allocation: 30 } } }),
      createVenture({ id: 'v3', metadata: { resources: { total_allocation: 40 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2', 'v3']);

    expect(result.balance.rebalanced).toBe(false);
  });

  it('respects custom balance cap', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { scheduling: { deadline_days: 5 }, financials: { revenue_growth: 30 }, resources: { total_allocation: 600 } } }),
      createVenture({ id: 'v2', metadata: { scheduling: { deadline_days: 30 }, financials: { revenue_growth: 10 }, resources: { total_allocation: 400 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // With 60% cap, v1 at 60% is exactly at the limit
    const result = await optimize(db, ['v1', 'v2'], { balanceCap: 0.60 });

    expect(result.balance.rebalanced).toBe(false);
  });

  it('supports dry-run mode', async () => {
    const ventures = [createVenture()];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1'], { dryRun: true });

    expect(result.applied).toBe(false);
  });

  it('applies by default (not dry-run)', async () => {
    const ventures = [createVenture()];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1']);

    expect(result.applied).toBe(true);
  });

  it('uses custom weights with all 5 signals', async () => {
    const ventures = [createVenture({
      metadata: {
        scheduling: { deadline_days: 10 },
        financials: { revenue_growth: 25, revenue_projections: 40 },
        market: { tam_score: 80 },
        health: { composite_score: 70 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0].priorityScore).toBeGreaterThan(0);
    expect(result.rankings[0].financialScore).toBeDefined();
    expect(result.rankings[0].marketScore).toBe(80);
    expect(result.rankings[0].healthScore).toBe(70);
  });

  it('throws INVALID_WEIGHTS when weights do not sum to 1.0', async () => {
    const db = createMockDb();
    const badWeights = { urgency: 0.5, roi: 0.3, financial: 0.1, market: 0.0, health: 0.0 };

    await expect(optimize(db, ['v1'], { weights: badWeights })).rejects.toThrow('must sum to 1.0');
    try {
      await optimize(db, ['v1'], { weights: badWeights });
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('INVALID_WEIGHTS');
    }
  });

  it('throws VENTURES_LOAD_FAILED on query error', async () => {
    const db = createMockDb({
      'ventures:select': { data: null, error: { message: 'connection refused' } },
    });

    await expect(optimize(db, ['v1'])).rejects.toThrow('Failed to load ventures');
    try {
      await optimize(db, ['v1']);
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('VENTURES_LOAD_FAILED');
    }
  });

  it('throws NO_VENTURES_FOUND when no ventures returned', async () => {
    const db = createMockDb({
      'ventures:select': { data: [], error: null },
    });

    await expect(optimize(db, ['v-missing'])).rejects.toThrow('No ventures found');
    try {
      await optimize(db, ['v-missing']);
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('NO_VENTURES_FOUND');
    }
  });

  it('emits optimization_started and optimization_completed events', async () => {
    const ventures = [createVenture()];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    await optimize(db, ['v1']);

    const eventCalls = db.from.mock.calls.filter(c => c[0] === 'eva_event_log');
    expect(eventCalls.length).toBe(2);
  });

  it('scores venture urgency based on deadline proximity', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { scheduling: { deadline_days: 3 }, financials: {}, resources: { total_allocation: 50 } } }),
      createVenture({ id: 'v2', metadata: { scheduling: { deadline_days: 120 }, financials: {}, resources: { total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    const v1 = result.rankings.find(r => r.ventureId === 'v1');
    const v2 = result.rankings.find(r => r.ventureId === 'v2');

    expect(v1.urgencyScore).toBe(90); // <= 7 days
    expect(v2.urgencyScore).toBe(20); // > 90 days
  });

  it('scores ROI based on revenue growth', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { scheduling: {}, financials: { revenue_growth: 40, margin_trajectory: 5 }, resources: { total_allocation: 50 } } }),
      createVenture({ id: 'v2', metadata: { scheduling: {}, financials: { revenue_growth: 3, margin_trajectory: -2 }, resources: { total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    const v1 = result.rankings.find(r => r.ventureId === 'v1');
    const v2 = result.rankings.find(r => r.ventureId === 'v2');

    expect(v1.roiScore).toBe(100); // 90 + 10 margin, capped at 100
    expect(v2.roiScore).toBe(20); // 30 - 10 margin
  });

  it('handles ventures with no metadata', async () => {
    const ventures = [createVenture({ id: 'v1', metadata: {} })];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1']);

    expect(result.rankings).toHaveLength(1);
    expect(result.rankings[0].urgencyScore).toBe(50); // baseline
    expect(result.rankings[0].roiScore).toBe(50); // baseline
    expect(result.rankings[0].financialScore).toBe(50); // baseline
    expect(result.rankings[0].marketScore).toBe(50); // baseline
    expect(result.rankings[0].healthScore).toBe(50); // baseline
  });
});

// ── Multi-Signal Scoring (US-001) ────────────────────────

describe('multi-signal scoring', () => {
  it('extracts financial projections score from metadata', async () => {
    const ventures = [createVenture({
      metadata: {
        financials: { revenue_projections: 60 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].financialScore).toBe(90); // >50
  });

  it('extracts market TAM score from metadata', async () => {
    const ventures = [createVenture({
      metadata: {
        market: { tam_score: 75 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].marketScore).toBe(75);
  });

  it('extracts health composite score from metadata', async () => {
    const ventures = [createVenture({
      metadata: {
        health: { composite_score: 85 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].healthScore).toBe(85);
  });

  it('defaults missing signals to baseline 50', async () => {
    const ventures = [createVenture({ metadata: {} })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].financialScore).toBe(50);
    expect(result.rankings[0].marketScore).toBe(50);
    expect(result.rankings[0].healthScore).toBe(50);
  });

  it('clamps market and health scores to 0-100 range', async () => {
    const ventures = [createVenture({
      metadata: {
        market: { tam_score: 150 },
        health: { composite_score: -10 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].marketScore).toBe(100);
    expect(result.rankings[0].healthScore).toBe(0);
  });
});

// ── Stage Maturity Weighting (US-002) ────────────────────

describe('stage maturity weighting', () => {
  it('applies full confidence for ventures with all 25 stages', async () => {
    const ventures = [createVenture({
      metadata: {
        stage_progress: 25,
        scheduling: { deadline_days: 10 },
        financials: { revenue_growth: 20 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].maturity).toBe(1.0);
  });

  it('reduces confidence for early-stage ventures', async () => {
    const ventures = [createVenture({
      metadata: {
        stage_progress: 3,
        scheduling: { deadline_days: 10 },
        financials: { revenue_growth: 20 },
        resources: { total_allocation: 50 },
      },
    })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    // 3/25 = 0.12 ratio → 0.5 + 0.12 * 0.5 = 0.56
    expect(result.rankings[0].maturity).toBeCloseTo(0.56, 1);
    // Priority score should be reduced by maturity multiplier
    expect(result.rankings[0].priorityScore).toBeLessThan(50);
  });

  it('defaults to full confidence when stage_progress is missing', async () => {
    const ventures = [createVenture({ metadata: {} })];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v1'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].maturity).toBe(1.0);
  });
});

// ── Time-in-Queue Tiebreaker (US-003) ────────────────────

describe('time-in-queue tiebreaker', () => {
  it('ranks older venture first when scores are within tolerance', async () => {
    const ventures = [
      createVenture({
        id: 'v-new', name: 'Newer',
        created_at: '2026-02-01T00:00:00Z',
        metadata: { scheduling: {}, financials: {}, resources: { total_allocation: 50 } },
      }),
      createVenture({
        id: 'v-old', name: 'Older',
        created_at: '2025-01-01T00:00:00Z',
        metadata: { scheduling: {}, financials: {}, resources: { total_allocation: 50 } },
      }),
    ];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    // Both have identical metadata → same scores → tiebreaker kicks in
    const result = await optimize(db, ['v-new', 'v-old'], { weights: EQUAL_WEIGHTS });

    expect(result.rankings[0].ventureId).toBe('v-old');
    expect(result.rankings[1].ventureId).toBe('v-new');
  });

  it('does not apply tiebreaker when score difference exceeds tolerance', async () => {
    const ventures = [
      createVenture({
        id: 'v-new', name: 'High Score',
        created_at: '2026-02-01T00:00:00Z',
        metadata: {
          scheduling: { deadline_days: 3, time_sensitive: true },
          financials: { revenue_growth: 50, revenue_projections: 80 },
          market: { tam_score: 90 },
          health: { composite_score: 95 },
          resources: { total_allocation: 50 },
        },
      }),
      createVenture({
        id: 'v-old', name: 'Low Score',
        created_at: '2025-01-01T00:00:00Z',
        metadata: { scheduling: { deadline_days: 200 }, financials: { revenue_growth: 1 }, resources: { total_allocation: 50 } },
      }),
    ];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    const result = await optimize(db, ['v-new', 'v-old'], { weights: EQUAL_WEIGHTS });

    // High-scoring newer venture should still rank first despite older competitor
    expect(result.rankings[0].ventureId).toBe('v-new');
  });

  it('respects custom tiebreaker tolerance', async () => {
    const ventures = [
      createVenture({
        id: 'v-new', name: 'Newer',
        created_at: '2026-02-01T00:00:00Z',
        metadata: { scheduling: {}, financials: {}, resources: { total_allocation: 50 } },
      }),
      createVenture({
        id: 'v-old', name: 'Older',
        created_at: '2025-01-01T00:00:00Z',
        metadata: { scheduling: {}, financials: {}, resources: { total_allocation: 50 } },
      }),
    ];

    const db = createMockDb({ 'ventures:select': { data: ventures, error: null } });
    // With tolerance 0, even equal scores should use strict numeric sort
    const result = await optimize(db, ['v-new', 'v-old'], {
      weights: EQUAL_WEIGHTS,
      tiebreakerTolerance: 0,
    });

    // Scores are identical (both baseline 50) so diff is 0 which is NOT > 0
    // tiebreaker applies → older first
    expect(result.rankings[0].ventureId).toBe('v-old');
  });

  it('classifies contention severity based on demand-to-capacity ratio', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { engineering: 0.7 } } }),
      createVenture({ id: 'v2', metadata: { resources: { engineering: 0.6 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // totalDemand = 1.3, capacity = 1.0, ratio = 1.3 → medium severity
    const result = await optimize(db, ['v1', 'v2']);

    const engConflict = result.contention.conflicts.find(c => c.resourceType === 'engineering');
    expect(engConflict.severity).toBe('medium');
  });

  it('respects custom capacities for severity scoring', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { engineering: 3 } } }),
      createVenture({ id: 'v2', metadata: { resources: { engineering: 2 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // totalDemand = 5, capacity = 10, ratio = 0.5 → below 1.0 threshold → low
    const result = await optimize(db, ['v1', 'v2'], { capacities: { engineering: 10 } });

    const engConflict = result.contention.conflicts.find(c => c.resourceType === 'engineering');
    expect(engConflict.severity).toBe('low');
    expect(engConflict.capacity).toBe(10);
  });

  it('selects escalate strategy for critical severity', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { scheduling: { deadline_days: 5 }, financials: { revenue_growth: 30 }, resources: { engineering: 2.0 } } }),
      createVenture({ id: 'v2', metadata: { scheduling: { deadline_days: 60 }, financials: { revenue_growth: 5 }, resources: { engineering: 1.5 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // totalDemand = 3.5, capacity = 1.0, ratio = 3.5 → critical
    const result = await optimize(db, ['v1', 'v2']);

    const engResolution = result.resolutions.find(r => r.resourceType === 'engineering');
    expect(engResolution.severity).toBe('critical');
    expect(engResolution.strategy).toBe('escalate');
  });

  it('emits contention_detected event when contention found', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { engineering: 3 } } }),
      createVenture({ id: 'v2', metadata: { resources: { engineering: 2 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    await optimize(db, ['v1', 'v2']);

    // Should emit: optimization_started, contention_detected, optimization_completed
    const eventCalls = db.from.mock.calls.filter(c => c[0] === 'eva_event_log');
    expect(eventCalls.length).toBe(3);
  });

  it('skips total_allocation from contention detection', async () => {
    const ventures = [
      createVenture({ id: 'v1', metadata: { resources: { total_allocation: 100, engineering: 5 } } }),
      createVenture({ id: 'v2', metadata: { resources: { total_allocation: 200, design: 3 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const result = await optimize(db, ['v1', 'v2']);

    // total_allocation should be excluded, engineering and design are unique
    expect(result.contention.hasContention).toBe(false);
  });
});

// ── Provider Boost & Deferral Protection ──────────────────────

describe('dependency-aware optimization', () => {
  it('boosts priority score for provider ventures', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'Provider', metadata: { scheduling: { deadline_days: 60 }, financials: { revenue_growth: 10 }, resources: { total_allocation: 50 } } }),
      createVenture({ id: 'v2', name: 'Consumer', metadata: { scheduling: { deadline_days: 60 }, financials: { revenue_growth: 10 }, resources: { total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // v1 provides to 2 dependents → +10 boost
    getDependencyGraph
      .mockResolvedValueOnce({ dependsOn: [], providesTo: ['v2', 'v3'] })  // v1
      .mockResolvedValueOnce({ dependsOn: ['v1'], providesTo: [] });       // v2

    const result = await optimize(db, ['v1', 'v2']);

    const provider = result.rankings.find(r => r.ventureId === 'v1');
    const consumer = result.rankings.find(r => r.ventureId === 'v2');

    expect(provider.providerBoost).toBe(10); // 2 * 5
    expect(consumer.providerBoost).toBe(0);
    expect(provider.priorityScore).toBeGreaterThan(consumer.priorityScore);
  });

  it('caps provider boost at 15 points', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'MegaProvider', metadata: { scheduling: { deadline_days: 60 }, financials: { revenue_growth: 10 }, resources: { total_allocation: 100 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // v1 provides to 5 dependents → 5*5=25 but capped at 15
    getDependencyGraph.mockResolvedValueOnce({
      dependsOn: [],
      providesTo: ['v2', 'v3', 'v4', 'v5', 'v6'],
    });

    const result = await optimize(db, ['v1']);

    expect(result.rankings[0].providerBoost).toBe(15);
  });

  it('applies zero boost when venture has no dependents', async () => {
    const ventures = [createVenture({ id: 'v1', metadata: { resources: { total_allocation: 50 } } })];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // Default mock returns empty providesTo
    const result = await optimize(db, ['v1']);

    expect(result.rankings[0].providerBoost).toBe(0);
  });

  it('protects provider ventures from deferral in contention resolution', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'Provider', metadata: { scheduling: { deadline_days: 90 }, financials: { revenue_growth: 5 }, resources: { engineering: 3, total_allocation: 60 } } }),
      createVenture({ id: 'v2', name: 'Independent', metadata: { scheduling: { deadline_days: 90 }, financials: { revenue_growth: 5 }, resources: { engineering: 2, total_allocation: 40 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // v1 is a provider, v2 is not
    getDependencyGraph
      .mockResolvedValueOnce({ dependsOn: [], providesTo: ['v3'] })  // v1 provider
      .mockResolvedValueOnce({ dependsOn: [], providesTo: [] });      // v2 independent

    const result = await optimize(db, ['v1', 'v2']);

    // Should have contention on engineering
    expect(result.contention.hasContention).toBe(true);

    // Resolution should target v2 (independent), not v1 (provider)
    const engResolution = result.resolutions.find(r => r.resourceType === 'engineering');
    expect(engResolution).toBeDefined();
    if (engResolution.details.targetVentureId) {
      expect(engResolution.details.targetVentureId).toBe('v2');
    }
  });

  it('escalates when all contending ventures are providers', async () => {
    const ventures = [
      createVenture({ id: 'v1', name: 'ProvA', metadata: { scheduling: { deadline_days: 30 }, financials: { revenue_growth: 10 }, resources: { engineering: 1.0, total_allocation: 50 } } }),
      createVenture({ id: 'v2', name: 'ProvB', metadata: { scheduling: { deadline_days: 30 }, financials: { revenue_growth: 10 }, resources: { engineering: 0.5, total_allocation: 50 } } }),
    ];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // Both ventures are providers
    getDependencyGraph
      .mockResolvedValueOnce({ dependsOn: [], providesTo: ['v3'] })  // v1
      .mockResolvedValueOnce({ dependsOn: [], providesTo: ['v4'] }); // v2

    const result = await optimize(db, ['v1', 'v2']);

    expect(result.contention.hasContention).toBe(true);

    const engResolution = result.resolutions.find(r => r.resourceType === 'engineering');
    expect(engResolution).toBeDefined();
    // medium severity (ratio 1.5) would normally suggest_realloc, but all are providers → escalate
    expect(engResolution.strategy).toBe('escalate');
    expect(engResolution.details.escalatedReason).toBe('all_ventures_are_providers');
  });

  it('handles getDependencyGraph failures gracefully', async () => {
    const ventures = [createVenture({ id: 'v1', metadata: { resources: { total_allocation: 50 } } })];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    // Promise.allSettled handles rejections — venture should get 0 boost
    getDependencyGraph.mockRejectedValueOnce(new Error('DB timeout'));

    const result = await optimize(db, ['v1']);

    expect(result.rankings[0].providerBoost).toBe(0);
    expect(result.rankings).toHaveLength(1);
  });
});
