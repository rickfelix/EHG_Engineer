/**
 * Modeling Module Tests
 *
 * Tests the horizontal forecasting infrastructure:
 * - generateForecast (LLM-powered financial projections)
 * - calculateVentureScore (scoring from forecast data)
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J
 */

import { describe, test, expect, vi } from 'vitest';
import { generateForecast, calculateVentureScore } from '../../lib/eva/stage-zero/modeling.js';

// ── Test Data ──────────────────────────────────────────

const SAMPLE_BRIEF = {
  name: 'AutoReview AI',
  problem_statement: 'Businesses lose revenue from unmanaged reputation signals',
  solution: 'AI-powered review management platform',
  target_market: 'Small businesses',
  origin_type: 'competitor_teardown',
  raw_chairman_intent: 'Businesses struggle to manage online reviews',
  maturity: 'ready',
  metadata: {
    path: 'competitor_teardown',
    synthesis: {
      build_cost: { complexity: 'moderate', timeline_weeks: { realistic: 9 } },
      archetypes: { primary_archetype: 'automator' },
      time_horizon: { position: 'build_now' },
    },
  },
};

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

// ── Mock LLM Client ──────────────────────────────

function createMockLLMClient(overrideResponse = null) {
  return {
    _model: 'mock-model',
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ text: JSON.stringify(overrideResponse || {
          market_sizing: {
            tam: { value: 5000000000, unit: 'USD', rationale: 'Global review management' },
            sam: { value: 500000000, unit: 'USD', rationale: 'SMB segment' },
            som: { value: 10000000, unit: 'USD', rationale: 'Year 3 target' },
          },
          revenue_projections: {
            year_1: { optimistic: 150000, realistic: 60000, pessimistic: 15000 },
            year_2: { optimistic: 700000, realistic: 250000, pessimistic: 80000 },
            year_3: { optimistic: 2500000, realistic: 900000, pessimistic: 250000 },
          },
          unit_economics: {
            cac: { optimistic: 12, realistic: 35, pessimistic: 75 },
            ltv: { optimistic: 700, realistic: 400, pessimistic: 180 },
            ltv_cac_ratio: { optimistic: 58.3, realistic: 11.4, pessimistic: 2.4 },
            payback_months: { optimistic: 1, realistic: 4, pessimistic: 10 },
          },
          growth_trajectory: {
            month_3_users: { optimistic: 300, realistic: 80, pessimistic: 15 },
            month_6_users: { optimistic: 1500, realistic: 300, pessimistic: 60 },
            month_12_users: { optimistic: 8000, realistic: 1200, pessimistic: 200 },
            growth_model: 'content-led with viral referral loop',
          },
          break_even: {
            months_to_break_even: { optimistic: 6, realistic: 12, pessimistic: 22 },
            monthly_burn_at_launch: 2500,
            monthly_burn_at_scale: 7000,
          },
          confidence: 72,
          key_assumptions: ['SMBs will pay $30-80/mo for review management', 'AI accuracy exceeds 85%'],
          summary: 'Moderate complexity venture with strong unit economics. Break-even in ~12 months realistic.',
        }) }],
      }),
    },
  };
}

// ── generateForecast Tests ──────────────────────────────

describe('Modeling - generateForecast', () => {
  test('returns complete forecast with all sections', async () => {
    const llmClient = createMockLLMClient();
    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.component).toBe('forecast');
    expect(result.market_sizing.tam.value).toBe(5000000000);
    expect(result.market_sizing.sam.value).toBe(500000000);
    expect(result.revenue_projections.year_1.realistic).toBe(60000);
    expect(result.revenue_projections.year_2.realistic).toBe(250000);
    expect(result.unit_economics.ltv_cac_ratio.realistic).toBe(11.4);
    expect(result.growth_trajectory.growth_model).toContain('content-led');
    expect(result.break_even.months_to_break_even.realistic).toBe(12);
    expect(result.confidence).toBe(72);
    expect(result.key_assumptions).toHaveLength(2);
  });

  test('handles LLM error gracefully', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: { create: vi.fn().mockRejectedValue(new Error('Rate limited')) },
    };

    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.component).toBe('forecast');
    expect(result.confidence).toBe(0);
    expect(result.revenue_projections.year_1.realistic).toBe(0);
    expect(result.summary).toContain('Rate limited');
  });

  test('handles non-JSON response', async () => {
    const llmClient = {
      _model: 'mock-model',
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I need more information to generate projections.' }],
        }),
      },
    };

    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.confidence).toBe(0);
    expect(result.summary).toContain('Could not parse');
  });

  test('handles brief without synthesis metadata', async () => {
    const briefNoSynthesis = { ...SAMPLE_BRIEF, metadata: {} };
    const llmClient = createMockLLMClient();

    const result = await generateForecast(briefNoSynthesis, { logger: silentLogger, llmClient });

    expect(result.component).toBe('forecast');
    expect(result.confidence).toBe(72);
  });

  test('handles partial LLM response', async () => {
    const llmClient = createMockLLMClient({
      revenue_projections: {
        year_1: { optimistic: 100000, realistic: 50000, pessimistic: 10000 },
      },
      confidence: 40,
      summary: 'Partial forecast.',
    });

    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.revenue_projections.year_1.realistic).toBe(50000);
    // Missing fields get defaults
    expect(result.market_sizing.tam.value).toBe(0);
    expect(result.unit_economics.cac.realistic).toBe(0);
  });
});

// ── calculateVentureScore Tests ──────────────────────────────

describe('Modeling - calculateVentureScore', () => {
  test('calculates score from realistic projections', () => {
    const forecast = {
      revenue_projections: {
        year_2: { optimistic: 700000, realistic: 250000, pessimistic: 80000 },
      },
      unit_economics: {
        ltv_cac_ratio: { optimistic: 58.3, realistic: 8.75, pessimistic: 2.4 },
      },
      break_even: {
        months_to_break_even: { optimistic: 6, realistic: 14, pessimistic: 22 },
      },
      confidence: 72,
    };

    const score = calculateVentureScore(forecast);

    // Revenue: (250000/250000)*35 = 35
    // LTV/CAC: (8.75/8.75)*30 = 30
    // Break-even: ((36-14)/22)*20 = 20
    // Confidence: (72/100)*15 = 10.8 ≈ 11
    expect(score).toBe(96);
  });

  test('returns 0 for null forecast', () => {
    expect(calculateVentureScore(null)).toBe(0);
  });

  test('returns 0 for zero confidence', () => {
    const forecast = {
      revenue_projections: { year_2: { realistic: 100000 } },
      unit_economics: { ltv_cac_ratio: { realistic: 5 } },
      break_even: { months_to_break_even: { realistic: 20 } },
      confidence: 0,
    };

    expect(calculateVentureScore(forecast)).toBe(0);
  });

  test('caps score at 100', () => {
    const forecast = {
      revenue_projections: { year_2: { realistic: 1000000 } },
      unit_economics: { ltv_cac_ratio: { realistic: 50 } },
      break_even: { months_to_break_even: { realistic: 3 } },
      confidence: 100,
    };

    const score = calculateVentureScore(forecast);
    expect(score).toBeLessThanOrEqual(100);
  });

  test('handles missing fields gracefully', () => {
    const forecast = { confidence: 50 };
    const score = calculateVentureScore(forecast);

    // Revenue: 0, LTV/CAC: 0, Break-even: 0 (defaults to 36 → score 0), Confidence: 8
    expect(score).toBe(8);
  });

  test('penalizes slow break-even', () => {
    const fastBE = {
      revenue_projections: { year_2: { realistic: 250000 } },
      unit_economics: { ltv_cac_ratio: { realistic: 8.75 } },
      break_even: { months_to_break_even: { realistic: 6 } },
      confidence: 72,
    };
    const slowBE = {
      ...fastBE,
      break_even: { months_to_break_even: { realistic: 30 } },
    };

    expect(calculateVentureScore(fastBE)).toBeGreaterThan(calculateVentureScore(slowBE));
  });
});
