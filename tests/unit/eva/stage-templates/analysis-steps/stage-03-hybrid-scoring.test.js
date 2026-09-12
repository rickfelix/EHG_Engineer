/**
 * Unit tests for Stage 03 Analysis Step - Hybrid Scoring
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-146 (FR-1/FR-2/FR-5): archetype + keyAssumptions
 * prompt context.
 *
 * Tests: analyzeStage03's AI-scoring prompt content (archetype, keyAssumptions).
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

import { analyzeStage03 } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-03-hybrid-scoring.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function makeAiScoreResponse(overrides = {}) {
  const base = {
    marketFit: 70,
    customerNeed: 65,
    momentum: 60,
    revenuePotential: 68,
    competitiveBarrier: 55,
    executionFeasibility: 72,
    designQuality: 60,
    risk_factors: [],
    go_conditions: [],
    market_fit_assessment: 'Reasonable fit',
    rationale: 'Balanced across dimensions',
  };
  return JSON.stringify({ ...base, ...overrides });
}

function makeStage2Data() {
  return {
    compositeScore: 62,
    critiques: [
      { model: 'market-strategist', score: 65 },
      { model: 'customer-advocate', score: 60 },
      { model: 'growth-hacker', score: 58 },
      { model: 'revenue-analyst', score: 62 },
      { model: 'moat-architect', score: 50 },
      { model: 'ops-realist', score: 68 },
      { model: 'product-designer', score: 55 },
    ],
  };
}

describe('analyzeStage03 - archetype/keyAssumptions prompt context (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-146)', () => {
  let mockComplete;
  const logger = createMockLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    mockComplete = vi.fn();
    getLLMClient.mockReturnValue({ complete: mockComplete });
  });

  it('includes stage1Data.archetype in the AI-scoring prompt when present', async () => {
    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    await analyzeStage03({
      stage1Data: { description: 'A B2B SaaS tool', archetype: 'saas_b2b' },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('saas_b2b');
    expect(prompt).toContain('calibration context');
  });

  it('includes stage1Data.keyAssumptions in the AI-scoring prompt when present', async () => {
    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    await analyzeStage03({
      stage1Data: {
        description: 'A B2B SaaS tool',
        keyAssumptions: ['Customers will pay monthly', 'Churn stays under 5%'],
      },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).toContain('Customers will pay monthly');
    expect(prompt).toContain('Churn stays under 5%');
  });

  it('omits archetype/keyAssumptions lines gracefully when absent', async () => {
    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    await analyzeStage03({
      stage1Data: { description: 'A B2B SaaS tool' },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).not.toContain('Venture Archetype');
    expect(prompt).not.toContain('Key Assumptions');
  });

  it('omits keyAssumptions line when the array is empty', async () => {
    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    await analyzeStage03({
      stage1Data: { description: 'A B2B SaaS tool', keyAssumptions: [] },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    const prompt = mockComplete.mock.calls[0][1];
    expect(prompt).not.toContain('Key Assumptions');
  });

  it('does not let archetype/keyAssumptions affect the deterministic+AI blended score computation', async () => {
    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    const withoutContext = await analyzeStage03({
      stage1Data: { description: 'A B2B SaaS tool' },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    mockComplete.mockResolvedValueOnce(makeAiScoreResponse());

    const withContext = await analyzeStage03({
      stage1Data: { description: 'A B2B SaaS tool', archetype: 'marketplace', keyAssumptions: ['Assumption X'] },
      stage2Data: makeStage2Data(),
      ventureName: 'TestVenture',
      logger,
    });

    // Same deterministic + AI mock scores in both calls -> same blended overallScore.
    // archetype/keyAssumptions are prompt-only context, never a scoring input.
    expect(withContext.overallScore).toBe(withoutContext.overallScore);
  });
});
