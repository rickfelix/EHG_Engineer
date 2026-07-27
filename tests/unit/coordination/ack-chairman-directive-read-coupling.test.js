// QF-20260727-454: a chairman directive was acknowledged before it was ever read (self-reported
// by Solomon, 2026-07-27). Root cause: the ack target was resolved by a proxy ("the newest
// unacked row") instead of taken from the row genuinely read; two rows were unacked, they
// diverged, and the wrong one was resolved. This pins the fix in scripts/ack-chairman-directive.cjs:
//   (a) the ack path resolves ONLY the EXPLICIT directive_id it was given — never a newest-unacked
//       scan across all outstanding directives — and refuses (returns row:null) when that id
//       matches nothing.
//   (b) the fetch (the "read") happens in the SAME operation as the ack, and the fetched body is
//       what main() prints — "handled" cannot outrun "read".
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fetchDirectiveForAck, directiveBodyText, CHAIRMAN_DIRECTIVE_KIND } = require('../../../scripts/ack-chairman-directive.cjs');

/**
 * Minimal PostgREST-shaped mock: records every .eq() filter applied to the chain and resolves
 * to the rows in `rows` that satisfy an exact match on payload->>directive_id (when such a
 * filter is present) — enough to prove fetchDirectiveForAck resolves by EXPLICIT id, not by
 * scanning/ordering across all rows.
 */
function makeMock(rows) {
  const queries = [];
  const supabase = {
    from: (table) => {
      const state = { table, filters: [] };
      const c = {
        select: () => c,
        eq: (col, v) => { state.filters.push(['eq', col, v]); return c; },
        order: (col, opts) => { state.filters.push(['order', col, opts]); return c; },
        limit: (n) => { state.filters.push(['limit', n]); return c; },
        then: (res, rej) => {
          queries.push(state);
          const idFilter = state.filters.find((f) => f[0] === 'eq' && f[1] === 'payload->>directive_id');
          const matched = idFilter ? rows.filter((r) => r.payload && r.payload.directive_id === idFilter[2]) : rows;
          return Promise.resolve({ data: matched, error: null }).then(res, rej);
        },
      };
      return c;
    },
  };
  return { supabase, queries };
}

describe('QF-20260727-454 (a): fetchDirectiveForAck resolves by EXPLICIT directive_id, never newest-unacked', () => {
  it('returns the row asked for, not the newest row overall, when a newer unrelated directive also exists', async () => {
    // dir-A is what was actually read (the 3608-char chairman directive in the real incident).
    // dir-B is a LATER, unrelated directive — the row a naive "newest unacked" lookup would pick.
    const rowA = { id: 'row-a', body: 'DIRECTIVE A — the one actually read', payload: { kind: CHAIRMAN_DIRECTIVE_KIND, directive_id: 'dir-A' }, created_at: '2026-07-27T10:00:00Z' };
    const rowB = { id: 'row-b', body: 'DIRECTIVE B — unrelated, newer', payload: { kind: CHAIRMAN_DIRECTIVE_KIND, directive_id: 'dir-B' }, created_at: '2026-07-27T11:00:00Z' };
    const { supabase, queries } = makeMock([rowA, rowB]);

    const { row, error } = await fetchDirectiveForAck(supabase, 'dir-A');

    expect(error).toBeNull();
    expect(row.id).toBe('row-a');
    expect(row.id).not.toBe('row-b');
    expect(queries[0].filters).toContainEqual(['eq', 'payload->>directive_id', 'dir-A']);
  });

  it('an unknown directive_id resolves to row:null — a hard refusal, never a silent newest-unacked substitute', async () => {
    const rowB = { id: 'row-b', body: 'unrelated', payload: { kind: CHAIRMAN_DIRECTIVE_KIND, directive_id: 'dir-B' }, created_at: '2026-07-27T11:00:00Z' };
    const { supabase } = makeMock([rowB]);

    const { row, error } = await fetchDirectiveForAck(supabase, 'dir-does-not-exist');

    expect(error).toBeNull();
    expect(row).toBeNull(); // main() turns a null row into process.exit(1), never falls back to rowB
  });

  it('(b) exact reproduction — two unacked directives present; asking for A returns ONLY A, B is never touched by the read', async () => {
    const rowA = { id: 'row-a', body: 'A', payload: { kind: CHAIRMAN_DIRECTIVE_KIND, directive_id: 'dir-A' }, created_at: '2026-07-27T09:00:00Z' };
    const rowB = { id: 'row-b', body: 'B', payload: { kind: CHAIRMAN_DIRECTIVE_KIND, directive_id: 'dir-B' }, created_at: '2026-07-27T09:05:00Z' };
    const { supabase } = makeMock([rowA, rowB]);

    const resultA = await fetchDirectiveForAck(supabase, 'dir-A');
    const resultB = await fetchDirectiveForAck(supabase, 'dir-B');

    expect(resultA.row.id).toBe('row-a');
    expect(resultB.row.id).toBe('row-b');
    expect(resultA.row.id).not.toBe(resultB.row.id);
  });

  it('propagates a query error instead of masking it as "not found"', async () => {
    const supabase = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ then: (res) => Promise.resolve({ data: null, error: { message: 'db down' } }).then(res) }) }) }) }) }) }) };
    const { row, error } = await fetchDirectiveForAck(supabase, 'dir-A');
    expect(row).toBeNull();
    expect(error).toBeTruthy();
  });
});

describe('QF-20260727-454 (c): directiveBodyText — the content surfaced by the coupled read', () => {
  it('prefers the top-level body column', () => {
    expect(directiveBodyText({ body: 'top-level', payload: { body: 'nested' } })).toBe('top-level');
  });
  it('falls back to payload.body when the top-level body is empty', () => {
    expect(directiveBodyText({ body: null, payload: { body: 'nested' } })).toBe('nested');
  });
  it('is empty (never throws) for a missing/empty row', () => {
    expect(directiveBodyText(null)).toBe('');
    expect(directiveBodyText({})).toBe('');
  });
});
