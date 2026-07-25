/**
 * QF-20260725-367 — insertCoordinationRow must FAIL LOUDLY on an enum violation.
 *
 * The defect was an ASYMMETRY, not a typo: an unknown TARGET already threw
 * DISPATCH_TARGET_UNKNOWN and named the problem, while an invalid message_type returned
 * id=null, threw nothing, and inserted nothing. Three FENCE_NOTICE sends were silently
 * discarded; one was the re-send of a PR merge HOLD, so the safety mechanism was itself
 * the lost payload.
 *
 * These pin BOTH directions: the enum violation now raises, and every OTHER insert error
 * keeps today's {data, error} contract so callers inspecting transient faults are unaffected.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { insertCoordinationRow } = require('../../lib/coordinator/dispatch.cjs');

// Minimal supabase double. target_session='broadcast' is a SENTINEL, which short-circuits
// assertValidTarget entirely (dispatch.cjs SENTINEL_TARGETS), so the fixture only has to return a
// canned insert result to exercise the post-insert branch under test.
function fakeSupabase(insertResult) {
  const api = {
    select() { return api; },
    eq() { return api; },
    in() { return api; },
    is() { return api; },
    gte() { return api; },
    order() { return api; },
    limit() { return api; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
    single() { return Promise.resolve(insertResult); },
    insert() {
      return {
        select() { return { single: () => Promise.resolve(insertResult) }; },
        then: (res, rej) => Promise.resolve(insertResult).then(res, rej),
      };
    },
    then: (res, rej) => Promise.resolve({ data: [], error: null }).then(res, rej),
  };
  return { rpc: () => Promise.resolve({ data: null, error: null }), from: () => api };
}

const ENUM_ERR = {
  data: null,
  error: { message: 'invalid input value for enum coordination_message_type: "FENCE_NOTICE"', code: '22P02' },
};
const TARGET = 'broadcast'; // sentinel — skips the live-session lookup

describe('QF-20260725-367 — enum violation is LOUD, not a silent drop', () => {
  it('throws DISPATCH_INVALID_MESSAGE_TYPE instead of returning id=null', async () => {
    const sb = fakeSupabase(ENUM_ERR);
    const row = { target_session: TARGET, message_type: 'FENCE_NOTICE', payload: { kind: 'fence_notice' } };
    await expect(insertCoordinationRow(sb, row)).rejects.toMatchObject({ code: 'DISPATCH_INVALID_MESSAGE_TYPE' });
  });

  it('surfaces the underlying Postgres message (the helper was swallowing a real error)', async () => {
    const sb = fakeSupabase(ENUM_ERR);
    const row = { target_session: TARGET, message_type: 'FENCE_NOTICE', payload: {} };
    await expect(insertCoordinationRow(sb, row)).rejects.toThrow(/invalid input value for enum coordination_message_type/);
  });

  it('explains the payload.kind vs message_type vocabulary trap that makes this recur', async () => {
    const sb = fakeSupabase(ENUM_ERR);
    const row = { target_session: TARGET, message_type: 'FENCE_NOTICE', payload: {} };
    await expect(insertCoordinationRow(sb, row)).rejects.toThrow(/payload\.kind but NOT a valid message_type/);
  });

  it('a NON-enum insert error keeps the {data, error} contract (no over-broad throwing)', async () => {
    const transient = { data: null, error: { message: 'could not connect to server', code: '08006' } };
    const sb = fakeSupabase(transient);
    const row = { target_session: TARGET, message_type: 'INFO', payload: {} };
    const res = await insertCoordinationRow(sb, row);
    expect(res.error.code).toBe('08006'); // returned, not thrown
  });

  it('a successful insert is unchanged', async () => {
    const ok = { data: [{ id: 'row-1' }], error: null };
    const sb = fakeSupabase(ok);
    const row = { target_session: TARGET, message_type: 'INFO', payload: {} };
    const res = await insertCoordinationRow(sb, row);
    expect(res.error).toBeNull();
    expect(res.data[0].id).toBe('row-1');
  });
});
