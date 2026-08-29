/**
 * Regression test for the skip-and-continue undefined-timestamp bug.
 * SD: SD-LEO-INFRA-FIX-SKIP-CONTINUE-001
 *
 * Before: markAsBlocked() fetched the SD with .select('metadata, status') but then
 * used .eq('updated_at', currentSD.updated_at) as an optimistic lock. Because
 * updated_at was never selected, currentSD.updated_at was undefined and supabase-js
 * serialized the filter to "updated_at=eq.undefined" -> Postgres:
 *   "invalid input syntax for type timestamp: undefined"
 * on every gate-failure block during AUTO-PROCEED skip-to-next-sibling.
 *
 * After: .select('metadata, status, updated_at') is used, so the optimistic lock
 * receives the real fetched timestamp.
 *
 * The mock supabase client below simulates PostgREST column projection: .single()
 * returns only the columns named in .select(...). That is what makes this a genuine
 * regression test — against the pre-fix code the returned row omits updated_at and
 * the lock filter is undefined (test fails); after the fix it is the fetched
 * timestamp (test passes).
 */

import { describe, it, expect } from 'vitest';
import { markAsBlocked } from '../../../scripts/modules/handoff/skip-and-continue.js';

const blockingInfo = {
  gate: 'GATE_EXAMPLE',
  score: 40,
  threshold: 70,
  issues: ['example issue'],
  retryCount: 2,
  correlationId: 'corr-test-1'
};

/**
 * Build a chainable mock supabase client that records calls and simulates
 * PostgREST column projection on .select().single().
 *
 * @param {object} opts
 * @param {object|null} opts.row   - the full stored row (or null to simulate not-found)
 * @param {object|null} opts.updateError - error returned by the update chain
 */
function makeMockSupabase({ row, updateError = null }) {
  const calls = { selectArg: null, updatePayload: null, eqFilters: [] };

  function project(arg) {
    if (!row) return null;
    if (!arg || arg === '*') return { ...row };
    const cols = arg.split(',').map((s) => s.trim());
    const out = {};
    for (const c of cols) if (c in row) out[c] = row[c];
    return out;
  }

  function makeSelectChain() {
    const chain = {
      eq(col, val) { calls.eqFilters.push({ phase: 'select', col, val }); return chain; },
      single() {
        const data = project(calls.selectArg);
        return Promise.resolve({ data, error: data ? null : { message: 'no rows', code: 'PGRST116' } });
      }
    };
    return chain;
  }

  function makeUpdateChain() {
    const chain = {
      eq(col, val) { calls.eqFilters.push({ phase: 'update', col, val }); return chain; },
      // make the chain awaitable -> resolves to { error }
      then(resolve, reject) { return Promise.resolve({ error: updateError }).then(resolve, reject); }
    };
    return chain;
  }

  const fromObj = {
    select(arg) { calls.selectArg = arg; return makeSelectChain(); },
    update(payload) { calls.updatePayload = payload; return makeUpdateChain(); }
  };

  return { client: { from() { return fromObj; } }, calls };
}

describe('skip-and-continue markAsBlocked() optimistic lock (SD-LEO-INFRA-FIX-SKIP-CONTINUE-001)', () => {
  it('selects updated_at and passes a valid timestamp (never undefined) to the optimistic lock', async () => {
    const fetchedTs = '2026-05-30T19:00:00.000Z';
    const { client, calls } = makeMockSupabase({
      row: { metadata: { foo: 1 }, status: 'active', updated_at: fetchedTs }
    });

    const result = await markAsBlocked(client, 'sd-uuid-1', blockingInfo);

    // FR-1: the fetch select must include updated_at (fails against pre-fix 'metadata, status')
    expect(calls.selectArg).toContain('updated_at');

    // The optimistic-lock filter on updated_at must receive the fetched timestamp.
    const lockFilter = calls.eqFilters.find((f) => f.phase === 'update' && f.col === 'updated_at');
    expect(lockFilter).toBeTruthy();
    expect(lockFilter.val).toBe(fetchedTs);
    expect(lockFilter.val).not.toBeUndefined();
    expect(lockFilter.val).not.toBe('undefined');

    // SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 (FR-5): status='blocked' is NOT a member of the
    // live strategic_directives_v2_status_check CHECK constraint and was previously written
    // unconditionally, guaranteeing a 23514 violation on every call. The fix omits status from
    // the update entirely (left unchanged) and relies on the metadata discriminators instead.
    expect(calls.updatePayload.status).toBeUndefined();
    expect(typeof calls.updatePayload.updated_at).toBe('string');
    expect(calls.updatePayload.metadata.can_unblock).toBe(true);
    expect(calls.updatePayload.metadata.blocked_reason).toContain('GATE_EXAMPLE');

    expect(result).toEqual({ success: true });
  });

  it('returns { success: true, alreadyBlocked: true } when the optimistic lock matches 0 rows (legacy message-string detection)', async () => {
    const { client } = makeMockSupabase({
      row: { metadata: {}, status: 'active', updated_at: '2026-05-30T19:00:00.000Z' },
      updateError: { message: 'JSON object requested, multiple (or no) rows returned: 0 rows' }
    });

    const result = await markAsBlocked(client, 'sd-uuid-2', blockingInfo);
    expect(result).toEqual({ success: true, alreadyBlocked: true });
  });

  it('returns { success: true, alreadyBlocked: true } when the optimistic lock matches 0 rows via PostgREST code PGRST116 (SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 FR-5: robust to message wording)', async () => {
    const { client } = makeMockSupabase({
      row: { metadata: {}, status: 'active', updated_at: '2026-05-30T19:00:00.000Z' },
      updateError: { code: 'PGRST116', message: 'some future rewording of the same condition' }
    });

    const result = await markAsBlocked(client, 'sd-uuid-2b', blockingInfo);
    expect(result).toEqual({ success: true, alreadyBlocked: true });
  });

  it('returns a failure (no throw) when the SD cannot be fetched', async () => {
    const { client } = makeMockSupabase({ row: null });
    const result = await markAsBlocked(client, 'sd-uuid-missing', blockingInfo);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('a genuine (non-lock) update error is surfaced as failure, never silently converted to success (SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 FR-5)', async () => {
    const { client } = makeMockSupabase({
      row: { metadata: {}, status: 'active', updated_at: '2026-05-30T19:00:00.000Z' },
      updateError: { code: '23514', message: 'new row for relation "strategic_directives_v2" violates check constraint "strategic_directives_v2_status_check"' }
    });

    const result = await markAsBlocked(client, 'sd-uuid-3', blockingInfo);
    expect(result.success).toBe(false);
    expect(result.error).toContain('check constraint');
  });
});

describe('skip-and-continue markAsBlocked() never writes an unpersistable status (SD-FDBK-ENH-HANDOFF-PIPELINE-NEVER-001 FR-5)', () => {
  it('the update payload never contains status:\'blocked\' (the value guaranteed-fails the live strategic_directives_v2_status_check CHECK constraint)', async () => {
    const { client, calls } = makeMockSupabase({
      row: { metadata: { existing: true }, status: 'active', updated_at: '2026-05-30T19:00:00.000Z' }
    });

    await markAsBlocked(client, 'sd-uuid-4', blockingInfo);

    expect(calls.updatePayload).not.toHaveProperty('status');
    // Existing metadata is preserved (spread), and the blocked discriminators are added.
    expect(calls.updatePayload.metadata.existing).toBe(true);
    expect(calls.updatePayload.metadata.can_unblock).toBe(true);
    expect(calls.updatePayload.metadata.blocked_by_gate).toBe('GATE_EXAMPLE');
  });
});
