// Tests for SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001
// Real per-FR delivery classification + default-OFF warn-only enforcement + approver descope.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// SECURITY finding 2 (EXEC-phase review): fr-delivery-classifier.js now disk-verifies test_ref
// via specFileExists() (lib/stories/e2e-path-guard.js). Mocked here so every pre-existing test's
// placeholder test_ref value (e.g. 'x', 'tests/x.test.js:10') keeps resolving as "exists" without
// touching dozens of call sites — permissive by default, false only for the one sentinel path the
// dedicated existence-check tests below use to exercise the real rejection path.
vi.mock('../../../../lib/stories/e2e-path-guard.js', () => ({
  specFileExists: (_repoRoot, candidatePath) => !String(candidatePath).includes('does-not-exist'),
}));

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
  classifyPhaseBucket,
  isExecPhaseOrLater,
  extractRegexFrMentions,
  resolveTestingEvidenceCoverage,
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

// ─────────────────────────────────────────────────────────────────────────────
// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 — testing_evidence second signal
// ─────────────────────────────────────────────────────────────────────────────

// Extended stub: also serves sub_agent_execution_results (TESTING rows), a table the plain
// stub() above always answers with []. Kept separate so every pre-existing test above (asserted
// against stub()'s exact shape) stays untouched.
// SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 round 5: resolveTestingEvidenceCoverage now sources
// its existence-check root exclusively from v_sub_agent_repo_compliance.expected_repo_path
// (infrastructure-controlled, never metadata.repo_path). Every testingRows id gets an
// expected_repo_path of process.cwd() by default -- reproducing the pre-round-5 "same-repo SD"
// default so none of the ~35 tests below that don't care about cross-repo behavior need to
// change. Override complianceRows/complianceError to test something else (see the dedicated
// round-5 describe block, and fr-delivery-classifier-testref-realfs.test.js for the full
// cross-repo/unregistered-application coverage).
function stubWithTesting({ stories = [], storiesError = null, testingRows = [], testingError = null, complianceRows = null, complianceError = null } = {}) {
  const effectiveComplianceRows = complianceRows ?? testingRows.map((r) => ({ id: r.id, expected_repo_path: process.cwd() }));
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) {
          if (table === 'user_stories') {
            return Promise.resolve(storiesError ? { data: null, error: storiesError } : { data: stories, error: null }).then(res);
          }
          if (table === 'sub_agent_execution_results') {
            return Promise.resolve(testingError ? { data: null, error: testingError } : { data: testingRows, error: null }).then(res);
          }
          if (table === 'v_sub_agent_repo_compliance') {
            return Promise.resolve(complianceError ? { data: null, error: complianceError } : { data: effectiveComplianceRows, error: null }).then(res);
          }
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

function testingRow({ id, phase, coverage = [], ...text }) {
  return { id, phase, metadata: { fr_coverage: coverage }, ...text };
}

const FRS3 = [{ id: 'FR-1' }, { id: 'FR-2' }, { id: 'FR-3' }];

// Round 5: resolveTestingEvidenceCoverage's root now comes ONLY from an explicit fsDeps.repoRoot
// override or the expectedRepoRoots map — direct calls below (bypassing classifyFrDelivery's own
// query, and stubWithTesting's auto-populated default) need this override so canResolve stays
// true and they keep exercising the mocked specFileExists's own logic, not the root-resolution
// short-circuit (which has its own dedicated tests).
const CWD_FS_DEPS = { repoRoot: process.cwd() };

describe('FR-3/TR-2/TR-6: classifyPhaseBucket / isExecPhaseOrLater — measured, normalized allow-list', () => {
  const admitted = ['EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL', 'COMPLETED', 'PLAN_VERIFY', 'PLAN_VERIFICATION', 'EXEC_IMPLEMENTATION', 'EXEC_COMPLETE', 'orchestrated'];
  const rejected = ['LEAD', 'PLAN', 'PLAN_TO_EXEC'];

  it('AC-2/AC-3: admits EXEC-or-later phases, including spelling variants and PLAN-prefixed chronological outliers', () => {
    for (const p of admitted) {
      expect(isExecPhaseOrLater(p)).toBe(true);
      expect(classifyPhaseBucket(p)).toBe('admitted');
    }
  });
  it('AC-4: rejects known pre-EXEC phases', () => {
    for (const p of rejected) {
      expect(isExecPhaseOrLater(p)).toBe(false);
      expect(classifyPhaseBucket(p)).toBe('rejected');
    }
  });
  it('AC-1: table-driven over the full measured census, not hand-picked examples', () => {
    for (const p of [...admitted, ...rejected]) {
      expect(['admitted', 'rejected']).toContain(classifyPhaseBucket(p));
    }
  });
  it('TS-R2 (closes R2): an unrecognized phase (PLAN_PRD, the largest real unrecognized-bucket value) fails closed, distinct from an explicit rejection', () => {
    expect(classifyPhaseBucket('PLAN_PRD')).toBe('unrecognized');
    expect(isExecPhaseOrLater('PLAN_PRD')).toBe(false);
  });
  it('null/undefined/empty fail closed', () => {
    for (const p of [null, undefined, '']) expect(isExecPhaseOrLater(p)).toBe(false);
  });
});

describe('FR-1: extractRegexFrMentions — report-only, phase-unfiltered, excludes its own fr_coverage', () => {
  it('AC-1: a LEAD-phase prose mention with no fr_coverage entry is captured, tagged with its phase', () => {
    const frs = [{ id: 'FR-3' }];
    const rows = [{ id: 'row-1', phase: 'LEAD', detailed_analysis: 'Risk: FR-3 may need more coverage', metadata: {} }];
    expect(extractRegexFrMentions(rows, frs)).toContainEqual({ fr_id: 'FR-3', sub_agent_result_id: 'row-1', phase: 'LEAD' });
  });
  it("AC-2: a fr_coverage entry's own fr_id does not itself produce a hit merely by existing in metadata JSON", () => {
    const frs = [{ id: 'FR-3' }];
    const rows = [{ id: 'row-1', phase: 'EXEC', metadata: { fr_coverage: [{ fr_id: 'FR-3', status: 'delivered', test_ref: 'x' }] } }];
    expect(extractRegexFrMentions(rows, frs)).toEqual([]);
  });
  it('scans across all phases, not just EXEC-or-later', () => {
    const frs = [{ id: 'FR-1' }];
    const rows = [{ id: 'row-1', phase: 'PLAN_TO_EXEC', summary: 'mentions FR-1 in passing', metadata: {} }];
    expect(extractRegexFrMentions(rows, frs).map((m) => m.fr_id)).toEqual(['FR-1']);
  });
  // S4 (closes: SECURITY finding 1's try/catch had zero test coverage — a naive mutant deleting
  // it survived all pre-existing tests, since none ever fed a metadata shape deep enough to
  // actually trigger JSON.stringify's RangeError).
  it('SECURITY finding 1: a pathologically deep metadata object does not throw, degrades to empty text instead', () => {
    let deep = {};
    let cursor = deep;
    for (let i = 0; i < 6000; i++) { cursor.nested = {}; cursor = cursor.nested; } // JSON.stringify throws ~5,000 levels deep (measured)
    const frs = [{ id: 'FR-1' }];
    const rows = [{ id: 'row-1', phase: 'LEAD', detailed_analysis: 'FR-1 also mentioned here', metadata: deep }];
    expect(() => extractRegexFrMentions(rows, frs)).not.toThrow();
    // still finds the prose mention via detailed_analysis -- only the metadata-JSON text degrades
    expect(extractRegexFrMentions(rows, frs)).toEqual([{ fr_id: 'FR-1', sub_agent_result_id: 'row-1', phase: 'LEAD' }]);
  });
});

describe('TR-1: resolveTestingEvidenceCoverage — strict schema, normalized match, unmatched diagnostics', () => {
  it('AC-1: a schema-valid, matched entry on an admitted phase promotes', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/foo.test.js:42' }] })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.matchedTestingCoverage).toEqual([{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/foo.test.js:42', sub_agent_result_id: 'r1' }]);
    expect(r.testingEvidenceRowsSeen).toBe(1);
  });
  it('AC-2: fr_id matching is normalized (case-insensitive)', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'fr-2', status: 'delivered', test_ref: 'x' }] })];
    expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toHaveLength(1);
  });
  it('AC-3: an unmatched fr_id is recorded, not silently dropped, and does not promote', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-99', status: 'delivered', test_ref: 'x' }] })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.matchedTestingCoverage).toEqual([]);
    expect(r.unmatchedFrCoverageIds).toEqual(['FR-99']);
  });
  it('rejects each of the 5 measured production shapes, including the dangerous bare-scalar-string case, without throwing', () => {
    const shapes = [
      { 'FR-1': 'some prose describing coverage' },  // object-keyed-by-FR-id prose
      ['FR-1', 'FR-2'],                                // array-of-plain-id-strings
      { covered: 'FR-1 and FR-2' },                    // object-keyed-by-prose-label
      { fr_coverage_check: true },                     // fr_coverage_check variant
      '7/7',                                           // bare scalar string (TR-1's flagged dangerous case)
    ];
    for (const coverage of shapes) {
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { fr_coverage: coverage } }];
      expect(() => resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS)).not.toThrow();
      expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toEqual([]);
    }
  });
  it('an unrecognized-phase row is diagnosed separately and does not count toward testingEvidenceRowsSeen', () => {
    const rows = [testingRow({ id: 'r1', phase: 'PLAN_PRD', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'x' }] })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.matchedTestingCoverage).toEqual([]);
    expect(r.unrecognizedPhaseRows).toEqual([{ sub_agent_result_id: 'r1', phase: 'PLAN_PRD' }]);
    expect(r.testingEvidenceRowsSeen).toBe(0);
  });

  // F5: a KNOWN pre-EXEC (rejected-bucket) row is now diagnosed too, distinct from
  // unrecognized -- otherwise "the writer fired at the wrong phase" was byte-identical to
  // "the writer never fired at all".
  it('a rejected-phase (known pre-EXEC) row is diagnosed separately too, not just silently skipped', () => {
    const rows = [testingRow({ id: 'r1', phase: 'LEAD', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'x' }] })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.matchedTestingCoverage).toEqual([]);
    expect(r.rejectedPhaseRows).toEqual([{ sub_agent_result_id: 'r1', phase: 'LEAD' }]);
    expect(r.testingEvidenceRowsSeen).toBe(0);
  });

  // F2 (closes: unrecognized status values were never tested, only unrecognized SHAPES).
  it('F2: an fr_coverage entry with an unrecognized status value (not delivered/undelivered) is rejected, not partially trusted', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'partial', test_ref: 'x' }] })];
    expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toEqual([]);
  });

  // F3 (closes: TS-N1's malformed fixture always failed on fr_id first, so test_ref's own
  // non-empty-string requirement was never independently exercised).
  it('F3: a well-formed fr_id/status entry with an empty test_ref is rejected', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: '' }] })];
    expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toEqual([]);
  });
  it('F3b: a well-formed fr_id/status entry with test_ref entirely missing is rejected', () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered' }] })];
    expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toEqual([]);
  });

  // SECURITY finding 2: schema-valid, fr_id-matched entries whose test_ref does not resolve to
  // a real file must not promote — closes the gap where any non-empty string was trusted.
  describe('SECURITY finding 2: test_ref is disk-verified, not merely shape-checked', () => {
    it('a schema-valid, matched entry whose test_ref does not resolve is rejected and diagnosed, not silently dropped', () => {
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/does-not-exist-anywhere.test.js:9' }] })];
      const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
      expect(r.matchedTestingCoverage).toEqual([]);
      expect(r.unresolvedTestRefs).toEqual([{ fr_id: 'FR-2', test_ref: 'tests/does-not-exist-anywhere.test.js:9', sub_agent_result_id: 'r1' }]);
    });
    it('a resolvable test_ref (the mock treats anything without "does-not-exist" as real) promotes', () => {
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/genuinely/somewhere.test.js:1' }] })];
      expect(resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toHaveLength(1);
    });
    it('a :LINE and a :LINE:COL suffix are both stripped before the existence check (same file, either suffix form)', () => {
      const withLine = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/x.test.js:42' }] })];
      const withLineCol = [testingRow({ id: 'r2', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/x.test.js:42:7' }] })];
      expect(resolveTestingEvidenceCoverage(withLine, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toHaveLength(1);
      expect(resolveTestingEvidenceCoverage(withLineCol, FRS3, CWD_FS_DEPS).matchedTestingCoverage).toHaveLength(1);
    });
    it('classifyFrDelivery level: an unresolved test_ref does not count as work product or promote the convention', async () => {
      const stories = [{ id: 's1', title: 'unrelated work', status: 'completed' }]; // Fixture C setup
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/does-not-exist-anywhere.test.js' }] })];
      const c = await classifyFrDelivery(stubWithTesting({ stories, testingRows: rows }), { sdId: 'sd-sec2', functionalRequirements: FRS3 });
      expect(c.convention_in_use).toBe(false);
      expect(c.unverifiable).toBe(3);
      expect(c.unresolved_test_refs).toEqual([{ fr_id: 'FR-2', test_ref: 'tests/does-not-exist-anywhere.test.js', sub_agent_result_id: 'r1' }]);
    });
  });

  // SECURITY finding 3: a single row's fr_coverage array can be arbitrarily long; diagnostic
  // arrays must not grow unbounded with it (measured: 200k unmatched entries -> 3.29MB blob).
  it('SECURITY finding 3: unmatchedFrCoverageIds/unresolvedTestRefs are capped, not unbounded', () => {
    const manyUnmatched = Array.from({ length: 200 }, (_, i) => ({ fr_id: `FR-UNMATCHED-${i}`, status: 'delivered', test_ref: 'x' }));
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: manyUnmatched })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.unmatchedFrCoverageIds.length).toBeLessThanOrEqual(50);
    expect(r.unmatchedFrCoverageIds.length).toBeGreaterThan(0);
  });

  // S6 (closes: the above test only actually exercises unmatchedFrCoverageIds's cap -- its own
  // name claims unresolvedTestRefs too, but every fixture entry used fr_id "FR-UNMATCHED-*",
  // which is unmatched and never reaches the unresolvedTestRefs branch at all).
  it('S6: unresolvedTestRefs is ALSO capped independently, not just unmatchedFrCoverageIds', () => {
    const manyUnresolved = Array.from({ length: 200 }, (_, i) => ({ fr_id: 'FR-1', status: 'delivered', test_ref: `tests/does-not-exist-${i}.test.js` }));
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: manyUnresolved })];
    const r = resolveTestingEvidenceCoverage(rows, FRS3, CWD_FS_DEPS);
    expect(r.unresolvedTestRefs.length).toBeLessThanOrEqual(50);
    expect(r.unresolvedTestRefs.length).toBeGreaterThan(0);
    expect(r.unmatchedFrCoverageIds).toEqual([]); // FR-1 is matched -- these all take the resolved-check branch, not the unmatched one
  });
});

describe('classifyFrDelivery — testing_evidence second signal (TS-1..TS-N2)', () => {
  it('TS-1 (Fixture A): story-delivered FRs classify delivered via the unchanged story signal', async () => {
    const stories = [{ id: 's1', title: 'covers FR-1 FR-2 FR-3', status: 'completed' }];
    const c = await classifyFrDelivery(stubWithTesting({ stories }), { sdId: 'sd-ts1', functionalRequirements: FRS3 });
    expect(c.delivered).toBe(3);
    expect(c.frs.every((f) => f.status === 'delivered' && f.delivery_basis === 'story')).toBe(true);
  });

  it('TS-2 (Fixture B, regression proof): a sibling FR without a reference is genuinely undelivered', async () => {
    const frs = [{ id: 'FR-1' }, { id: 'FR-2' }, { id: 'FR-3' }, { id: 'FR-4' }];
    const stories = [{ id: 's1', title: 'covers FR-1 FR-2 FR-3', status: 'completed' }];
    const c = await classifyFrDelivery(stubWithTesting({ stories }), { sdId: 'sd-ts2', functionalRequirements: frs });
    expect(c.frs.find((f) => f.id === 'FR-4').status).toBe('undelivered');
  });

  it('TS-3-zero (Fixture C-zero, non-regression): zero stories + zero TESTING evidence -> undelivered, not unverifiable', async () => {
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: [] }), { sdId: 'sd-ts3zero', functionalRequirements: FRS3 });
    expect(c.undelivered).toBe(3);
    expect(c.unverifiable).toBe(0);
  });

  it('TS-3 (Fixture C, genuine unverifiable): a validated story exists but references no FR', async () => {
    const stories = [{ id: 's1', title: 'unrelated work', status: 'completed' }];
    const c = await classifyFrDelivery(stubWithTesting({ stories }), { sdId: 'sd-ts3', functionalRequirements: FRS3 });
    expect(c.has_work_product).toBe(true);
    expect(c.convention_in_use).toBe(false);
    expect(c.unverifiable).toBe(3);
  });

  it('TS-4 (Fixture D): EXEC-phase fr_coverage promotes via testing_evidence with no story; sibling is undelivered (not unverifiable) and its evidence does not falsely claim nothing was built', async () => {
    const frs = [{ id: 'FR-2' }, { id: 'FR-3' }];
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/x.test.js:10' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-ts4', functionalRequirements: frs });
    const fr2 = c.frs.find((f) => f.id === 'FR-2');
    const fr3 = c.frs.find((f) => f.id === 'FR-3');
    expect(fr2.status).toBe('delivered');
    expect(fr2.delivery_basis).toBe('testing_evidence');
    expect(fr3.status).toBe('undelivered');
    expect(fr3.evidence).not.toMatch(/nothing was built/i);
    expect(c.has_work_product).toBe(true);
    expect(c.convention_in_use).toBe(true);
  });

  it('TS-5 (Fixture D-negative): identical fr_coverage on a LEAD-phase row is rejected by the phase filter and does not count as work product', async () => {
    const frs = [{ id: 'FR-2' }, { id: 'FR-3' }];
    const rows = [testingRow({ id: 'r1', phase: 'LEAD', coverage: [{ fr_id: 'FR-2', status: 'delivered', test_ref: 'tests/x.test.js:10' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-ts5', functionalRequirements: frs });
    expect(c.has_work_product).toBe(false);
    expect(c.frs.find((f) => f.id === 'FR-2').status).toBe('undelivered');
    expect(c.testing_evidence_rows_seen).toBe(0);
    expect(c.rejected_phase_rows).toEqual([{ sub_agent_result_id: 'r1', phase: 'LEAD' }]); // F5: visible, not silently dropped
  });

  it('TS-6: a LEAD-phase risk-flagging prose mention (no fr_coverage) does not change delivery status, present vs absent', async () => {
    const frs = [{ id: 'FR-3' }];
    const withMention = [{ id: 'r1', phase: 'LEAD', detailed_analysis: 'Risk: FR-3 needs attention', metadata: {} }];
    const c1 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: withMention }), { sdId: 'sd-ts6', functionalRequirements: frs });
    const c2 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: [] }), { sdId: 'sd-ts6', functionalRequirements: frs });
    expect(c1.frs[0].status).toBe(c2.frs[0].status);
    expect(c1.undelivered).toBe(c2.undelivered);
    expect(c1.regex_fr_mentions.length).toBeGreaterThan(0);
    expect(c2.regex_fr_mentions.length).toBe(0);
  });

  it('TS-6b: a PLAN_TO_EXEC-phase prose mention (no fr_coverage) is a second, independent non-load-bearing witness', async () => {
    const frs = [{ id: 'FR-4' }];
    const withMention = [{ id: 'r1', phase: 'PLAN_TO_EXEC', summary: 'pre-implementation note about FR-4', metadata: {} }];
    const c1 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: withMention }), { sdId: 'sd-ts6b', functionalRequirements: frs });
    const c2 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: [] }), { sdId: 'sd-ts6b', functionalRequirements: frs });
    expect(c1.frs[0].status).toBe(c2.frs[0].status);
    expect(c1.regex_fr_mentions.length).toBeGreaterThan(0);
  });

  it('TS-7: malformed real-world fr_coverage shapes never throw and never promote (classifyFrDelivery level)', async () => {
    const shapes = [{ 'FR-1': 'prose' }, ['FR-1', 'FR-2'], { covered: 'FR-1' }, { fr_coverage_check: true }, '7/7'];
    for (const shape of shapes) {
      const rows = [{ id: 'r1', phase: 'EXEC', metadata: { fr_coverage: shape } }];
      const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-ts7', functionalRequirements: FRS3 });
      expect(c.delivered).toBe(0);
    }
  });

  it('TS-8: only the measured EXEC-or-later allow-list promotes, across spelling variants; LEAD/PLAN/PLAN_TO_EXEC do not', async () => {
    const admittedPhases = ['EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL', 'COMPLETED', 'PLAN_VERIFY', 'PLAN_VERIFICATION', 'EXEC_IMPLEMENTATION', 'EXEC_COMPLETE', 'orchestrated'];
    const rejectedPhases = ['LEAD', 'PLAN', 'PLAN_TO_EXEC'];
    const allPhases = [...admittedPhases, ...rejectedPhases];
    const frs = allPhases.map((_, i) => ({ id: `FR-${i + 1}` }));
    const rows = allPhases.map((phase, i) => testingRow({ id: `r${i}`, phase, coverage: [{ fr_id: `FR-${i + 1}`, status: 'delivered', test_ref: 'x' }] }));
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-ts8', functionalRequirements: frs });
    for (let i = 0; i < admittedPhases.length; i++) {
      expect(c.frs[i].status).toBe('delivered');
    }
    for (let i = admittedPhases.length; i < allPhases.length; i++) {
      expect(c.frs[i].status).not.toBe('delivered');
    }
  });

  it('TS-8b: a COMPLETED-phase row promotes (non-regression against the corrected D2/N4 measurement)', async () => {
    const frs = [{ id: 'FR-1' }];
    const rows = [testingRow({ id: 'r1', phase: 'COMPLETED', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-ts8b', functionalRequirements: frs });
    expect(c.frs[0].status).toBe('delivered');
    expect(c.frs[0].delivery_basis).toBe('testing_evidence');
  });

  it('TS-conflict: story wins over a conflicting fr_coverage entry; the conflict is surfaced, not silently dropped', async () => {
    const frs = [{ id: 'FR-1' }];
    const stories = [{ id: 's1', title: 'delivers FR-1', status: 'completed' }];
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'undelivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories, testingRows: rows }), { sdId: 'sd-tsconflict', functionalRequirements: frs });
    expect(c.frs[0].status).toBe('delivered');
    expect(c.frs[0].delivery_basis).toBe('story');
    expect(c.conflicting_signals).toEqual([{ fr_id: 'FR-1', story_says: 'delivered', testing_evidence_says: 'undelivered' }]);
  });

  it('TS-N1 (closes N1): an admitted TESTING row with no valid fr_coverage entries does not count as work product', async () => {
    for (const coverage of [[], [{ nope: true }]]) {
      const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage })];
      const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-tsn1', functionalRequirements: FRS3 });
      expect(c.has_work_product).toBe(false);
      expect(c.undelivered).toBe(3);
      expect(c.unverifiable).toBe(0);
      expect(c.testing_evidence_rows_seen).toBe(1);
    }
  });

  it('TS-N2 (closes N2): an unmatched fr_coverage entry does not flip siblings from unverifiable to undelivered', async () => {
    const stories = [{ id: 's1', title: 'unrelated work', status: 'completed' }];
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-99', status: 'delivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories, testingRows: rows }), { sdId: 'sd-tsn2', functionalRequirements: FRS3 });
    expect(c.convention_in_use).toBe(false);
    expect(c.unverifiable).toBe(3);
    expect(c.undelivered).toBe(0);
    expect(c.unmatched_fr_coverage_ids).toEqual(['FR-99']);
  });

  it('AC-8/R7: a matched entry explicitly marked undelivered proves the convention is in use, at least as strongly as no evidence', async () => {
    const stories = [{ id: 's1', title: 'unrelated work', status: 'completed' }]; // Fixture C setup: hasWorkProduct via story, references no FR
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-2', status: 'undelivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories, testingRows: rows }), { sdId: 'sd-r7', functionalRequirements: FRS3 });
    expect(c.convention_in_use).toBe(true);
    expect(c.frs.find((f) => f.id === 'FR-2').status).toBe('undelivered');
    expect(c.unverifiable).toBe(0);
    expect(c.undelivered).toBe(3);
  });

  it('F1 (HIGH, closes: regex was proven non-load-bearing for deliveredBy but NOT for conventionInUse): Fixture C + a prose-only FR mention does not flip unverifiable to undelivered', async () => {
    // Fixture C: one validated story that references NO FR (hasWorkProduct=true via the story,
    // conventionInUse=false) -- the ONLY shape where conventionInUse's value is actually
    // observable in the output (in a hasWorkProduct=false fixture like TS-6/TS-6b, unmeasurable
    // is false regardless of conventionInUse, so a conventionInUse-only mutation is invisible
    // there — confirmed by an adversarial mutation sweep that survived all 65 pre-existing tests).
    const stories = [{ id: 's1', title: 'unrelated work', status: 'completed' }];
    const rows = [{ id: 'r1', phase: 'EXEC', detailed_analysis: 'Note: this may relate to FR-2', metadata: {} }]; // prose only, no fr_coverage
    const c = await classifyFrDelivery(stubWithTesting({ stories, testingRows: rows }), { sdId: 'sd-f1', functionalRequirements: FRS3 });
    expect(c.regex_fr_mentions.length).toBeGreaterThan(0); // the mention IS captured (diagnostic)...
    expect(c.convention_in_use).toBe(false);                // ...but never promotes conventionInUse
    expect(c.unverifiable).toBe(3);                          // stays unverifiable, not undelivered
    expect(c.undelivered).toBe(0);
    expect(c.delivered).toBe(0);
  });

  it('F7 (closes: a matched testingDelivered entry silently overwrote an approver-gated descope): descope wins, the disagreement is still recorded', async () => {
    const rows = [testingRow({ id: 'r1', phase: 'EXEC', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), {
      sdId: 'sd-f7',
      functionalRequirements: [{ id: 'FR-1' }],
      sdMetadata: { descoped_frs: [{ fr_id: 'FR-1', approved_by: 'chairman', reason: 'deferred' }] },
    });
    expect(c.frs[0].status).toBe('descoped');
    expect(c.descoped).toBe(1);
    expect(c.delivered).toBe(0);
    expect(c.conflicting_signals).toEqual([{ fr_id: 'FR-1', descoped_by: 'chairman', testing_evidence_says: 'delivered' }]);
  });

  it('TS-R2 (closes R2): an unrecognized-phase row (PLAN_PRD) does not promote and is separately diagnosed', async () => {
    const frs = [{ id: 'FR-1' }];
    const rows = [testingRow({ id: 'r1', phase: 'PLAN_PRD', coverage: [{ fr_id: 'FR-1', status: 'delivered', test_ref: 'x' }] })];
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: rows }), { sdId: 'sd-tsr2', functionalRequirements: frs });
    expect(c.frs[0].status).not.toBe('delivered');
    expect(c.unrecognized_phase_rows).toEqual([{ sub_agent_result_id: 'r1', phase: 'PLAN_PRD' }]);
  });

  it('TR-3: a bound query error degrades gracefully to story-only behavior, not a thrown exception', async () => {
    const stories = [{ id: 's1', title: 'covers FR-1', status: 'completed' }];
    const c = await classifyFrDelivery(stubWithTesting({ stories, testingError: { message: 'boom' } }), { sdId: 'sd-tr3', functionalRequirements: [{ id: 'FR-1' }, { id: 'FR-2' }] });
    expect(c.frs.find((f) => f.id === 'FR-1').status).toBe('delivered');
    expect(c.testing_evidence_rows_seen).toBe(0);
  });

  // Pre-existing bug found by testing-agent evidence e3437068-25eb-4922-b069-90bec988ff3f while
  // reviewing SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 (filed as standalone feedback, out of
  // that SD's scope): the user_stories query destructured only {data}, so an error made `data`
  // null and every FR on the SD silently classified undelivered/unverifiable with no visibility
  // into WHY. Fixed by binding `error` and surfacing stories_lookup_failed, mirroring the
  // pre-existing compliance_lookup_failed pattern for the sibling testing_evidence query.
  it('a bound user_stories query error is surfaced via stories_lookup_failed, not silently folded into zero validated stories', async () => {
    const c = await classifyFrDelivery(
      stubWithTesting({ storiesError: { message: 'column "description" does not exist' }, testingRows: [] }),
      { sdId: 'sd-stories-err', functionalRequirements: [{ id: 'FR-1' }, { id: 'FR-2' }] },
    );
    expect(c.stories_lookup_failed).toBe(true);
    expect(c.validated_story_count).toBe(0);
    // Degrades gracefully -- no throw, and the existing classification logic still runs.
    expect(c.frs).toHaveLength(2);
  });

  it('stories_lookup_failed is false on a healthy (non-erroring) lookup, including a genuine zero-rows result', async () => {
    const c = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: [] }), { sdId: 'sd-stories-ok', functionalRequirements: [{ id: 'FR-1' }] });
    expect(c.stories_lookup_failed).toBe(false);
  });
});

describe('TS-10: consuming gates tolerate the extended classification shape', () => {
  it('a classification with all new fields present but empty produces byte-identical scoring/warnings to the pre-extension shape', () => {
    const base = { frs: [{ id: 'FR-002', description: 'b', status: 'undelivered' }, { id: 'FR-001', description: 'a', status: 'delivered' }], total: 2, delivered: 1, descoped: 0, undelivered: 1, unverifiable: 0 };
    const extended = { ...base, regex_fr_mentions: [], testing_evidence_rows_seen: 0, unmatched_fr_coverage_ids: [], unresolved_test_refs: [], conflicting_signals: [], unrecognized_phase_rows: [], rejected_phase_rows: [], compliance_lookup_failed: false, stories_lookup_failed: false };
    const rBase = projectGateResult(base, { enforced: true });
    const rExtended = projectGateResult(extended, { enforced: true });
    expect(rExtended.passed).toBe(rBase.passed);
    expect(rExtended.score).toBe(rBase.score);
    expect(rExtended.issues).toEqual(rBase.issues);
    expect(rExtended.warnings).toEqual(rBase.warnings);
  });

  // SECURITY LOW finding (round 5 follow-up): a failed repo-compliance lookup silently degraded
  // to "the writer produced nothing valid", producing an UNDELIVERED verdict that stated a claim
  // ("nothing was built or validated") the gate never actually measured -- this module's own
  // header names exactly that class of bug as the defect it was repaired to remove.
  it('compliance_lookup_failed=true is NEVER silent, in either enforcement mode', () => {
    const base = { frs: [], total: 2, delivered: 0, descoped: 0, undelivered: 2, unverifiable: 0, compliance_lookup_failed: true };
    for (const enforced of [true, false]) {
      const r = projectGateResult(base, { enforced });
      expect(r.warnings.join(' ')).toMatch(/repo-compliance lookup.*failed/i);
    }
  });
  it('compliance_lookup_failed=false produces no such warning', () => {
    const base = { frs: [], total: 2, delivered: 2, descoped: 0, undelivered: 0, unverifiable: 0, compliance_lookup_failed: false };
    const r = projectGateResult(base, { enforced: true });
    expect(r.warnings.join(' ')).not.toMatch(/repo-compliance lookup/i);
  });

  it('stories_lookup_failed=true is NEVER silent, in either enforcement mode', () => {
    const base = { frs: [], total: 2, delivered: 0, descoped: 0, undelivered: 2, unverifiable: 0, stories_lookup_failed: true };
    for (const enforced of [true, false]) {
      const r = projectGateResult(base, { enforced });
      expect(r.warnings.join(' ')).toMatch(/user_stories lookup.*failed/i);
    }
  });
  it('stories_lookup_failed=false produces no such warning', () => {
    const base = { frs: [], total: 2, delivered: 2, descoped: 0, undelivered: 0, unverifiable: 0, stories_lookup_failed: false };
    const r = projectGateResult(base, { enforced: true });
    expect(r.warnings.join(' ')).not.toMatch(/user_stories lookup/i);
  });
});

describe('TR-5/TS-9: mutation test — regex_fr_mentions is genuinely non-load-bearing', () => {
  const SOURCE_PATH = fileURLToPath(new URL('../../../../scripts/modules/handoff/gates/fr-delivery-classifier.js', import.meta.url));
  const E2E_PATH_GUARD_URL = pathToFileURL(fileURLToPath(new URL('../../../../lib/stories/e2e-path-guard.js', import.meta.url))).href;
  const ANCHOR = 'const deliveredBy = validated.find((s) => frReferencesId(s, id));';
  const MUTATED = "const deliveredBy = validated.find((s) => frReferencesId(s, id)) || (regexFrMentions.some((m) => String(m.fr_id).trim().toUpperCase() === String(id).trim().toUpperCase()) ? { id: '__MUTATION_REGEX_WITNESS__' } : undefined);";
  // The mutated copy is written to os.tmpdir(), so its own relative import of e2e-path-guard.js
  // (added for SECURITY finding 2) would resolve against the WRONG directory. Rewrite it to an
  // absolute file:// URL before writing the copy — same end-anchored-string-replace hermetic
  // approach as the ANCHOR mutation itself, not a fixed offset.
  const IMPORT_ANCHOR = "import { specFileExists } from '../../../../lib/stories/e2e-path-guard.js';";

  it('wiring regex_fr_mentions into deliveredBy resolution makes TS-6 and TS-6b fail, by name', async () => {
    const source = readFileSync(SOURCE_PATH, 'utf8');
    const occurrences = source.split(ANCHOR).length - 1;
    expect(occurrences).toBe(1); // the pinned anchor must exist exactly once, end-anchored, for a hermetic mutation
    const importOccurrences = source.split(IMPORT_ANCHOR).length - 1;
    expect(importOccurrences).toBe(1);
    const mutatedSource = source
      .replace(ANCHOR, MUTATED)
      .replace(IMPORT_ANCHOR, `import { specFileExists } from '${E2E_PATH_GUARD_URL}';`);

    const tempPath = join(tmpdir(), `fr-delivery-classifier.mutated.${Date.now()}.${Math.random().toString(36).slice(2)}.mjs`);
    writeFileSync(tempPath, mutatedSource, 'utf8');
    try {
      const mutated = await import(pathToFileURL(tempPath).href);

      // TS-6 witness: LEAD-phase prose mention of FR-3, no fr_coverage entry.
      const ts6Rows = [{ id: 'r1', phase: 'LEAD', detailed_analysis: 'Risk: FR-3 needs attention', metadata: {} }];
      const ts6Mutated = await mutated.classifyFrDelivery(stubWithTesting({ stories: [], testingRows: ts6Rows }), { sdId: 'sd-mut-ts6', functionalRequirements: [{ id: 'FR-3' }] });
      expect(ts6Mutated.frs[0].status).toBe('delivered'); // TS-6 witness FAILS (flips) under the mutation

      // TS-6b witness: PLAN_TO_EXEC-phase prose mention of FR-4, no fr_coverage entry.
      const ts6bRows = [{ id: 'r1', phase: 'PLAN_TO_EXEC', summary: 'pre-implementation note about FR-4', metadata: {} }];
      const ts6bMutated = await mutated.classifyFrDelivery(stubWithTesting({ stories: [], testingRows: ts6bRows }), { sdId: 'sd-mut-ts6b', functionalRequirements: [{ id: 'FR-4' }] });
      expect(ts6bMutated.frs[0].status).toBe('delivered'); // TS-6b witness FAILS (flips) under the mutation too
    } finally {
      unlinkSync(tempPath);
    }
  });

  it('sanity: the SAME fixtures do NOT flip under the real, unmutated module', async () => {
    const ts6Rows = [{ id: 'r1', phase: 'LEAD', detailed_analysis: 'Risk: FR-3 needs attention', metadata: {} }];
    const c1 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: ts6Rows }), { sdId: 'sd-real-ts6', functionalRequirements: [{ id: 'FR-3' }] });
    expect(c1.frs[0].status).not.toBe('delivered');

    const ts6bRows = [{ id: 'r1', phase: 'PLAN_TO_EXEC', summary: 'pre-implementation note about FR-4', metadata: {} }];
    const c2 = await classifyFrDelivery(stubWithTesting({ stories: [], testingRows: ts6bRows }), { sdId: 'sd-real-ts6b', functionalRequirements: [{ id: 'FR-4' }] });
    expect(c2.frs[0].status).not.toBe('delivered');
  });
});
