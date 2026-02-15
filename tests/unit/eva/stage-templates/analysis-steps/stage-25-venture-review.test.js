/**
 * Unit tests for Stage 25 Analysis Step - Venture Review (Capstone)
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-25-venture-review.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage25, VENTURE_DECISIONS, HEALTH_RATINGS, REVIEW_CATEGORIES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-25-venture-review.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    journeySummary: 'The venture began as an idea in Stage 1, progressed through validation in Stage 5, and launched in Stage 23 with strong early traction.',
    financialComparison: {
      projectedRevenue: '$50,000 ARR by month 6',
      actualRevenue: '$35,000 ARR at month 6',
      projectedCosts: '$120,000 for first year',
      actualCosts: '$95,000 spent so far',
      variance: 'Revenue 30% below projection, costs 21% under budget',
      assessment: 'Below expectations on revenue, but cost discipline is strong',
    },
    ventureHealth: {
      overallRating: 'good',
      dimensions: {
        product: { score: 8, rationale: 'Core features well-received' },
        market: { score: 7, rationale: 'Good fit, slower adoption than expected' },
        technical: { score: 9, rationale: 'Solid architecture, low error rate' },
        financial: { score: 6, rationale: 'Revenue below projections' },
        team: { score: 7, rationale: 'Small but effective team' },
      },
    },
    driftAnalysis: {
      originalVision: 'AI-powered analytics for SMBs',
      currentState: 'Pivoted slightly to mid-market with self-serve onboarding',
      driftDetected: true,
      driftSummary: 'Moderate drift from pure SMB to mid-market segment',
    },
    ventureDecision: {
      recommendation: 'continue',
      confidence: 78,
      rationale: 'Revenue trends are positive despite being below initial projections. Product-market fit indicators are strong.',
      nextActions: ['Increase marketing spend', 'Launch referral program', 'Hire sales rep'],
    },
    initiatives: {
      product: [{ title: 'Core MVP', status: 'completed', outcome: 'All features shipped' }],
      market: [{ title: 'Beta program', status: 'completed', outcome: '62 beta users acquired' }],
      technical: [{ title: 'Infrastructure setup', status: 'completed', outcome: '99.9% uptime' }],
      financial: [{ title: 'Seed funding', status: 'completed', outcome: '$150K raised' }],
      team: [{ title: 'Founding team', status: 'completed', outcome: '3 co-founders aligned' }],
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

function setupMock(responseOverrides = {}) {
  const mockComplete = vi.fn().mockResolvedValue(createLLMResponse(responseOverrides));
  getLLMClient.mockReturnValue({ complete: mockComplete });
  return mockComplete;
}

const VALID_PARAMS = {
  stage24Data: {
    launchOutcome: { assessment: 'partial', criteriaMetRate: 67 },
    learnings: [
      { insight: 'Mobile onboarding preferred', action: 'Improve mobile UX', impactLevel: 'high' },
    ],
  },
};

describe('stage-25-venture-review.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export VENTURE_DECISIONS', () => {
      expect(VENTURE_DECISIONS).toEqual(['continue', 'pivot', 'expand', 'sunset', 'exit']);
    });

    it('should export HEALTH_RATINGS', () => {
      expect(HEALTH_RATINGS).toEqual(['excellent', 'good', 'fair', 'poor', 'critical']);
    });

    it('should export REVIEW_CATEGORIES', () => {
      expect(REVIEW_CATEGORIES).toEqual(['product', 'market', 'technical', 'financial', 'team']);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage24Data is missing', async () => {
      await expect(analyzeStage25({})).rejects.toThrow('Stage 25 venture review requires Stage 24');
    });
  });

  describe('Journey summary normalization', () => {
    it('should use LLM-provided summary', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.journeySummary).toContain('venture began');
    });

    it('should truncate to 2000 characters', async () => {
      setupMock({ journeySummary: 'X'.repeat(3000) });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.journeySummary.length).toBe(2000);
    });

    it('should default when missing', async () => {
      setupMock({ journeySummary: undefined });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.journeySummary).toBe('Venture journey summary pending review.');
    });
  });

  describe('Financial comparison normalization', () => {
    it('should normalize all financial fields', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.financialComparison).toHaveProperty('projectedRevenue');
      expect(result.financialComparison).toHaveProperty('actualRevenue');
      expect(result.financialComparison).toHaveProperty('projectedCosts');
      expect(result.financialComparison).toHaveProperty('actualCosts');
      expect(result.financialComparison).toHaveProperty('variance');
      expect(result.financialComparison).toHaveProperty('assessment');
    });

    it('should provide defaults when missing', async () => {
      setupMock({ financialComparison: {} });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.financialComparison.projectedRevenue).toBe('Not available');
      expect(result.financialComparison.actualRevenue).toBe('Not measured');
    });
  });

  describe('Venture health normalization', () => {
    it('should normalize all 5 dimension scores', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      for (const cat of REVIEW_CATEGORIES) {
        expect(result.ventureHealth.dimensions[cat]).toHaveProperty('score');
        expect(result.ventureHealth.dimensions[cat]).toHaveProperty('rationale');
        expect(result.ventureHealth.dimensions[cat].score).toBeGreaterThanOrEqual(1);
        expect(result.ventureHealth.dimensions[cat].score).toBeLessThanOrEqual(10);
      }
    });

    it('should clamp scores to 1-10 range', async () => {
      setupMock({
        ventureHealth: {
          overallRating: 'good',
          dimensions: {
            product: { score: 15, rationale: 'Over max' },
            market: { score: -5, rationale: 'Under min' },
            technical: { score: 0, rationale: 'Zero' },
            financial: { score: 5.7, rationale: 'Decimal' },
            team: { score: 10, rationale: 'Max' },
          },
        },
      });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureHealth.dimensions.product.score).toBe(10);
      expect(result.ventureHealth.dimensions.market.score).toBe(1);
      expect(result.ventureHealth.dimensions.technical.score).toBe(1);
      expect(result.ventureHealth.dimensions.financial.score).toBe(6);
      expect(result.ventureHealth.dimensions.team.score).toBe(10);
    });

    it('should default score to 5 when not a number', async () => {
      setupMock({
        ventureHealth: {
          dimensions: {
            product: { score: 'not a number', rationale: 'Test' },
            market: { score: 7, rationale: 'Test' },
            technical: { score: 7, rationale: 'Test' },
            financial: { score: 7, rationale: 'Test' },
            team: { score: 7, rationale: 'Test' },
          },
        },
      });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureHealth.dimensions.product.score).toBe(5);
    });

    it('should use LLM overallRating when valid', async () => {
      for (const rating of HEALTH_RATINGS) {
        setupMock({ ventureHealth: { overallRating: rating, dimensions: {} } });
        const result = await analyzeStage25(VALID_PARAMS);
        expect(result.ventureHealth.overallRating).toBe(rating);
      }
    });

    it('should derive overallRating from average score when LLM gives invalid', async () => {
      setupMock({
        ventureHealth: {
          overallRating: 'invalid',
          dimensions: {
            product: { score: 9, rationale: '' },
            market: { score: 9, rationale: '' },
            technical: { score: 9, rationale: '' },
            financial: { score: 8, rationale: '' },
            team: { score: 9, rationale: '' },
          },
        },
      });
      const result = await analyzeStage25(VALID_PARAMS);
      // avg = 8.8 >= 8.5 -> excellent
      expect(result.ventureHealth.overallRating).toBe('excellent');
    });
  });

  describe('Drift analysis normalization', () => {
    it('should normalize drift fields', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.driftAnalysis).toHaveProperty('originalVision');
      expect(result.driftAnalysis).toHaveProperty('currentState');
      expect(result.driftAnalysis).toHaveProperty('driftDetected');
      expect(result.driftAnalysis).toHaveProperty('driftSummary');
    });

    it('should default driftDetected to false when not boolean', async () => {
      setupMock({ driftAnalysis: { driftDetected: 'yes' } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.driftAnalysis.driftDetected).toBe(false);
    });

    it('should use stage01Data elevator_pitch as fallback for originalVision', async () => {
      setupMock({ driftAnalysis: {} });
      const result = await analyzeStage25({
        ...VALID_PARAMS,
        stage01Data: { elevator_pitch: 'AI for analytics' },
      });
      expect(result.driftAnalysis.originalVision).toBe('AI for analytics');
    });
  });

  describe('Venture decision normalization', () => {
    it('should accept all valid decisions', async () => {
      for (const decision of VENTURE_DECISIONS) {
        setupMock({ ventureDecision: { recommendation: decision, confidence: 80, rationale: 'Test', nextActions: ['Act'] } });
        const result = await analyzeStage25(VALID_PARAMS);
        expect(result.ventureDecision.recommendation).toBe(decision);
      }
    });

    it('should default to continue for invalid decision', async () => {
      setupMock({ ventureDecision: { recommendation: 'invalid' } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureDecision.recommendation).toBe('continue');
    });

    it('should clamp confidence to 0-100', async () => {
      setupMock({ ventureDecision: { recommendation: 'continue', confidence: 150, rationale: 'R', nextActions: ['A'] } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureDecision.confidence).toBe(100);
    });

    it('should default confidence to 50 when not a number', async () => {
      setupMock({ ventureDecision: { recommendation: 'continue', confidence: 'high' } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureDecision.confidence).toBe(50);
    });

    it('should provide default nextActions when empty', async () => {
      setupMock({ ventureDecision: { recommendation: 'continue', confidence: 80, rationale: 'R', nextActions: [] } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureDecision.nextActions.length).toBe(1);
    });
  });

  describe('Initiatives normalization', () => {
    it('should normalize all 5 initiative categories', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      for (const cat of REVIEW_CATEGORIES) {
        expect(result.initiatives[cat]).toBeDefined();
        expect(result.initiatives[cat].length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should provide default initiatives for missing categories', async () => {
      setupMock({ initiatives: { product: [{ title: 'Test', status: 'completed', outcome: 'Done' }] } });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.initiatives.market[0].title).toContain('market');
      expect(result.initiatives.market[0].status).toBe('planned');
    });

    it('should truncate title to 200 characters', async () => {
      setupMock({
        initiatives: {
          product: [{ title: 'T'.repeat(300), status: 'done', outcome: 'OK' }],
          market: [{ title: 'M', status: 'done', outcome: 'OK' }],
          technical: [{ title: 'T', status: 'done', outcome: 'OK' }],
          financial: [{ title: 'F', status: 'done', outcome: 'OK' }],
          team: [{ title: 'Te', status: 'done', outcome: 'OK' }],
        },
      });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.initiatives.product[0].title.length).toBe(200);
    });
  });

  describe('Derived fields', () => {
    it('should compute totalInitiatives', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.totalInitiatives).toBe(5); // 1 per category
    });

    it('should set allCategoriesReviewed to true when all categories present', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.allCategoriesReviewed).toBe(true);
    });

    it('should compute healthScore as rounded average', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      // (8+7+9+6+7)/5 = 37/5 = 7.4
      expect(result.healthScore).toBe(7.4);
    });
  });

  describe('Output shape', () => {
    it('should return all expected fields', async () => {
      setupMock();
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result).toHaveProperty('journeySummary');
      expect(result).toHaveProperty('financialComparison');
      expect(result).toHaveProperty('ventureHealth');
      expect(result).toHaveProperty('driftAnalysis');
      expect(result).toHaveProperty('ventureDecision');
      expect(result).toHaveProperty('initiatives');
      expect(result).toHaveProperty('totalInitiatives');
      expect(result).toHaveProperty('allCategoriesReviewed');
      expect(result).toHaveProperty('healthScore');
    });
  });

  describe('Upstream data integration', () => {
    it('should include stage24 metrics context in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage25(VALID_PARAMS);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('partial');
      expect(userPrompt).toContain('67');
    });

    it('should include stage01 vision in prompt when provided', async () => {
      const mockComplete = setupMock();
      await analyzeStage25({
        ...VALID_PARAMS,
        stage01Data: { venture_name: 'TestCo', elevator_pitch: 'AI for everyone' },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('TestCo');
      expect(userPrompt).toContain('AI for everyone');
    });

    it('should include ventureName in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage25({ ...VALID_PARAMS, ventureName: 'ReviewCo' });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('ReviewCo');
    });
  });

  describe('JSON parsing', () => {
    it('should handle markdown code block wrapping', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage25(VALID_PARAMS);
      expect(result.ventureDecision.recommendation).toBe('continue');
    });

    it('should throw on unparseable response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('Garbage data');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage25(VALID_PARAMS)).rejects.toThrow('Failed to parse LLM response as JSON');
    });
  });
});
