// SD-LEO-FIX-EXEC-PLAN-HEALS-001: TESTING's MANDATORY_TESTING_VALIDATION precheck reads a
// stored TESTING verdict that can only ever be produced by a standalone pre-handoff run --
// which by construction cannot observe deliverables/stories the exec-to-plan executor's OWN
// healers only complete DURING a handoff attempt. healDeliverablesAndStories() closes that:
// for POST_IMPLEMENTATION callers only, it reconciles deliverables (evidence-gated, never the
// zero-evidence autoCompleteDeliverablesForSD fallback) then promotes stories, before TESTING
// measures completeness.
//
// FR-2 is the load-bearing safety property: a standalone TESTING run must never be able to
// fabricate the evidence it then measures against. The second describe block below is a
// static source check pinning that autoCompleteDeliverablesForSD/autoCompleteDeliverables are
// never imported into this module -- a future edit that wires the heal step to that fallback
// tier fails here even if every other test still passes.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const reconcileDeliverablesMock = vi.fn();
const autoValidateUserStoriesMock = vi.fn();

vi.mock('../../../../scripts/modules/handoff/executors/exec-to-plan/gates/deliverables-completeness.js', () => ({
  reconcileDeliverables: (...args) => reconcileDeliverablesMock(...args),
}));
vi.mock('../../../../scripts/auto-validate-user-stories-on-exec-complete.js', () => ({
  autoValidateUserStories: (...args) => autoValidateUserStoriesMock(...args),
}));

const { healDeliverablesAndStories } = await import('../../../../lib/sub-agents/testing/index.js');

function makeSupabase({ deliverables = [] } = {}) {
  const from = vi.fn((table) => {
    if (table !== 'sd_scope_deliverables') throw new Error(`unexpected table: ${table}`);
    return {
      select: () => ({
        eq: () => ({ limit: () => Promise.resolve({ data: deliverables, error: null }) }),
      }),
    };
  });
  return { from };
}

beforeEach(() => {
  reconcileDeliverablesMock.mockReset().mockResolvedValue({ reconciled: 0, evidence: [] });
  autoValidateUserStoriesMock.mockReset().mockResolvedValue({ validated: false });
});

describe('healDeliverablesAndStories — gated strictly on storyGateContext.blocking (FR-1)', () => {
  it('TS-2: PRE_IMPLEMENTATION (blocking:false) makes ZERO calls -- no reconcile, no promote, no DB read', async () => {
    const supabase = makeSupabase({ deliverables: [{ id: 'd1', completion_status: 'pending' }] });
    await healDeliverablesAndStories('sd-1', supabase, { blocking: false });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(reconcileDeliverablesMock).not.toHaveBeenCalled();
    expect(autoValidateUserStoriesMock).not.toHaveBeenCalled();
  });

  it('no-op when storyGateContext is absent (defensive default matches fail-closed callers)', async () => {
    const supabase = makeSupabase();
    await healDeliverablesAndStories('sd-1', supabase, undefined);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('TS-1: POST_IMPLEMENTATION (blocking:true) reads deliverables, reconciles, then promotes stories', async () => {
    const deliverables = [{ id: 'd1', completion_status: 'pending' }, { id: 'd2', completion_status: 'completed' }];
    const supabase = makeSupabase({ deliverables });
    reconcileDeliverablesMock.mockResolvedValue({ reconciled: 1, evidence: [{ id: 'd1', evidenceType: 'prd_active' }] });

    await healDeliverablesAndStories('sd-1', supabase, { blocking: true });

    expect(supabase.from).toHaveBeenCalledWith('sd_scope_deliverables');
    expect(reconcileDeliverablesMock).toHaveBeenCalledTimes(1);
    expect(reconcileDeliverablesMock).toHaveBeenCalledWith(deliverables, 'sd-1', supabase);
    expect(autoValidateUserStoriesMock).toHaveBeenCalledTimes(1);
    expect(autoValidateUserStoriesMock).toHaveBeenCalledWith('sd-1', supabase);
  });

  it('promotion still runs (as a safe no-op) even when there are no deliverables to reconcile', async () => {
    const supabase = makeSupabase({ deliverables: [] });
    await healDeliverablesAndStories('sd-1', supabase, { blocking: true });
    expect(reconcileDeliverablesMock).not.toHaveBeenCalled();
    expect(autoValidateUserStoriesMock).toHaveBeenCalledTimes(1);
  });

  it('promotion still runs (as a safe no-op) when the deliverables query returns null data', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: null, error: null }) }) }) }) };
    await healDeliverablesAndStories('sd-1', supabase, { blocking: true });
    expect(reconcileDeliverablesMock).not.toHaveBeenCalled();
    expect(autoValidateUserStoriesMock).toHaveBeenCalledTimes(1);
  });

  it('TS-3: reconcileDeliverables is called with the RAW deliverables list, never pre-filtered -- fabrication happens inside the evidence-gated function, not before it', async () => {
    // The only defense against fabricating completion is that reconcileDeliverables itself
    // leaves an unmatched deliverable untouched. This test pins that healDeliverablesAndStories
    // does not itself pre-mark anything complete before delegating -- it is a pure pass-through.
    const deliverables = [{ id: 'd1', completion_status: 'pending', deliverable_name: 'no matching evidence' }];
    const supabase = makeSupabase({ deliverables });
    reconcileDeliverablesMock.mockResolvedValue({ reconciled: 0, evidence: [] });

    await healDeliverablesAndStories('sd-1', supabase, { blocking: true });

    expect(reconcileDeliverablesMock).toHaveBeenCalledWith(deliverables, 'sd-1', supabase);
    expect(deliverables[0].completion_status).toBe('pending'); // untouched by healDeliverablesAndStories itself
  });
});

describe('FR-2 (load-bearing safety property): the zero-evidence auto-complete fallback is never wired into TESTING', () => {
  it('lib/sub-agents/testing/index.js never imports autoCompleteDeliverablesForSD or autoCompleteDeliverables', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../../../../lib/sub-agents/testing/index.js'), 'utf8');
    // Check real import/call sites, never bare substring presence -- this module's own
    // safety-property comments legitimately NAME the forbidden function for context, and a
    // naive substring match would false-positive on its own documentation.
    expect(src).not.toMatch(/^\s*import\s*\{[^}]*autoCompleteDeliverablesForSD/m);
    expect(src).not.toMatch(/[^.\w]autoCompleteDeliverablesForSD\s*\(/);
    expect(src).not.toMatch(/from ['"].*auto-complete-deliverables\.js['"]/);
    expect(src).not.toMatch(/from ['"].*exec-to-plan\/index\.js['"]/);
  });

  it('the heal step imports ONLY the evidence-gated reconciler and the canonical promoter', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '../../../../lib/sub-agents/testing/index.js'), 'utf8');
    expect(src).toMatch(/import \{ reconcileDeliverables \} from ['"].*deliverables-completeness\.js['"]/);
    expect(src).toMatch(/import \{ autoValidateUserStories \} from ['"].*auto-validate-user-stories-on-exec-complete\.js['"]/);
  });
});
