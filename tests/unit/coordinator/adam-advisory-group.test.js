/**
 * Unit tests — SD-LEO-FIX-SOLOMON-MULTI-PART-001
 * lib/coordinator/adam-advisory-store.cjs — resolveGroupForAdvisory / stampActionedGroup
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveGroupForAdvisory, stampActionedGroup } = require('../../../lib/coordinator/adam-advisory-store.cjs');

// STRICT supabase builder mirroring @supabase/postgrest-js's REAL staged shape: .from()
// returns a query-builder exposing ONLY select/insert/update/... — filter methods
// (.eq/.gte/.order/.limit) exist ONLY on the object .select() returns. A round-2
// adversarial review caught a real bug that a permissive "everything-on-one-object" mock
// had hidden: production code called .eq() directly on .from(...), which throws against
// the real client (TypeError: ...eq is not a function) but was silently swallowed by
// resolveGroupForAdvisory's own try/catch. This mock enforces the same call-order
// constraint so that class of bug fails a test instead of passing one. Captures
// eq()/order() args so tests can assert the query SHAPE, not just its result.
function makeSupabase({ selectResult, updateResult = { error: null }, captured = {} } = {}) {
  const filterChain = {
    eq(k, v) { (captured.eq = captured.eq || []).push([k, v]); return filterChain; },
    gte() { return filterChain; },
    order(k, opts) { captured.order = [k, opts]; return filterChain; },
    limit() { return Promise.resolve(selectResult); },
  };
  const updateChain = {
    eq() { return updateChain; },
    then(res, rej) { return Promise.resolve(updateResult).then(res, rej); },
  };
  return {
    from() {
      return {
        select() { return filterChain; },
        update() { return updateChain; },
      };
    },
  };
}

describe('resolveGroupForAdvisory', () => {
  it('resolves a full 2-part group when a sibling row is found', async () => {
    const advisoryRow = { id: 'row-2', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 2/2' };
    const siblingData = [
      { id: 'row-1', subject: 'VERDICT 1/2', body: 'first', target_session: 'coord-1', sender_session: 'solomon-1', created_at: '2026-07-17T13:15:12Z' },
      { id: 'row-2', subject: 'VERDICT 2/2', body: 'second', target_session: 'coord-1', sender_session: 'solomon-1', created_at: '2026-07-17T13:16:12Z' },
    ];
    const supabase = makeSupabase({ selectResult: { data: siblingData, error: null } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group.isMultiPart).toBe(true);
    expect(group.isComplete).toBe(true);
    expect(group.memberIds).toEqual(['row-1', 'row-2']);
  });

  it('degrades to a singleton group when the row has no target_session/sender_session', async () => {
    const advisoryRow = { id: 'row-1', subject: 'VERDICT 1/2' };
    const supabase = makeSupabase({ selectResult: { data: [], error: null } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group).toMatchObject({ id: 'row-1', memberIds: ['row-1'], isMultiPart: false, isComplete: true, total: 1 });
  });

  it('degrades to a singleton group on a lookup error (never throws)', async () => {
    const advisoryRow = { id: 'row-1', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2' };
    const supabase = makeSupabase({ selectResult: { data: null, error: { message: 'boom' } } });
    const group = await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(group.memberIds).toEqual(['row-1']);
  });

  // Adversarial-review regression (PR #6191): the sibling query MUST order newest-first —
  // ascending + limit(50) silently returned the OLDEST 50 rows, excluding the current
  // advisory's own recent siblings (or even itself) on a busy (target_session,
  // sender_session) pair with >50 rows in the lookback window.
  it('orders the sibling query created_at DESCENDING (newest-first), not ascending', async () => {
    const advisoryRow = { id: 'row-1', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2' };
    const captured = {};
    const supabase = makeSupabase({ selectResult: { data: [advisoryRow], error: null }, captured });
    await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(captured.order).toEqual(['created_at', { ascending: false }]);
  });

  // Adversarial-review regression (PR #6191): scope the sibling lookup to adam_advisory
  // rows only, so an unrelated row between the same session pair that coincidentally
  // carries a numeric "N/M"-shaped subject is never pulled into the group.
  it('scopes the sibling query to payload->>kind=adam_advisory', async () => {
    const advisoryRow = { id: 'row-1', target_session: 'coord-1', sender_session: 'solomon-1', subject: 'VERDICT 1/2' };
    const captured = {};
    const supabase = makeSupabase({ selectResult: { data: [advisoryRow], error: null }, captured });
    await resolveGroupForAdvisory(supabase, advisoryRow);
    expect(captured.eq).toContainEqual(['payload->>kind', 'adam_advisory']);
  });
});

describe('stampActionedGroup', () => {
  it('stamps actioned_at on every member row of the group', async () => {
    const supabase = makeSupabase({ updateResult: { error: null } });
    const group = { rows: [{ id: 'row-1', payload: { kind: 'adam_advisory' } }, { id: 'row-2', payload: { kind: 'adam_advisory' } }] };
    const { error } = await stampActionedGroup(supabase, group, '2026-07-17T00:00:00.000Z');
    expect(error).toBeNull();
  });

  it('returns the first error encountered without stopping the remaining stamps', async () => {
    let call = 0;
    const supabase = {
      from() { return this; },
      update() { return this; },
      eq() { return this; },
      then(res) {
        call += 1;
        return Promise.resolve(call === 1 ? { error: { message: 'row-1 failed' } } : { error: null }).then(res);
      },
    };
    const group = { rows: [{ id: 'row-1', payload: {} }, { id: 'row-2', payload: {} }] };
    const { error } = await stampActionedGroup(supabase, group, '2026-07-17T00:00:00.000Z');
    expect(error.message).toBe('row-1 failed');
  });
});
