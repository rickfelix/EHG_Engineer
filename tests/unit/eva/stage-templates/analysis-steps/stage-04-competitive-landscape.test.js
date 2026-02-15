/**
 * Unit tests for Stage 04 Analysis Step - Competitive Landscape
 * SD: SD-EVA-R2-FIX-TEST-COVERAGE-001
 *
 * Tests: analyzeStage04, MIN_COMPETITORS, competitor normalization, stage5Handoff
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
}));

// Mock web-search
vi.mock('../../../../../lib/eva/utils/web-search.js', () => ({
  isSearchEnabled: vi.fn(() => false),
  searchBatch: vi.fn(async () => []),
  formatResultsForPrompt: vi.fn(() => ''),
}));

import { analyzeStage04, MIN_COMPETITORS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../../../../lib/eva/utils/web-search.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeCompetitor(name, threat = 'M') {
  return {
    name,
    position: `${name} is a market leader`,
    threat,
    strengths: ['Brand recognition'],
    weaknesses: ['Slow innovation'],
    swot: {
      strengths: ['Market share'],
      weaknesses: ['Legacy tech'],
      opportunities: ['New markets'],
      threats: ['Disruption'],
    },
    pricingModel: {
      type: 'subscription',
      lowTier: '$10/mo',
      highTier: '$99/mo',
      freeOption: true,
      notes: 'Freemium model',
    },
  };
}

function makeLLMResponse(numCompetitors = 3) {
  const competitors = [];
  for (let i = 0; i < numCompetitors; i++) {
    competitors.push(makeCompetitor(`Competitor ${i + 1}`, ['H', 'M', 'L'][i % 3]));
  }
  return JSON.stringify({
    competitors,
    stage5Handoff: {
      avgMarketPrice: '$50/mo',
      pricingModels: ['subscription', 'freemium'],
      priceRange: { low: 10, high: 99 },
      competitiveDensity: 'medium',
    },
  });
}

describe('MIN_COMPETITORS', () => {
  it('is set to 3', () => {
    expect(MIN_COMPETITORS).toBe(3);
  });
});

describe('analyzeStage04', () => {
  let mockComplete;
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn();
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  const validStage1Data = {
    description: 'AI-powered project management tool',
    valueProp: 'Automates task assignment and tracking',
    targetMarket: 'Software development teams',
    problemStatement: 'Manual project management is inefficient',
  };

  const validStage3Data = {
    overallScore: 75,
    competitiveBarrier: 60,
  };

  it('throws when stage1Data is missing description', async () => {
    await expect(
      analyzeStage04({ stage1Data: {}, logger }),
    ).rejects.toThrow('Stage 04 requires Stage 1 data with description');
  });

  it('throws when fewer than MIN_COMPETITORS returned', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      competitors: [makeCompetitor('Only One')],
      stage5Handoff: {},
    }));

    await expect(
      analyzeStage04({ stage1Data: validStage1Data, logger }),
    ).rejects.toThrow(`at least ${MIN_COMPETITORS} competitors`);
  });

  it('throws when competitors is not an array', async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      competitors: null,
      stage5Handoff: {},
    }));

    await expect(
      analyzeStage04({ stage1Data: validStage1Data, logger }),
    ).rejects.toThrow(`at least ${MIN_COMPETITORS} competitors`);
  });

  it('returns competitors and stage5Handoff on valid response', async () => {
    mockComplete.mockResolvedValueOnce(makeLLMResponse(4));

    const result = await analyzeStage04({
      stage1Data: validStage1Data,
      stage3Data: validStage3Data,
      ventureName: 'AITasker',
      logger,
    });

    expect(result.competitors).toHaveLength(4);
    expect(result.stage5Handoff).toBeDefined();
    expect(result.stage5Handoff.avgMarketPrice).toBe('$50/mo');
  });

  it('normalizes invalid threat levels to M', async () => {
    const response = JSON.stringify({
      competitors: [
        { ...makeCompetitor('C1'), threat: 'INVALID' },
        { ...makeCompetitor('C2'), threat: 'X' },
        { ...makeCompetitor('C3'), threat: 'H' },
      ],
      stage5Handoff: { avgMarketPrice: '$50/mo', pricingModels: [], priceRange: { low: 0, high: 0 }, competitiveDensity: 'low' },
    });
    mockComplete.mockResolvedValueOnce(response);

    const result = await analyzeStage04({ stage1Data: validStage1Data, logger });

    expect(result.competitors[0].threat).toBe('M');
    expect(result.competitors[1].threat).toBe('M');
    expect(result.competitors[2].threat).toBe('H');
  });

  it('normalizes missing strengths/weaknesses to [N/A]', async () => {
    const response = JSON.stringify({
      competitors: [
        { name: 'C1', strengths: null, weaknesses: [] },
        { name: 'C2' },
        { name: 'C3' },
      ],
      stage5Handoff: { avgMarketPrice: '$50/mo', pricingModels: [], priceRange: { low: 0, high: 0 }, competitiveDensity: 'low' },
    });
    mockComplete.mockResolvedValueOnce(response);

    const result = await analyzeStage04({ stage1Data: validStage1Data, logger });

    expect(result.competitors[0].strengths).toEqual(['N/A']);
    expect(result.competitors[0].weaknesses).toEqual(['N/A']);
    expect(result.competitors[1].strengths).toEqual(['N/A']);
  });

  it('normalizes missing SWOT fields', async () => {
    const response = JSON.stringify({
      competitors: [
        { name: 'C1', swot: {} },
        { name: 'C2', swot: null },
        { name: 'C3' },
      ],
      stage5Handoff: { avgMarketPrice: '$50/mo', pricingModels: [], priceRange: { low: 0, high: 0 }, competitiveDensity: 'low' },
    });
    mockComplete.mockResolvedValueOnce(response);

    const result = await analyzeStage04({ stage1Data: validStage1Data, logger });

    expect(result.competitors[0].swot.strengths).toEqual(['N/A']);
    expect(result.competitors[0].swot.weaknesses).toEqual(['N/A']);
    expect(result.competitors[0].swot.opportunities).toEqual(['N/A']);
    expect(result.competitors[0].swot.threats).toEqual(['N/A']);
  });

  it('uses LLM-provided stage5Handoff when available', async () => {
    const handoff = {
      avgMarketPrice: '$75/mo',
      pricingModels: ['enterprise'],
      priceRange: { low: 50, high: 200 },
      competitiveDensity: 'high',
    };
    mockComplete.mockResolvedValueOnce(JSON.stringify({
      competitors: [makeCompetitor('C1'), makeCompetitor('C2'), makeCompetitor('C3')],
      stage5Handoff: handoff,
    }));

    const result = await analyzeStage04({ stage1Data: validStage1Data, logger });
    expect(result.stage5Handoff).toEqual(handoff);
  });

  it('includes stage3Data in prompt when provided', async () => {
    mockComplete.mockResolvedValueOnce(makeLLMResponse(3));

    await analyzeStage04({
      stage1Data: validStage1Data,
      stage3Data: validStage3Data,
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('75');
    expect(prompt).toContain('60');
  });

  it('handles missing competitor name with Unknown fallback', async () => {
    const response = JSON.stringify({
      competitors: [
        { position: 'Leader' },
        { name: 'C2' },
        { name: 'C3' },
      ],
      stage5Handoff: { avgMarketPrice: '$50/mo', pricingModels: [], priceRange: { low: 0, high: 0 }, competitiveDensity: 'low' },
    });
    mockComplete.mockResolvedValueOnce(response);

    const result = await analyzeStage04({ stage1Data: validStage1Data, logger });
    expect(result.competitors[0].name).toBe('Unknown');
  });

  describe('web search integration', () => {
    it('does not call searchBatch when search is disabled', async () => {
      isSearchEnabled.mockReturnValue(false);
      mockComplete.mockResolvedValueOnce(makeLLMResponse(3));

      await analyzeStage04({ stage1Data: validStage1Data, logger });

      expect(searchBatch).not.toHaveBeenCalled();
      expect(formatResultsForPrompt).not.toHaveBeenCalled();
    });

    it('calls searchBatch with competitive queries when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([{ title: 'Competitor Report', url: 'https://example.com', content: 'Market data' }]);
      formatResultsForPrompt.mockReturnValue('Web: Market data');
      mockComplete.mockResolvedValueOnce(makeLLMResponse(3));

      await analyzeStage04({
        stage1Data: validStage1Data,
        ventureName: 'TestVenture',
        logger,
      });

      expect(searchBatch).toHaveBeenCalledTimes(1);
      const queries = searchBatch.mock.calls[0][0];
      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('competitors');
      expect(formatResultsForPrompt).toHaveBeenCalledWith(
        expect.any(Array),
        'Competitive Intelligence Research',
      );
    });

    it('injects web context into LLM prompt when search is enabled', async () => {
      isSearchEnabled.mockReturnValue(true);
      searchBatch.mockResolvedValueOnce([]);
      formatResultsForPrompt.mockReturnValue('Web Research: competitor data here');
      mockComplete.mockResolvedValueOnce(makeLLMResponse(3));

      await analyzeStage04({ stage1Data: validStage1Data, logger });

      const prompt = mockComplete.mock.calls[0][1];
      expect(prompt).toContain('Web Research: competitor data here');
    });
  });
});
