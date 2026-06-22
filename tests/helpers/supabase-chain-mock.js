/**
 * Strict chainable Supabase mock (SD-REFILL-002XLOD1).
 *
 * Fixes the recurring "supabase.from(...).update(...).eq is not a function"
 * quarantine class: hand-rolled mocks made every method `mockReturnThis()`, but
 * tests then overrode a mid-chain method (e.g. `update.mockResolvedValue(...)`)
 * to return a resolved plain object — so the next chained call (`.eq()`) blew up.
 *
 * Recipe (from SD-LEO-FIX-FIX-PHANTOM-COLUMN-001):
 *  - Builder/filter methods stay chainable: they return the same chain object,
 *    so any `.from().update().eq()...` length composes.
 *  - The chain is THENABLE: awaiting it anywhere (the update path awaits the
 *    chain itself, not a terminal resolver) resolves to a configurable result.
 *  - `single`/`maybeSingle` are terminal vi.fns returning real promises, so a
 *    test can still do `mock.maybeSingle.mockResolvedValue({ data, error })`
 *    for the read path without breaking chaining.
 *
 * Every method is a vi.fn() spy, so `toHaveBeenCalledWith(...)` assertions work.
 */
import { vi } from 'vitest';

const CHAIN_METHODS = [
  'from', 'select', 'insert', 'update', 'upsert', 'delete',
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is',
  'in', 'contains', 'containedBy', 'match', 'not', 'or', 'filter',
  'order', 'limit', 'range', 'returns', 'overrideTypes',
  'channel', 'on', 'rpc',
];

/**
 * @param {object} [opts]
 * @param {{data:any,error:any}} [opts.result] default resolution for the
 *   thenable chain (update/delete paths that await the chain directly).
 * @returns chain mock (also the client: `client.from(...)` returns the chain)
 */
export function createSupabaseChainMock(opts = {}) {
  const state = { result: opts.result ?? { data: null, error: null } };
  const chain = {};

  for (const m of CHAIN_METHODS) {
    chain[m] = vi.fn(() => chain);
  }

  // Terminal resolvers — real promises so per-test .mockResolvedValue works.
  chain.single = vi.fn(() => Promise.resolve(state.result));
  chain.maybeSingle = vi.fn(() => Promise.resolve(state.result));
  chain.subscribe = vi.fn(() => chain);
  chain.unsubscribe = vi.fn(() => Promise.resolve({ error: null }));

  // Make the chain awaitable for terminal builder calls (e.g. `await
  // from().update({...}).eq('id', x)`), which don't end in single/maybeSingle.
  chain.then = (resolve, reject) =>
    Promise.resolve(state.result).then(resolve, reject);

  // Allow tests to set what the awaited chain (non-single path) resolves to.
  chain.__setResult = (result) => { state.result = result; return chain; };

  return chain;
}

export default createSupabaseChainMock;
