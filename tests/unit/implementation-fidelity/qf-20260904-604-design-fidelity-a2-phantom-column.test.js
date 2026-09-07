/**
 * QF-20260904-604 — Gate 2 design-fidelity A2 probe selected sd_phase_handoffs.deliverables,
 * a column that has never existed (real column is deliverables_manifest). Under a
 * throw-on-42703 client (SCHEMA-TRUTH-001-A) that read detonated, scoring Gate 2 at 0 for
 * every SD with 12 held in EXEC. Fix at the time: the A2 probe stopped selecting the phantom
 * column entirely and booked a flat, unconditional +5 -- a residue explicitly left as "no
 * fallback to deliverables_manifest (out of scope for this ticket)".
 *
 * QF-20260906-474 (ratification 6c263823) replaces that residue: A1/A2/A3 must never award
 * half credit on an unverifiable branch (a constant reads as a measurement no probe took).
 * A2 now reads the REAL deliverables_manifest column on the accepted EXEC-TO-PLAN handoff --
 * this file is updated to pin the new, varying behavior rather than the flat +5 it used to pin.
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

/** A supabase double whose sd_phase_handoffs leg resolves to `handoffRow` (or none). */
function makeHandoffSupabase(handoffRow, calls = { tables: [] }) {
  return {
    from(table) {
      calls.tables.push(table);
      if (table === 'sd_phase_handoffs') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: handoffRow ?? null, error: null }),
        };
        return chain;
      }
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        not: () => chain,
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        limit: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
  };
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

describe('QF-20260906-474: design-fidelity A2 reads the real deliverables_manifest column', () => {
  beforeEach(() => { h.sd = null; });

  it('credits A2 10/10 when an accepted EXEC->PLAN handoff has a non-empty deliverables_manifest', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    const calls = { tables: [] };
    const supabase = makeHandoffSupabase({ deliverables_manifest: '- ✅ All user stories implemented' }, calls);

    await expect(validateDesignFidelity('SD-X', { some: 'design' }, v, supabase)).resolves.not.toThrow();

    expect(v.gate_scores.design_fidelity).toBeGreaterThanOrEqual(10);
    expect(v.details.design_fidelity?.deliverables_manifest_found).toBe(true);
    // NOTE: A1/A3 still can't verify in this fixture (gitLogForSD is mocked empty), so
    // v.unverified stays true overall -- this test isolates A2's OWN success path only.
    expect(v.warnings).not.toContain('[A2] No accepted EXEC→PLAN handoff with a deliverables manifest found');
    expect(calls.tables).toContain('sd_phase_handoffs');
  });

  it('awards 0/10 and stamps the section unverified when no accepted EXEC->PLAN handoff exists', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    const supabase = makeHandoffSupabase(null);

    await validateDesignFidelity('SD-X', { some: 'design' }, v, supabase);

    expect(v.warnings).toContain('[A2] No accepted EXEC→PLAN handoff with a deliverables manifest found');
    expect(v.unverified).toBe(true);
  });

  it('two distinct A2 outcomes on the same SD shape, differing only by handoff presence (acceptance criterion)', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const withHandoff = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, withHandoff, makeHandoffSupabase({ deliverables_manifest: '- ✅ done' }));

    const withoutHandoff = makeValidation();
    await validateDesignFidelity('SD-X', { some: 'design' }, withoutHandoff, makeHandoffSupabase(null));

    expect(withHandoff.gate_scores.design_fidelity).not.toBe(withoutHandoff.gate_scores.design_fidelity);
  });
});
