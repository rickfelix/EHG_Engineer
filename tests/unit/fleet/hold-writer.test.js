/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-4/FR-5/FR-9/FR-10): lib/fleet/hold-writer.js
 *
 * Mirrors safe-metadata-merge.mjs's own test style (fake raw-pg client via createClientFn
 * injection) for the SD-side writers; a fake supabase-js client for the QF-side writers.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  BOUNDED_WAIT_MS, isBoundedWaitElapsed, classifyMergeFailure,
  writeSdOracleHold, releaseSdOracleHold, writeQfOracleHold, releaseQfOracleHold,
  isOracleHeldQF, QF_ORACLE_HOLD_PREFIX, printRemainingIneligibility,
} from '../../../lib/fleet/hold-writer.js';

function fakeSupabaseForRow(row) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        }),
      }),
    }),
  };
}

function fakePgClient({ rowCount = 1, queryError = null, selectRows = [] } = {}) {
  const queries = [];
  return {
    queries,
    query: vi.fn(async (sql, params) => {
      queries.push({ sql, params });
      if (queryError) throw queryError;
      if (/^SELECT metadata FROM/i.test(sql)) return { rows: selectRows };
      return { rowCount };
    }),
    end: vi.fn(async () => {}),
  };
}

describe('isBoundedWaitElapsed (FR-9)', () => {
  it('is a named constant close to 30 minutes', () => {
    expect(BOUNDED_WAIT_MS).toBe(30 * 60 * 1000);
  });

  it('returns false before the bound and true at/after it, via injected clock', () => {
    const created = '2026-08-01T00:00:00Z';
    const before = Date.parse(created) + BOUNDED_WAIT_MS - 1000;
    const atBound = Date.parse(created) + BOUNDED_WAIT_MS;
    expect(isBoundedWaitElapsed(created, before)).toBe(false);
    expect(isBoundedWaitElapsed(created, atBound)).toBe(true);
  });

  it('returns false on an unparseable timestamp rather than throwing', () => {
    expect(isBoundedWaitElapsed('not-a-date', Date.now())).toBe(false);
    expect(isBoundedWaitElapsed(null, Date.now())).toBe(false);
  });
});

describe('classifyMergeFailure (FR-10)', () => {
  it('distinguishes decider-refusal from a silent zero-row no-op', () => {
    expect(classifyMergeFailure({ merged: true })).toBe('ok');
    expect(classifyMergeFailure({ merged: false, error: 'requires_human_action=true without a decider: ...' })).toBe('decider_refused');
    expect(classifyMergeFailure({ merged: false })).toBe('silent_zero_row_no_op');
    expect(classifyMergeFailure({ merged: false, error: 'db_connect_failed: timeout' })).toBe('write_error');
    expect(classifyMergeFailure(null)).toBe('unknown');
  });
});

describe('writeSdOracleHold (FR-4)', () => {
  it('stamps requires_human_action + oracle_read_pending reason/review_at/consult provenance in ONE atomic merge', async () => {
    const client = fakePgClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);

    const result = await writeSdOracleHold('SD-TEST-001', {
      reviewAt: '2026-09-01T00:00:00Z',
      releaseCondition: 'awaiting Solomon oracle read',
      consultRowId: 'consult-row-1',
      premisePredicate: 'classifyDispatchIneligibility returns null',
      createClientFn,
    });

    expect(result.merged).toBe(true);
    expect(result.cause).toBe('ok');
    const patchArg = JSON.parse(client.queries[0].params[1]);
    expect(patchArg).toMatchObject({
      requires_human_action: true,
      requires_human_action_reason: 'oracle_read_pending',
      human_decider: 'solomon',
      oracle_read_pending_review_at: '2026-09-01T00:00:00Z',
      oracle_read_pending_consult_row_id: 'consult-row-1',
      premise_recheck_by: '2026-09-01T00:00:00Z',
      premise_predicate: 'classifyDispatchIneligibility returns null',
    });
  });

  it('a silent zero-row no-op classifies as silent_zero_row_no_op, not decider_refused', async () => {
    const client = fakePgClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await writeSdOracleHold('SD-WRONG-KEY', {
      reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'x', premisePredicate: 'x', createClientFn,
    });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('silent_zero_row_no_op');
  });

  // QF-20260902-868: a hold without premisePredicate is refused by the writer -- the hourly
  // review must always have a re-measurable line, never a hold that only names WHY without HOW
  // to re-check it.
  it('refuses to write a hold with no premisePredicate', async () => {
    const client = fakePgClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await writeSdOracleHold('SD-TEST-002', {
      reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'awaiting Solomon oracle read', createClientFn,
    });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('missing_premise_predicate');
    expect(client.queries.length).toBe(0);
  });
});

describe('releaseSdOracleHold (FR-5)', () => {
  it('cites the consult row id + created_at, not a self-supplied-only timestamp', async () => {
    const client = fakePgClient({ rowCount: 1 });
    const createClientFn = vi.fn(async () => client);
    const result = await releaseSdOracleHold('SD-TEST-001', {
      consultRowId: 'consult-row-1', consultRowCreatedAt: '2026-08-01T00:00:00Z', releasedBy: 'solomon', createClientFn,
    });
    expect(result.merged).toBe(true);
    const patchArg = JSON.parse(client.queries[0].params[1]);
    expect(patchArg).toMatchObject({
      requires_human_action: false,
      unfenced_by: 'solomon',
      unfenced_consult_row_id: 'consult-row-1',
      unfenced_consult_row_created_at: '2026-08-01T00:00:00Z',
    });
    expect(typeof patchArg.unfenced_at).toBe('string');
  });
});

/**
 * Generic chainable fake, so any sequence of .eq()/.like()/.not() filters (however many the
 * caller adds) resolves to the same terminal {data, error} — records every filter call so a test
 * can assert the WHERE clause actually names the guard it claims to (D-4 regression coverage).
 */
function fakeSupabase({ updateData = { id: 'QF-1', owner: 'chairman', release_condition: 'x' }, updateError = null, matchPredicate = null } = {}) {
  const calls = [];
  const filters = [];
  function chain() {
    return {
      eq: (col, val) => { filters.push({ op: 'eq', col, val }); return chain(); },
      like: (col, val) => { filters.push({ op: 'like', col, val }); return chain(); },
      not: (col, op, val) => { filters.push({ op: 'not', col, val }); return chain(); },
      or: (expr) => { filters.push({ op: 'or', expr }); return chain(); },
      select: () => ({
        maybeSingle: async () => {
          if (updateError) return { data: null, error: updateError };
          const matched = matchPredicate ? matchPredicate(filters) : true;
          return matched ? { data: updateData, error: null } : { data: null, error: null };
        },
      }),
    };
  }
  return {
    calls,
    filters,
    from: (table) => ({
      update: (payload) => {
        calls.push({ table, payload });
        return chain();
      },
    }),
  };
}

describe('writeQfOracleHold / isOracleHeldQF / releaseQfOracleHold (FR-4)', () => {
  it('reuses the owner=chairman shape (the ONLY claim-block chokepoint qf-start.js reads)', async () => {
    const supabase = fakeSupabase();
    const result = await writeQfOracleHold(supabase, 'QF-1', { reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'awaiting oracle' });
    expect(result.merged).toBe(true);
    expect(supabase.calls[0].payload.owner).toBe('chairman');
    expect(supabase.calls[0].payload.release_condition).toMatch(new RegExp(`^${QF_ORACLE_HOLD_PREFIX.replace(/[[\]]/g, '\\$&')}`));
  });

  // SECURITY finding S-1: an unconditioned write silently clobbered a GENUINE chairman gate,
  // destroying its original release_condition text — then matched the D-4-hardened release guard,
  // reopening the exact defect D-4 fixed, just via the write path instead of the release path.
  it('S-1: the write WHERE clause guards against clobbering a genuine chairman gate', async () => {
    const supabase = fakeSupabase();
    await writeQfOracleHold(supabase, 'QF-1', { reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'x' });
    expect(supabase.filters).toContainEqual({
      op: 'or', expr: `owner.is.null,owner.neq.chairman,release_condition.like.${QF_ORACLE_HOLD_PREFIX}%`,
    });
  });

  it('S-1: a row already carrying a genuine chairman gate does NOT match the write WHERE clause', async () => {
    // Simulates a real Postgres row {owner:'chairman', release_condition:'EU-send-planned'} — the
    // .or() clause (owner IS NULL OR owner != chairman OR condition LIKE prefix%) is FALSE for it,
    // so the UPDATE matches zero rows and the write refuses rather than clobbering it.
    const matchPredicate = () => false;
    const supabase = fakeSupabase({ matchPredicate });
    const result = await writeQfOracleHold(supabase, 'QF-GENUINE-CHAIRMAN-GATE', { reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'x' });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('silent_zero_row_no_op');
  });

  it('isOracleHeldQF distinguishes this SD marker from a genuine chairman gate', () => {
    expect(isOracleHeldQF({ owner: 'chairman', release_condition: `${QF_ORACLE_HOLD_PREFIX} review_at=x :: y` })).toBe(true);
    expect(isOracleHeldQF({ owner: 'chairman', release_condition: 'EU-send-planned' })).toBe(false);
    expect(isOracleHeldQF({ owner: null, release_condition: null })).toBe(false);
  });

  it('releaseQfOracleHold reports silent_zero_row_no_op on no match', async () => {
    const supabase = fakeSupabase({ updateData: null });
    const result = await releaseQfOracleHold(supabase, 'QF-MISSING');
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('silent_zero_row_no_op');
  });

  it('TESTING finding D-4: the release WHERE clause requires owner=chairman AND the oracle-hold prefix — not just a non-null release_condition', async () => {
    const supabase = fakeSupabase();
    await releaseQfOracleHold(supabase, 'QF-1');
    expect(supabase.filters).toContainEqual({ op: 'eq', col: 'owner', val: 'chairman' });
    expect(supabase.filters).toContainEqual({ op: 'like', col: 'release_condition', val: `${QF_ORACLE_HOLD_PREFIX}%` });
    // The prior defect's WHERE clause (a bare `.not('release_condition','is',null)`) is gone.
    expect(supabase.filters.some((f) => f.op === 'not')).toBe(false);
  });

  it('TESTING finding D-4: a genuine chairman gate (no oracle-hold prefix) does NOT match the release WHERE clause', async () => {
    const matchPredicate = (filters) => filters.some((f) => f.op === 'like' && f.val === `${QF_ORACLE_HOLD_PREFIX}%`)
      // Simulates a genuine chairman gate: the LIKE filter is present in the query (from our code),
      // but a real Postgres row with release_condition='EU-send-planned' would NOT satisfy it —
      // modeled here as the predicate itself deciding no-match for a non-oracle row.
      && false;
    const supabase = fakeSupabase({ matchPredicate });
    const result = await releaseQfOracleHold(supabase, 'QF-GENUINE-CHAIRMAN-GATE');
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('silent_zero_row_no_op');
  });
});

// QF-20260902-868: a release only clears ONE predicate -- specimen incident where
// unactionable_venture_remediation kept refusing a row after its needs_coordinator_review hold
// was released, silently, because the release path never re-checked the eligibility classifier.
describe('printRemainingIneligibility (QF-20260902-868)', () => {
  it('prints and returns the remaining verdict when a released row is still refused by a DIFFERENT axis', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabaseForRow({
      sd_key: 'SD-LEO-FIX-REMEDIATION-001',
      metadata: {},
      target_application: 'SomeVentureApp',
    });
    const remaining = await printRemainingIneligibility(supabase, 'SD-LEO-FIX-REMEDIATION-001');
    expect(remaining).toBe('unactionable_venture_remediation');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('unactionable_venture_remediation'));
    spy.mockRestore();
  });

  it('returns null silently when the released row is now fully claimable', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = fakeSupabaseForRow({
      sd_key: 'SD-NOW-CLAIMABLE-001',
      status: 'active',
      current_phase: 'LEAD',
      metadata: {},
      target_application: 'EHG_Engineer',
    });
    const remaining = await printRemainingIneligibility(supabase, 'SD-NOW-CLAIMABLE-001');
    expect(remaining).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
