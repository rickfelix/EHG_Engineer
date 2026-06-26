/**
 * SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-5) — ground S12 GTM in the operating model:
 * organic-first ($0 paid budget early); a paid-led plan is FLAGGED as an explicit override (surfaced,
 * not silently accepted, not rewritten).
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

import { analyzeStage12 } from '../../../lib/eva/stage-templates/analysis-steps/stage-12-gtm-sales.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const PARAMS = {
  stage1Data: { description: 'self-serve analytics SaaS', targetMarket: 'SMBs', problemStatement: 'x' },
  stage10Data: { customerPersonas: [{ name: 'SMB Owner', segment: 'SMB' }] },
  stage11Data: { brandName: 'Acme' },
  logger: silent,
};

// 8 channels (REQUIRED_CHANNELS); helper to build a GTM response with a given channel mix
function gtm(channels) {
  return {
    marketTiers: [{ name: 'T1' }],
    channels,
    salesModel: 'self-serve',
    funnelStages: [], dealStages: [], customerJourney: [],
  };
}
const organicChannels = Array.from({ length: 8 }, (_, i) => ({ name: `Organic ${i}`, channelType: 'organic', primaryTier: 'T1', monthly_budget: 0, expected_cac: 0, primary_kpi: 'signups' }));
const paidLedChannels = [
  { name: 'Paid Search', channelType: 'paid', primaryTier: 'T1', monthly_budget: 8000, expected_cac: 200, primary_kpi: 'leads' },
  ...Array.from({ length: 7 }, (_, i) => ({ name: `Organic ${i}`, channelType: 'organic', primaryTier: 'T1', monthly_budget: 0, expected_cac: 0, primary_kpi: 'signups' })),
];

function run(channels) { h.resp = gtm(channels); return analyzeStage12(PARAMS); }

describe('FR-5 prompt — S12 injects the operating-model block', () => {
  it('the producer source assembles getOperatingModelPromptBlock into the client.complete call', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '../../../lib/eva/stage-templates/analysis-steps/stage-12-gtm-sales.js'), 'utf8');
    expect(src).toMatch(/client\.complete\([^)]*getOperatingModelPromptBlock\(\)/s);
  });
});

describe('FR-5 paid-led flag', () => {
  it('an organic-first plan is NOT flagged (operating_model_grounded)', async () => {
    const r = await run(organicChannels);
    expect(r.gtm_paid_led).toBe(false);
    expect(r.operating_model_grounded).toBe(true);
    expect(r.gtm_motion_provenance).toMatch(/organic-first/i);
  });

  it('a paid-led plan is FLAGGED as an explicit operating-model override (surfaced, not rewritten)', async () => {
    const r = await run(paidLedChannels);
    expect(r.gtm_paid_led).toBe(true);
    expect(r.operating_model_grounded).toBe(false);
    expect(r.gtm_motion_provenance).toMatch(/PAID-LED-OVERRIDE/);
    // not rewritten — the paid channel + its budget are preserved
    expect(r.total_monthly_budget).toBeGreaterThan(0);
  });
});
