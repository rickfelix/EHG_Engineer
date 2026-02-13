/**
 * Unit tests for Stage 24 Analysis Step - Metrics & Learning
 * Part of SD-EVA-FEAT-TEMPLATES-LAUNCH-001
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-24-metrics-learning.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage24, AARRR_CATEGORIES, TREND_DIRECTIONS, OUTCOME_ASSESSMENTS, IMPACT_LEVELS } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-24-metrics-learning.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

function createLLMResponse(overrides = {}) {
  const base = {
    aarrr: {
      acquisition: [{ name: 'Website visitors', value: 5000, target: 10000, trendDirection: 'up' }],
      activation: [{ name: 'Signup rate', value: 400, target: 500, trendDirection: 'up' }],
      retention: [{ name: 'Day-7 retention', value: 35, target: 40, trendDirection: 'flat' }],
      revenue: [{ name: 'MRR', value: 2000, target: 5000, trendDirection: 'up' }],
      referral: [{ name: 'Referral rate', value: 8, target: 10, trendDirection: 'flat' }],
    },
    criteriaEvaluation: [
      { metric: 'User signups', target: '50 in 7 days', actual: '62 in 7 days', met: true, notes: 'Exceeded target' },
      { metric: 'Error rate', target: 'Below 5%', actual: '3.2%', met: true, notes: 'Well within target' },
      { metric: 'NPS score', target: 'Above 30', actual: '25', met: false, notes: 'Slightly below target' },
    ],
    learnings: [
      { insight: 'Users prefer mobile onboarding', action: 'Prioritize mobile UX improvements', impactLevel: 'high' },
      { insight: 'Referral flow has friction', action: 'Simplify sharing mechanism', impactLevel: 'medium' },
    ],
    launchOutcome: {
      assessment: 'partial',
      criteriaMetRate: 67,
      summary: 'Launch partially successful: 67% of success criteria met.',
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
  stage23Data: {
    launchType: 'beta',
    successCriteria: [
      { metric: 'User signups', target: '50 in 7 days', priority: 'primary', measurementWindow: '7 days' },
      { metric: 'Error rate', target: 'Below 5%', priority: 'secondary', measurementWindow: '7 days' },
    ],
  },
};

describe('stage-24-metrics-learning.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export AARRR_CATEGORIES', () => {
      expect(AARRR_CATEGORIES).toEqual(['acquisition', 'activation', 'retention', 'revenue', 'referral']);
    });

    it('should export TREND_DIRECTIONS', () => {
      expect(TREND_DIRECTIONS).toEqual(['up', 'flat', 'down']);
    });

    it('should export OUTCOME_ASSESSMENTS', () => {
      expect(OUTCOME_ASSESSMENTS).toEqual(['success', 'partial', 'failure', 'indeterminate']);
    });

    it('should export IMPACT_LEVELS', () => {
      expect(IMPACT_LEVELS).toEqual(['high', 'medium', 'low']);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage23Data is missing', async () => {
      await expect(analyzeStage24({})).rejects.toThrow('Stage 24 metrics & learning requires Stage 23');
    });
  });

  describe('AARRR metrics normalization', () => {
    it('should populate all 5 AARRR categories', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      for (const cat of AARRR_CATEGORIES) {
        expect(result.aarrr[cat]).toBeDefined();
        expect(result.aarrr[cat].length).toBeGreaterThanOrEqual(1);
      }
    });

    it('should provide default metric for missing categories', async () => {
      setupMock({ aarrr: { acquisition: [{ name: 'Visitors', value: 100, target: 200, trendDirection: 'up' }] } });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.aarrr.retention[0].name).toBe('retention metric');
      expect(result.aarrr.retention[0].value).toBe(0);
    });

    it('should default invalid trendDirection to flat', async () => {
      setupMock({
        aarrr: {
          acquisition: [{ name: 'Visitors', value: 100, target: 200, trendDirection: 'invalid' }],
          activation: [{ name: 'A', value: 1, target: 2, trendDirection: 'up' }],
          retention: [{ name: 'R', value: 1, target: 2, trendDirection: 'flat' }],
          revenue: [{ name: 'Rev', value: 1, target: 2, trendDirection: 'down' }],
          referral: [{ name: 'Ref', value: 1, target: 2, trendDirection: 'up' }],
        },
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.aarrr.acquisition[0].trendDirection).toBe('flat');
    });

    it('should accept all valid trend directions', async () => {
      for (const dir of TREND_DIRECTIONS) {
        setupMock({
          aarrr: {
            acquisition: [{ name: 'A', value: 1, target: 2, trendDirection: dir }],
            activation: [{ name: 'A', value: 1, target: 2, trendDirection: dir }],
            retention: [{ name: 'R', value: 1, target: 2, trendDirection: dir }],
            revenue: [{ name: 'Rev', value: 1, target: 2, trendDirection: dir }],
            referral: [{ name: 'Ref', value: 1, target: 2, trendDirection: dir }],
          },
        });
        const result = await analyzeStage24(VALID_PARAMS);
        expect(result.aarrr.acquisition[0].trendDirection).toBe(dir);
      }
    });

    it('should truncate metric name to 200 characters', async () => {
      setupMock({
        aarrr: {
          acquisition: [{ name: 'N'.repeat(300), value: 100, target: 200, trendDirection: 'up' }],
          activation: [{ name: 'A', value: 1, target: 2, trendDirection: 'up' }],
          retention: [{ name: 'R', value: 1, target: 2, trendDirection: 'up' }],
          revenue: [{ name: 'Rev', value: 1, target: 2, trendDirection: 'up' }],
          referral: [{ name: 'Ref', value: 1, target: 2, trendDirection: 'up' }],
        },
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.aarrr.acquisition[0].name.length).toBe(200);
    });
  });

  describe('Criteria evaluation normalization', () => {
    it('should normalize criteria from LLM response', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.criteriaEvaluation.length).toBe(3);
      expect(result.criteriaEvaluation[0].met).toBe(true);
      expect(result.criteriaEvaluation[2].met).toBe(false);
    });

    it('should default met to false when not boolean', async () => {
      setupMock({
        criteriaEvaluation: [
          { metric: 'M1', target: 'T1', actual: 'A1', met: 'yes', notes: 'Note' },
        ],
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.criteriaEvaluation[0].met).toBe(false);
    });

    it('should filter out entries without metric', async () => {
      setupMock({
        criteriaEvaluation: [
          { metric: 'Valid', target: 'T', actual: 'A', met: true, notes: '' },
          { target: 'T', actual: 'A', met: true, notes: '' },
        ],
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.criteriaEvaluation.length).toBe(1);
    });
  });

  describe('Learnings normalization', () => {
    it('should use LLM-provided learnings', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.learnings.length).toBe(2);
      expect(result.learnings[0].impactLevel).toBe('high');
    });

    it('should provide default learning when empty', async () => {
      setupMock({ learnings: [] });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.learnings.length).toBe(1);
      expect(result.learnings[0].impactLevel).toBe('medium');
    });

    it('should default invalid impactLevel to medium', async () => {
      setupMock({
        learnings: [{ insight: 'Test', action: 'Do something', impactLevel: 'extreme' }],
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.learnings[0].impactLevel).toBe('medium');
    });

    it('should accept all valid impact levels', async () => {
      for (const level of IMPACT_LEVELS) {
        setupMock({
          learnings: [{ insight: 'Test', action: 'Act', impactLevel: level }],
        });
        const result = await analyzeStage24(VALID_PARAMS);
        expect(result.learnings[0].impactLevel).toBe(level);
      }
    });
  });

  describe('Launch outcome normalization', () => {
    it('should use LLM-provided assessment when valid', async () => {
      for (const assessment of OUTCOME_ASSESSMENTS) {
        setupMock({ launchOutcome: { assessment, criteriaMetRate: 50, summary: 'Test' } });
        const result = await analyzeStage24(VALID_PARAMS);
        expect(result.launchOutcome.assessment).toBe(assessment);
      }
    });

    it('should compute criteriaMetRate from criteria evaluation', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      // 2 met out of 3 = 67%
      expect(result.launchOutcome.criteriaMetRate).toBe(67);
    });

    it('should derive assessment from criteriaMetRate when LLM gives invalid', async () => {
      setupMock({
        launchOutcome: { assessment: 'invalid', criteriaMetRate: 50, summary: 'Test' },
        criteriaEvaluation: [
          { metric: 'M1', target: 'T1', actual: 'A1', met: true, notes: '' },
          { metric: 'M2', target: 'T2', actual: 'A2', met: true, notes: '' },
          { metric: 'M3', target: 'T3', actual: 'A3', met: true, notes: '' },
          { metric: 'M4', target: 'T4', actual: 'A4', met: true, notes: '' },
          { metric: 'M5', target: 'T5', actual: 'A5', met: false, notes: '' },
        ],
      });
      const result = await analyzeStage24(VALID_PARAMS);
      // 4/5 = 80% -> success
      expect(result.launchOutcome.assessment).toBe('success');
    });

    it('should assess indeterminate when no criteria', async () => {
      setupMock({
        launchOutcome: { assessment: 'invalid' },
        criteriaEvaluation: [],
      });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.launchOutcome.assessment).toBe('indeterminate');
    });
  });

  describe('Derived metrics', () => {
    it('should compute totalMetrics, metricsOnTarget, metricsBelowTarget', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.totalMetrics).toBe(5); // 1 per category
      expect(typeof result.metricsOnTarget).toBe('number');
      expect(typeof result.metricsBelowTarget).toBe('number');
      expect(result.metricsOnTarget + result.metricsBelowTarget).toBe(result.totalMetrics);
    });

    it('should report categoriesComplete when all 5 have metrics', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.categoriesComplete).toBe(true);
    });

    it('should count totalLearnings and highImpactLearnings', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.totalLearnings).toBe(2);
      expect(result.highImpactLearnings).toBe(1);
    });
  });

  describe('Output shape', () => {
    it('should return all expected fields', async () => {
      setupMock();
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result).toHaveProperty('aarrr');
      expect(result).toHaveProperty('criteriaEvaluation');
      expect(result).toHaveProperty('learnings');
      expect(result).toHaveProperty('launchOutcome');
      expect(result).toHaveProperty('totalMetrics');
      expect(result).toHaveProperty('metricsOnTarget');
      expect(result).toHaveProperty('metricsBelowTarget');
      expect(result).toHaveProperty('categoriesComplete');
      expect(result).toHaveProperty('totalLearnings');
      expect(result).toHaveProperty('highImpactLearnings');
    });
  });

  describe('Upstream data integration', () => {
    it('should include launch type in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage24(VALID_PARAMS);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('beta');
    });

    it('should include success criteria in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage24(VALID_PARAMS);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('User signups');
    });

    it('should include ventureName in prompt', async () => {
      const mockComplete = setupMock();
      await analyzeStage24({ ...VALID_PARAMS, ventureName: 'LaunchCo' });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('LaunchCo');
    });
  });

  describe('JSON parsing', () => {
    it('should handle markdown code block wrapping', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage24(VALID_PARAMS);
      expect(result.launchOutcome.assessment).toBe('partial');
    });

    it('should throw on unparseable response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('Not valid JSON');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage24(VALID_PARAMS)).rejects.toThrow('Failed to parse metrics & learning response');
    });
  });
});
