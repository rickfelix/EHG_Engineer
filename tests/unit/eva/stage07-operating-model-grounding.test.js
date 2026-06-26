/**
 * SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-4) — ground the S7 pricing/unit-economics
 * producer in the operating model: organic-first $0 CAC + lean-AI-ops margin (not generic $100 / 70%),
 * with provenance tags. These economics flow downstream into S16 + the S5/kill gates.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const h = vi.hoisted(() => ({ resp: {} }));
vi.mock('../../../lib/llm/index.js', () => ({
  getLLMClient: () => ({ complete: async () => ({ content: JSON.stringify(h.resp) }) }),
}));
vi.mock('../../../lib/eva/stage-templates/utils/web-search.js', () => ({
  isSearchEnabled: () => false, searchBatch: async () => [], formatResultsForPrompt: () => '',
}));

import { analyzeStage07 } from '../../../lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
// a self-serve (NOT high-ACV) concept -> organic-first default applies
const stage1 = { description: 'self-serve AI tool for solo consultants', targetMarket: 'consultants', problemStatement: 'x' };
const baseResp = (ue) => ({
  pricing_model: 'subscription',
  tiers: [{ name: 'Pro', price: 449, billing_period: 'monthly' }],
  priceAnchor: { competitorAvg: 500, proposedPrice: 449, positioning: 'premium' },
  unitEconomics: ue,
  rationale: 'r',
});

function run(ue) {
  h.resp = baseResp(ue);
  return analyzeStage07({ stage1Data: stage1, stage4Data: {}, stage5Data: {}, stage6Data: {}, ventureName: 'V1', logger: silent });
}

describe('FR-4 prompt — S7 injects the operating-model block', () => {
  it('the producer source assembles getOperatingModelPromptBlock into the client.complete call', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/stage-templates/analysis-steps/stage-07-pricing-strategy.js'), 'utf8');
    expect(src).toMatch(/client\.complete\([^)]*getOperatingModelPromptBlock\(\)/s);
  });
});

describe('FR-4 grounded defaults (omitted -> operating model; provided -> preserved)', () => {
  it('omitted gross_margin -> lean operating-model margin (~90%, not 70), tagged DERIVED', async () => {
    const r = await run({ cac: 200, churn_rate_monthly: 4, arpa: 449 }); // gross_margin omitted
    expect(r.gross_margin_pct).toBeGreaterThan(80);
    expect(r.econ_provenance.gross_margin_pct).toBe('DERIVED-from-operating-model');
    expect(r.operating_model_grounded).toBe(true);
  });

  it('omitted CAC on a non-high-ACV concept -> $0 organic-first, tagged DERIVED', async () => {
    const r = await run({ gross_margin_pct: 88, churn_rate_monthly: 4, arpa: 449 }); // cac omitted
    expect(r.cac).toBe(0);
    expect(r.econ_provenance.cac).toBe('DERIVED-from-operating-model');
  });

  it('LLM-provided gross_margin + cac are PRESERVED (tagged ESTIMATE, not over-grounded)', async () => {
    const r = await run({ gross_margin_pct: 72, cac: 350, churn_rate_monthly: 4, arpa: 449 });
    expect(r.gross_margin_pct).toBe(72);
    expect(r.cac).toBe(350);
    expect(r.econ_provenance.gross_margin_pct).toBe('ESTIMATE');
    expect(r.econ_provenance.cac).toBe('ESTIMATE');
    expect(r.operating_model_grounded).toBe(false);
  });
});
