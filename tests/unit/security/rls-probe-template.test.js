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
function fakeService(store) {
  return {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: store.rows, error: null }) }),
      delete: () => ({ eq: () => { store.rows = []; return Promise.resolve({ error: null }); } }),
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

describe('FR-5 — never branch on message TEXT', () => {
  // Measured: a genuinely-denied control returns the SAME code AND the same message string as the
  // ambiguous case, so the template must decide on state and never on wording.
  it('the template source contains no error-message branching', () => {
    const src = require('node:fs').readFileSync(require.resolve('../../../lib/security/rls-probe-template.cjs'), 'utf8');
    expect(src).not.toMatch(/error\.message\s*[.=~]|message\s*\.\s*(includes|match)/);
  });
});
