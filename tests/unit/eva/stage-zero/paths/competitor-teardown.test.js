/**
 * Unit Tests: Competitor Teardown Path
 *
 * Test Coverage:
 * - Throws on no URLs / empty array
 * - Analyzes each URL, returns PathOutput with origin_type='competitor_teardown'
 * - Handles single/multiple competitors
 * - Uses injected llmClient
 * - Runs gap analysis for multiple competitors
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/client-factory.js', () => ({
  getValidationClient: vi.fn(() => mockLlmClient),
}));

vi.mock('../../../../../scripts/modules/sd-key-generator.js', () => ({
  generateSDKey: vi.fn().mockReturnValue('SD-TEST-001'),
  generateChildKey: vi.fn().mockReturnValue('SD-TEST-001-A'),
  normalizeVenturePrefix: vi.fn().mockReturnValue('TEST'),
}));

import { executeCompetitorTeardown } from '../../../../../lib/eva/stage-zero/paths/competitor-teardown.js';

const silentLogger = { log: vi.fn(), warn: vi.fn() };

let mockLlmClient;

function createMockLlm(analysisResponse, deconstructionResponse, gapResponse) {
  let callCount = 0;
  const responses = [];

  return {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockImplementation(() => {
        callCount++;
        // First N calls = competitor analyses (one per URL)
        // Then deconstruction, then gap analysis
        if (callCount <= (analysisResponse ? 1 : 0)) {
          return Promise.resolve({
            content: [{ text: JSON.stringify(analysisResponse) }],
          });
        }
        // For simplicity, return different responses based on call order
        // The implementation calls: analyzeCompetitor (per URL), deconstructToFirstPrinciples, runGapAnalysis
        return Promise.resolve({
          content: [{ text: JSON.stringify(deconstructionResponse || {
            suggested_venture_name: 'AI Venture',
            root_customer_problem: 'Customer problem',
            automation_solution: 'Automated solution',
            target_market: 'SMBs',
          }) }],
        });
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Simple mock that always returns valid JSON for any LLM call
  mockLlmClient = {
    _model: 'test-model',
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify({
          company_name: 'TestCorp',
          url: 'http://test.com',
          business_model: 'SaaS',
          value_proposition: 'Test value',
          target_market: 'B2B',
          key_features: ['feature1'],
          work_components: [],
          weaknesses: ['slow'],
          differentiation_opportunities: ['AI automation'],
          suggested_venture_name: 'AI TestCorp',
          root_customer_problem: 'Manual processes',
          automation_solution: 'Full automation',
        }) }],
      }),
    },
  };
});

describe('executeCompetitorTeardown', () => {
  test('throws when no URLs provided', async () => {
    await expect(executeCompetitorTeardown({ urls: [] }, { logger: silentLogger }))
      .rejects.toThrow('At least one competitor URL is required');
  });

  test('throws when urls is undefined', async () => {
    await expect(executeCompetitorTeardown({}, { logger: silentLogger }))
      .rejects.toThrow('At least one competitor URL is required');
  });

  test('analyzes single URL and returns PathOutput', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://competitor.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result).not.toBeNull();
    expect(result.origin_type).toBe('competitor_teardown');
    expect(result.competitor_urls).toEqual(['http://competitor.com']);
    expect(result.raw_material.competitor_analyses).toHaveLength(1);
    expect(result.metadata.path).toBe('competitor_teardown');
    expect(result.metadata.url_count).toBe(1);
  });

  test('analyzes multiple URLs', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://a.com', 'http://b.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result.competitor_urls).toEqual(['http://a.com', 'http://b.com']);
    expect(result.raw_material.competitor_analyses).toHaveLength(2);
    // Gap analysis runs for multiple competitors
    expect(result.raw_material.gap_analysis).not.toBeNull();
  });

  test('single competitor does not run gap analysis', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://single.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(result.raw_material.gap_analysis).toBeNull();
  });

  test('uses injected llmClient', async () => {
    await executeCompetitorTeardown(
      { urls: ['http://test.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    expect(mockLlmClient.messages.create).toHaveBeenCalled();
  });

  test('returns valid PathOutput with suggested fields from deconstruction', async () => {
    const result = await executeCompetitorTeardown(
      { urls: ['http://test.com'] },
      { logger: silentLogger, llmClient: mockLlmClient }
    );

    // The suggested fields come from the deconstruction response
    expect(result.suggested_name).toBeDefined();
    expect(result.suggested_problem).toBeDefined();
    expect(result.suggested_solution).toBeDefined();
    expect(result.target_market).toBeDefined();
  });
});
