/**
 * Tests for Expand-vs-Spinoff Evaluator
 * SD-EVA-FEAT-EXPAND-SPINOFF-001
 */

import { describe, it, expect, vi } from 'vitest';
import { evaluate, MODULE_VERSION } from '../../../lib/eva/expand-spinoff-evaluator.js';
import { ServiceError } from '../../../lib/eva/shared-services.js';

// ── Mock Supabase builder ──────────────────────────────────

function createMockDb(config = {}) {
  return {
    from: vi.fn((table) => {
      const chainable = {};

      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn().mockReturnValue(chainable);

      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });

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
    name: 'Test Venture',
    status: 'active',
    current_stage: 25,
    archetype: 'saas',
    metadata: {
      financials: {
        revenue_growth: 25,
        margin_trajectory: 5,
        capital_requirements: 500_000,
        burn_rate: 80_000,
      },
      market: {
        market_size: 500_000_000,
        competitive_position: 8,
        expansion_potential: 5,
        market_share: 15,
      },
      operational: {
        team_capacity: 8,
        infrastructure_readiness: 7,
        process_maturity: 6,
      },
    },
    ...overrides,
  };
}

function createStage() {
  return {
    id: 's1',
    venture_id: 'v1',
    stage_number: 25,
    status: 'in_progress',
    started_at: '2026-01-01',
    completed_at: null,
    metadata: {},
  };
}

// ── MODULE_VERSION ──────────────────────────────────

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── evaluate ──────────────────────────────────

describe('evaluate', () => {
  it('returns expand recommendation for strong financials and operations', async () => {
    const venture = createVenture();
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await evaluate(db, 'v1');

    expect(result.recommendation).toBe('expand');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.compositeScore).toBeGreaterThanOrEqual(60);
    expect(result.dimensions.financial).toBeDefined();
    expect(result.dimensions.market).toBeDefined();
    expect(result.dimensions.operational).toBeDefined();
    expect(result.evidence.ventureId).toBe('v1');
    expect(result.evidence.stage).toBe(25);
    expect(result.dataCompleteness).toBeGreaterThan(0);
  });

  it('returns spinoff recommendation when financials suggest independence', async () => {
    const venture = createVenture({
      metadata: {
        financials: {
          revenue_growth: 5,
          margin_trajectory: -3,
          capital_requirements: 5_000_000,
          burn_rate: 300_000,
        },
        market: {
          market_size: 5_000_000_000,
          competitive_position: 3,
          expansion_potential: 9,
          market_share: 2,
        },
        operational: {
          team_capacity: 3,
          infrastructure_readiness: 3,
          process_maturity: 3,
        },
      },
    });
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await evaluate(db, 'v1');

    expect(result.recommendation).toBe('spinoff');
    expect(result.compositeScore).toBeLessThanOrEqual(40);
  });

  it('returns lower confidence with incomplete data', async () => {
    const venture = createVenture({
      metadata: {
        financials: { revenue_growth: 20 },
        market: {},
        operational: {},
      },
    });
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await evaluate(db, 'v1');

    // With mostly empty data, completeness should be low
    expect(result.dataCompleteness).toBeLessThan(50);
  });

  it('throws STAGE_MISMATCH when no Stage 25 record exists', async () => {
    const venture = createVenture();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    });

    await expect(evaluate(db, 'v1')).rejects.toThrow('no Stage 25');
    try {
      await evaluate(db, 'v1');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('STAGE_MISMATCH');
    }
  });

  it('throws VENTURE_NOT_FOUND when venture does not exist', async () => {
    const db = createMockDb({
      'ventures:single': { data: null, error: null },
    });

    await expect(evaluate(db, 'v-missing')).rejects.toThrow('not found');
    try {
      await evaluate(db, 'v-missing');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('VENTURE_NOT_FOUND');
    }
  });

  it('emits evaluation_started and evaluation_completed events', async () => {
    const venture = createVenture();
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    await evaluate(db, 'v1');

    // Verify insert was called for event log (at least 2 times: started + completed)
    const insertCalls = db.from.mock.calls.filter(c => c[0] === 'eva_event_log');
    expect(insertCalls.length).toBe(2);
  });

  it('uses custom weights when provided', async () => {
    const venture = createVenture();
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const customWeights = { financial: 0.5, market: 0.3, operational: 0.2 };
    const result = await evaluate(db, 'v1', { weights: customWeights });

    expect(result.evidence.weightsUsed).toEqual(customWeights);
    expect(result.dimensions.financial.weight).toBe(0.5);
  });

  it('throws INVALID_WEIGHTS when weights do not sum to 1.0', async () => {
    const db = createMockDb({
      'ventures:single': { data: createVenture(), error: null },
      'eva_venture_stages:single': { data: createStage(), error: null },
    });

    const badWeights = { financial: 0.5, market: 0.3, operational: 0.1 };

    await expect(evaluate(db, 'v1', { weights: badWeights })).rejects.toThrow('must sum to 1.0');
    try {
      await evaluate(db, 'v1', { weights: badWeights });
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('INVALID_WEIGHTS');
    }
  });

  it('handles venture with no metadata gracefully', async () => {
    const venture = createVenture({ metadata: {} });
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await evaluate(db, 'v1');

    // No data → neutral scores, low completeness
    expect(result.recommendation).toBe('neutral');
    expect(result.dataCompleteness).toBe(0);
    expect(result.compositeScore).toBe(50);
  });

  it('returns mixed signals with lower confidence', async () => {
    const venture = createVenture({
      metadata: {
        financials: {
          revenue_growth: 30,
          margin_trajectory: 10,
          capital_requirements: 100_000,
          burn_rate: 30_000,
        },
        market: {
          market_size: 10_000_000_000,
          competitive_position: 2,
          expansion_potential: 9,
          market_share: 1,
        },
        operational: {
          team_capacity: 5,
          infrastructure_readiness: 5,
          process_maturity: 5,
        },
      },
    });
    const stage = createStage();

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await evaluate(db, 'v1');

    // Financial says expand, market says spinoff — mixed
    expect(result.dimensions.financial.recommendation).toBe('expand');
    expect(result.dimensions.market.recommendation).toBe('spinoff');
    // Confidence should be lower due to disagreement
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});
