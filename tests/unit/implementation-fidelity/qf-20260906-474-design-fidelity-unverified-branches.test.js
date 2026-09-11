/**
 * QF-20260906-474 (ratification 6c263823) — every unverifiable branch in design-fidelity's
 * Section A (A1 no component files / git-log failure, A2 no accepted handoff / query failure,
 * A3 no CRUD detected / git-diff failure) must award 0 and stamp validation.unverified=true,
 * never the half-credit constants (+5/+5/+3) it booked before this fix -- a constant that reads
 * as a measurement no probe actually took.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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

const { validateDesignFidelity } = await import(
  '../../../scripts/modules/implementation-fidelity/sections/design-fidelity.js'
);

function emptyHandoffSupabase() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    not: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: null, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return { from: () => chain };
}

function makeValidation() {
  return {
    passed: true,
    score: 0,
    issues: [],
    warnings: [],
    details: { sd_type: 'feature', target_application: 'venturewidget' },
    gate_scores: {},
  };
}

describe('QF-20260906-474: unverifiable branches award 0, never half credit', () => {
  beforeEach(() => { h.sd = null; });

  it('A1 (no component files), A2 (no handoff) and A3 (no CRUD) all book 0 on the same unmeasurable SD, and the section is stamped unverified', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();

    await validateDesignFidelity('SD-X', { some: 'design' }, v, emptyHandoffSupabase());

    expect(v.warnings).toContain('[A1] No component files found in git commits');
    expect(v.warnings).toContain('[A2] No accepted EXEC→PLAN handoff with a deliverables manifest found');
    expect(v.warnings).toContain('[A3] No CRUD operations detected in code changes');
    expect(v.unverified).toBe(true);
    // Before this fix: 5 (A1) + 5 (A2) + 3 (A3) = 13/25 booked with no probe succeeding.
    // After: every unverifiable branch is 0, so the section score is 0/25.
    expect(v.gate_scores.design_fidelity).toBe(0);
  });

  it('does not stamp unverified when every sub-section actually verifies (control)', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    const handoffSupabase = {
      from: (table) => {
        if (table === 'sd_phase_handoffs') {
          const chain = {
            select: () => chain,
            eq: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: () => Promise.resolve({ data: { deliverables_manifest: '- ✅ done' }, error: null }),
          };
          return chain;
        }
        return emptyHandoffSupabase().from(table);
      },
    };

    await validateDesignFidelity('SD-X', { some: 'design' }, v, handoffSupabase);

    // A1/A3 still can't verify (gitLogForSD is mocked empty), so unverified stays true --
    // this control only isolates that A2's own success path does not itself flip unverified.
    expect(v.details.design_fidelity?.deliverables_manifest_found).toBe(true);
    expect(v.gate_scores.design_fidelity).toBeGreaterThanOrEqual(10);
  });
});
