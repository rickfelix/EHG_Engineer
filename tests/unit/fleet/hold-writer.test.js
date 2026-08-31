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
  isOracleHeldQF, QF_ORACLE_HOLD_PREFIX,
} from '../../../lib/fleet/hold-writer.js';

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
    });
  });

  it('a silent zero-row no-op classifies as silent_zero_row_no_op, not decider_refused', async () => {
    const client = fakePgClient({ rowCount: 0 });
    const createClientFn = vi.fn(async () => client);
    const result = await writeSdOracleHold('SD-WRONG-KEY', {
      reviewAt: '2026-09-01T00:00:00Z', releaseCondition: 'x', createClientFn,
    });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('silent_zero_row_no_op');
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

function fakeSupabase({ updateData = { id: 'QF-1', owner: 'chairman', release_condition: 'x' }, updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    from: (table) => ({
      update: (payload) => {
        calls.push({ table, payload });
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => (updateError ? { data: null, error: updateError } : { data: updateData, error: null }),
            }),
            not: () => ({
              select: () => ({
                maybeSingle: async () => (updateError ? { data: null, error: updateError } : { data: updateData, error: null }),
              }),
            }),
          }),
        };
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
});
