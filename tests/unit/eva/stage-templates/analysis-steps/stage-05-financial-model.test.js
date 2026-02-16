/**
 * Unit tests for Stage 05 Analysis Step - Financial Model
 * SD: SD-EVA-R2-FIX-TEST-COVERAGE-001
 *
 * Tests: analyzeStage05, ROI_THRESHOLD, MAX_PAYBACK_MONTHS, kill gate logic
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

import { analyzeStage05, ROI_THRESHOLD, MAX_PAYBACK_MONTHS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../../../../lib/eva/utils/web-search.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeFinancialResponse(overrides = {}) {
  const base = {
    initialInvestment: 50000,
    year1: { revenue: 100000, cogs: 30000, opex: 40000 },
    year2: { revenue: 200000, cogs: 50000, opex: 60000 },
    year3: { revenue: 350000, cogs: 80000, opex: 80000 },
    unitEconomics: {
      cac: 150,
      ltv: 900,
      ltvCacRatio: 6,
      paybackMonths: 8,
      monthlyChurn: 0.03,
    },
    roiBands: {
      pessimistic: 1.5,
      base: 2.0,
      optimistic: 2.6,
    },
    assumptions: [
      'Market grows 15% annually',
      'Churn stabilizes at 3% monthly',
      'CAC decreases 10% year-over-year',
    ],
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe('Constants', () => {
  it('ROI_THRESHOLD is 0.25 (25%)', () => {
    expect(ROI_THRESHOLD).toBe(0.25);
  });

  it('MAX_PAYBACK_MONTHS is 24', () => {
    expect(MAX_PAYBACK_MONTHS).toBe(24);
  });
});

describe('analyzeStage05', () => {
  let mockComplete;
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn();
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  const validStage1Data = {
    description: 'B2B SaaS for inventory management',
    targetMarket: 'Small retail businesses',
    problemStatement: 'Manual inventory tracking causes losses',
  };

  const validStage3Data = { overallScore: 72 };

  const validStage4Data = {
    competitors: [{ name: 'C1' }, { name: 'C2' }, { name: 'C3' }],
    stage5Handoff: {
      avgMarketPrice: '$50/mo',
      pricingModels: ['subscription'],
      priceRange: { low: 20, high: 100 },
      competitiveDensity: 'medium',
    },
  };

  it('throws when stage1Data is missing description', async () => {
    await expect(
      analyzeStage05({ stage1Data: {}, logger }),
    ).rejects.toThrow('Stage 05 requires Stage 1 data');
  });

  it('returns pass decision when ROI exceeds threshold', async () => {
    // High-revenue scenario: ROI will be well above 25%
    mockComplete.mockResolvedValueOnce(makeFinancialResponse());

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      stage3Data: validStage3Data,
      stage4Data: validStage4Data,
      ventureName: 'InvenTrack',
      logger,
    });

    expect(result.decision).toBe('pass');
    expect(result.blockProgression).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  it('returns kill decision when ROI is below threshold', async () => {
    // Low-revenue scenario: revenue barely covers costs
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      initialInvestment: 500000,
      year1: { revenue: 10000, cogs: 5000, opex: 8000 },
      year2: { revenue: 15000, cogs: 7000, opex: 10000 },
      year3: { revenue: 20000, cogs: 9000, opex: 12000 },
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result.decision).toBe('kill');
    expect(result.blockProgression).toBe(true);
    expect(result.reasons.some(r => r.type === 'roi_below_threshold')).toBe(true);
  });

  it('flags no_break_even_year1 when Y1 net profit is negative', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      initialInvestment: 100000,
      year1: { revenue: 10000, cogs: 5000, opex: 20000 }, // net = -15000
      year2: { revenue: 200000, cogs: 50000, opex: 60000 },
      year3: { revenue: 350000, cogs: 80000, opex: 80000 },
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result.breakEvenMonth).toBeNull();
    expect(result.reasons.some(r => r.type === 'no_break_even_year1')).toBe(true);
  });

  it('computes derived financial fields correctly', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      initialInvestment: 100000,
      year1: { revenue: 200000, cogs: 60000, opex: 80000 },
      year2: { revenue: 300000, cogs: 80000, opex: 100000 },
      year3: { revenue: 400000, cogs: 100000, opex: 120000 },
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    // Y1: GP = 200k-60k = 140k, NP = 140k-80k = 60k
    expect(result.grossProfitY1).toBe(140000);
    expect(result.netProfitY1).toBe(60000);

    // Y2: GP = 300k-80k = 220k, NP = 220k-100k = 120k
    expect(result.grossProfitY2).toBe(220000);
    expect(result.netProfitY2).toBe(120000);

    // Y3: GP = 400k-100k = 300k, NP = 300k-120k = 180k
    expect(result.grossProfitY3).toBe(300000);
    expect(result.netProfitY3).toBe(180000);

    // ROI = (totalNP - initial) / initial = (360k - 100k) / 100k = 2.6
    expect(result.roi3y).toBe(2.6);
  });

  it('computes breakEvenMonth from Y1 net profit', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      initialInvestment: 60000,
      year1: { revenue: 200000, cogs: 60000, opex: 80000 }, // NP = 60k, monthly = 5k
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    // breakEvenMonth = ceil(60000 / 5000) = 12
    expect(result.breakEvenMonth).toBe(12);
  });

  it('uses fallback values for missing unit economics', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      unitEconomics: {}, // All fields missing
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    // Fallback: cac=100, ltv=500
    expect(result.unitEconomics.cac).toBe(100);
    expect(result.unitEconomics.ltv).toBe(500);
    expect(result.unitEconomics.monthlyChurn).toBe(0.05); // Default
  });

  it('clamps monthlyChurn between 0 and 1', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      unitEconomics: {
        cac: 200,
        ltv: 1000,
        paybackMonths: 6,
        monthlyChurn: 1.5, // Over 1
      },
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result.unitEconomics.monthlyChurn).toBeLessThanOrEqual(1);
  });

  it('computes ROI bands from base ROI', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse());

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    // Bands should be: pessimistic = roi * 0.8, optimistic = roi * 1.3
    expect(result.roiBands.pessimistic).toBeCloseTo(result.roi3y * 0.8, 2);
    expect(result.roiBands.base).toBeCloseTo(result.roi3y, 2);
    expect(result.roiBands.optimistic).toBeCloseTo(result.roi3y * 1.3, 2);
  });

  it('preserves assumptions array from LLM response', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse());

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result.assumptions).toHaveLength(3);
    expect(result.assumptions[0]).toContain('Market grows');
  });

  it('handles missing assumptions with empty array', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      assumptions: null,
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result.assumptions).toEqual([]);
  });

  it('includes competitive pricing in prompt when stage4Data provided', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse());

    await analyzeStage05({
      stage1Data: validStage1Data,
      stage4Data: validStage4Data,
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('$50/mo');
    expect(prompt).toContain('subscription');
  });

  it('handles missing stage4Data gracefully', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse());

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    expect(result).toBeDefined();
    expect(result.decision).toBeDefined();
  });

  it('uses fallback for invalid initialInvestment', async () => {
    mockComplete.mockResolvedValueOnce(makeFinancialResponse({
      initialInvestment: -5000,
    }));

    const result = await analyzeStage05({
      stage1Data: validStage1Data,
      logger,
    });

    // Fallback is 10000
    expect(result.initialInvestment).toBe(10000);
  });

  describe('web search integration', () => {
    it('does not call searchBatch when search is disabled', async () => {
      isSearchEnabled.mockReturnValue(false);
      mockComplete.mockResolvedValueOnce(makeFinancialResponse());

      await analyzeStage05({ stage1Data: validStage1Data, logger });

      expect(searchBatch).not.toHaveBeenCalled();
    });

    it('calls searchBatch with financial queries when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([{ title: 'Benchmarks', url: 'https://example.com', content: 'CAC data' }]);
      formatResultsForPrompt.mockReturnValue('Web: CAC data');
      mockComplete.mockResolvedValueOnce(makeFinancialResponse());

      await analyzeStage05({
        stage1Data: validStage1Data,
        ventureName: 'TestVenture',
        logger,
      });

      expect(searchBatch).toHaveBeenCalledTimes(1);
      const queries = searchBatch.mock.calls[0][0];
      expect(queries).toHaveLength(2);
      expect(queries[0]).toContain('benchmarks');
      expect(queries[1]).toContain('CAC');
      expect(formatResultsForPrompt).toHaveBeenCalledWith(
        expect.any(Array),
        'Financial Benchmark Research',
      );
    });

    it('injects web context into LLM prompt when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([]);
      formatResultsForPrompt.mockReturnValue('Web: Financial benchmarks here');
      mockComplete.mockResolvedValueOnce(makeFinancialResponse());

      await analyzeStage05({ stage1Data: validStage1Data, logger });

      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('Web: Financial benchmarks here');
    });
  });
});
