/**
 * SD-FDBK-FIX-GATE2-IMPLEMENTATION-FIDELITY-001 — broadened backend-leaf exemption
 * (PAT-GATE2-BACKEND-ONLY-001) for GATE2_IMPLEMENTATION_FIDELITY Section A
 * (design-fidelity) and Section C (data-flow-alignment).
 *
 * Cross-repo BACKEND venture leaves (no UI), e.g. the DataDistill D1 distillation
 * engine, previously scored 77<80 because the Section A/C UI/form sub-checks penalize
 * the absence of a UI surface and the narrow feature+scope-keyword exemption missed an
 * "engine/worker" scope. This SD makes the exemption SD-type/backend aware while keeping
 * the !hasUISurface fence that keeps venture UI leaves (F1 dashboard, G1 widget) enforced.
 *
 * Tests the shared pure helper directly (deterministic, no DB) AND the two section
 * validators end-to-end (mirroring the existing lib-feature-exemption.test.js harness).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  classifyBackendLeaf,
  hasUISurface,
  hasBackendEvidence,
  isEhgEngineerTarget,
} from '../../../scripts/modules/implementation-fidelity/sections/backend-leaf-detection.js';

// ─────────────────────────────────────────────────────────────────────────────
// Part 1 — pure helper (the discriminator logic)
// ─────────────────────────────────────────────────────────────────────────────
describe('backend-leaf-detection — classifyBackendLeaf (pure)', () => {
  it('TS-1: exempts a feature backend venture leaf (D1 distillation engine, no UI scope)', () => {
    const r = classifyBackendLeaf(
      'feature',
      'Distillation engine SCAN/WALK/DIST + FK-integrity transitive-closure + run/worker',
      'DataDistill D1 Distillation Engine'
    );
    expect(r.exempt).toBe(true);
  });

  it('TS-1: exempts a bugfix backend leaf (H1 error middleware) and an infrastructure leaf (E1 PII)', () => {
    expect(classifyBackendLeaf('bugfix', 'error middleware handler for the run worker', 'H1 error middleware').exempt).toBe(true);
    expect(classifyBackendLeaf('infrastructure', 'PII masking mask-before-write fail-closed + Luhn', 'E1 PII masking').exempt).toBe(true);
  });

  it('TS-2: does NOT exempt venture UI leaves F1 (dashboard) / G1 (widget) — the false-pass fence', () => {
    expect(classifyBackendLeaf('feature', 'Run History Dashboard - UI Layer with charts', 'F1 Run History Dashboard').exempt).toBe(false);
    expect(classifyBackendLeaf('feature', 'Feedback Widget - UI Layer dialog form', 'G1 Feedback Widget').exempt).toBe(false);
  });

  it('conservative: a vague feature with no UI and no backend evidence is NOT exempted', () => {
    expect(classifyBackendLeaf('feature', 'Improve some things and tidy up', '').exempt).toBe(false);
  });

  it('TS-3: sd_type comparison is case-insensitive', () => {
    expect(classifyBackendLeaf('FEATURE', 'api server endpoint worker', 'X').exempt).toBe(true);
    expect(classifyBackendLeaf(' Feature ', 'distillation engine', 'X').exempt).toBe(true);
  });

  it('TS-6 (fail-safe): bad/empty inputs never throw and never exempt', () => {
    expect(() => classifyBackendLeaf(null, null, null)).not.toThrow();
    expect(classifyBackendLeaf(null, null, null).exempt).toBe(false);
    expect(() => classifyBackendLeaf(undefined, 123, {})).not.toThrow();
    expect(classifyBackendLeaf(undefined, 123, {}).exempt).toBe(false);
  });

  it('hasUISurface: word-boundaried — no false trips on platform/transform/build', () => {
    expect(hasUISurface('build a cross-platform transform pipeline')).toBe(false);
    expect(hasUISurface('add a settings form')).toBe(true);
    expect(hasUISurface('Run History Dashboard - UI Layer')).toBe(true);
    expect(hasUISurface('Feedback Widget')).toBe(true);
  });

  it('hasBackendEvidence: matches engine/worker vocabulary in scope OR title', () => {
    expect(hasBackendEvidence('distillation engine scan', '')).toBe(true);
    expect(hasBackendEvidence('plain prose with no signal', '')).toBe(false);
    expect(hasBackendEvidence('', 'API Server Endpoint')).toBe(true);
  });

  it('TS-3/TS-5: isEhgEngineerTarget is case/whitespace-insensitive; EHG and venture apps are not EHG_Engineer', () => {
    expect(isEhgEngineerTarget('EHG_Engineer')).toBe(true);
    expect(isEhgEngineerTarget('ehg_engineer')).toBe(true);
    expect(isEhgEngineerTarget('  EHG_Engineer  ')).toBe(true);
    expect(isEhgEngineerTarget('EHG')).toBe(false);
    expect(isEhgEngineerTarget('datadistill')).toBe(false);
    expect(isEhgEngineerTarget('DataDistill')).toBe(false);
    expect(isEhgEngineerTarget(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Part 2 — section validators end-to-end (mirrors lib-feature-exemption.test.js)
// ─────────────────────────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({ sd: null }));

vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({
  resolveSdInputOrNull: async () => ({ sd: h.sd }),
  resolveSdInput: async () => ({ sd: h.sd }),
}));
vi.mock('../../../scripts/modules/implementation-fidelity/utils/index.js', () => ({
  getSDSearchTerms: async () => [],
  detectImplementationRepos: async () => [],
  gitLogForSD: async () => '',
}));

const { validateDataFlowAlignment } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/data-flow-alignment.js'
);
const { validateDesignFidelity } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/design-fidelity.js'
);

function makeSupabase() {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    not: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    limit: () => Promise.resolve({ data: null, error: null }),
  };
  return chain;
}
function makeValidation({ sd_type = 'feature', target_application = 'datadistill' } = {}) {
  return { passed: true, score: 0, issues: [], warnings: [], details: { sd_type, target_application }, gate_scores: {} };
}
const isBackendLeaf = (d, k) => d?.[k]?.skipped === true && typeof d?.[k]?.reason === 'string' && d[k].reason.includes('Backend leaf');

// A feature scope that MISSES the narrow pre-existing regex (no script/cli/api/server/lib/)
// but hits the broadened engine/worker evidence → exercises THIS SD's new branch.
const D1_SCOPE = 'Distillation engine: SCAN/WALK/DIST passes, FK-integrity transitive-closure, run + worker loop';

describe('backend-leaf exemption — Section C (data-flow-alignment) E2E', () => {
  beforeEach(() => { h.sd = null; });

  it('TS-1: a feature backend venture leaf is exempted (25/25) via the broadened branch', async () => {
    h.sd = { sd_type: 'feature', scope: D1_SCOPE, title: 'D1 Distillation Engine' };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', null, null, v, makeSupabase());
    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(isBackendLeaf(v.details, 'data_flow_alignment')).toBe(true);
  });

  it('TS-2: a venture UI leaf (dashboard) is NOT exempted by the backend-leaf branch', async () => {
    h.sd = { sd_type: 'feature', scope: 'Run History Dashboard - UI Layer with charts and a view', title: 'F1 Dashboard' };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', null, null, v, makeSupabase());
    expect(isBackendLeaf(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('TS-5: EHG_Engineer (case-insensitive) still exempts via the earlier PAT-GATE2-BE-001 rung', async () => {
    h.sd = { sd_type: 'feature', scope: D1_SCOPE, title: 'x' };
    const v = makeValidation({ target_application: 'ehg_engineer' });
    await validateDataFlowAlignment('SD-X', null, null, v, makeSupabase());
    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(v.details.data_flow_alignment.reason).toMatch(/backend-only/i);
    expect(isBackendLeaf(v.details, 'data_flow_alignment')).toBe(false); // not the new marker
  });
});

describe('backend-leaf exemption — Section A (design-fidelity) E2E', () => {
  beforeEach(() => { h.sd = null; });

  it('TS-1: a feature backend venture leaf is exempted (25/25)', async () => {
    h.sd = { sd_type: 'feature', scope: D1_SCOPE, title: 'D1 Distillation Engine' };
    const v = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(v.gate_scores.design_fidelity).toBe(25);
    expect(isBackendLeaf(v.details, 'design_fidelity')).toBe(true);
  });

  it('TS-2: a venture UI leaf (widget + form) is NOT exempted by the backend-leaf branch', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(isBackendLeaf(v.details, 'design_fidelity')).toBe(false);
  });

  it('TS-4: case-insensitive EHG_Engineer exempts via the earlier rung (regression-safe)', async () => {
    h.sd = { sd_type: 'feature', scope: D1_SCOPE, title: 'x' };
    const v = makeValidation({ target_application: 'EHG_Engineer' });
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(v.gate_scores.design_fidelity).toBe(25);
    expect(isBackendLeaf(v.details, 'design_fidelity')).toBe(false);
  });
});
