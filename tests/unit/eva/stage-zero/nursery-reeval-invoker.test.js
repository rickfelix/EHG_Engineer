import { describe, it, expect } from 'vitest';
import {
  invokeNurseryReeval,
  hasOpenRequestFor,
  OPEN_REQUEST_STATUSES,
} from '../../../../lib/eva/stage-zero/nursery-reeval-invoker.js';
import { NURSERY_REEVAL_STRATEGY } from '../../../../lib/eva/stage-zero/nursery-reeval-request.js';

const HEADLINE_TRANSFORMER = '3d95f7ea-7d6e-4ffd-ba14-2d915b65fda1';
const SERVICE_PRINCIPAL = '27e0e91e-35f7-4617-bbb9-932408db80f1';
const CHAIRMAN_HUMAN_UID = '69c8aa7a-7661-48ed-9779-746fa6290873';

/**
 * Minimal supabase double. The nursery query must survive the FR-1 predicate's real chain
 * (.is/.or/.order x3/.limit), so the builder returns itself until it is awaited — if the
 * invoker ever stops routing through applyPendingNurseryPredicate this double stops matching
 * and the test fails, which is the point.
 */
function makeSupabase({ due = [], open = [], insertResult = { id: 'req-1' }, openError = null, dueError = null } = {}) {
  const calls = { inserted: null, predicateOps: [], dedupeFilters: [], dedupeStatuses: null };
  const nurseryQuery = {
    is(...a) { calls.predicateOps.push('is'); return this; },
    or(...a) { calls.predicateOps.push('or'); return this; },
    order(...a) { calls.predicateOps.push('order'); return this; },
    limit() { return Promise.resolve({ data: due, error: dueError }); },
  };
  return {
    calls,
    from(table) {
      if (table === 'venture_nursery') return { select: () => nurseryQuery };
      if (table === 'stage_zero_requests') {
        return {
          select: () => {
            // SEC-6: the dedupe read is now scoped SERVER-SIDE. Record the filters so a
            // regression to "fetch every open request and filter in JS" fails here rather
            // than silently reintroducing the 1000-row truncation.
            const q = {
              in(_col, statuses) { calls.dedupeStatuses = statuses; return this; },
              eq(col, val) { calls.dedupeFilters.push([col, val]); return this; },
              limit() { return Promise.resolve({ data: open, error: openError }); },
            };
            return q;
          },
          insert: (row) => {
            calls.inserted = row;
            return { select: () => ({ single: () => Promise.resolve({ data: insertResult, error: null }) }) };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

// `principalExists` stubs the auth.users EXISTENCE precondition added alongside the dangling-
// principal fix. These tests are about request SHAPE, dedupe and selection, so they assert their
// own subjects against a principal that resolves; the existence guard itself is falsified
// separately in nursery-reeval-principal-existence.test.js (including the fail-closed and
// two-sided cases). Stubbing it here would be a hole ONLY if nothing else exercised it — that
// file is what stops this from being one.
const withPrincipal = {
  registeredPrincipals: [SERVICE_PRINCIPAL],
  principalExists: async () => ({ exists: true, detail: null }),
};
const candidate = { id: HEADLINE_TRANSFORMER, name: 'Headline Transformer', current_score: 90 };

describe('invokeNurseryReeval — FR-6 scheduled invoker', () => {
  it('enqueues a correctly-shaped request with NO human in the loop', async () => {
    const sb = makeSupabase({ due: [candidate] });
    const out = await invokeNurseryReeval({}, { supabase: sb, ...withPrincipal, logger: { log() {} } });

    expect(out.enqueued).toBe(true);
    expect(out.nurseryId).toBe(HEADLINE_TRANSFORMER);
    // The shape the queue processor dispatches on. path is what it actually reads (it defaults
    // to blueprint_browse), so a missing path silently runs the wrong path entirely.
    expect(sb.calls.inserted.metadata.strategy).toBe(NURSERY_REEVAL_STRATEGY);
    expect(sb.calls.inserted.metadata.path).toBe('discovery_mode');
    expect(sb.calls.inserted.metadata.nursery_id).toBe(HEADLINE_TRANSFORMER);
    expect(sb.calls.inserted.requested_by).toBe(SERVICE_PRINCIPAL);
    expect(sb.calls.inserted.requested_by).not.toBe(CHAIRMAN_HUMAN_UID);
  });

  it('routes through the FR-1 predicate rather than re-deriving eligibility', async () => {
    // A fourth disagreeing predicate is the defect FR-1 removed. Assert the authoritative one
    // actually ran: it contributes .is (unpromoted), .or (null-or-due) and three .order calls.
    const sb = makeSupabase({ due: [candidate] });
    await invokeNurseryReeval({}, { supabase: sb, ...withPrincipal, logger: { log() {} } });
    expect(sb.calls.predicateOps.filter((o) => o === 'is')).toHaveLength(1);
    expect(sb.calls.predicateOps.filter((o) => o === 'or')).toHaveLength(1);
    expect(sb.calls.predicateOps.filter((o) => o === 'order')).toHaveLength(3);
  });

  it('does NOT enqueue a duplicate while one is already open', async () => {
    // Without this the invoker enqueues a fresh copy every scheduled tick, because enqueueing
    // does not advance next_evaluation_at. Unbounded identical work whose first symptom is cost.
    const sb = makeSupabase({
      due: [candidate],
      open: [{ id: 'r0', status: 'pending', metadata: { strategy: NURSERY_REEVAL_STRATEGY, nursery_id: HEADLINE_TRANSFORMER } }],
    });
    const out = await invokeNurseryReeval({}, { supabase: sb, ...withPrincipal });
    expect(out.enqueued).toBe(false);
    expect(out.reason).toBe('already_queued');
    expect(sb.calls.inserted).toBeNull();
  });

  it('a FAILED dedupe read refuses to enqueue rather than guessing', async () => {
    // "I could not tell whether a duplicate exists" is not "no duplicate exists". Fail toward
    // NOT flooding the queue.
    const sb = makeSupabase({ due: [candidate], openError: { message: 'read failed' } });
    await expect(invokeNurseryReeval({}, { supabase: sb, ...withPrincipal })).rejects.toThrow(/open-request read failed/);
    expect(sb.calls.inserted).toBeNull();
  });

  it('refuses before touching the nursery when no principal is registered', async () => {
    // Ordering matters: discovering this AFTER selecting a candidate would log a candidate we
    // could never act on, which reads as a selection bug rather than a config gap.
    const sb = makeSupabase({ due: [candidate] });
    const out = await invokeNurseryReeval({}, { supabase: sb, registeredPrincipals: [] });
    expect(out).toEqual({ enqueued: false, reason: 'no_registered_service_principal' });
    expect(sb.calls.predicateOps).toHaveLength(0); // nursery was never queried
  });

  it('reports no_due_candidates without enqueuing when the selector is empty', async () => {
    const sb = makeSupabase({ due: [] });
    const out = await invokeNurseryReeval({}, { supabase: sb, ...withPrincipal });
    expect(out).toEqual({ enqueued: false, reason: 'no_due_candidates' });
    expect(sb.calls.inserted).toBeNull();
  });

  it('scopes the dedupe read SERVER-SIDE so the 1000-row cap is unreachable', async () => {
    // SEC-6: this previously fetched EVERY open request and filtered in JS. A truncated read
    // reports "no duplicate" for a duplicate that exists, which revives the unbounded queue the
    // check is the only guard against. Assert the narrowing filters are actually applied.
    const sb = makeSupabase({ due: [candidate] });
    await invokeNurseryReeval({}, { supabase: sb, ...withPrincipal, logger: { log() {} } });
    expect(sb.calls.dedupeStatuses).toEqual(['pending', 'claimed', 'in_progress']);
    expect(sb.calls.dedupeFilters).toEqual([
      ['metadata->>strategy', NURSERY_REEVAL_STRATEGY],
      ['metadata->>nursery_id', HEADLINE_TRANSFORMER],
    ]);
  });

  it('dryRun builds and validates the row but writes nothing', async () => {
    const sb = makeSupabase({ due: [candidate] });
    const out = await invokeNurseryReeval({ dryRun: true }, { supabase: sb, ...withPrincipal });
    expect(out.enqueued).toBe(false);
    expect(out.reason).toBe('dry_run');
    expect(out.request.metadata.nursery_id).toBe(HEADLINE_TRANSFORMER);
    expect(sb.calls.inserted).toBeNull();
  });
});

describe('hasOpenRequestFor — dedupe key', () => {
  it('keys on strategy AND nursery_id, not nursery_id alone', () => {
    const otherPath = [{ metadata: { strategy: 'trend_scanner', nursery_id: HEADLINE_TRANSFORMER } }];
    // An unrelated path holding a request for the same candidate must not suppress ours.
    expect(hasOpenRequestFor(otherPath, HEADLINE_TRANSFORMER)).toBe(false);
    const ours = [{ metadata: { strategy: NURSERY_REEVAL_STRATEGY, nursery_id: HEADLINE_TRANSFORMER } }];
    expect(hasOpenRequestFor(ours, HEADLINE_TRANSFORMER)).toBe(true);
  });

  it('tolerates rows with absent metadata', () => {
    expect(hasOpenRequestFor([{}, { metadata: null }], HEADLINE_TRANSFORMER)).toBe(false);
    expect(hasOpenRequestFor(null, HEADLINE_TRANSFORMER)).toBe(false);
  });

  it('uses only REAL stage_zero_status enum members', () => {
    // This assertion previously read ['pending','processing'] and passed, while Postgres
    // rejected the query with: invalid input value for enum stage_zero_status: "processing".
    // The suite mocks .in(), so it could only ever confirm the constant matched itself — a
    // mocked seam cannot see a schema constraint. Caught by running the real CLI, not here.
    // Probed live: the enum admits pending, claimed, in_progress, completed, dismissed,
    // failed. 'processing' and 'running' are NOT members.
    const REAL_ENUM = ['pending', 'claimed', 'in_progress', 'completed', 'dismissed', 'failed'];
    for (const s of OPEN_REQUEST_STATUSES) expect(REAL_ENUM).toContain(s);
    // and it must cover every non-terminal one, or a live request stops suppressing duplicates
    expect([...OPEN_REQUEST_STATUSES].sort()).toEqual(['claimed', 'in_progress', 'pending']);
  });
});
