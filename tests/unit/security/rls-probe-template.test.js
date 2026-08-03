// SELF-TEST for the canonical RLS probe template — SD-LEO-INFRA-SURVEY-EVERY-PERMISSION-001 FR-5 / TS-1,2,7.
//
// The point of this file is NOT that the template runs. It is that the template DISCRIMINATES: a
// version that returned OPEN unconditionally, or REFUSED unconditionally, must FAIL here. Both arms
// are asserted in the same scenario because a suite whose every arm expects the same verdict is
// satisfied by a constant function — that exact vacuity was caught in this SD's own PRD draft.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  VERDICT, CONFIRM, ProbeTemplateError, buildProbePlan, classifyProbeEvidence, runProbe,
} = require('../../../lib/security/rls-probe-template.cjs');

const validRow = { subject: '__PROBE_MARKER__', source_type: 'auto_capture', feedback_type: 'user_bug', description: 'probe' };
const nonsense = { subject: '__PROBE_MARKER__', source_type: 'auto_capture', feedback_type: 'sentry_error', description: 'control' };
const plan = () => buildProbePlan({ table: 'feedback', validRow, fieldUnderTest: 'feedback_type', nonsenseControl: nonsense });

// LAZY like the real supabase-js builder: the request fires on AWAIT, not at insert(). An eager fake
// mutated state during .insert() and made the leg-2 readback see the bare row, misreporting WHICH leg
// found it — a fake-fidelity bug that produced a confident wrong answer about ORDER.
function fakeAnon({ landsWithReturning = false, landsOnBare = false, store = null }) {
  return {
    from: () => ({
      insert: () => ({
        then(resolve) {
          if (landsOnBare && store) store.rows = [{ id: 'landed-bare' }];
          return Promise.resolve(landsOnBare ? { error: null } : { error: { code: '42501' } }).then(resolve);
        },
        select() {
          if (landsWithReturning && store) store.rows = [{ id: 'landed-ret' }];
          return Promise.resolve(landsWithReturning
            ? { data: [{ id: 'landed-ret' }], error: null }
            : { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "feedback"' } });
        },
      }),
    }),
  };
}
// delete().eq() must be awaitable AND chain .select() — deletion-count mode counts what it removed.
function fakeService(store) {
  return {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: store.rows, error: null }) }),
      delete: () => ({
        eq: () => {
          const removed = store.rows;
          store.rows = [];
          const settled = Promise.resolve({ data: removed, error: null });
          return { then: (r, j) => settled.then(r, j), select: () => settled };
        },
      }),
    }),
  };
}
const ok = async () => {};

describe('FR-5 — the nonsense control is a SLOT, not a discipline', () => {
  it('THROWS when the control is omitted (a remembered control is absent when it matters most)', () => {
    expect(() => buildProbePlan({ table: 'feedback', validRow, fieldUnderTest: 'feedback_type' }))
      .toThrow(ProbeTemplateError);
  });
  it('THROWS without an otherwise-valid row — a constraint trip says nothing about the policy', () => {
    expect(() => buildProbePlan({ table: 'feedback', fieldUnderTest: 'x', nonsenseControl: nonsense }))
      .toThrow(/OTHERWISE-VALID/);
  });
  it('accepts a complete plan', () => {
    expect(plan().nonsenseControl).toBeTruthy();
  });
});

describe('FR-5 — the template DISCRIMINATES (both arms, one scenario)', () => {
  it('OPEN when the bare write lands, REFUSED for the control — in the SAME run', async () => {
    const openStore = { rows: [] };
    const openVerdict = await runProbe({
      anon: fakeAnon({ landsOnBare: true, store: openStore }),
      service: fakeService(openStore), plan: plan(), assertPrecondition: ok,
    });

    const refusedStore = { rows: [] };
    const refusedVerdict = await runProbe({
      anon: fakeAnon({ landsOnBare: false, store: refusedStore }),
      service: fakeService(refusedStore), plan: plan(), assertPrecondition: ok,
    });

    // A constant-OPEN template fails the second; a constant-REFUSED template fails the first.
    expect(openVerdict.verdict).toBe(VERDICT.OPEN);
    expect(openVerdict.detail.landed_via).toBe('bare-write');
    expect(refusedVerdict.verdict).toBe(VERDICT.REFUSED);
    expect(refusedVerdict.detail.legs).toBe(3);
    expect(openVerdict.verdict).not.toBe(refusedVerdict.verdict);
  });

  it('OPEN when the RETURNING attempt itself succeeds', async () => {
    const store = { rows: [] };
    const v = await runProbe({
      anon: fakeAnon({ landsWithReturning: true, store }),
      service: fakeService(store), plan: plan(), assertPrecondition: ok,
    });
    expect(v.verdict).toBe(VERDICT.OPEN);
    expect(v.detail.landed_via).toBe('with-returning');
  });
});

describe('FR-5 — absence-readback ALONE is INCONCLUSIVE, never REFUSED', () => {
  it('two legs is not enough — this is the false all-clear the SD was built on', () => {
    const v = classifyProbeEvidence({
      withReturning: { data: null, error: { code: '42501' } },
      readbackAfterReturning: { rows: [] },
    });
    expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(v.detail.legs).toBe(2);
  });
  it('an error code with no confirmation at all is one leg', () => {
    const v = classifyProbeEvidence({ withReturning: { data: null, error: { code: '42501' } } });
    expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(v.detail.legs).toBe(1);
  });
  it('a failed readback is ABSENT EVIDENCE, not evidence of absence', () => {
    const v = classifyProbeEvidence({
      withReturning: { data: null, error: { code: '42501' } },
      readbackAfterReturning: null,
      bareInsert: { error: { code: '42501' } },
      readbackAfterBare: null,
    });
    expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
  });
});

describe('FR-5 — deletion-count is a valid leg-2 variant (found live in SURVEY-1)', () => {
  it('REFUSED when both legs deleted zero rows', () => {
    const v = classifyProbeEvidence({
      confirmBy: CONFIRM.DELETION_COUNT,
      withReturning: { data: null, error: { code: '42501' } },
      readbackAfterReturning: { deleted: 0 },
      bareInsert: { error: { code: '42501' } },
      readbackAfterBare: { deleted: 0 },
    });
    expect(v.verdict).toBe(VERDICT.REFUSED);
  });
  it('OPEN when a deletion removed a row that should never have existed', () => {
    const v = classifyProbeEvidence({
      confirmBy: CONFIRM.DELETION_COUNT,
      withReturning: { data: null, error: { code: '42501' } },
      readbackAfterReturning: { deleted: 0 },
      bareInsert: { error: null },
      readbackAfterBare: { deleted: 1 },
    });
    expect(v.verdict).toBe(VERDICT.OPEN);
  });
});

describe('FR-5 / TS-7 — fixture drift HARD-ERRORS, never skips', () => {
  it('refuses to run without a precondition assert', async () => {
    const store = { rows: [] };
    await expect(runProbe({ anon: fakeAnon({ store }), service: fakeService(store), plan: plan() }))
      .rejects.toThrow(/assertPrecondition is REQUIRED/);
  });
  it('propagates a drift throw rather than degrading to a verdict', async () => {
    const store = { rows: [] };
    await expect(runProbe({
      anon: fakeAnon({ store }), service: fakeService(store), plan: plan(),
      assertPrecondition: async () => { throw new Error('policy set drifted: anon_feedback_ingress_bounds missing'); },
    })).rejects.toThrow(/drifted/);
  });
});

describe('FR-5 — a NON-POLICY error is INCONCLUSIVE, never REFUSED', () => {
  // MEASURED, and the reason this arm exists: probing `feedback` with a row carrying a `subject`
  // column (that table has none — the marker column is `title`) died PGRST204 in the schema cache
  // BEFORE any policy ran. All three legs came back absent and the classifier said
  // "REFUSED — three legs confirmed" about a surface that is in fact OPEN for source_type='telegram'.
  // A malformed probe fails CONSISTENTLY, which is indistinguishable from a working guard.
  it('PGRST204 (column not in schema cache) is INCONCLUSIVE even with all three legs absent', () => {
    const v = classifyProbeEvidence({
      withReturning: { data: null, error: { code: 'PGRST204' } },
      readbackAfterReturning: { rows: [] },
      bareInsert: { error: { code: 'PGRST204' } },
      readbackAfterBare: { rows: [] },
    });
    expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(v.detail.non_policy_error).toBe(true);
  });

  // ALLOWLIST, NOT BLOCKLIST — an enumerated list of non-policy codes is always one entry short, so
  // an unanticipated code must fail CLOSED to INCONCLUSIVE rather than through to REFUSED.
  it.each(['PGRST205', '42703', '23502', '23514', '22P02', 'SOME-UNANTICIPATED-CODE'])(
    'code %s never yields REFUSED', (code) => {
      const v = classifyProbeEvidence({
        withReturning: { data: null, error: { code } },
        readbackAfterReturning: { rows: [] },
        bareInsert: { error: { code } },
        readbackAfterBare: { rows: [] },
      });
      expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
    });

  it('still reaches REFUSED for the real RLS code, so the guard above did not just disable the verdict', () => {
    const v = classifyProbeEvidence({
      withReturning: { data: null, error: { code: '42501' } },
      readbackAfterReturning: { rows: [] },
      bareInsert: { error: { code: '42501' } },
      readbackAfterBare: { rows: [] },
    });
    expect(v.verdict).toBe(VERDICT.REFUSED);
  });
});

describe('FR-5 — the COLLECTOR must not manufacture absence (SECURITY H1)', () => {
  // postgrest-js resolves failures as {data:null,error} instead of throwing, so a `catch`-only guard
  // never runs and every failed readback became rows:[] — "observed, and absent". That is one of the
  // two conjuncts REFUSED requires, so a landed row could be reported REFUSED {legs:3}. The
  // classifiers were correct throughout; the collector lied to them. These fakes RESOLVE with an
  // error exactly as the real client does.
  const erroringService = () => ({
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: null, error: { code: 'PGRST205' } }) }),
      delete: () => ({ eq: () => Promise.resolve({ data: null, error: { code: 'PGRST205' } }) }),
    }),
  });

  it('a readback that RESOLVES with an error is absent evidence — never REFUSED', async () => {
    const v = await runProbe({
      anon: fakeAnon({ landsOnBare: true, store: { rows: [] } }),
      service: erroringService(), plan: plan(), assertPrecondition: ok,
    }).catch((e) => ({ verdict: 'THREW', reason: e.message }));
    // Either it refuses to report (baseline guard) or it reports INCONCLUSIVE. What it must NEVER do
    // is return REFUSED off a readback that failed.
    expect(v.verdict).not.toBe(VERDICT.REFUSED);
  });

  it('refuses to report at all when the BASELINE confirmation fails', async () => {
    await expect(runProbe({
      anon: fakeAnon({ store: { rows: [] } }), service: erroringService(),
      plan: plan(), assertPrecondition: ok,
    })).rejects.toThrow(/baseline confirmation FAILED/);
  });

  it('refuses to run when the marker already matches a row — no OPEN from residue (M2)', async () => {
    const store = { rows: [{ id: 'pre-existing' }] };
    await expect(runProbe({
      anon: fakeAnon({ store }), service: fakeService(store), plan: plan(), assertPrecondition: ok,
    })).rejects.toThrow(/not unique/);
  });
});

describe('FR-5 — the nonsense control is EXECUTED, not merely required (SECURITY M1)', () => {
  // Instrumentation showed ZERO property reads on plan.nonsenseControl during a full probe: it was
  // present as a field and absent as a check. A probe cannot show it is still capable of failing by
  // holding a control it never attempts.
  it('withdraws a REFUSED verdict when the control row is ACCEPTED', async () => {
    const store = { rows: [] };
    // Denies the probe row, accepts anything else — i.e. the guard has stopped discriminating.
    const anon = {
      from: () => ({
        insert: (row) => {
          const isControl = String(row[Object.keys(row).find((k) => k === 'subject')] || '').includes('__CONTROL__');
          if (isControl) { store.rows = [{ id: 'control-landed' }]; return Promise.resolve({ error: null }); }
          return { then: (r) => Promise.resolve({ error: { code: '42501' } }).then(r),
            select: () => Promise.resolve({ data: null, error: { code: '42501' } }) };
        },
      }),
    };
    const service = {
      from: () => ({
        select: () => ({ eq: (_c, v) => Promise.resolve({
          data: String(v).includes('__CONTROL__') ? store.rows : [], error: null }) }),
        delete: () => ({ eq: () => { store.rows = []; return Promise.resolve({ error: null }); } }),
      }),
    };
    const v = await runProbe({ anon, service, plan: plan(), assertPrecondition: ok });
    expect(v.verdict).toBe(VERDICT.INCONCLUSIVE);
    expect(v.detail.control).toBe('landed');
    expect(v.detail.withdrawn_verdict).toBe(VERDICT.REFUSED);
  });

  it('a REFUSED verdict records that the control was denied', async () => {
    const store = { rows: [] };
    const v = await runProbe({
      anon: fakeAnon({ landsOnBare: false, store }), service: fakeService(store),
      plan: plan(), assertPrecondition: ok,
    });
    expect(v.verdict).toBe(VERDICT.REFUSED);
    expect(v.detail.control).toBe('denied');
  });
});

describe('FR-5 — deletion-count mode can actually CONCLUDE (SECURITY M3)', () => {
  // confirm() only ever emitted `rows` while present()/observed() read only `.deleted`, so in
  // deletion-count mode a LANDED write returned INCONCLUSIVE "no service-role confirmation" — about a
  // confirmation that had run. A mode that can never reach a verdict is not a mode.
  it('reports OPEN when the row lands, rather than INCONCLUSIVE', async () => {
    const store = { rows: [] };
    const dcPlan = buildProbePlan({
      table: 'feedback', validRow, fieldUnderTest: 'feedback_type',
      nonsenseControl: nonsense, confirmBy: CONFIRM.DELETION_COUNT,
    });
    const v = await runProbe({
      anon: fakeAnon({ landsOnBare: true, store }), service: fakeService(store),
      plan: dcPlan, assertPrecondition: ok,
    });
    expect(v.verdict).toBe(VERDICT.OPEN);
  });
});

describe('FR-5 — 1-REP is ENFORCED against the canary, not asserted in prose', () => {
  // The docstring used to claim "one representation of the rule, two consumers". It was false — the
  // canary required 42501 and this classifier did not. This test is what makes the claim true.
  //
  // SCOPE, STATED RATHER THAN IMPLIED: every case below is ABSENCE-MODE evidence, because absence
  // mode is the canary's ENTIRE domain — classifyRlsProbe has no confirmBy switch and reads only
  // `rows`. So this asserts agreement across the whole surface the two actually share, and it does
  // NOT cover deletion-count evidence, where they genuinely differ and the canary is not a consumer
  // at all. Left uncovered deliberately: forcing agreement there would mean asserting something about
  // a mode one side does not implement. A cross-check whose scope is unstated invites the reader to
  // assume it covers everything — which is how the divergence it now catches got in.
  const { classifyRlsProbe } = require('../../../lib/breakage/active-canary-probes.cjs');
  const EVIDENCE = [
    ['landed via bare', { withReturning: { data: null, error: { code: '42501' } }, readbackAfterReturning: { rows: [] }, bareInsert: { error: null }, readbackAfterBare: { rows: [{ id: 'x' }] } }],
    ['three-leg refusal', { withReturning: { data: null, error: { code: '42501' } }, readbackAfterReturning: { rows: [] }, bareInsert: { error: { code: '42501' } }, readbackAfterBare: { rows: [] } }],
    ['two legs only', { withReturning: { data: null, error: { code: '42501' } }, readbackAfterReturning: { rows: [] } }],
    ['non-policy error', { withReturning: { data: null, error: { code: 'PGRST204' } }, readbackAfterReturning: { rows: [] }, bareInsert: { error: { code: 'PGRST204' } }, readbackAfterBare: { rows: [] } }],
    ['landed via returning', { withReturning: { data: [{ id: 'x' }], error: null }, readbackAfterReturning: { rows: [{ id: 'x' }] } }],
  ];
  it.each(EVIDENCE)('template and canary agree on: %s', (_label, evidence) => {
    const mine = classifyProbeEvidence(evidence);
    const theirs = classifyRlsProbe(evidence);
    // Canary vocabulary -> template vocabulary. breakage=true means the write got through.
    const theirsVerdict = theirs.breakage ? VERDICT.OPEN : theirs.inconclusive ? VERDICT.INCONCLUSIVE : VERDICT.REFUSED;
    expect(mine.verdict).toBe(theirsVerdict);
  });
});

describe('FR-5 — never branch on message TEXT', () => {
  // Measured: a genuinely-denied control returns the SAME code AND the same message string as the
  // ambiguous case, so the template must decide on state and never on wording.
  it('the template source contains no error-message branching', () => {
    const src = require('node:fs').readFileSync(require.resolve('../../../lib/security/rls-probe-template.cjs'), 'utf8');
    expect(src).not.toMatch(/error\.message\s*[.=~]|message\s*\.\s*(includes|match)/);
  });
});
