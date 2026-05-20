/**
 * PAT-GATE2-LIBFEATURE-001 — Frontend presentational / lib-level feature exemption
 * for GATE2_IMPLEMENTATION_FIDELITY Section A (design-fidelity) and Section C
 * (data-flow-alignment).
 *
 * SD-FDBK-ENH-GATE2-IMPLEMENTATION-FIDELITY-001.
 *
 * An EHG (frontend app) feature whose scope is library-level code (src/lib/ or lib/)
 * AND which explicitly declares no new UI components/forms AND no new DB is a pure
 * transform and should score full Section A/C credit. The exemption is strictly
 * additive: a real UI/DB feature must never be exempted by this block. We assert on
 * the specific reason marker ('PAT-GATE2-LIBFEATURE-001') so the negative cases are
 * robust regardless of what the fallback scoring path produces.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared mutable fixture holder (hoisted so the vi.mock factories can read it).
const h = vi.hoisted(() => ({ sd: null }));

// Stub the SD resolver (dynamically imported inside both section functions).
vi.mock('../../../scripts/lib/sd-id-resolver.js', () => ({
  resolveSdInputOrNull: async () => ({ sd: h.sd }),
  resolveSdInput: async () => ({ sd: h.sd }),
}));

// Stub the git/util helpers so the fallback scoring path is hermetic (no git, no network).
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

// Minimal chainable supabase stub: every builder method returns the chain; terminal
// awaits resolve to { data: null }. Section A's A2 handoff query needs this.
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

function makeValidation({ sd_type = 'feature', target_application = 'EHG' } = {}) {
  return {
    passed: true,
    score: 0,
    issues: [],
    warnings: [],
    details: { sd_type, target_application },
    gate_scores: {},
  };
}

// Real SD-SURFACEAWARE-...-001-D-style string scope (the canonical false-positive).
const D_STRING_SCOPE =
  'IN SCOPE (EHG app, src/lib/gvos):\n- Add a distinct surface field to WireframeRow and ' +
  'branch per-wireframe structural prompt directives by surface in renderLovablePayloadForWireframe.\n' +
  'OUT OF SCOPE:\n- No new UI components (existing preview surfaces the change).\n' +
  '- No new DB columns or migration (consumes the existing screen-object JSON key).';

// Object-form scope: the no-UI/no-DB declarations live ONLY in scope.excluded, and the
// included text trips hasUIScope (via "page_type", exactly like the real D scope) so flow
// bypasses the earlier backend-only rung and reaches PAT-GATE2-LIBFEATURE-001 — proving the
// new block reads scope.excluded. (If included had no UI keyword, backend-only would exempt
// it first via the "lib/" backend-scope match — still 25/25, but not this block.)
const OBJECT_SCOPE = {
  included: ['Branch per-wireframe prompt directives by surface in src/lib/gvos; do not overload the existing page_type field'],
  excluded: ['No new UI components', 'No new DB columns or migration'],
};

const LIB_REASON = 'PAT-GATE2-LIBFEATURE-001';

/** Did the lib-feature exemption fire? (specific marker, not just "skipped") */
function libExemptionFired(details, key) {
  const reason = details?.[key]?.reason;
  return details?.[key]?.skipped === true && typeof reason === 'string' && reason.includes(LIB_REASON);
}

describe('PAT-GATE2-LIBFEATURE-001 — Section C (data-flow-alignment)', () => {
  beforeEach(() => { h.sd = null; });

  it('P1: exempts a string-scope EHG lib feature with explicit no-UI + no-DB declarations (25/25)', async () => {
    h.sd = { sd_type: 'feature', scope: D_STRING_SCOPE };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(true);
  });

  it('P2: exempts an object-form scope (declarations in scope.excluded)', async () => {
    h.sd = { sd_type: 'feature', scope: OBJECT_SCOPE };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(true);
  });

  it('N1: missing lib path → not exempted by the lib-feature block', async () => {
    h.sd = { sd_type: 'feature', scope: 'Tweak something. No new UI components. No new DB columns.' };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('N2: missing no-UI declaration → not exempted', async () => {
    h.sd = { sd_type: 'feature', scope: 'Change src/lib/gvos renderer. No new DB columns or migration.' };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('N3 (safety): declares no UI but ADDS a column (no no-DB declaration) → not exempted', async () => {
    h.sd = {
      sd_type: 'feature',
      scope: 'Update src/lib/gvos. No new UI components. ADD COLUMN surface to venture_artifacts.',
    };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('N4: wrong sd_type (refactor) → not exempted by the lib-feature block', async () => {
    h.sd = { sd_type: 'refactor', scope: D_STRING_SCOPE };
    const v = makeValidation({ sd_type: 'refactor' });
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('N5: target=EHG_Engineer is handled by the earlier block, NOT the lib-feature block', async () => {
    h.sd = { sd_type: 'feature', scope: D_STRING_SCOPE };
    const v = makeValidation({ target_application: 'EHG_Engineer' });
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    // Still exempt (full credit) but via the EHG_Engineer rung, not PAT-GATE2-LIBFEATURE-001.
    expect(v.gate_scores.data_flow_alignment).toBe(25);
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('N6: a real EHG UI feature (page + form + table + reuse components) → not exempted', async () => {
    h.sd = {
      sd_type: 'feature',
      scope: 'Build a new settings page with a form and a save button that writes to the user_prefs table; reuse existing shared components.',
    };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('B1: "filib/" trap is not treated as a lib path → not exempted', async () => {
    h.sd = { sd_type: 'feature', scope: 'Edit src/filib/thing. No new UI components. No new DB columns.' };
    const v = makeValidation();
    await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });

  it('B2: no-DB declaration variants (schema changes / migrations) are recognized', async () => {
    for (const dbDecl of ['No schema changes.', 'No new migrations.', 'No new tables.']) {
      h.sd = { sd_type: 'feature', scope: `Edit lib/gvos. No new UI components. ${dbDecl}` };
      const v = makeValidation();
      await validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase());
      expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(true);
    }
  });

  it('B3: unpopulated validation.details (no target_application) neither throws nor lib-exempts', async () => {
    h.sd = { sd_type: 'feature', scope: D_STRING_SCOPE };
    const v = { passed: true, score: 0, issues: [], warnings: [], details: {}, gate_scores: {} };
    await expect(validateDataFlowAlignment('SD-X', {}, {}, v, makeSupabase())).resolves.toBeUndefined();
    expect(libExemptionFired(v.details, 'data_flow_alignment')).toBe(false);
  });
});

describe('PAT-GATE2-LIBFEATURE-001 — Section A (design-fidelity)', () => {
  beforeEach(() => { h.sd = null; });

  it('P1: exempts a string-scope EHG lib feature (25/25)', async () => {
    h.sd = { sd_type: 'feature', scope: D_STRING_SCOPE, title: 'GVOS prompt renderer surface branching' };
    const v = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(v.gate_scores.design_fidelity).toBe(25);
    expect(libExemptionFired(v.details, 'design_fidelity')).toBe(true);
  });

  it('P2: exempts an object-form scope (declarations in scope.excluded)', async () => {
    h.sd = { sd_type: 'feature', scope: OBJECT_SCOPE, title: 'GVOS surface field' };
    const v = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(v.gate_scores.design_fidelity).toBe(25);
    expect(libExemptionFired(v.details, 'design_fidelity')).toBe(true);
  });

  it('N6: a real EHG UI feature is not exempted by the lib-feature block', async () => {
    h.sd = {
      sd_type: 'feature',
      title: 'Settings page',
      scope: 'Build a new settings page with a form and a save button writing to user_prefs; reuse existing shared components.',
    };
    const v = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(libExemptionFired(v.details, 'design_fidelity')).toBe(false);
  });

  it('N4: wrong sd_type (refactor) is not exempted by the lib-feature block', async () => {
    h.sd = { sd_type: 'refactor', scope: D_STRING_SCOPE, title: 'refactor gvos' };
    const v = makeValidation({ sd_type: 'refactor' });
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(libExemptionFired(v.details, 'design_fidelity')).toBe(false);
  });

  it('N5: target=EHG_Engineer handled by the earlier block, not the lib-feature block', async () => {
    h.sd = { sd_type: 'feature', scope: D_STRING_SCOPE, title: 'gvos' };
    const v = makeValidation({ target_application: 'EHG_Engineer' });
    await validateDesignFidelity('SD-X', { some: 'design' }, v, makeSupabase());
    expect(v.gate_scores.design_fidelity).toBe(25);
    expect(libExemptionFired(v.details, 'design_fidelity')).toBe(false);
  });
});
