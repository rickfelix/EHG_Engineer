/**
 * claimQuickFix — fail-closed CAS unit tests
 * SD-LEO-INFRA-SESSION-AWARE-AUTO-001 (FR-1, FR-2)
 *
 * Covers the prospective DEFECTs the QF auto-proceed/adopt path was previously
 * blind to:
 *   - TS-1  CAS concurrency (DEFECT 3): two sessions race the same QF; exactly
 *           one wins. The 2nd .update matches 0 rows once claiming_session_id is
 *           non-null-and-not-self.
 *   - TS-2  self re-adopt idempotency (DEFECT 4): the owning session may re-claim
 *           its own QF without a spurious "lost race" bail (the OR ...eq.self leg).
 *   - TS-2b foreign-bail message: a QF held by another session returns
 *           claimed:false with holder = the other session id.
 *
 * The fake supabase below is a FAITHFUL model of the PostgREST query-builder
 * surface claimQuickFix uses (.from().update().eq().or().select().maybeSingle()
 * and .from().select().eq().maybeSingle()). Crucially it enforces the SAME
 * (claiming_session_id IS NULL OR claiming_session_id = sessionId) WHERE
 * semantics the real `.or('claiming_session_id.is.null,claiming_session_id.eq.X')`
 * filter encodes — so the CAS race is genuinely exercised against row state, not
 * stubbed return values.
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { claimQuickFix } from '../../lib/quick-fix-claim.mjs';

/**
 * Build a stateful fake supabase backed by a single in-memory quick_fixes row.
 * Returns { supabase, store } so a test can inspect/seed the row directly.
 *
 * The .or() parser understands exactly the one shape the helper emits:
 *   `claiming_session_id.is.null,claiming_session_id.eq.<sessionId>`
 * and applies it as (col IS NULL) OR (col === sessionId). Any other .or() shape
 * throws — so a future change to the filter shape can't silently no-op the guard.
 */
function makeFakeSupabase(initialRow) {
  const store = { row: initialRow ? { ...initialRow } : null };

  function parseOr(orExpr) {
    // Only the canonical CAS shape is supported; anything else is a test bug.
    const m = /^claiming_session_id\.is\.null,claiming_session_id\.eq\.(.+)$/.exec(orExpr);
    if (!m) throw new Error(`fake supabase: unsupported .or() shape: ${orExpr}`);
    const self = m[1];
    return (row) => row.claiming_session_id == null || row.claiming_session_id === self;
  }

  function from(table) {
    if (table !== 'quick_fixes') throw new Error(`fake supabase: unexpected table ${table}`);

    // ----- UPDATE builder -----
    function updateBuilder(patch) {
      const filters = { id: undefined, orPred: null };
      const api = {
        eq(col, val) {
          if (col !== 'id') throw new Error(`fake supabase update: only .eq('id') modelled, got ${col}`);
          filters.id = val;
          return api;
        },
        or(expr) {
          filters.orPred = parseOr(expr);
          return api;
        },
        select() { return api; },
        async maybeSingle() {
          const row = store.row;
          // .eq('id') miss → 0 rows.
          if (!row || (filters.id !== undefined && row.id !== filters.id)) {
            return { data: null, error: null };
          }
          // CAS guard: the .or() predicate must hold against the CURRENT row.
          if (filters.orPred && !filters.orPred(row)) {
            return { data: null, error: null }; // 0 rows updated — lost race.
          }
          // Apply the patch (mutates the shared store → models real persistence).
          Object.assign(row, patch);
          return { data: { id: row.id, claiming_session_id: row.claiming_session_id }, error: null };
        },
      };
      return api;
    }

    // ----- SELECT builder (best-effort holder read) -----
    function selectBuilder() {
      const filters = { id: undefined };
      const api = {
        eq(col, val) {
          if (col !== 'id') throw new Error(`fake supabase select: only .eq('id') modelled, got ${col}`);
          filters.id = val;
          return api;
        },
        async maybeSingle() {
          const row = store.row;
          if (!row || (filters.id !== undefined && row.id !== filters.id)) {
            return { data: null, error: null };
          }
          return { data: { claiming_session_id: row.claiming_session_id }, error: null };
        },
      };
      return api;
    }

    return {
      update: (patch) => updateBuilder(patch),
      select: () => selectBuilder(),
    };
  }

  return { supabase: { from }, store };
}

const QF = 'QF-20260101-001';
const SESS_A = 'session-aaaaaaaa';
const SESS_B = 'session-bbbbbbbb';

describe('claimQuickFix — argument guards', () => {
  test('throws without a supabase client', async () => {
    await expect(claimQuickFix(null, QF, SESS_A)).rejects.toThrow(/supabase client/);
  });
  test('throws without qfId or sessionId', async () => {
    const { supabase } = makeFakeSupabase({ id: QF, claiming_session_id: null });
    await expect(claimQuickFix(supabase, '', SESS_A)).rejects.toThrow(/qfId and sessionId/);
    await expect(claimQuickFix(supabase, QF, '')).rejects.toThrow(/qfId and sessionId/);
  });
});

describe('TS-1 CAS concurrency (DEFECT 3): two sessions race the same unclaimed QF', () => {
  test('exactly one session wins; the loser gets claimed=false holder=winner', async () => {
    // Single shared row, initially unclaimed (claiming_session_id = null).
    const { supabase, store } = makeFakeSupabase({ id: QF, claiming_session_id: null, status: 'open' });

    // First session claims — the row is null → CAS matches → it wins.
    const first = await claimQuickFix(supabase, QF, SESS_A);
    // Second session claims AFTER the row is now non-null-and-not-self → 0 rows.
    const second = await claimQuickFix(supabase, QF, SESS_B);

    const winners = [first, second].filter(r => r.claimed === true);
    const losers = [first, second].filter(r => r.claimed === false);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    expect(first.claimed).toBe(true);
    expect(first.holder).toBe(SESS_A);

    expect(second.claimed).toBe(false);
    expect(second.holder).toBe(SESS_A); // the winner is reported as the holder

    // Row reflects the winner only; the loser never overwrote it.
    expect(store.row.claiming_session_id).toBe(SESS_A);
    expect(store.row.status).toBe('in_progress');
  });

  test('claim flips status→in_progress and stamps started_at on the winner', async () => {
    const { supabase, store } = makeFakeSupabase({ id: QF, claiming_session_id: null, status: 'open' });
    const before = Date.now();
    const res = await claimQuickFix(supabase, QF, SESS_A);
    expect(res.claimed).toBe(true);
    expect(store.row.status).toBe('in_progress');
    expect(typeof store.row.started_at).toBe('string');
    expect(new Date(store.row.started_at).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('TS-2 self re-adopt idempotency (DEFECT 4): same session claims twice', () => {
  test('both calls return claimed=true (the OR ...eq.self leg), no spurious bail', async () => {
    const { supabase, store } = makeFakeSupabase({ id: QF, claiming_session_id: null, status: 'open' });

    const first = await claimQuickFix(supabase, QF, SESS_A);
    const second = await claimQuickFix(supabase, QF, SESS_A); // re-adopt by the SAME session

    expect(first.claimed).toBe(true);
    expect(first.holder).toBe(SESS_A);
    expect(second.claimed).toBe(true);
    expect(second.holder).toBe(SESS_A);
    expect(store.row.claiming_session_id).toBe(SESS_A);
  });

  test('re-adopt works even when the row already carries this session as holder', async () => {
    // Seed the row as already held by SESS_A (e.g. claim-guard reaffirm path).
    const { supabase } = makeFakeSupabase({ id: QF, claiming_session_id: SESS_A, status: 'in_progress' });
    const res = await claimQuickFix(supabase, QF, SESS_A);
    expect(res.claimed).toBe(true);
    expect(res.holder).toBe(SESS_A);
  });
});

describe('TS-2b foreign-bail message: QF held by a different session', () => {
  test('returns claimed=false with holder = the other session id', async () => {
    // Row already claimed by SESS_B; SESS_A attempts to claim.
    const { supabase, store } = makeFakeSupabase({ id: QF, claiming_session_id: SESS_B, status: 'in_progress' });
    const res = await claimQuickFix(supabase, QF, SESS_A);
    expect(res.claimed).toBe(false);
    expect(res.holder).toBe(SESS_B); // best-effort follow-up read surfaces the real holder
    // SESS_A must NOT have overwritten SESS_B's claim.
    expect(store.row.claiming_session_id).toBe(SESS_B);
  });
});

describe('fail-loud on a real PostgREST error', () => {
  test('a query error THROWS (never silently treated as a lost race)', async () => {
    const erroringSupabase = {
      from() {
        return {
          update() {
            return {
              eq() { return this; },
              or() { return this; },
              select() { return this; },
              async maybeSingle() {
                return { data: null, error: { message: 'connection reset' } };
              },
            };
          },
        };
      },
    };
    await expect(claimQuickFix(erroringSupabase, QF, SESS_A)).rejects.toThrow(/CAS failed.*connection reset/);
  });
});
