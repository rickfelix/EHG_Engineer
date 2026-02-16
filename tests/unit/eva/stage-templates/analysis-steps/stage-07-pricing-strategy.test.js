/**
 * Unit tests for Stage 07 Analysis Step - Pricing Strategy
 * SD: SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-A
 *
 * Tests: analyzeStage07, PRICING_MODELS, POSITIONING_VALUES, web search integration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock LLM client
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

// Mock parseJSON
vi.mock('../../../../../lib/eva/utils/parse-json.js', () => ({
  parseJSON: vi.fn((str) => JSON.parse(str)),
  extractUsage: vi.fn((response) => response?.usage || null),
}));

// Mock web-search
vi.mock('../../../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(() => false),
  searchBatch: vi.fn(async () => []),
  formatResultsForPrompt: vi.fn(() => ''),
}));

import { analyzeStage07, PRICING_MODELS, POSITIONING_VALUES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../../../../lib/eva/utils/web-search.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makePricingResponse(overrides = {}) {
  const base = {
    pricingModel: 'subscription',
    primaryValueMetric: 'per user per month',
    priceAnchor: {
      competitorAvg: 50,
      proposedPrice: 39,
      positioning: 'discount',
    },
    tiers: [
      { name: 'Starter', price: 0, billing_period: 'monthly', target_segment: 'Solo developers', included_units: 'Up to 3 projects' },
      { name: 'Pro', price: 29, billing_period: 'monthly', target_segment: 'Small teams', included_units: 'Unlimited projects' },
      { name: 'Enterprise', price: 99, billing_period: 'monthly', target_segment: 'Large orgs', included_units: 'Custom SLA' },
    ],
    unitEconomics: {
      gross_margin_pct: 75,
      churn_rate_monthly: 4,
      cac: 120,
      arpa: 45,
    },
    rationale: 'Subscription model with freemium tier to drive adoption',
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe('Constants', () => {
  it('PRICING_MODELS contains 6 values', () => {
    expect(PRICING_MODELS).toEqual([
      'freemium', 'subscription', 'usage_based', 'per_seat', 'marketplace_commission', 'one_time',
    ]);
  });

  it('POSITIONING_VALUES contains 3 values', () => {
    expect(POSITIONING_VALUES).toEqual(['premium', 'parity', 'discount']);
  });
});

describe('analyzeStage07', () => {
  let mockComplete;
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn();
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  const validStage1Data = {
    description: 'AI-powered analytics platform',
    targetMarket: 'SaaS companies',
    archetype: 'disruptor',
  };

  const validStage4Data = {
    stage5Handoff: {
      avgMarketPrice: '$50/mo',
      priceRange: { low: 20, high: 100 },
      pricingModels: ['subscription', 'freemium'],
      competitiveDensity: 'medium',
    },
  };

  const validStage5Data = {
    grossProfitY1: 140000,
    year1: { revenue: 200000 },
    unitEconomics: {
      cac: 150,
      ltv: 900,
      monthlyChurn: 0.03,
    },
  };

  it('throws when stage1Data is missing description', async () => {
    await expect(
      analyzeStage07({ stage1Data: {}, logger }),
    ).rejects.toThrow('Stage 07 pricing strategy requires Stage 1 data with description');
  });

  it('returns a valid pricing strategy on good input', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse());

    const result = await analyzeStage07({
      stage1Data: validStage1Data,
      ventureName: 'AnalytiX',
      logger,
    });

    expect(result.pricingModel).toBe('subscription');
    expect(result.primaryValueMetric).toBe('per user per month');
    expect(result.priceAnchor.positioning).toBe('discount');
    expect(result.tiers).toHaveLength(3);
    expect(result.unitEconomics.gross_margin_pct).toBe(75);
    expect(result.rationale).toContain('Subscription');
  });

  it('normalizes invalid pricingModel to subscription', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      pricingModel: 'invalid_model',
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.pricingModel).toBe('subscription');
  });

  it('normalizes invalid positioning to parity', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      priceAnchor: { competitorAvg: 50, proposedPrice: 50, positioning: 'invalid' },
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.priceAnchor.positioning).toBe('parity');
  });

  it('normalizes tier pricing - clamps negative to 0', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      tiers: [
        { name: 'Free', price: -10, billing_period: 'monthly', target_segment: 'All', included_units: 'Basic' },
        { name: 'Pro', price: 29, billing_period: 'monthly', target_segment: 'Teams', included_units: 'All' },
      ],
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.tiers[0].price).toBe(0);
  });

  it('normalizes invalid billing_period to monthly', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      tiers: [
        { name: 'T1', price: 10, billing_period: 'weekly', target_segment: 'All', included_units: 'Basic' },
      ],
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.tiers[0].billing_period).toBe('monthly');
  });

  it('seeds unitEconomics from stage5Data when available', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      unitEconomics: {}, // Empty - should fall back to stage5Data
    }));

    const result = await analyzeStage07({
      stage1Data: validStage1Data,
      stage5Data: validStage5Data,
      logger,
    });

    // gross_margin_pct should come from stage5: (140k/200k)*100 = 70
    expect(result.unitEconomics.gross_margin_pct).toBe(70);
    // churn should come from stage5: 0.03 * 100 = 3
    expect(result.unitEconomics.churn_rate_monthly).toBe(3);
    // cac should come from stage5: 150
    expect(result.unitEconomics.cac).toBe(150);
  });

  it('clamps unitEconomics values to valid ranges', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      unitEconomics: {
        gross_margin_pct: 150, // Over 100
        churn_rate_monthly: -5, // Below 0
        cac: -50, // Below 0
        arpa: -10, // Below 0
      },
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.unitEconomics.gross_margin_pct).toBe(100);
    expect(result.unitEconomics.churn_rate_monthly).toBe(0);
    expect(result.unitEconomics.cac).toBeGreaterThanOrEqual(0);
    expect(result.unitEconomics.arpa).toBeGreaterThanOrEqual(0);
  });

  it('includes competitive context in prompt when stage4Data provided', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse());

    await analyzeStage07({
      stage1Data: validStage1Data,
      stage4Data: validStage4Data,
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('$50/mo');
    expect(prompt).toContain('subscription');
  });

  it('includes financial context in prompt when stage5Data provided', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse());

    await analyzeStage07({
      stage1Data: validStage1Data,
      stage5Data: validStage5Data,
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('150');
    expect(prompt).toContain('900');
  });

  it('includes risk context in prompt when stage6Data provided', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse());

    await analyzeStage07({
      stage1Data: validStage1Data,
      stage6Data: { totalRisks: 10, highRiskCount: 3 },
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('10 risks');
    expect(prompt).toContain('3 high-risk');
  });

  it('handles empty tiers from LLM', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      tiers: null,
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.tiers).toEqual([]);
  });

  it('handles missing priceAnchor fields gracefully', async () => {
    mockComplete.mockResolvedValueOnce(makePricingResponse({
      priceAnchor: {},
    }));

    const result = await analyzeStage07({ stage1Data: validStage1Data, logger });
    expect(result.priceAnchor.competitorAvg).toBe(0);
    expect(result.priceAnchor.positioning).toBe('parity');
  });

  describe('web search integration', () => {
    it('does not call searchBatch when search is disabled', async () => {
      isSearchEnabled.mockReturnValue(false);
      mockComplete.mockResolvedValueOnce(makePricingResponse());

      await analyzeStage07({ stage1Data: validStage1Data, logger });

      expect(searchBatch).not.toHaveBeenCalled();
    });

    it('calls searchBatch with pricing queries when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([{ title: 'Pricing Report', url: 'https://example.com', content: 'Pricing data' }]);
      formatResultsForPrompt.mockReturnValue('Web: Pricing data');
      mockComplete.mockResolvedValueOnce(makePricingResponse());

      await analyzeStage07({
        stage1Data: validStage1Data,
        ventureName: 'TestVenture',
        logger,
      });

      expect(searchBatch).toHaveBeenCalledTimes(1);
      const queries = searchBatch.mock.calls[0][0];
      expect(queries).toHaveLength(2);
      expect(queries[0]).toContain('pricing');
      expect(queries[1]).toContain('pricing');
      expect(formatResultsForPrompt).toHaveBeenCalledWith(
        expect.any(Array),
        'Pricing Intelligence Research',
      );
    });

    it('injects web context into LLM prompt when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([]);
      formatResultsForPrompt.mockReturnValue('Web: Pricing intelligence here');
      mockComplete.mockResolvedValueOnce(makePricingResponse());

      await analyzeStage07({ stage1Data: validStage1Data, logger });

      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('Web: Pricing intelligence here');
    });
  });
});
