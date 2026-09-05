/**
 * QF-20260904-604 — Gate 2 design-fidelity A2 probe selected sd_phase_handoffs.deliverables,
 * a column that has never existed (real column is deliverables_manifest). Under a
 * throw-on-42703 client (SCHEMA-TRUTH-001-A) that read detonated, scoring Gate 2 at 0 for
 * every SD with 12 held in EXEC. Fix: the A2 probe no longer selects the phantom column at
 * all -- the pre-existing "no handoff found" +5 outcome (design-fidelity.js:322-326 before
 * the fix) is kept verbatim as the sole, unconditional A2 result. No fallback to
 * deliverables_manifest (out of scope for this ticket).
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

/** A supabase double that detonates like a real throw-on-42703 client the instant
 *  anything touches sd_phase_handoffs.deliverables -- the phantom column this QF removes. */
function makeThrowOn42703Supabase(calls) {
  return {
    from(table) {
      calls.tables.push(table);
      if (table === 'sd_phase_handoffs') {
        return {
          select(colsStr) {
            calls.handoffSelects.push(colsStr);
            const requested = String(colsStr).split(',').map((s) => s.trim());
            if (requested.includes('deliverables')) {
              throw { code: '42703', message: 'column sd_phase_handoffs.deliverables does not exist' };
            }
            return this;
          },
          eq() { return this; },
          order() { return this; },
          limit: () => Promise.resolve({ data: [], error: null }),
        };
      }
      // Any other table (e.g. sd-id-resolver's own lookups) behaves as an empty, benign chain.
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

describe('QF-20260904-604: design-fidelity A2 no longer reads the phantom deliverables column', () => {
  beforeEach(() => { h.sd = null; });

  it('completes without a 42703 against a throw-on-42703 client, and A2 credits 5', async () => {
    // A UI leaf so no earlier exemption branch (EHG_Engineer / backend-leaf) short-circuits
    // before reaching A2 -- mirrors the G1 Feedback Widget non-exempt case.
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    const calls = { tables: [], handoffSelects: [] };
    const supabase = makeThrowOn42703Supabase(calls);

    await expect(validateDesignFidelity('SD-X', { some: 'design' }, v, supabase)).resolves.not.toThrow();

    expect(v.warnings).toContain('[A2] No EXEC→PLAN handoff found');
    // sd_phase_handoffs is never touched at all -- the phantom-column read is gone, not
    // merely error-tolerant.
    expect(calls.tables).not.toContain('sd_phase_handoffs');
    expect(calls.handoffSelects).toHaveLength(0);
  });

  it('A2 is unconditional: even if a real handoff row with a workflow-mentioning payload existed, A2 still just credits the flat 5 (no re-introduced 10-point branch)', async () => {
    h.sd = { sd_type: 'feature', scope: 'Feedback Widget UI Layer with a form and a button', title: 'G1 Feedback Widget' };
    const v = makeValidation();
    // Even a supabase double that WOULD happily return workflow-mentioning deliverables
    // must not change the outcome, because A2 no longer queries at all.
    const chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve({ data: [{ deliverables: { workflow: 'user workflow implemented' } }], error: null }),
    };
    const supabase = { from: () => chain };

    await validateDesignFidelity('SD-X', { some: 'design' }, v, supabase);

    expect(v.warnings).toContain('[A2] No EXEC→PLAN handoff found');
    expect(v.details.design_fidelity?.workflows_mentioned).toBeUndefined();
  });
});
