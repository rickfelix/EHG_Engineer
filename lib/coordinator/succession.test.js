/**
 * SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 — succession.cjs unit suite.
 * Covers PRD TS-2 (race/winner gating via the retired-list contract), TS-3 (sentinel
 * park), TS-5 (tables-absent fail-open, the merge-without-apply class), TESTING
 * GAP-3 (COORD_SUCCESSION_V1 kill switch) and GAP-5 (explicit idempotency moved===0).
 * The LIVE succession e2e (TS-1/TS-4, Solomon pin a0cdbf9e) lives in
 * tests/integration/coordinator/coordinator-succession-live.test.js (db tier).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isSuccessionEnabled, drainCoordinatorOutbound, parkAtBroadcast,
  openTenure, closeTenure, gracefulRetire, __resetTablesAbsentWarned,
} from './succession.cjs';

function mockUpdateChain(result) {
  const calls = { updates: [] };
  const chain = {
    from: vi.fn(() => chain),
    update: vi.fn((patch) => { calls.updates.push(patch); return chain; }),
    insert: vi.fn(() => chain),
    in: vi.fn(() => chain),
    is: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    single: vi.fn(async () => result),
    select: vi.fn(async () => result),
  };
  return { chain, calls };
}

afterEach(() => { delete process.env.COORD_SUCCESSION_V1; __resetTablesAbsentWarned(); vi.restoreAllMocks(); });

describe('kill switch (TESTING GAP-3)', () => {
  it('COORD_SUCCESSION_V1=off makes every path a no-op', async () => {
    process.env.COORD_SUCCESSION_V1 = 'off';
    expect(isSuccessionEnabled()).toBe(false);
    const { chain } = mockUpdateChain({ data: [], error: null });
    expect((await drainCoordinatorOutbound(chain, { newSessionId: 'n', oldSessionIds: ['o'] })).skipped).toBe('flag_off');
    expect((await parkAtBroadcast(chain, { oldSessionIds: ['o'] })).skipped).toBe('flag_off');
    expect((await gracefulRetire(chain, { sessionId: 'x' })).skipped).toBe('flag_off');
    expect(chain.from).not.toHaveBeenCalled();
  });
  it('defaults ON', () => { expect(isSuccessionEnabled()).toBe(true); });
});

describe('drainCoordinatorOutbound (FR-1)', () => {
  it('re-targets unread predecessor rows and reports moved count', async () => {
    const { chain } = mockUpdateChain({ data: [{ id: 1 }, { id: 2 }], error: null });
    const r = await drainCoordinatorOutbound(chain, { newSessionId: 'new', oldSessionIds: ['old1', 'old2'] });
    expect(r.moved).toBe(2);
    expect(chain.in).toHaveBeenCalledWith('target_session', ['old1', 'old2']);
    expect(chain.is).toHaveBeenCalledWith('read_at', null); // idempotency gate
  });

  it('idempotent re-run reports moved===0 (TESTING GAP-5)', async () => {
    const { chain } = mockUpdateChain({ data: [], error: null });
    const r = await drainCoordinatorOutbound(chain, { newSessionId: 'new', oldSessionIds: ['old1'] });
    expect(r.moved).toBe(0);
    expect(r.error).toBeUndefined();
  });

  it('winner-gating contract: an empty retired list (deferred non-winner) drains NOTHING (TS-2)', async () => {
    // resolve.cjs only populates retiredByThisRegistration when THIS session is the
    // canonical winner; a deferring non-winner passes [] — the drain must not touch the DB.
    const { chain } = mockUpdateChain({ data: [{ id: 1 }], error: null });
    const r = await drainCoordinatorOutbound(chain, { newSessionId: 'loser', oldSessionIds: [] });
    expect(r.moved).toBe(0);
    expect(chain.from).not.toHaveBeenCalled();
  });

  it('fail-open on DB error: {moved:0, error}, never throws', async () => {
    const { chain } = mockUpdateChain({ data: null, error: { message: 'boom' } });
    const r = await drainCoordinatorOutbound(chain, { newSessionId: 'n', oldSessionIds: ['o'] });
    expect(r).toEqual({ moved: 0, error: 'boom' });
  });
});

describe('parkAtBroadcast (FR-2 sentinel fallback, TS-3)', () => {
  it('re-targets unread rows to broadcast-coordinator and refreshes created_at', async () => {
    const { chain, calls } = mockUpdateChain({ data: [{ id: 1 }], error: null });
    const r = await parkAtBroadcast(chain, { oldSessionIds: ['corpse'] });
    expect(r.parked).toBe(1);
    expect(calls.updates[0].target_session).toBe('broadcast-coordinator');
    expect(calls.updates[0].created_at).toBeTruthy(); // aging-out guard (DESIGN adj. 3)
    expect(chain.is).toHaveBeenCalledWith('read_at', null);
  });
});

describe('tables-absent fail-open (TS-5, merge-without-apply class)', () => {
  it('42P01 on tenure writes warns once and degrades to no-op — never throws', async () => {
    const err = Object.assign(new Error('relation "coordinator_role_history" does not exist'), { code: '42P01' });
    const chain = {
      from: () => chain, update: () => chain,
      in: () => chain, is: () => chain,
      // bare `await .insert(...)` resolves a {error} result (supabase builders are thenable)
      insert: () => ({ then: (resolve) => resolve({ error: err }) }),
      select: async () => { throw err; },
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const o = await openTenure(chain, { sessionId: 's1' });
    expect(o.tablesAbsent).toBe(true);
    const c = await closeTenure(chain, { sessionIds: ['s1'], endCause: 'takeover', endedBy: 'x' });
    expect(c.tablesAbsent).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1); // once-per-process latch
    expect(String(warn.mock.calls[0][0])).toContain('COORD_SUCCESSION_TABLES_ABSENT');
  });
});

describe('gracefulRetire (FR-5)', () => {
  it('with a successor: drains to it and closes tenure with graceful', async () => {
    const { chain, calls } = mockUpdateChain({ data: [{ id: 1 }], error: null });
    const r = await gracefulRetire(chain, { sessionId: 'me', successorSessionId: 'next' });
    expect(r.ok).toBe(true);
    expect(r.drain.moved).toBe(1);
    const tenureClose = calls.updates.find((u) => u.end_cause);
    expect(tenureClose.end_cause).toBe('graceful');
  });
  it('without a successor: parks at the sentinel', async () => {
    const { chain, calls } = mockUpdateChain({ data: [], error: null });
    const r = await gracefulRetire(chain, { sessionId: 'me' });
    expect(r.drain.parked).toBe(0);
    expect(calls.updates.some((u) => u.target_session === 'broadcast-coordinator')).toBe(true);
  });
});
