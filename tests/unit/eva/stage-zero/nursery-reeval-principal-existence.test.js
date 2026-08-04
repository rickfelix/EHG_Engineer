import { describe, it, expect, vi } from 'vitest';
import { invokeNurseryReeval } from '../../../../lib/eva/stage-zero/nursery-reeval-invoker.js';

/**
 * SD-EHG-IDEATION-PIPELINE-SEAMS-001 — THE DANGLING-PRINCIPAL FALSIFIER.
 *
 * THE DEFECT THIS PINS, measured 2026-08-04 rather than imagined: the branch registry carried
 * '27e0e91e-35f7-4617-bbb9-932408db80f1' under a comment reading "PROVISIONED 2026-07-26", and
 * auth.users contained no such row. REGISTERED_SERVICE_PRINCIPALS is a SOURCE-CONTROLLED list of
 * DATABASE ids; the two drift independently and nothing reconciled them. The allowlist answers
 * "is this id a MEMBER of the list", which it was, so every guard reported healthy and the INSERT
 * would have died one layer below on requested_by REFERENCES auth.users(id).
 *
 * WHY IT SURVIVED A WEEK OF GREEN SUITES: an EMPTY registry fails CLOSED and says so. A DANGLING
 * registry fails GREEN. The existing coverage asserts the empty case (nursery-reeval-production-
 * registry.test.js pins "the allowlist is empty, therefore nothing can enqueue") — a property
 * that CEASES TO HOLD the moment an id is added, and nothing replaced it. This file is the
 * replacement property: not "the list is empty" but "whatever is in the list actually exists".
 *
 * WHY THESE ARE UNIT TESTS AND NOT db-TIER TESTS, which is where they obviously belong:
 * vitest.config.js:156 sets `DB_INCLUDE_GATED = DB_TARGET.allowed ? DB_INCLUDE : []` and the db
 * project sets `passWithNoTests: true`. Against any non-designated target that tier is EMPTY and
 * GREEN — a db-tier existence test would report success having executed nothing, reproducing the
 * very "guard that cannot fail" shape it was written to catch. So the check lives at RUNTIME in
 * the invoker and is falsified HERE, in the tier that actually runs.
 */

const PRINCIPAL = '27e0e91e-35f7-4617-bbb9-932408db80f1';
const NURSERY_ID = '3d95f7ea-7d6e-4ffd-ba14-2d915b65fda1';

/**
 * Supabase double that RECORDS inserts. Chain shapes mirror the real call sites exactly — a
 * double that resolves early instead of chaining would abort a regressed run with a TypeError
 * before reaching .insert(), so the test would still go red but for the wrong reason and the
 * assertion meant to catch the regression would never be evaluated.
 */
function makeRecordingSupabase({ withAuthAdmin = null } = {}) {
  const inserts = [];
  const client = {
    inserts,
    from(table) {
      if (table === 'venture_nursery') {
        // Deliberately NON-EMPTY: if the existence guard ever regressed, a candidate WOULD be
        // available. A fixture with nothing to select could mask the regression by returning
        // 'no_due_candidates' for the wrong reason.
        const q = {
          is: () => q,
          or: () => q,
          order: () => q,
          limit: () => Promise.resolve({
            data: [{ id: NURSERY_ID, next_evaluation_at: null }],
            error: null,
          }),
        };
        return { select: () => q };
      }
      if (table === 'stage_zero_requests') {
        const q = {
          in: () => q,
          eq: () => q,
          limit: () => Promise.resolve({ data: [], error: null }), // no duplicate -> would enqueue
        };
        return {
          select: () => q,
          insert: (row) => {
            inserts.push(row);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'req-1' }, error: null }),
              }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  if (withAuthAdmin) client.auth = { admin: withAuthAdmin };
  return client;
}

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('invokeNurseryReeval — registered principal must EXIST, not merely be listed', () => {
  it('REFUSES to enqueue when a registered principal has no auth.users row', async () => {
    const supabase = makeRecordingSupabase();
    const result = await invokeNurseryReeval({}, {
      supabase,
      registeredPrincipals: [PRINCIPAL],
      principalExists: async () => ({ exists: false, detail: 'User not found' }),
      logger: silentLogger,
    });

    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe('registered_principal_missing');
    expect(result.principal).toBe(PRINCIPAL);
    // THE ASSERTION THAT MATTERS: nothing was written. Reason alone is not enough — a future
    // refactor could set the reason and still fall through to the insert.
    expect(supabase.inserts).toHaveLength(0);
    // Loud, not quiet: a dangling entry is a defect and must not read as "nothing was due".
    expect(silentLogger.error).toHaveBeenCalled();
  });

  it('FAILS CLOSED when existence cannot be determined (admin API absent on the client)', async () => {
    // Exercises the REAL defaultPrincipalExists — no principalExists injected — against a client
    // with no auth.admin. "I could not tell whether the principal exists" is not "it exists",
    // matching this module's existing stance on a failed dedupe read.
    const supabase = makeRecordingSupabase();
    const result = await invokeNurseryReeval({}, {
      supabase,
      registeredPrincipals: [PRINCIPAL],
      logger: silentLogger,
    });

    expect(result.enqueued).toBe(false);
    expect(result.reason).toBe('registered_principal_missing');
    expect(supabase.inserts).toHaveLength(0);
  });

  it('resolves a REAL principal through the live admin shape and proceeds to enqueue', async () => {
    // THE TWO-SIDED CONTROL. Without this case the suite would pass just as happily against an
    // invoker that refuses unconditionally, which would be a different bug wearing this fix's
    // clothes. It also pins the ACTUAL supabase admin response shape ({data:{user}}, error) that
    // defaultPrincipalExists destructures, so a wrong assumption about that shape fails here
    // rather than silently blocking every real enqueue in production.
    const getUserById = vi.fn(async (id) => ({ data: { user: { id } }, error: null }));
    const supabase = makeRecordingSupabase({ withAuthAdmin: { getUserById } });

    const result = await invokeNurseryReeval({}, {
      supabase,
      registeredPrincipals: [PRINCIPAL],
      logger: silentLogger,
    });

    expect(getUserById).toHaveBeenCalledWith(PRINCIPAL);
    expect(result.enqueued).toBe(true);
    expect(supabase.inserts).toHaveLength(1);
    // Attribution is the point of the whole guard — assert the row carries the principal.
    expect(supabase.inserts[0].requested_by).toBe(PRINCIPAL);
  });
});
