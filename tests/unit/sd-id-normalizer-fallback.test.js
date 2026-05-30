/**
 * Regression test for b6256a28 / QF-20260529-533.
 *
 * normalizeSDId's dynamic import of scripts/lib/sd-id-resolver.js used to reject
 * with ERR_MODULE_NOT_FOUND in worktrees provisioned before that file existed,
 * crashing the LEAD-FINAL post-completion path. The shim now falls back to
 * _normalizeViaDirectQuery when the resolver module is absent. This test pins
 * the fallback's contract (canonical-id resolution + null on not-found/error).
 *
 * Chainable-Supabase-mock pattern mirrors tests/unit/lib/sd-id-resolver.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import { _normalizeViaDirectQuery } from '../../scripts/modules/sd-id-normalizer.js';

function makeMockSupabase(payload, opts = {}) {
  const calls = { froms: [], ors: [] };
  const stub = {
    from(table) {
      calls.froms.push(table);
      return {
        select() { return this; },
        or(filter) { calls.ors.push(filter); return this; },
        async maybeSingle() {
          if (opts.throw) throw new Error(opts.throw);
          return payload;
        },
      };
    },
    _calls: calls,
  };
  return stub;
}

const UUID = 'b6256a28-8ba7-4d4a-826b-e5bfc2bda52c';

describe('_normalizeViaDirectQuery — b6256a28 fail-soft fallback', () => {
  it('returns the canonical id when matched by uuid', async () => {
    const supabase = makeMockSupabase({ data: { id: UUID, sd_key: 'SD-X-001' }, error: null });
    expect(await _normalizeViaDirectQuery(supabase, UUID, 'uuid')).toBe(UUID);
    expect(supabase._calls.froms[0]).toBe('strategic_directives_v2');
  });

  it('normalizes an sd_key to the canonical uuid id', async () => {
    const supabase = makeMockSupabase({ data: { id: UUID, sd_key: 'SD-X-001' }, error: null });
    expect(await _normalizeViaDirectQuery(supabase, 'SD-X-001', 'sd_key')).toBe(UUID);
    expect(supabase._calls.ors[0]).toContain('sd_key.eq.SD-X-001');
  });

  it('returns null when the SD is not found', async () => {
    const supabase = makeMockSupabase({ data: null, error: null });
    expect(await _normalizeViaDirectQuery(supabase, 'SD-MISSING-001', 'sd_key')).toBeNull();
  });

  it('returns null on a DB error', async () => {
    const supabase = makeMockSupabase({ data: null, error: { message: 'boom' } });
    expect(await _normalizeViaDirectQuery(supabase, 'SD-X-001', 'sd_key')).toBeNull();
  });

  it('returns null and never queries on an unrecognized format', async () => {
    const fromSpy = vi.fn();
    const supabase = { from: fromSpy };
    expect(await _normalizeViaDirectQuery(supabase, 'garbage', 'unknown')).toBeNull();
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('returns null if the underlying query throws', async () => {
    const supabase = makeMockSupabase(null, { throw: 'network down' });
    expect(await _normalizeViaDirectQuery(supabase, 'SD-X-001', 'sd_key')).toBeNull();
  });
});
