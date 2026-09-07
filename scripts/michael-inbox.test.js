// SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-G / FR-5, TS-4.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { isMichaelInboxRow, isOrphanedMichaelRow, drainInbox, drainMichaelOutbound } = require('./michael-inbox.cjs');
const { DRAIN_SETS } = require('../lib/fleet/worker-status.cjs');

// Derived from the real registry rather than hand-listed, per tests/static-guards/drain-set-
// registry-readers.test.js's tripwire against reintroducing a hand-rolled kind-list literal.
const RECOGNIZED = [...DRAIN_SETS.michael];

describe('isMichaelInboxRow / isOrphanedMichaelRow', () => {
  it('a recognized kind is an inbox row, not orphaned', () => {
    const r = { payload: { kind: 'michael_handoff' } };
    expect(isMichaelInboxRow(r, RECOGNIZED)).toBe(true);
    expect(isOrphanedMichaelRow(r, RECOGNIZED)).toBe(false);
  });
  it('an unrecognized kind is orphaned, not an inbox row', () => {
    const r = { payload: { kind: 'some_unregistered_kind' } };
    expect(isMichaelInboxRow(r, RECOGNIZED)).toBe(false);
    expect(isOrphanedMichaelRow(r, RECOGNIZED)).toBe(true);
  });
  it('an untyped row (no kind) is orphaned', () => {
    expect(isOrphanedMichaelRow({ payload: {} }, RECOGNIZED)).toBe(true);
    expect(isOrphanedMichaelRow(null, RECOGNIZED)).toBe(false);
  });
});

function stubSupabase({ selectRows = [], updateRows = [], selectError = null, updateError = null } = {}) {
  const calls = { updates: [] };
  return {
    calls,
    from(table) {
      let isUpdate = false;
      const chain = {
        select() { return chain; },
        in(col, vals) { chain._in = { col, vals }; return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() {
          if (isUpdate) return chain;
          return Promise.resolve({ data: selectError ? null : selectRows, error: selectError });
        },
        update(patch) { isUpdate = true; calls.updates.push(patch); return chain; },
        gte() { return chain; },
        then(res, rej) {
          return Promise.resolve(updateError ? { data: null, error: updateError } : { data: updateRows, error: null }).then(res, rej);
        },
      };
      return chain;
    },
  };
}

describe('drainInbox', () => {
  it('drains a michael_handoff row via a real registry read (fail-open to DRAIN_SETS.michael)', async () => {
    const rows = [
      { id: 'r1', payload: { kind: 'michael_handoff', body: 'a household task' }, created_at: new Date().toISOString() },
      { id: 'r2', payload: { kind: 'some_unregistered_kind' }, created_at: new Date().toISOString() },
    ];
    const sb = stubSupabase({ selectRows: rows });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await drainInbox(sb, 'sess-1', { quiet: true });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe('r1');
    expect(result.orphaned).toHaveLength(1);
    expect(result.orphaned[0].id).toBe('r2');
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // SD-LEO-INFRA-MICHAEL-ADAM-COMMS-001 FR-1: drainInbox() must stamp read_at on every
  // recognized-kind row and NEVER on an orphaned row (isOrphanedMichaelRow's "surface, never
  // silently consume" contract). Uses a stateful in-memory fixture (not the memory-less
  // stubSupabase above) because the acceptance criterion is behavioral across two calls.
  function statefulFixture(initialRows) {
    const table = initialRows.map((r) => ({ ...r }));
    return {
      table,
      from() {
        let filterInIds = null;
        let filterReadAtNull = false;
        let updatePatch = null;
        const chain = {
          select() { return chain; },
          in(col, vals) { if (col === 'target_session') return chain; filterInIds = vals; return chain; },
          is(col) { if (col === 'read_at') filterReadAtNull = true; return chain; },
          order() { return chain; },
          update(patch) { updatePatch = patch; return chain; },
          limit() {
            const rows = table.filter((r) => (filterReadAtNull ? r.read_at == null : true));
            return Promise.resolve({ data: rows, error: null });
          },
          then(res, rej) {
            const targets = filterInIds
              ? table.filter((r) => filterInIds.includes(r.id) && (!filterReadAtNull || r.read_at == null))
              : [];
            targets.forEach((r) => Object.assign(r, updatePatch));
            return Promise.resolve({ data: targets, error: null }).then(res, rej);
          },
        };
        return chain;
      },
    };
  }

  it('stamps read_at on every recognized-kind row, never on an orphaned row', async () => {
    const sb = statefulFixture([
      { id: 'r1', payload: { kind: 'michael_handoff', body: 'task A' }, created_at: new Date().toISOString(), read_at: null },
      { id: 'r2', payload: { kind: 'michael_handoff', body: 'task B' }, created_at: new Date().toISOString(), read_at: null },
      { id: 'r3', payload: { kind: 'some_unregistered_kind' }, created_at: new Date().toISOString(), read_at: null },
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await drainInbox(sb, 'sess-1', { quiet: true });

    const byId = Object.fromEntries(sb.table.map((r) => [r.id, r]));
    expect(byId.r1.read_at).not.toBeNull();
    expect(byId.r2.read_at).not.toBeNull();
    expect(byId.r3.read_at).toBeNull();
  });

  it('is idempotent: a second drain over the same fixture returns zero of the already-drained rows', async () => {
    const sb = statefulFixture([
      { id: 'r1', payload: { kind: 'michael_handoff', body: 'task A' }, created_at: new Date().toISOString(), read_at: null },
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = await drainInbox(sb, 'sess-1', { quiet: true });
    expect(first.rows).toHaveLength(1);

    const second = await drainInbox(sb, 'sess-1', { quiet: true });
    expect(second.rows).toHaveLength(0);
  });

  it('reports zero rows on a query error without throwing', async () => {
    const sb = stubSupabase({ selectError: { message: 'boom' } });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await drainInbox(sb, 'sess-1', { quiet: true });
    expect(result.rows).toEqual([]);
    errSpy.mockRestore();
  });

  it('--json mode emits a single parseable JSON line', async () => {
    const sb = stubSupabase({ selectRows: [{ id: 'r1', payload: { kind: 'michael_handoff' }, created_at: new Date().toISOString() }] });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await drainInbox(sb, 'sess-1', { asJson: true });
    const line = logSpy.mock.calls.at(-1)[0];
    expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(line)).toMatchObject({ ok: true, rows: 1 });
    logSpy.mockRestore();
  });
});

describe('drainMichaelOutbound', () => {
  it('re-targets unread rows from old session ids to the new one, returning {moved}', async () => {
    const sb = stubSupabase({ updateRows: [{ id: 'r1' }, { id: 'r2' }] });
    const result = await drainMichaelOutbound(sb, { newSessionId: 'new-1', oldSessionIds: ['old-1', 'old-2'] });
    expect(result).toEqual({ moved: 2 });
    expect(sb.calls.updates[0]).toEqual({ target_session: 'new-1' });
  });

  it('is a no-op {moved:0} when oldSessionIds is empty or missing', async () => {
    const sb = stubSupabase();
    expect(await drainMichaelOutbound(sb, { newSessionId: 'new-1', oldSessionIds: [] })).toEqual({ moved: 0 });
    expect(await drainMichaelOutbound(sb, { newSessionId: 'new-1' })).toEqual({ moved: 0 });
  });

  it('never throws on a missing supabase client (fail-open)', async () => {
    expect(await drainMichaelOutbound(null, { newSessionId: 'new-1', oldSessionIds: ['old-1'] })).toEqual({ moved: 0 });
  });

  it('filters out the new session id itself from oldSessionIds (never re-targets to itself as a no-op source)', async () => {
    const sb = stubSupabase({ updateRows: [] });
    const result = await drainMichaelOutbound(sb, { newSessionId: 'same-1', oldSessionIds: ['same-1'] });
    expect(result).toEqual({ moved: 0 });
  });

  it('reports the error and moved:0 on an update failure, never throws', async () => {
    const sb = stubSupabase({ updateError: { message: 'db down' } });
    const result = await drainMichaelOutbound(sb, { newSessionId: 'new-1', oldSessionIds: ['old-1'] });
    expect(result.moved).toBe(0);
    expect(result.error).toBe('db down');
  });
});
