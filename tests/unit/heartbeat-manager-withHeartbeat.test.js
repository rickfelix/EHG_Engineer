// SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR1): withHeartbeat wrapper tests
//
// Covers:
//   - Writes to the 4 trigger tables fire a heartbeat ping after resolution
//   - Writes to non-trigger tables pass through without a ping
//   - Select (read) calls pass through without a ping
//   - Chained `.from(t).eq(...).update(...)` still pings
//   - Heartbeat ping errors are swallowed (fail-soft)
//   - Input validation rejects missing sessionId / non-client arg
//   - Non-`.from()` client methods pass through unchanged
//
// Plus one indirect FR6 regression note: since withHeartbeat ultimately
// calls session-manager.updateHeartbeat, it automatically gets FR6
// (reactivate-on-release) behavior. The FR6 semantics itself lives in
// session-manager.mjs — tested there via a separate integration test
// (out of scope for a pure unit test on the wrapper).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withHeartbeat } from '../../lib/heartbeat-manager.mjs';

// Lightweight fake supabase builder + client — mimics the parts of
// @supabase/supabase-js that PostgREST write chains actually use.
function makeFakeBuilder(resolveValue = { data: [{ id: 1 }], error: null }) {
  const builder = {
    // chainable filters
    eq: vi.fn(function () { return this; }),
    neq: vi.fn(function () { return this; }),
    in: vi.fn(function () { return this; }),
    // terminal methods — each returns a thenable that resolves to resolveValue
    insert: vi.fn(function () { return makeThenable(resolveValue); }),
    update: vi.fn(function () { return makeThenable(resolveValue); }),
    upsert: vi.fn(function () { return makeThenable(resolveValue); }),
    delete: vi.fn(function () { return makeThenable(resolveValue); }),
    // select is a non-write terminal
    select: vi.fn(function () { return makeThenable(resolveValue); }),
  };
  return builder;
}

function makeThenable(value) {
  return {
    then(onFulfilled, onRejected) {
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
  };
}

function makeFakeClient(resolveValue) {
  return {
    from: vi.fn((table) => makeFakeBuilder(resolveValue)),
    auth: { getUser: vi.fn() },
    rpc: vi.fn(),
  };
}

describe('withHeartbeat(supabase, sessionId)', () => {
  let heartbeatFn;
  let client;
  let wrapped;
  const SESSION_ID = 'test-session-4b15d2aa';

  beforeEach(() => {
    heartbeatFn = vi.fn().mockResolvedValue({ success: true });
    client = makeFakeClient();
    wrapped = withHeartbeat(client, SESSION_ID, { heartbeatFn });
  });

  describe('input validation', () => {
    it('throws when client is missing', () => {
      expect(() => withHeartbeat(null, SESSION_ID)).toThrow(/must be a PostgREST client/);
      expect(() => withHeartbeat({}, SESSION_ID)).toThrow(/must be a PostgREST client/);
    });

    it('throws when sessionId is missing or non-string', () => {
      expect(() => withHeartbeat(client, null)).toThrow(/non-empty string/);
      expect(() => withHeartbeat(client, '')).toThrow(/non-empty string/);
      expect(() => withHeartbeat(client, 123)).toThrow(/non-empty string/);
    });
  });

  describe('trigger-table writes fire a ping', () => {
    const triggerTables = [
      'strategic_directives_v2',
      'product_requirements_v2',
      'sub_agent_execution_results',
      'sd_phase_handoffs',
    ];

    for (const table of triggerTables) {
      it(`insert into ${table} pings`, async () => {
        await wrapped.from(table).insert({ foo: 'bar' });
        // Microtask flush — ping is fire-and-forget
        await new Promise((r) => setImmediate(r));
        expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
      });

      it(`update on ${table} pings`, async () => {
        await wrapped.from(table).update({ foo: 'bar' });
        await new Promise((r) => setImmediate(r));
        expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
      });

      it(`upsert on ${table} pings`, async () => {
        await wrapped.from(table).upsert({ foo: 'bar' });
        await new Promise((r) => setImmediate(r));
        expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
      });

      it(`delete on ${table} pings`, async () => {
        await wrapped.from(table).delete();
        await new Promise((r) => setImmediate(r));
        expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
      });
    }

    it('chained .eq().update() still pings', async () => {
      await wrapped.from('strategic_directives_v2').eq('id', 'X').update({ foo: 1 });
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
    });

    it('ping fires even when the write rejects', async () => {
      // Override the fake builder for this single call to return a rejecting thenable
      client.from = vi.fn(() => ({
        insert: () => ({
          then(onF, onR) { return Promise.reject(new Error('DB down')).then(onF, onR); },
        }),
      }));
      wrapped = withHeartbeat(client, SESSION_ID, { heartbeatFn });

      await expect(wrapped.from('strategic_directives_v2').insert({})).rejects.toThrow('DB down');
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
    });
  });

  describe('non-trigger tables pass through', () => {
    it('writes to an untracked table do NOT ping', async () => {
      await wrapped.from('some_other_table').insert({ foo: 'bar' });
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).not.toHaveBeenCalled();
    });
  });

  describe('read-only access passes through', () => {
    it('select does not ping', async () => {
      await wrapped.from('strategic_directives_v2').select('*');
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).not.toHaveBeenCalled();
    });
  });

  describe('non-from client methods pass through', () => {
    it('accessing .auth returns the original auth object', () => {
      expect(wrapped.auth).toBe(client.auth);
    });

    it('calling .rpc is delegated to the original client', () => {
      const rpcSpy = vi.fn().mockResolvedValue({ data: 1 });
      client.rpc = rpcSpy;
      wrapped = withHeartbeat(client, SESSION_ID, { heartbeatFn });
      wrapped.rpc('some_rpc', { a: 1 });
      expect(rpcSpy).toHaveBeenCalledWith('some_rpc', { a: 1 });
    });
  });

  describe('fail-soft behavior', () => {
    it('heartbeat failure does not leak into the caller', async () => {
      heartbeatFn = vi.fn().mockRejectedValue(new Error('network blip'));
      wrapped = withHeartbeat(client, SESSION_ID, { heartbeatFn });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Caller sees the original write's success; ping error is swallowed.
      const result = await wrapped.from('strategic_directives_v2').insert({});
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r)); // extra tick for the rejected promise's catch handler
      expect(result).toBeDefined();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[withHeartbeat]'));
      warnSpy.mockRestore();
    });
  });

  describe('custom options', () => {
    it('accepts a custom tables set', async () => {
      const customWrapped = withHeartbeat(client, SESSION_ID, {
        tables: new Set(['custom_table']),
        heartbeatFn,
      });
      await customWrapped.from('custom_table').insert({});
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);

      heartbeatFn.mockClear();
      await customWrapped.from('strategic_directives_v2').insert({});
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).not.toHaveBeenCalled();
    });

    it('accepts a custom tables array (converted to Set)', async () => {
      const customWrapped = withHeartbeat(client, SESSION_ID, {
        tables: ['only_this'],
        heartbeatFn,
      });
      await customWrapped.from('only_this').insert({});
      await new Promise((r) => setImmediate(r));
      expect(heartbeatFn).toHaveBeenCalledWith(SESSION_ID);
    });
  });
});
