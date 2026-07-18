/**
 * Modeling Module Tests
 *
 * Tests the horizontal forecasting infrastructure:
 * - generateForecast (LLM-powered financial projections)
 * - calculateVentureScore (scoring from forecast data)
 * - reference-data injection (SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-C)
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-J
 */

import { describe, test, expect, vi } from 'vitest';
import {
  generateForecast,
  calculateVentureScore,
  formatReferenceDataForPrompt,
  loadReferenceData,
  REFERENCE_DATA_ENTRY_TYPES,
  ESTIMATION_METHOD_RULES,
} from '../../lib/eva/stage-zero/modeling.js';

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
  const client = {
    _model: 'mock-model',
    // New LLM-client interface (client.complete) — returns the same JSON text
    complete: vi.fn(async () => {
      const res = await client.messages.create();
      return res.content[0].text;
    }),
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
          cost_breakdown: { build: 10000, run_monthly: 2500 },
          timeline: { mvp_weeks: 9 },
          confidence: 72,
          key_assumptions: ['SMBs will pay $30-80/mo for review management', 'AI accuracy exceeds 85%'],
          summary: 'Moderate complexity venture with strong unit economics. Break-even in ~12 months realistic.',
        }) }],
      }),
    },
  };
  return client;
}

// ── Mock Supabase (reference-data reader) ──────────────────────────────

function createMockSupabase({ data = [], error = null } = {}) {
  const calls = { from: [], select: [], eq: [], in: [] };
  const builder = {
    select: vi.fn(function select(cols) { calls.select.push(cols); return builder; }),
    eq: vi.fn(function eq(col, val) { calls.eq.push([col, val]); return builder; }),
    in: vi.fn(function inFn(col, vals) { calls.in.push([col, vals]); return Promise.resolve({ data, error }); }),
  };
  return {
    from: vi.fn(function from(table) { calls.from.push(table); return builder; }),
    _calls: calls,
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
      complete: vi.fn().mockRejectedValue(new Error('Rate limited')),
      messages: { create: vi.fn().mockRejectedValue(new Error('Rate limited')) },
    };

    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.component).toBe('forecast');
    expect(result.confidence).toBe(0);
    expect(result.revenue_projections.year_1.realistic).toBe(0);
    expect(result.summary).toContain('Rate limited');
    // H7 (Delta-ledger 41a2e6da): confidence:0 alone doesn't distinguish "genuinely
    // scored zero" from "the forecast failed" — _failed makes that explicit.
    expect(result._failed).toBe(true);
  });

  test('handles non-JSON response', async () => {
    const llmClient = {
      _model: 'mock-model',
      complete: vi.fn(async () => 'I need more information to generate projections.'),
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ text: 'I need more information to generate projections.' }],
        }),
      },
    };

    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    expect(result.confidence).toBe(0);
    expect(result.summary).toContain('Could not parse');
    expect(result._failed).toBe(true);
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
      cost_breakdown: { build: 5000 },
      timeline: { mvp_weeks: 6 },
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

// ── Reference-Data Injection Tests (SD-LEO-INFRA-RESEARCH-INTELLIGENCE-OPERATOR-001-C) ──

describe('Modeling - reference-data injection', () => {
  const REFERENCE_ROWS = [
    { entry_type: 'market_size', subject: 'review_mgmt_smb', payload: { tam_usd: '5B-9B' }, source_refs: ['yt-abc'], confidence: 'medium', is_current: true },
    { entry_type: 'unit_economics', subject: 'smb_saas_cac', payload: { cac_usd: '20-60' }, confidence: 'low', is_current: true },
  ];

  test('injects supplied reference data into the forecast prompt (TS-1)', async () => {
    const llmClient = createMockLLMClient();
    await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient, referenceData: REFERENCE_ROWS });

    const prompt = llmClient.complete.mock.calls[0][1];
    expect(prompt).toContain('REFERENCE DATA');
    expect(prompt).toContain('review_mgmt_smb');
    expect(prompt).toContain('smb_saas_cac');
    expect(prompt).toContain('tam_usd');
  });

  test('honest-idle: no reference data leaves the prompt unguided but keeps estimation rules (TS-2)', async () => {
    const llmClient = createMockLLMClient();
    const result = await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    const prompt = llmClient.complete.mock.calls[0][1];
    expect(prompt).not.toContain('REFERENCE DATA');
    expect(prompt).toContain('ESTIMATION METHOD');
    // Backward-compatible output shape preserved
    expect(result.component).toBe('forecast');
    expect(result.confidence).toBe(72);
  });

  test('reads reference data via deps.supabase when referenceData is not supplied', async () => {
    const llmClient = createMockLLMClient();
    const supabase = createMockSupabase({
      data: [{ entry_type: 'comparables', subject: 'comp_x', payload: { note: 'peer set' }, is_current: true }],
    });

    await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient, supabase });

    expect(supabase.from).toHaveBeenCalledWith('research_intelligence_reference');
    const prompt = llmClient.complete.mock.calls[0][1];
    expect(prompt).toContain('comp_x');
  });

  test('injected referenceData takes precedence over supabase read', async () => {
    const llmClient = createMockLLMClient();
    const supabase = createMockSupabase({ data: [{ entry_type: 'market_size', subject: 'db_row', payload: {}, is_current: true }] });

    await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient, supabase, referenceData: REFERENCE_ROWS });

    // Supabase should not be queried when referenceData is already supplied
    expect(supabase.from).not.toHaveBeenCalled();
    const prompt = llmClient.complete.mock.calls[0][1];
    expect(prompt).toContain('review_mgmt_smb');
    expect(prompt).not.toContain('db_row');
  });

  test('estimation-method rules are present in the prompt (TS-5)', async () => {
    const llmClient = createMockLLMClient();
    await generateForecast(SAMPLE_BRIEF, { logger: silentLogger, llmClient });

    const prompt = llmClient.complete.mock.calls[0][1];
    expect(prompt).toContain('Ranges, never bare points');
    expect(prompt).toContain('Fermi decomposition');
    expect(prompt).toContain('Explicit assumptions');
    expect(prompt).toContain('Reference-class base rates');
  });
});

// ── formatReferenceDataForPrompt Tests (TS-3) ──────────────────────────────

describe('Modeling - formatReferenceDataForPrompt', () => {
  test('returns empty string for empty, null, and undefined input', () => {
    expect(formatReferenceDataForPrompt([])).toBe('');
    expect(formatReferenceDataForPrompt(null)).toBe('');
    expect(formatReferenceDataForPrompt(undefined)).toBe('');
    expect(formatReferenceDataForPrompt('not-an-array')).toBe('');
  });

  test('filters to Child-C economic families and excludes Child B landscape rows', () => {
    const mixed = [
      { entry_type: 'market_size', subject: 'ms1', payload: {}, is_current: true },
      { entry_type: 'tech_landscape', subject: 'tl1', payload: {}, is_current: true },
      { entry_type: 'model_landscape', subject: 'ml1', payload: {}, is_current: true },
      { entry_type: 'comparables', subject: 'cmp1', payload: {}, is_current: true },
    ];
    const block = formatReferenceDataForPrompt(mixed);
    expect(block).toContain('ms1');
    expect(block).toContain('cmp1');
    expect(block).not.toContain('tl1');
    expect(block).not.toContain('ml1');
  });

  test('excludes non-current (superseded) rows', () => {
    const rows = [
      { entry_type: 'unit_economics', subject: 'ue_current', payload: {}, is_current: true },
      { entry_type: 'unit_economics', subject: 'ue_old', payload: {}, is_current: false },
    ];
    const block = formatReferenceDataForPrompt(rows);
    expect(block).toContain('ue_current');
    expect(block).not.toContain('ue_old');
  });

  test('renders subject, confidence, and payload for each entry', () => {
    const block = formatReferenceDataForPrompt([
      { entry_type: 'market_size', subject: 'sizing_x', payload: { tam: '1B' }, confidence: 'high', source_refs: ['a', 'b'], is_current: true },
    ]);
    expect(block).toContain('sizing_x');
    expect(block).toContain('high');
    expect(block).toContain('tam');
    expect(block).toContain('sources: 2');
  });

  test('REFERENCE_DATA_ENTRY_TYPES matches the Child-C read family', () => {
    expect([...REFERENCE_DATA_ENTRY_TYPES]).toEqual(['market_size', 'unit_economics', 'comparables']);
  });
});

// ── loadReferenceData Tests (TS-4) ──────────────────────────────

describe('Modeling - loadReferenceData', () => {
  test('queries the standing table filtering is_current and Child-C entry types', async () => {
    const supabase = createMockSupabase({ data: [{ entry_type: 'market_size', subject: 's', is_current: true }] });
    const rows = await loadReferenceData(supabase, { logger: silentLogger });

    expect(supabase._calls.from).toContain('research_intelligence_reference');
    expect(supabase._calls.eq).toContainEqual(['is_current', true]);
    expect(supabase._calls.in).toContainEqual(['entry_type', REFERENCE_DATA_ENTRY_TYPES]);
    expect(rows).toHaveLength(1);
  });

  test('returns [] on query error without throwing', async () => {
    const supabase = createMockSupabase({ error: { message: 'boom' } });
    const rows = await loadReferenceData(supabase, { logger: silentLogger });
    expect(rows).toEqual([]);
  });

  test('returns [] for a missing or malformed client', async () => {
    expect(await loadReferenceData(null, { logger: silentLogger })).toEqual([]);
    expect(await loadReferenceData({}, { logger: silentLogger })).toEqual([]);
  });
});

// ── ESTIMATION_METHOD_RULES ──────────────────────────────

describe('Modeling - ESTIMATION_METHOD_RULES', () => {
  test('encodes the parent SD Modeling Estimation Method appendix', () => {
    expect(ESTIMATION_METHOD_RULES).toContain('Ranges, never bare points');
    expect(ESTIMATION_METHOD_RULES).toContain('Fermi decomposition');
    expect(ESTIMATION_METHOD_RULES).toContain('Explicit assumptions');
    expect(ESTIMATION_METHOD_RULES).toContain('Reference-class base rates');
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
