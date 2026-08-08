import { describe, it, expect } from 'vitest';
import { invokeNurseryReeval } from '../../../../lib/eva/stage-zero/nursery-reeval-invoker.js';
import { REGISTERED_SERVICE_PRINCIPALS } from '../../../../lib/eva/stage-zero/nursery-reeval-request.js';

/**
 * WHY THIS FILE EXISTS AS A SEPARATE FILE.
 *
 * nursery-reeval-invoker.test.js is carried VERBATIM from the source branch so that when the
 * gated enqueue PR eventually lands it produces no merge conflict. But every one of its
 * invokeNurseryReeval call sites INJECTS `registeredPrincipals` through the test seam, so
 * nothing there ever exercises the module resolving the REAL production registry through its
 * own default parameter — which is precisely the path that matters for the claim "this cannot
 * enqueue". Closing that gap by editing the verbatim file would trade a real guarantee for a
 * test, so the coverage lives here instead.
 *
 * WHAT IT PINNED, AND WHY THAT SENTENCE NO LONGER HOLDS HERE. On main the claim was: "the
 * scheduler is safe because the production allowlist is EMPTY, not because a config flag says
 * so." This branch is the change that ARMS that allowlist (FR-5/AC-10 provisions
 * svc-stage-zero-invoker@execholdings.ai), so the empty-registry property is deliberately gone
 * and the assertions resting on it would now be asserting a state the branch exists to leave.
 *
 * Rewriting them to green would have been the exact mistake this file was built to catch, so
 * the coverage is KEPT and re-pointed instead:
 *   - the fail-closed-on-empty path is still exercised, by INJECTING an empty registry rather
 *     than relying on the production one happening to be empty. That path stays reachable
 *     forever regardless of what the real registry holds, which is strictly better coverage
 *     than it had — it was previously hostage to a production constant.
 *   - what governs the DEFAULT path on this branch is asserted separately below: the registry
 *     resolves a principal, and the enqueue is then stopped by the auth.users EXISTENCE check,
 *     which fails closed when it cannot see auth.users at all.
 *
 * WHAT THIS FILE DOES NOT CLAIM, stated so nobody reads a green run as more than it is: that
 * the armed configuration is cleared to run in production. That is a domain attestation for the
 * service principal and it is the chairman's alone; PR #6528 stays gated on it. These are tests
 * of code properties, not an authorisation.
 */

/** A registry that is empty BY INJECTION — see the header for why this replaced the real one. */
const EMPTY_REGISTRY = Object.freeze([]);

/** Minimal Supabase double that RECORDS whether anything was written. */
function makeRecordingSupabase() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      if (table === 'venture_nursery') {
        // Deliberately non-empty: if the early return ever regressed, a candidate WOULD be
        // available, so this fixture cannot mask the regression by having nothing to select.
        //
        // The is/or/order chain is not decoration. applyPendingNurseryPredicate() calls all
        // three unconditionally (venture-nursery.js:457-465), so a double lacking them aborts a
        // regressed run with "query.is is not a function" before it reaches anything meaningful.
        // The test would still fail — but for the wrong reason, and the assertion meant to catch
        // the regression would never be evaluated. A fixture that fails by accident is not
        // testing what its name says it tests.
        //
        // WHAT ACTUALLY STOPS A REGRESSED RUN, stated precisely because the tempting one-line
        // version of this comment is wrong: there are TWO guards, not one. Disabling the early
        // return at invoker.js:99 does NOT produce an insert — execution proceeds to AC-10's
        // in-path check, where buildNurseryReevalRequest is called with the empty registry and
        // throws UnregisteredPrincipalError. The module keeps that second check deliberately
        // ("kept in the path rather than trusted to have been checked above"). So `inserts`
        // staying empty is defence in depth, and this fixture is what lets the run travel far
        // enough to prove the second guard is really there rather than assumed.
        const q = {
          is: () => q,
          or: () => q,
          order: () => q,
          limit: () => Promise.resolve({
            data: [{ id: '3d95f7ea-7d6e-4ffd-ba14-2d915b65fda1', next_evaluation_at: null }],
            error: null,
          }),
        };
        return { select: () => q };
      }
      if (table === 'stage_zero_requests') {
        // Chainable through the REAL dedupe shape — .select().in().eq().eq().limit(1). A double
        // that resolves early instead of chaining would abort a regressed run with a TypeError
        // before it could reach .insert(), which is the only thing `inserts` can observe.
        const q = {
          select: () => q,
          eq: () => q,
          in: () => q,
          limit: () => Promise.resolve({ data: [], error: null }),
          insert: (row) => {
            inserts.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'req-1' }, error: null }) }) };
          },
        };
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

describe('nursery re-eval fails closed on an EMPTY registry (injected, not inherited)', () => {
  const emptyRegistry = { registeredPrincipals: EMPTY_REGISTRY };

  it('refuses to enqueue, and writes NOTHING, when no principal is registered', async () => {
    const sb = makeRecordingSupabase();

    const out = await invokeNurseryReeval({}, { supabase: sb, ...emptyRegistry });

    // It RETURNS a verdict rather than throwing — invoker.js reads registeredPrincipals[0],
    // finds undefined, and returns early. Asserting a throw here would fail against correct code.
    expect(out).toEqual({ enqueued: false, reason: 'no_registered_service_principal' });

    // The assertion that actually matters: no row reached stage_zero_requests. A returned
    // `enqueued: false` is a claim about the outcome; this is the outcome.
    expect(sb.inserts).toHaveLength(0);
  });

  it('refuses BEFORE reading the nursery, so no candidate is selected it could not act on', async () => {
    let nurseryRead = false;
    const sb = makeRecordingSupabase();
    const inner = sb.from.bind(sb);
    sb.from = (table) => {
      if (table === 'venture_nursery') nurseryRead = true;
      return inner(table);
    };

    await invokeNurseryReeval({}, { supabase: sb, ...emptyRegistry });

    // Ordering is a deliberate design choice the module documents: discovering the config gap
    // after selecting a candidate would log a row it was never able to act on, which reads as
    // a selection bug rather than the config gap it is.
    expect(nurseryRead).toBe(false);
  });

  it('still refuses when dryRun is set — dry-run is not the control here', async () => {
    // The cron workflow carries a dry-run input whose expression resolves to LIVE on scheduled
    // runs. Pinning that dryRun is irrelevant to this refusal: the empty registry stops the call
    // in either mode, so safety does not depend on that flag being read correctly.
    const sb = makeRecordingSupabase();
    const out = await invokeNurseryReeval({ dryRun: true }, { supabase: sb, ...emptyRegistry });
    expect(out).toEqual({ enqueued: false, reason: 'no_registered_service_principal' });
    expect(sb.inserts).toHaveLength(0);
  });
});

describe('nursery re-eval against the PRODUCTION registry (no injected seam)', () => {
  it('registers exactly one principal, frozen — an armed allowlist, not an empty one', () => {
    // The state this branch establishes, asserted directly so that arming it further (or
    // emptying it again) is a deliberate diff against a test rather than a silent edit.
    expect(REGISTERED_SERVICE_PRINCIPALS).toHaveLength(1);
    expect(Object.isFrozen(REGISTERED_SERVICE_PRINCIPALS)).toBe(true);
  });

  it('is stopped by the auth.users EXISTENCE check, which fails closed when it cannot look', async () => {
    // THE PATH THIS WHOLE FILE EXISTS FOR: no `registeredPrincipals` key, so the module resolves
    // its own default. With the registry armed, the emptiness early-return no longer fires and
    // execution reaches the existence precondition.
    //
    // The recording double has no `auth.admin`, which is the "I cannot see auth.users" case —
    // and defaultPrincipalExists treats "cannot tell" as "does not exist" rather than waving it
    // through. That direction is the point: this asserts the fail-closed branch, so a future
    // change that made an unreadable auth API mean "assume fine" fails here.
    const sb = makeRecordingSupabase();

    const out = await invokeNurseryReeval({}, { supabase: sb });

    expect(out.enqueued).toBe(false);
    expect(out.reason).toBe('registered_principal_missing');
    expect(sb.inserts).toHaveLength(0);
  });

  it('writes NOTHING through the default registry even with dryRun off', async () => {
    // Two-sided against the test above: same default path, the mode an operator would actually
    // run, still zero inserts. `enqueued: false` is a claim about the outcome; this is it.
    const sb = makeRecordingSupabase();
    await invokeNurseryReeval({ dryRun: false }, { supabase: sb });
    expect(sb.inserts).toHaveLength(0);
  });
});
