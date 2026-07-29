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
 * WHAT IT PINS. The scheduler is safe on main because the production allowlist is EMPTY, not
 * because a config flag says so. That is a property of the code, and this asserts it directly.
 */

/** Minimal Supabase double that RECORDS whether anything was written. */
function makeRecordingSupabase() {
  const inserts = [];
  return {
    inserts,
    from(table) {
      if (table === 'venture_nursery') {
        // Deliberately non-empty: if the guard ever regressed, a candidate WOULD be available,
        // so this fixture cannot mask a failure by having nothing to select.
        const q = {
          select: () => q,
          limit: () => Promise.resolve({
            data: [{ id: '3d95f7ea-7d6e-4ffd-ba14-2d915b65fda1', next_evaluation_at: null }],
            error: null,
          }),
        };
        return { select: () => q };
      }
      if (table === 'stage_zero_requests') {
        const q = {
          select: () => q,
          eq: () => q,
          in: () => Promise.resolve({ data: [], error: null }),
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

describe('nursery re-eval against the PRODUCTION registry (no injected seam)', () => {
  it('has an EMPTY production registry — the property every other assertion here rests on', () => {
    expect(REGISTERED_SERVICE_PRINCIPALS).toHaveLength(0);
    expect(Object.isFrozen(REGISTERED_SERVICE_PRINCIPALS)).toBe(true);
  });

  it('refuses to enqueue, and writes NOTHING, when no principal is registered', async () => {
    const sb = makeRecordingSupabase();

    // No `registeredPrincipals` key: the module falls back to REGISTERED_SERVICE_PRINCIPALS.
    const out = await invokeNurseryReeval({}, { supabase: sb });

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

    await invokeNurseryReeval({}, { supabase: sb });

    // Ordering is a deliberate design choice the module documents: discovering the config gap
    // after selecting a candidate would log a row it was never able to act on, which reads as
    // a selection bug rather than the config gap it is.
    expect(nurseryRead).toBe(false);
  });

  it('still refuses when dryRun is set — dry-run is not the control here', async () => {
    // The excluded cron workflow carries a dry-run input whose expression resolves to LIVE on
    // scheduled runs. Pinning that dryRun is irrelevant to this refusal: the empty registry
    // stops the call in either mode, so safety does not depend on that flag being read correctly.
    const sb = makeRecordingSupabase();
    const out = await invokeNurseryReeval({ dryRun: true }, { supabase: sb });
    expect(out).toEqual({ enqueued: false, reason: 'no_registered_service_principal' });
    expect(sb.inserts).toHaveLength(0);
  });
});
