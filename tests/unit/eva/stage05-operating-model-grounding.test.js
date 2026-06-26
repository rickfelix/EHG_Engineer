/**
 * SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-1/2/3) — ground the S5 financial KILL gate
 * in the operating-model SSOT so it stops false-KILLing viable ventures on phantom human-team burn.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const h = vi.hoisted(() => ({ model: {} }));
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: async () => ({ content: JSON.stringify(h.model) }) }),
}));
// keep S5's optional web-search + persistence inert
vi.mock('../../../lib/eva/stage-templates/utils/web-search.js', () => ({
  isSearchEnabled: () => false, searchBatch: async () => [], formatResultsForPrompt: () => '',
}));

import { analyzeStage05 } from '../../../lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js';
import { getOperatingModelPromptBlock } from '../../../lib/eva/standards/operating-model.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const stage1 = { description: 'AI-native market modeling SaaS', targetMarket: 'consultants', problemStatement: 'manual WTP' };

// a model with a PHANTOM human-team payroll opex (~$1.2M/yr) that would false-KILL on burn
const phantomBurnModel = {
  initialInvestment: 50000,
  year1: { revenue: 120000, cogs: 12000, opex: 1200000 }, // phantom human-team payroll
  year2: { revenue: 400000, cogs: 40000, opex: 1500000 },
  year3: { revenue: 900000, cogs: 90000, opex: 1800000 },
  unitEconomics: { cac: 800, ltv: 8980, paybackMonths: 6, churnRate: 4 },
};
// a model with operating-model-consistent (lean) opex
const leanModel = {
  initialInvestment: 5000,
  year1: { revenue: 120000, cogs: 12000, opex: 6000 },
  year2: { revenue: 400000, cogs: 40000, opex: 12000 },
  year3: { revenue: 900000, cogs: 90000, opex: 20000 },
  unitEconomics: { cac: 0, ltv: 8980, paybackMonths: 3, churnRate: 4 },
};

function run(model) {
  h.model = model;
  return analyzeStage05({ stage1Data: stage1, stage3Data: {}, stage4Data: {}, ventureName: 'V1', logger: silent });
}

describe('FR-1 prompt — S5 injects the operating-model block', () => {
  it('the producer source assembles getOperatingModelPromptBlock into the client.complete call', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/stage-templates/analysis-steps/stage-05-financial-model.js'), 'utf8');
    expect(src).toMatch(/client\.complete\([^)]*getOperatingModelPromptBlock\(\)/s);
    // sanity: the block actually carries the zero-payroll / AI-ops constraint
    expect(getOperatingModelPromptBlock()).toMatch(/personnel|payroll|AI operations/i);
  });
});

describe('FR-2 fallback — phantom burn grounded; lean opex preserved', () => {
  it('grounds an implausibly-high (phantom human-team) opex to the operating model', async () => {
    const r = await run(phantomBurnModel);
    expect(r.operating_model_grounded).toBe(true);
    expect(r.opex_provenance.year1).toBe('DERIVED-from-operating-model');
    expect(r.opex_provenance.year2).toBe('DERIVED-from-operating-model');
    expect(r.opex_provenance.year3).toBe('DERIVED-from-operating-model');
  });

  it('preserves an operating-model-consistent (lean) LLM opex (not over-grounded)', async () => {
    const r = await run(leanModel);
    expect(r.opex_provenance.year1).toBe('ESTIMATE');
    expect(r.operating_model_grounded).toBe(false);
  });
});

describe('FR-3 provenance — per-year tags present', () => {
  it('emits opex_provenance per year (DERIVED-from-operating-model | ESTIMATE)', async () => {
    const r = await run(phantomBurnModel);
    expect(Object.keys(r.opex_provenance)).toEqual(['year1', 'year2', 'year3']);
    for (const yr of ['year1', 'year2', 'year3']) {
      expect(['DERIVED-from-operating-model', 'ESTIMATE']).toContain(r.opex_provenance[yr]);
    }
  });
});
