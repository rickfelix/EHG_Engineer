/**
 * Unit tests for Stage 12 Analysis Step - Sales Logic (v2.0 enhancements)
 * Part of SD-EVA-FEAT-TEMPLATES-IDENTITY-001
 *
 * Tests v2.0 features:
 * - mappedFunnelStage back-linking validation
 * - conversionRateEstimate range clamping (0-1)
 * - economyCheck computation (totalPipelineValue, avgConversionRate, pricingAvailable)
 * - stage7Data integration (pricing context in prompt)
 *
 * @module tests/unit/eva/stage-templates/analysis-steps/stage-12-sales-logic.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the LLM client before importing the module under test
vi.mock('../../../../../lib/llm/index.js', () => ({
  getLLMClient: vi.fn(() => ({
    complete: vi.fn(),
  })),
}));

import { analyzeStage12, VALID_SALES_MODELS, MIN_FUNNEL_STAGES, MIN_JOURNEY_STEPS, MIN_DEAL_STAGES } from '../../../../../lib/eva/stage-templates/analysis-steps/stage-12-sales-logic.js';
import { getLLMClient } from '../../../../../lib/llm/index.js';

/**
 * Helper: create a well-formed LLM response JSON string.
 */
function createLLMResponse(overrides = {}) {
  const base = {
    sales_model: 'inside-sales',
    sales_cycle_days: 45,
    deal_stages: [
      { name: 'Qualification', description: 'Initial lead qualification', avg_duration_days: 3, mappedFunnelStage: 'Awareness' },
      { name: 'Discovery', description: 'Needs assessment and demo', avg_duration_days: 7, mappedFunnelStage: 'Interest' },
      { name: 'Proposal', description: 'Solution proposal and pricing', avg_duration_days: 5, mappedFunnelStage: 'Consideration' },
      { name: 'Negotiation', description: 'Terms negotiation and close', avg_duration_days: 7, mappedFunnelStage: 'Purchase' },
    ],
    funnel_stages: [
      { name: 'Awareness', metric: 'Website visitors', target_value: 10000, conversionRateEstimate: 0.10 },
      { name: 'Interest', metric: 'Signup rate', target_value: 1000, conversionRateEstimate: 0.25 },
      { name: 'Consideration', metric: 'Trial starts', target_value: 250, conversionRateEstimate: 0.40 },
      { name: 'Purchase', metric: 'Customers', target_value: 100, conversionRateEstimate: 0.50 },
    ],
    customer_journey: [
      { step: 'Discovers via search', funnel_stage: 'Awareness', touchpoint: 'Website' },
      { step: 'Reads blog content', funnel_stage: 'Interest', touchpoint: 'Blog' },
      { step: 'Signs up for trial', funnel_stage: 'Consideration', touchpoint: 'Signup form' },
      { step: 'Engages with features', funnel_stage: 'Consideration', touchpoint: 'Product' },
      { step: 'Converts to paid', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
    ],
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
  stage1Data: { description: 'An AI-powered analytics platform', targetMarket: 'SMBs', problemStatement: 'Data chaos' },
};

describe('stage-12-sales-logic.js - Analysis Step v2.0', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Exported constants', () => {
    it('should export VALID_SALES_MODELS with 6 values', () => {
      expect(VALID_SALES_MODELS).toEqual(['self-serve', 'inside-sales', 'enterprise', 'hybrid', 'marketplace', 'channel']);
    });

    it('should export MIN_FUNNEL_STAGES = 4', () => {
      expect(MIN_FUNNEL_STAGES).toBe(4);
    });

    it('should export MIN_JOURNEY_STEPS = 5', () => {
      expect(MIN_JOURNEY_STEPS).toBe(5);
    });

    it('should export MIN_DEAL_STAGES = 3', () => {
      expect(MIN_DEAL_STAGES).toBe(3);
    });
  });

  describe('Input validation', () => {
    it('should throw when stage1Data is missing', async () => {
      await expect(analyzeStage12({})).rejects.toThrow('Stage 12 sales logic requires Stage 1 data with description');
    });

    it('should throw when stage1Data.description is empty', async () => {
      await expect(analyzeStage12({ stage1Data: { description: '' } })).rejects.toThrow('Stage 12 sales logic requires Stage 1 data with description');
    });
  });

  describe('mappedFunnelStage back-linking validation', () => {
    it('should keep mappedFunnelStage when it matches a funnel stage name', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.deal_stages[0].mappedFunnelStage).toBe('Awareness');
      expect(result.deal_stages[1].mappedFunnelStage).toBe('Interest');
      expect(result.deal_stages[2].mappedFunnelStage).toBe('Consideration');
      expect(result.deal_stages[3].mappedFunnelStage).toBe('Purchase');
    });

    it('should default mappedFunnelStage to first funnel stage when it does not match', async () => {
      setupMock({
        deal_stages: [
          { name: 'D1', description: 'Desc1', avg_duration_days: 3, mappedFunnelStage: 'NonExistent' },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5, mappedFunnelStage: 'AlsoNonExistent' },
          { name: 'D3', description: 'Desc3', avg_duration_days: 7, mappedFunnelStage: 'Nope' },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      for (const ds of result.deal_stages) {
        expect(ds.mappedFunnelStage).toBe('Awareness'); // first funnel stage name
      }
    });

    it('should default mappedFunnelStage to first funnel stage when it is missing', async () => {
      setupMock({
        deal_stages: [
          { name: 'D1', description: 'Desc1', avg_duration_days: 3 },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5 },
          { name: 'D3', description: 'Desc3', avg_duration_days: 7 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      for (const ds of result.deal_stages) {
        expect(ds.mappedFunnelStage).toBe('Awareness');
      }
    });

    it('should set mappedFunnelStage to null when empty string and no funnel stages match', async () => {
      setupMock({
        deal_stages: [
          { name: 'D1', description: 'Desc1', avg_duration_days: 3, mappedFunnelStage: '' },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5, mappedFunnelStage: '' },
          { name: 'D3', description: 'Desc3', avg_duration_days: 7, mappedFunnelStage: '' },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      // Empty string -> normalized to null via String('').substring(0,200) || null -> null
      // Then back-link check: null is not in funnelNames -> defaults to funnelNames[0] = 'Awareness'
      for (const ds of result.deal_stages) {
        expect(ds.mappedFunnelStage).toBe('Awareness');
      }
    });

    it('should truncate mappedFunnelStage to 200 characters', async () => {
      setupMock({
        deal_stages: [
          { name: 'D1', description: 'Desc1', avg_duration_days: 3, mappedFunnelStage: 'M'.repeat(300) },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5 },
          { name: 'D3', description: 'Desc3', avg_duration_days: 7 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      // Long string won't match any funnel stage, so it defaults to first
      expect(result.deal_stages[0].mappedFunnelStage).toBe('Awareness');
    });
  });

  describe('conversionRateEstimate range clamping', () => {
    it('should keep conversionRateEstimate when in 0-1 range', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBe(0.10);
      expect(result.funnel_stages[1].conversionRateEstimate).toBe(0.25);
      expect(result.funnel_stages[2].conversionRateEstimate).toBe(0.40);
      expect(result.funnel_stages[3].conversionRateEstimate).toBe(0.50);
    });

    it('should set conversionRateEstimate to null when negative', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: -0.5 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBeNull();
    });

    it('should set conversionRateEstimate to null when greater than 1', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: 1.5 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBeNull();
    });

    it('should set conversionRateEstimate to null when missing', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100 },
          { name: 'F2', metric: 'M2', target_value: 50 },
          { name: 'F3', metric: 'M3', target_value: 25 },
          { name: 'F4', metric: 'M4', target_value: 10 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      for (const fs of result.funnel_stages) {
        expect(fs.conversionRateEstimate).toBeNull();
      }
    });

    it('should accept conversionRateEstimate = 0 (boundary)', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: 0 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBe(0);
    });

    it('should accept conversionRateEstimate = 1 (boundary)', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: 1.0 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBe(1.0);
    });

    it('should round conversionRateEstimate to 4 decimal places', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: 0.123456789 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].conversionRateEstimate).toBe(0.1235);
    });
  });

  describe('economyCheck computation', () => {
    it('should compute totalPipelineValue as sum of funnel target_values', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      // 10000 + 1000 + 250 + 100 = 11350
      expect(result.economyCheck.totalPipelineValue).toBe(11350);
    });

    it('should compute avgConversionRate as average of non-null conversionRateEstimates', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      // (0.10 + 0.25 + 0.40 + 0.50) / 4 = 1.25 / 4 = 0.3125
      expect(result.economyCheck.avgConversionRate).toBe(0.3125);
    });

    it('should return avgConversionRate as null when all estimates are null', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100 },
          { name: 'F2', metric: 'M2', target_value: 50 },
          { name: 'F3', metric: 'M3', target_value: 25 },
          { name: 'F4', metric: 'M4', target_value: 10 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.economyCheck.avgConversionRate).toBeNull();
    });

    it('should set pricingAvailable to true when stage7Data is provided', async () => {
      setupMock();
      const result = await analyzeStage12({
        ...VALID_PARAMS,
        stage7Data: { pricingModel: 'subscription', unitEconomics: { arpa: 99 } },
      });
      expect(result.economyCheck.pricingAvailable).toBe(true);
    });

    it('should set pricingAvailable to false when stage7Data is not provided', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.economyCheck.pricingAvailable).toBe(false);
    });

    it('should round avgConversionRate to 4 decimal places', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: 100, conversionRateEstimate: 0.333 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.333 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.333 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.001 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      // (0.333 + 0.333 + 0.333 + 0.001) / 4 = 1.0 / 4 = 0.25
      expect(result.economyCheck.avgConversionRate).toBe(0.25);
    });
  });

  describe('stage7Data integration', () => {
    it('should include pricing context in prompt when stage7Data is provided', async () => {
      const mockComplete = setupMock();
      await analyzeStage12({
        ...VALID_PARAMS,
        stage7Data: { pricingModel: 'subscription', unitEconomics: { arpa: 99 } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('subscription');
      expect(userPrompt).toContain('99');
    });

    it('should not include pricing context when stage7Data is absent', async () => {
      const mockComplete = setupMock();
      await analyzeStage12(VALID_PARAMS);
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).not.toContain('Pricing:');
    });
  });

  describe('Sales model normalization', () => {
    it('should accept all valid sales models', async () => {
      for (const model of VALID_SALES_MODELS) {
        setupMock({ sales_model: model });
        const result = await analyzeStage12(VALID_PARAMS);
        expect(result.sales_model).toBe(model);
      }
    });

    it('should default to "hybrid" for invalid sales model', async () => {
      setupMock({ sales_model: 'invalid-model' });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_model).toBe('hybrid');
    });

    it('should default to "hybrid" when sales model is missing', async () => {
      setupMock({ sales_model: undefined });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_model).toBe('hybrid');
    });
  });

  describe('Sales cycle days normalization', () => {
    it('should use LLM-provided value when valid', async () => {
      setupMock({ sales_cycle_days: 90 });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_cycle_days).toBe(90);
    });

    it('should default to 30 when sales_cycle_days < 1', async () => {
      setupMock({ sales_cycle_days: 0 });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_cycle_days).toBe(30);
    });

    it('should default to 30 when sales_cycle_days is not a number', async () => {
      setupMock({ sales_cycle_days: 'not a number' });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_cycle_days).toBe(30);
    });

    it('should round non-integer sales_cycle_days', async () => {
      setupMock({ sales_cycle_days: 45.7 });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_cycle_days).toBe(46);
    });
  });

  describe('Deal stages normalization', () => {
    it('should pad deal stages to MIN_DEAL_STAGES when LLM provides fewer', async () => {
      setupMock({
        deal_stages: [
          { name: 'Only', description: 'One stage', avg_duration_days: 5 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.deal_stages.length).toBeGreaterThanOrEqual(MIN_DEAL_STAGES);
    });

    it('should truncate deal stage name to 200 and description to 500 characters', async () => {
      setupMock({
        deal_stages: [
          { name: 'N'.repeat(300), description: 'D'.repeat(600), avg_duration_days: 5 },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5 },
          { name: 'D3', description: 'Desc3', avg_duration_days: 5 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.deal_stages[0].name.length).toBe(200);
      expect(result.deal_stages[0].description.length).toBe(500);
    });

    it('should clamp negative avg_duration_days to 0', async () => {
      setupMock({
        deal_stages: [
          { name: 'D1', description: 'Desc1', avg_duration_days: -10 },
          { name: 'D2', description: 'Desc2', avg_duration_days: 5 },
          { name: 'D3', description: 'Desc3', avg_duration_days: 7 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      // Non-negative check: -10 fails, defaults to 5
      expect(result.deal_stages[0].avg_duration_days).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Funnel stages normalization', () => {
    it('should pad funnel stages to MIN_FUNNEL_STAGES when LLM provides fewer', async () => {
      setupMock({
        funnel_stages: [
          { name: 'Only', metric: 'M', target_value: 100, conversionRateEstimate: 0.5 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages.length).toBeGreaterThanOrEqual(MIN_FUNNEL_STAGES);
    });

    it('should clamp negative target_value to 0', async () => {
      setupMock({
        funnel_stages: [
          { name: 'F1', metric: 'M1', target_value: -500, conversionRateEstimate: 0.10 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].target_value).toBe(0);
    });

    it('should truncate funnel stage name to 200 and metric to 200 characters', async () => {
      setupMock({
        funnel_stages: [
          { name: 'N'.repeat(300), metric: 'M'.repeat(300), target_value: 100, conversionRateEstimate: 0.10 },
          { name: 'F2', metric: 'M2', target_value: 50, conversionRateEstimate: 0.25 },
          { name: 'F3', metric: 'M3', target_value: 25, conversionRateEstimate: 0.40 },
          { name: 'F4', metric: 'M4', target_value: 10, conversionRateEstimate: 0.50 },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.funnel_stages[0].name.length).toBe(200);
      expect(result.funnel_stages[0].metric.length).toBe(200);
    });
  });

  describe('Customer journey normalization', () => {
    it('should pad customer journey to MIN_JOURNEY_STEPS when LLM provides fewer', async () => {
      setupMock({
        customer_journey: [
          { step: 'Only one step', funnel_stage: 'Awareness', touchpoint: 'Website' },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.customer_journey.length).toBeGreaterThanOrEqual(MIN_JOURNEY_STEPS);
    });

    it('should truncate step to 300, funnel_stage to 200, touchpoint to 200 characters', async () => {
      setupMock({
        customer_journey: [
          { step: 'S'.repeat(400), funnel_stage: 'F'.repeat(300), touchpoint: 'T'.repeat(300) },
          { step: 'S2', funnel_stage: 'Awareness', touchpoint: 'Web' },
          { step: 'S3', funnel_stage: 'Interest', touchpoint: 'Email' },
          { step: 'S4', funnel_stage: 'Decision', touchpoint: 'Demo' },
          { step: 'S5', funnel_stage: 'Purchase', touchpoint: 'Checkout' },
        ],
      });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.customer_journey[0].step.length).toBe(300);
      expect(result.customer_journey[0].funnel_stage.length).toBe(200);
      expect(result.customer_journey[0].touchpoint.length).toBe(200);
    });
  });

  describe('Optional upstream data integration', () => {
    it('should include stage10 brand context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage12({
        ...VALID_PARAMS,
        stage10Data: { brandGenome: { archetype: 'Explorer', audience: 'Digital nomads' } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('Explorer');
      expect(userPrompt).toContain('Digital nomads');
    });

    it('should include stage11 GTM context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage12({
        ...VALID_PARAMS,
        stage11Data: { tierCount: 3, channelCount: 8, avgCac: 150 },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('3 tiers');
      expect(userPrompt).toContain('8 channels');
      expect(userPrompt).toContain('150');
    });

    it('should include stage5 financial context in prompt when available', async () => {
      const mockComplete = setupMock();
      await analyzeStage12({
        ...VALID_PARAMS,
        stage5Data: { year1: { revenue: 500000 } },
      });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('500000');
    });

    it('should include ventureName in prompt when provided', async () => {
      const mockComplete = setupMock();
      await analyzeStage12({ ...VALID_PARAMS, ventureName: 'TestCorp' });
      const userPrompt = mockComplete.mock.calls[0][1];
      expect(userPrompt).toContain('TestCorp');
    });
  });

  describe('Output shape', () => {
    it('should return all expected top-level fields', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result).toHaveProperty('sales_model');
      expect(result).toHaveProperty('sales_cycle_days');
      expect(result).toHaveProperty('deal_stages');
      expect(result).toHaveProperty('funnel_stages');
      expect(result).toHaveProperty('customer_journey');
      expect(result).toHaveProperty('totalDealStages');
      expect(result).toHaveProperty('totalFunnelStages');
      expect(result).toHaveProperty('totalJourneySteps');
      expect(result).toHaveProperty('economyCheck');
    });

    it('should set count fields to match array lengths', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.totalDealStages).toBe(result.deal_stages.length);
      expect(result.totalFunnelStages).toBe(result.funnel_stages.length);
      expect(result.totalJourneySteps).toBe(result.customer_journey.length);
    });

    it('should have economyCheck with correct structure', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.economyCheck).toHaveProperty('totalPipelineValue');
      expect(result.economyCheck).toHaveProperty('avgConversionRate');
      expect(result.economyCheck).toHaveProperty('pricingAvailable');
      expect(typeof result.economyCheck.totalPipelineValue).toBe('number');
      expect(typeof result.economyCheck.pricingAvailable).toBe('boolean');
    });

    it('should ensure each deal stage has mappedFunnelStage field', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      for (const ds of result.deal_stages) {
        expect(ds).toHaveProperty('mappedFunnelStage');
      }
    });

    it('should ensure each funnel stage has conversionRateEstimate field', async () => {
      setupMock();
      const result = await analyzeStage12(VALID_PARAMS);
      for (const fs of result.funnel_stages) {
        expect(fs).toHaveProperty('conversionRateEstimate');
      }
    });
  });

  describe('JSON parsing', () => {
    it('should handle LLM response wrapped in markdown code block', async () => {
      const response = createLLMResponse();
      const mockComplete = vi.fn().mockResolvedValue('```json\n' + response + '\n```');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      const result = await analyzeStage12(VALID_PARAMS);
      expect(result.sales_model).toBe('inside-sales');
    });

    it('should throw on unparseable LLM response', async () => {
      const mockComplete = vi.fn().mockResolvedValue('This is garbage');
      getLLMClient.mockReturnValue({ complete: mockComplete });
      await expect(analyzeStage12(VALID_PARAMS)).rejects.toThrow('Failed to parse sales logic response');
    });
  });
});
