/**
 * SD-LEO-INFRA-AI-FINANCIAL-RIGOR-CONTROLS-001 (FR-3 objective correctness) — the EVA S16 producer.
 *
 * RCA: runway_months = initial_capital / monthly_burn_rate (flat month-1 burn, ignoring revenue + the
 * growing burn); cost breakdowns never validated to sum to costs; capital taken verbatim from the LLM.
 * This locks: trough-based runway, deterministic symbolic cross-checks (validation_errors +
 * financials_valid), and bottom-up recommended_initial_capital + under-capitalization warning.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ fin: {} }));
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: () => ({ complete: async () => ({ content: JSON.stringify(h.fin) }) }),
}));

import { analyzeStage16 } from '../../../lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const stage1 = { description: 'A SaaS venture', targetMarket: 'SMBs', problemStatement: 'manual ops' };

function runWith(fin) {
  h.fin = fin;
  return analyzeStage16({ stage1Data: stage1, stage13Data: {}, stage14Data: {}, stage15Data: {}, ventureName: 'T', logger: silent });
}

const cb = (total) => ({ personnel: total * 0.6, infrastructure: total * 0.2, marketing: total * 0.1, other: total * 0.1 });

describe('FR-1 runway is trough-based, not the flat month-1 burn', () => {
  it('runway reflects the cash-balance trough (growing burn) — shorter than initial_capital/burn_rate', async () => {
    // initial 50000, flat burn 8000 -> flat runway would be 6.25. Growing costs drive cash negative in month 3.
    const fin = {
      initial_capital: 50000,
      monthly_burn_rate: 8000,
      revenue_projections: [
        { month: 1, revenue: 1000, costs: 15000, cost_breakdown: cb(15000) }, // bal 36000
        { month: 2, revenue: 1500, costs: 18000, cost_breakdown: cb(18000) }, // bal 19500
        { month: 3, revenue: 2000, costs: 22000, cost_breakdown: cb(22000) }, // bal -500 -> negative
        { month: 4, revenue: 2500, costs: 24000, cost_breakdown: cb(24000) },
      ],
    };
    const r = await runWith(fin);
    expect(r.runway_months).toBe(2); // two months of non-negative cash before insolvency
    expect(r.runway_months).toBeLessThan(50000 / 8000); // strictly shorter than the old flat calc (6.25)
  });
});

describe('FR-2 symbolic cross-checks reject + flag inconsistent financials', () => {
  it('a cost_breakdown that does not sum to costs records a validation_error + financials_valid=false', async () => {
    const fin = {
      initial_capital: 100000, monthly_burn_rate: 5000,
      revenue_projections: [
        { month: 1, revenue: 4000, costs: 15000, cost_breakdown: { personnel: 5000, infrastructure: 2000, marketing: 1000, other: 1000 } }, // sums to 9000 != 15000
      ],
    };
    const r = await runWith(fin);
    expect(r.financials_valid).toBe(false);
    expect(r.validation_errors.length).toBeGreaterThan(0);
    expect(r.validation_errors[0]).toMatch(/cost_breakdown/i);
  });

  it('a reconciling breakdown yields financials_valid=true and no validation_errors', async () => {
    const fin = {
      initial_capital: 100000, monthly_burn_rate: 5000,
      revenue_projections: [
        { month: 1, revenue: 4000, costs: 15000, cost_breakdown: cb(15000) },
        { month: 2, revenue: 6000, costs: 14000, cost_breakdown: cb(14000) },
      ],
    };
    const r = await runWith(fin);
    expect(r.financials_valid).toBe(true);
    expect(r.validation_errors).toEqual([]);
  });
});

describe('FR-3 capital is sized bottom-up with an under-capitalization warning', () => {
  it('recommended_initial_capital covers the cash trough; an LLM capital below it warns', async () => {
    // initial 10000 but the cumulative deficit needs far more -> under-capitalized.
    const fin = {
      initial_capital: 10000, monthly_burn_rate: 9000,
      revenue_projections: [
        { month: 1, revenue: 500, costs: 12000, cost_breakdown: cb(12000) }, // bal -1500
        { month: 2, revenue: 800, costs: 13000, cost_breakdown: cb(13000) }, // bal -13700
        { month: 3, revenue: 1200, costs: 14000, cost_breakdown: cb(14000) }, // bal -26500 (trough)
      ],
    };
    const r = await runWith(fin);
    expect(r.recommended_initial_capital).toBeGreaterThan(r.initial_capital);
    expect(r.under_capitalized).toBe(true);
    expect(r.viability_warnings.some(w => /under-capitalized/i.test(w))).toBe(true);
  });

  it('an adequately capitalized venture is NOT flagged under-capitalized', async () => {
    const fin = {
      initial_capital: 200000, monthly_burn_rate: 8000,
      revenue_projections: [
        { month: 1, revenue: 5000, costs: 12000, cost_breakdown: cb(12000) },
        { month: 2, revenue: 9000, costs: 12000, cost_breakdown: cb(12000) },
      ],
    };
    const r = await runWith(fin);
    expect(r.under_capitalized).toBe(false);
  });
});
