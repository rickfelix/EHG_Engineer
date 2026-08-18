// Tests for SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001
// Real per-FR delivery classification + default-OFF warn-only enforcement + approver descope.

import { describe, it, expect, vi } from 'vitest';
import {
  isFrTraceabilityEnforced,
  frIdOf,
  frReferencesId,
  isValidatedStory,
  descopeFor,
  classifyFrDelivery,
  projectGateResult,
  frUnverifiableCeiling,
  NOT_MEASURED_SCORE,
  ERRORED_SCORE,
} from '../../../../scripts/modules/handoff/gates/fr-delivery-classifier.js';

describe('FR-2: isFrTraceabilityEnforced — default OFF', () => {
  it('OFF when unset', () => expect(isFrTraceabilityEnforced({})).toBe(false));
  it('OFF for falsey strings', () => {
    for (const v of ['', '0', 'false', 'off', 'no']) expect(isFrTraceabilityEnforced({ LEO_FR_TRACEABILITY_ENFORCE: v })).toBe(false);
  });
  it('ON for truthy strings', () => {
    for (const v of ['1', 'true', 'on', 'YES']) expect(isFrTraceabilityEnforced({ LEO_FR_TRACEABILITY_ENFORCE: v })).toBe(true);
  });
});

describe('FR-1: frReferencesId — real per-FR mapping (word-boundary)', () => {
  it('matches the FR id in title/want/AC/notes', () => {
    expect(frReferencesId({ title: 'Implement FR-004 growth playbook' }, 'FR-004')).toBe(true);
    expect(frReferencesId({ user_want: 'as a user I want FR-005' }, 'FR-005')).toBe(true);
    expect(frReferencesId({ acceptance_criteria: [{ then: 'satisfies FR-001' }] }, 'FR-001')).toBe(true);
    expect(frReferencesId({ technical_notes: '{"fr":"FR-002"}' }, 'FR-002')).toBe(true);
  });
  it('does not false-match a different id (word boundary)', () => {
    expect(frReferencesId({ title: 'FR-0040 something' }, 'FR-004')).toBe(false);
    expect(frReferencesId({ title: 'XFR-004' }, 'FR-004')).toBe(false);
    expect(frReferencesId({ title: 'no fr here' }, 'FR-004')).toBe(false);
  });
  it('handles missing story/id', () => {
    expect(frReferencesId(null, 'FR-1')).toBe(false);
    expect(frReferencesId({ title: 'x' }, null)).toBe(false);
  });
});

describe('isValidatedStory', () => {
  it('true for completed/done/validated status or validation_status=validated', () => {
    for (const s of ['completed', 'done', 'validated']) expect(isValidatedStory({ status: s })).toBe(true);
    expect(isValidatedStory({ status: 'ready', validation_status: 'validated' })).toBe(true);
  });
  it('false for in-progress/draft', () => {
    expect(isValidatedStory({ status: 'ready' })).toBe(false);
    expect(isValidatedStory({ status: 'draft' })).toBe(false);
  });
});

describe('FR-4: descopeFor — approver-gated', () => {
  const md = { descoped_frs: [
    { fr_id: 'FR-005', approved_by: 'chairman', reason: 'deferred' },
    { fr_id: 'FR-006', approved_by: '' },             // no approver -> ignored
    { fr_id: 'FR-007', approved_by: 'me-session' },   // self-approval guarded below
  ] };
  it('honors a descope with a named approver', () => {
    expect(descopeFor(md, 'FR-005')).toBeTruthy();
  });
  it('ignores a descope without an approver', () => {
    expect(descopeFor(md, 'FR-006')).toBeNull();
  });
  it('rejects self-approval (approver == requester)', () => {
    expect(descopeFor(md, 'FR-007', 'me-session')).toBeNull();
    expect(descopeFor(md, 'FR-007', 'other-session')).toBeTruthy();
  });
  it('null when no descope list', () => expect(descopeFor({}, 'FR-1')).toBeNull());

  // QF-20260816-923: requesterSessionId was always null in production (BaseExecutor's
  // validationContext never set it) -- the self-approval guard above never ran. Now that
  // sessionId is threaded through, an identity-unknown call must warn loudly rather than
  // silently trust the descope.
  it('QF-20260816-923: warns loudly when requesterSessionId is unknown (self-approval guard cannot run)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(descopeFor(md, 'FR-005')).toBeTruthy(); // still honored (warn-only per QF scope)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('requesterSessionId is unknown'));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('QF-20260816-923: does NOT warn when requesterSessionId is provided', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // QF-20260818-850: vi.spyOn reuses an already-active (un-restored) spy on the same
    // property rather than creating a fresh one, so under reordered execution this spy can
    // start with call history left by another test. Clear before acting so this assertion
    // reflects only the descopeFor() call below, regardless of run order.
    warnSpy.mockClear();
    try {
      descopeFor(md, 'FR-007', 'other-session');
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

// Injectable supabase stub: returns FRs from the PRD query and stories from user_stories.
function stub({ stories = [] } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) {
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

const FRS = [{ id: 'FR-001', requirement: 'a' }, { id: 'FR-002', requirement: 'b' }, { id: 'FR-003', requirement: 'c' }];

describe('FR-1: classifyFrDelivery', () => {
  it('classifies delivered / descoped / undelivered per-FR', async () => {
    const stories = [
      { id: 's1', title: 'do FR-001', status: 'completed' },
      { id: 's2', title: 'do FR-002', status: 'ready' }, // not validated -> not a delivery signal
    ];
    const c = await classifyFrDelivery(stub({ stories }), {
      sdId: 'sd-1', functionalRequirements: FRS,
      sdMetadata: { descoped_frs: [{ fr_id: 'FR-003', approved_by: 'lead-final' }] },
    });
    const byId = Object.fromEntries(c.frs.map((f) => [f.id, f.status]));
    expect(byId['FR-001']).toBe('delivered');     // validated story references it
    expect(byId['FR-002']).toBe('undelivered');   // story exists but not validated
    expect(byId['FR-003']).toBe('descoped');      // approver-gated descope
    expect(c).toMatchObject({ total: 3, delivered: 1, descoped: 1, undelivered: 1 });
  });
});

describe('FR-2: projectGateResult — flag gating', () => {
  const undeliveredClass = { frs: [{ id: 'FR-002', description: 'b', status: 'undelivered' }, { id: 'FR-001', description: 'a', status: 'delivered' }], total: 2, delivered: 1, descoped: 0, undelivered: 1 };
  const allGoodClass = { frs: [{ id: 'FR-001', description: 'a', status: 'delivered' }], total: 1, delivered: 1, descoped: 0, undelivered: 0 };

  it('ON + undelivered -> hard fail (passed:false, required:true)', () => {
    const r = projectGateResult(undeliveredClass, { enforced: true });
    expect(r.passed).toBe(false);
    expect(r.required).toBe(true);
    expect(r.issues.join(' ')).toMatch(/undelivered/i);
  });
  // SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001 REPLACES the two assertions that used to live here.
  // They asserted score===100 in warn-only mode and an invariant pass-path "regardless of
  // undelivered count" — i.e. they PINNED the defect: the gate was required by its own tests to
  // report a perfect score while measuring a shortfall. Measured on the real specimen, that made
  // 0-of-6 delivered indistinguishable from 6-of-6. The contract is now inverted: the flag
  // governs BLOCKING only and never the reported score.
  it('OFF + undelivered -> warn-only pass but the score is TRUE, not pinned at 100', () => {
    const r = projectGateResult(undeliveredClass, { enforced: false });
    expect(r.passed).toBe(true);
    expect(r.required).toBe(false);
    expect(r.score).toBe(50);                  // 1 of 2 satisfied — honest, not 100
    expect(r.warnings.join(' ')).toMatch(/FR-002/);
  });
  it('OFF score TRACKS the undelivered count instead of being invariant', () => {
    const allBad = { frs: [], total: 5, delivered: 0, descoped: 0, undelivered: 5, unverifiable: 0 };
    const halfBad = { frs: [], total: 4, delivered: 2, descoped: 0, undelivered: 2, unverifiable: 0 };
    expect(projectGateResult(allBad, { enforced: false }).score).toBe(0);
    expect(projectGateResult(halfBad, { enforced: false }).score).toBe(50);
    // still non-blocking in warn-only mode — the rollout promise that DOES survive
    expect(projectGateResult(allBad, { enforced: false }).passed).toBe(true);
  });
  it('all delivered -> pass either way, score 100; required mirrors the flag', () => {
    expect(projectGateResult(allGoodClass, { enforced: false })).toMatchObject({ passed: true, required: false, score: 100 });
    expect(projectGateResult(allGoodClass, { enforced: true })).toMatchObject({ passed: true, required: true, score: 100 });
  });
  it('no FRs -> pass but scored as NOT-MEASURED, never 100', () => {
    const r = projectGateResult({ frs: [], total: 0, delivered: 0, descoped: 0, undelivered: 0 }, { enforced: true });
    expect(r).toMatchObject({ passed: true, required: false });
    expect(r.score).toBe(NOT_MEASURED_SCORE);
    expect(r.score).not.toBe(100);
    expect(r.warnings.join(' ')).toMatch(/NOT verified|not-measured/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SD-FDBK-FIX-COMPLETION-FLAG-HARNESS-001 — the repair
// ─────────────────────────────────────────────────────────────────────────────

describe('UNVERIFIABLE: per-SD convention check distinguishes blindness from absence', () => {
  it('REGRESSION (the 93-scored specimen): no FR referenced anywhere -> all unverifiable, never 100', async () => {
    // Mirrors SD-FDBK-INFRA-WORKER-LOOP-DIRECTIVE-001: 6 FRs, 6 validated stories, and not one
    // story references an FR id. Shipped behaviour was 6 undelivered reported as score 100.
    const stories = [
      { id: 's1', title: 'Name the classifier denial verbatim', status: 'completed' },
      { id: 's2', title: 'State the correct shape as four actions', status: 'completed' },
      { id: 's3', title: 'Keep the second surface in sync', status: 'completed' },
    ];
    const c = await classifyFrDelivery(stub({ stories }), { sdId: 'sd-spec', functionalRequirements: FRS });
    expect(c.unverifiable).toBe(3);
    expect(c.undelivered).toBe(0);          // NOT blamed for non-delivery
    expect(c.convention_in_use).toBe(false);

    const r = projectGateResult(c, { enforced: false });
    expect(r.score).not.toBe(100);          // the defect, gone
    expect(r.score).toBe(0);                // zero VERIFIED delivery — accurate
    expect(r.warnings.join(' ')).toMatch(/UNVERIFIABLE/);
    expect(r.warnings.join(' ')).toMatch(/BLINDNESS, not evidence of absence/);
  });

  it('SEEDED DEFECT: convention IS in use and one named FR is missing -> UNDELIVERED and REFUSED', async () => {
    // The acceptance case. FR-001 is genuinely referenced, which proves the instrument works
    // for this SD, so FR-002's missing reference is real evidence rather than an artifact.
    const stories = [{ id: 's1', title: 'implement FR-001 fully', status: 'completed' }];
    const c = await classifyFrDelivery(stub({ stories }), {
      sdId: 'sd-seeded',
      functionalRequirements: [{ id: 'FR-001', requirement: 'a' }, { id: 'FR-002', requirement: 'b' }],
    });
    expect(c.convention_in_use).toBe(true);
    expect(c.delivered).toBe(1);
    expect(c.undelivered).toBe(1);
    expect(c.unverifiable).toBe(0);

    const enforcedResult = projectGateResult(c, { enforced: true });
    expect(enforcedResult.passed).toBe(false);   // REFUSED
    expect(enforcedResult.required).toBe(true);
    expect(enforcedResult.issues.join(' ')).toMatch(/FR-002/);
  });

  it('ZERO validated stories is UNDELIVERED, not unverifiable — blindness needs something to be blind to', async () => {
    // The distinction that matters: "stories exist but do not use the convention" is genuine
    // blindness; "no work product exists at all" is not an excuse, it is a finding. Without
    // this, an SD could declare FRs, build and validate nothing, and be excused as unmeasurable.
    const c = await classifyFrDelivery(stub({ stories: [] }), { sdId: 'sd-empty', functionalRequirements: FRS });
    expect(c.has_work_product).toBe(false);
    expect(c.validated_story_count).toBe(0);
    expect(c.undelivered).toBe(3);
    expect(c.unverifiable).toBe(0);
    expect(c.frs[0].evidence).toMatch(/nothing was built or validated/i);
    // and it must still hard-fail under enforcement
    expect(projectGateResult(c, { enforced: true }).passed).toBe(false);
  });

  it('unvalidated stories do not count as work product', async () => {
    // Stories that exist but were never validated cannot carry a delivery signal either way,
    // so they must not flip an SD out of the honest UNDELIVERED verdict.
    const stories = [{ id: 's1', title: 'draft work', status: 'ready' }];
    const c = await classifyFrDelivery(stub({ stories }), { sdId: 'sd-draft', functionalRequirements: FRS });
    expect(c.has_work_product).toBe(false);
    expect(c.undelivered).toBe(3);
    expect(c.unverifiable).toBe(0);
  });

  it('a descope alone does not prove the convention is in use', async () => {
    // Work product exists (a validated story) but references no FR id, so the convention is
    // not in use; the descope is honoured and the remaining FR is unmeasurable rather than
    // blamed. A descope is an approval record, not evidence that the reference convention works.
    const stories = [{ id: 's1', title: 'some unrelated work', status: 'completed' }];
    const c = await classifyFrDelivery(stub({ stories }), {
      sdId: 'sd-descope-only',
      functionalRequirements: [{ id: 'FR-001', requirement: 'a' }, { id: 'FR-002', requirement: 'b' }],
      sdMetadata: { descoped_frs: [{ fr_id: 'FR-001', approved_by: 'lead' }] },
    });
    expect(c.descoped).toBe(1);
    expect(c.convention_in_use).toBe(false);
    expect(c.unverifiable).toBe(1);   // FR-002 unmeasurable, not "undelivered"
    expect(c.undelivered).toBe(0);
  });
});

describe('UNVERIFIABLE ceiling (shipped day one, per the WAIT-verdict precedent)', () => {
  const allUnver = { frs: [], total: 4, delivered: 0, descoped: 0, undelivered: 0, unverifiable: 4 };

  it('default ceiling tolerates a fully-unverifiable SD but still reports it', () => {
    const r = projectGateResult(allUnver, { enforced: true, ceiling: 1 });
    expect(r.passed).toBe(true);
    expect(r.details.over_ceiling).toBe(false);
  });
  it('exceeding the ceiling produces an OBSERVABLY DIFFERENT result, not the same pass', () => {
    const within = projectGateResult(allUnver, { enforced: true, ceiling: 1 });
    const over = projectGateResult(allUnver, { enforced: true, ceiling: 0.5 });
    expect(over.passed).toBe(false);
    expect(over.passed).not.toBe(within.passed);
    expect(over.details.over_ceiling).toBe(true);
    expect(over.issues.join(' ')).toMatch(/ceiling/i);
  });
  it('the ceiling never blocks in warn-only mode', () => {
    expect(projectGateResult(allUnver, { enforced: false, ceiling: 0 }).passed).toBe(true);
  });
  it('frUnverifiableCeiling parses env and fails safe on nonsense', () => {
    expect(frUnverifiableCeiling({})).toBe(1);
    expect(frUnverifiableCeiling({ LEO_FR_UNVERIFIABLE_CEILING: '0.4' })).toBe(0.4);
    for (const bad of ['nonsense', '-1', '2', '']) {
      expect(frUnverifiableCeiling({ LEO_FR_UNVERIFIABLE_CEILING: bad })).toBe(1);
    }
  });
});

describe('no path reports 100 without a verified full delivery', () => {
  it('score 100 implies undelivered===0 AND unverifiable===0', () => {
    const cases = [
      { frs: [], total: 3, delivered: 3, descoped: 0, undelivered: 0, unverifiable: 0 },
      { frs: [], total: 3, delivered: 1, descoped: 2, undelivered: 0, unverifiable: 0 },
      { frs: [], total: 3, delivered: 0, descoped: 0, undelivered: 3, unverifiable: 0 },
      { frs: [], total: 3, delivered: 0, descoped: 0, undelivered: 0, unverifiable: 3 },
      { frs: [], total: 3, delivered: 1, descoped: 0, undelivered: 1, unverifiable: 1 },
      { frs: [], total: 0, delivered: 0, descoped: 0, undelivered: 0, unverifiable: 0 },
    ];
    for (const c of cases) {
      for (const enforced of [true, false]) {
        const r = projectGateResult(c, { enforced });
        if (r.score === 100) {
          expect(c.undelivered).toBe(0);
          expect(c.unverifiable).toBe(0);
          expect(c.total).toBeGreaterThan(0);
        }
      }
    }
  });
  it('a non-measurement and a broken instrument do not share a score with each other or with 100', () => {
    expect(NOT_MEASURED_SCORE).not.toBe(100);
    expect(ERRORED_SCORE).not.toBe(100);
    expect(ERRORED_SCORE).not.toBe(NOT_MEASURED_SCORE);
    expect(ERRORED_SCORE).toBeLessThan(NOT_MEASURED_SCORE);
  });
});

describe('frIdOf', () => {
  it('uses fr.id then falls back to FR-<n>', () => {
    expect(frIdOf({ id: 'FR-009' }, 0)).toBe('FR-009');
    expect(frIdOf({}, 3)).toBe('FR-4');
  });
});
