/**
 * Tests for Portfolio Optimizer
 * SD-EVA-FEAT-PORTFOLIO-OPT-001
 */

import { describe, it, expect, vi } from 'vitest';
import { optimize, MODULE_VERSION } from '../../../lib/eva/portfolio-optimizer.js';
import { ServiceError } from '../../../lib/eva/shared-services.js';

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
    metadata: {
      scheduling: { deadline_days: 14, time_sensitive: false },
      financials: { revenue_growth: 20, margin_trajectory: 5 },
      resources: { engineering: 3, design: 1, total_allocation: 100 },
    },
    ...overrides,
  };
}

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
    expect(result.rankings[0].priorityScore).toBeGreaterThanOrEqual(result.rankings[1].priorityScore);
    // Urgent venture (5 days, time_sensitive) should rank higher on urgency
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

  it('uses custom weights', async () => {
    const ventures = [createVenture()];

    const db = createMockDb({
      'ventures:select': { data: ventures, error: null },
    });

    const customWeights = { urgency: 0.30, roi: 0.70 };
    const result = await optimize(db, ['v1'], { weights: customWeights });

    expect(result.rankings).toHaveLength(1);
    // With ROI weighted higher, score should reflect that
    expect(result.rankings[0].priorityScore).toBeGreaterThan(0);
  });

  it('throws INVALID_WEIGHTS when weights do not sum to 1.0', async () => {
    const db = createMockDb();
    const badWeights = { urgency: 0.5, roi: 0.3 };

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
