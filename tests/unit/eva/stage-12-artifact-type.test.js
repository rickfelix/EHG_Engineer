/**
 * SD-LEO-INFRA-S12-GTM-ARTIFACT-TYPE-MISPERSIST-001
 *
 * FR-1: analyzeStage12 must emit a TYPED artifact (identity_gtm_sales_strategy) so the orchestrator
 *       persists the GTM output deterministically and never falls back to venture_stages
 *       .required_artifacts[12][0] = 'identity_brand_guidelines'. Flat fields stay for back-compat.
 * FR-2: gate-failure-recovery formatReasons serializes structured reasons (no '[object Object]').
 * FR-3: the hardcoded reality-gates '12->13' fallback requires identity_gtm_sales_strategy (and no
 *       longer demands the S14 blueprint artifacts), matching the canonical DB gate_boundary_config.
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
import { formatReasons } from '../../../lib/eva/gate-failure-recovery.js';

const silent = { log: () => {}, warn: () => {}, error: () => {} };
const PARAMS = {
  stage1Data: { description: 'self-serve analytics SaaS', targetMarket: 'SMBs', problemStatement: 'x' },
  stage10Data: { customerPersonas: [{ name: 'SMB Owner', segment: 'SMB' }] },
  stage11Data: { brandName: 'Acme' },
  logger: silent,
};
const channels = Array.from({ length: 8 }, (_, i) => ({ name: `Organic ${i}`, channelType: 'organic', primaryTier: 'T1', monthly_budget: 0, expected_cac: 0, primary_kpi: 'signups' }));
function run() {
  h.resp = { marketTiers: [{ name: 'T1' }], channels, salesModel: 'self-serve', funnelStages: [], dealStages: [], customerJourney: [] };
  return analyzeStage12(PARAMS);
}

// ── FR-1 ─────────────────────────────────────────────────────────────────────
describe('FR-1: analyzeStage12 emits a typed identity_gtm_sales_strategy artifact', () => {
  it('returns a typed artifacts[] entry with the canonical S12 type', async () => {
    const r = await run();
    expect(Array.isArray(r.artifacts)).toBe(true);
    expect(r.artifacts).toHaveLength(1);
    expect(r.artifacts[0].artifactType).toBe('identity_gtm_sales_strategy');
    // never the S10-deposited brand type
    expect(r.artifacts[0].artifactType).not.toBe('identity_brand_guidelines');
  });

  it('the typed payload carries the GTM data (so mergeArtifactOutputs flattens it back)', async () => {
    const r = await run();
    expect(r.artifacts[0].payload).toBeTruthy();
    expect(r.artifacts[0].payload.marketTiers).toBeTruthy();
    expect(r.artifacts[0].payload.channels).toBeTruthy();
  });

  it('preserves the flat top-level fields for back-compat with direct readers/tests', async () => {
    const r = await run();
    // these are read directly by existing tests (e.g. stage12-operating-model-grounding)
    expect(r.marketTiers).toBeTruthy();
    expect(r.channels).toBeTruthy();
    expect(typeof r.operating_model_grounded).toBe('boolean');
    expect(r.reality_gate).toBeTruthy();
  });
});

// ── FR-2 ─────────────────────────────────────────────────────────────────────
describe('FR-2: formatReasons serializes structured reasons (no [object Object])', () => {
  it('renders code: message for structured reason objects', () => {
    const out = formatReasons([{ code: 'ARTIFACT_MISSING', message: 'identity_gtm_sales_strategy not found' }]);
    expect(out).toBe('ARTIFACT_MISSING: identity_gtm_sales_strategy not found');
    expect(out).not.toContain('[object Object]');
  });
  it('joins multiple reasons and tolerates plain strings + code-only + null', () => {
    const out = formatReasons([
      { code: 'A', message: 'first' },
      'a plain string reason',
      { code: 'CODE_ONLY' },
      null,
    ]);
    expect(out).toBe('A: first; a plain string reason; CODE_ONLY; unknown');
    expect(out).not.toContain('[object Object]');
  });
  it('handles empty / non-array input', () => {
    expect(formatReasons([])).toBe('(no reasons provided)');
    expect(formatReasons(undefined)).toBe('(no reasons provided)');
  });
  it('falls back to JSON for an object with neither message nor code', () => {
    expect(formatReasons([{ artifact_type: 'x', actual: 1 }])).toContain('"artifact_type"');
  });
});

// ── FR-3 ─────────────────────────────────────────────────────────────────────
// QF-20260829-634 leg 1: the hardcoded BOUNDARY_CONFIG fallback content this
// describe block originally pinned (IDENTITY_GTM_SALES_STRATEGY et al) is now
// RETIRED for every boundary, including 12->13 -- gate_boundary_config (DB) is
// the sole content authority. The GTM requirement these tests protect against
// regressing still lives on, just relocated: it's asserted against the live DB
// row content, not the deprecated in-code fallback. See gate_boundary_config
// row '12->13' (identity_gtm_sales_strategy + engine_business_model_canvas +
// identity_persona_brand) for the canonical source of truth.
describe('FR-3: reality-gates 12->13 boundary is a designated Reality Gate with retired fallback content', () => {
  const src = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../lib/eva/reality-gates.js'),
    'utf8',
  );
  // isolate the '12->13' BOUNDARY_CONFIG block
  const block = src.slice(src.indexOf("'12->13'"), src.indexOf("'17->18'"));

  it('12->13 remains a designated boundary (key present) with content retired', () => {
    expect(block).toMatch(/required_artifacts:\s*\[\]/);
  });
  it('no longer carries ANY hardcoded artifact-type content (stale or otherwise) for 12->13', () => {
    expect(block).not.toMatch(/IDENTITY_GTM_SALES_STRATEGY/);
    expect(block).not.toMatch(/BLUEPRINT_TECHNICAL_ARCHITECTURE/);
    expect(block).not.toMatch(/BLUEPRINT_PROJECT_PLAN/);
    expect(block).not.toMatch(/ENGINE_BUSINESS_MODEL_CANVAS/);
    expect(block).not.toMatch(/IDENTITY_PERSONA_BRAND/);
  });
});
