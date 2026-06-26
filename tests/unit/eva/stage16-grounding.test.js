/**
 * SD-LEO-INFRA-S16-FINANCIAL-GROUNDING-EVIDENCE-GATE-001 FR-A/FR-B — ground the S16 producer in the
 * ratified upstream S7 unit-economics, transform-not-invent, with epistemic tags + facts>0.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ fin: {} }));
vi.mock('../../../lib/llm/client-factory.js', () => ({
  getLLMClient: () => ({ complete: async () => ({ content: JSON.stringify(h.fin) }) }),
}));

import {
  analyzeStage16,
  buildVerifiedInputs,
  groundVerifiedFacts,
} from '../../../lib/eva/stage-templates/analysis-steps/stage-16-financial-projections.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const stage1 = { description: 'Market modeling SaaS', targetMarket: 'consultants', problemStatement: 'manual WTP research' };
// venture-1's real ratified S7 economics
const S7 = { cac: 800, arpa: 449, churn_rate_monthly: 4, gross_margin_pct: 80, ltv: null, tiers: [{ name: 'Pro', price: 449 }] };
const cb = (t) => ({ personnel: t * 0.6, infrastructure: t * 0.2, marketing: t * 0.1, other: t * 0.1 });
const FIN = {
  initial_capital: 200000, monthly_burn_rate: 30000,
  revenue_projections: [
    { month: 1, revenue: 4490, costs: 30000, cost_breakdown: cb(30000) },
    { month: 2, revenue: 8980, costs: 32000, cost_breakdown: cb(32000) },
  ],
};

function run(stage7Economics) {
  h.fin = FIN;
  return analyzeStage16({ stage1Data: stage1, stage13Data: {}, stage14Data: {}, stage15Data: {}, stage7Economics, ventureName: 'V1', logger: silent });
}

describe('FR-A buildVerifiedInputs', () => {
  it('builds a verified block from ratified S7 economics', () => {
    const vi2 = buildVerifiedInputs(S7);
    expect(vi2).not.toBeNull();
    expect(vi2.cac).toBe(800);
    expect(vi2.arpa).toBe(449);
  });
  it('returns null without the core unit economics (cac/arpa)', () => {
    expect(buildVerifiedInputs({ churn_rate_monthly: 4 })).toBeNull();
    expect(buildVerifiedInputs(null)).toBeNull();
  });
});

describe('FR-A/FR-B groundVerifiedFacts', () => {
  it('registers verified inputs as FACTS (facts count rises) and derives LTV + LTV:CAC', () => {
    const fb = { classifications: [], summary: { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 } };
    const derived = groundVerifiedFacts(fb, buildVerifiedInputs(S7));
    expect(fb.summary.facts).toBeGreaterThan(0);
    // LTV = ARPA*margin/churn = 449*0.8/0.04 = 8980
    expect(derived.ltv_derived).toBeCloseTo(8980, 0);
    expect(derived.ltv_cac_ratio).toBeCloseTo(11.225, 1); // 8980/800
  });
});

describe('analyzeStage16 grounding (end-to-end with mocked LLM)', () => {
  it('GROUNDED: with S7 economics -> grounded=true, facts>0, verified_inputs + DERIVED + tags present', async () => {
    const r = await run(S7);
    expect(r.grounded).toBe(true);
    expect(r.fourBuckets.summary.facts).toBeGreaterThan(0);
    expect(r.verified_inputs.cac).toBe(800);
    expect(r.verified_inputs.arpa).toBe(449);
    expect(r.derived_economics.ltv_derived).toBeCloseTo(8980, 0);
    expect(r.epistemic_tags.cac).toBe('FACT');
    expect(r.epistemic_tags.ltv).toBe('DERIVED');
    expect(r.grounding_source).toMatch(/S7/);
  });

  it('UNGROUNDED: without S7 economics -> grounded=false, no injected facts', async () => {
    const r = await run(undefined);
    expect(r.grounded).toBe(false);
    expect(r.verified_inputs).toBeNull();
    // no verified-fact injection; facts stay whatever the LLM produced (0 for our fixture)
    expect(r.fourBuckets.summary.facts).toBe(0);
  });
});
