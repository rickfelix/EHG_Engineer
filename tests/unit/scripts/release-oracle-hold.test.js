/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-5): scripts/release-oracle-hold.js
 */
import { describe, it, expect } from 'vitest';
import { parseReleaseOracleArgs, releaseOracleHold } from '../../../scripts/release-oracle-hold.js';
import { BOUNDED_WAIT_MS } from '../../../lib/fleet/hold-writer.js';

describe('parseReleaseOracleArgs', () => {
  it('parses --sd/--qf/--consult-row/--by/--force', () => {
    expect(parseReleaseOracleArgs(['--sd', 'SD-1', '--consult-row', 'row-1', '--by', 'solomon']))
      .toEqual({ sdKey: 'SD-1', qfId: null, consultRowId: 'row-1', releasedBy: 'solomon', force: false });
    expect(parseReleaseOracleArgs(['--qf', 'QF-1', '--force']))
      .toEqual({ sdKey: null, qfId: 'QF-1', consultRowId: null, releasedBy: null, force: true });
  });
});

function fakeSupabaseForLookup(consultRow) {
  return {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => (table === 'session_coordination' ? { data: consultRow, error: null } : { data: null, error: null }),
        }),
      }),
    }),
  };
}

function chainableQfUpdate(result) {
  const step = () => ({
    eq: () => step(),
    like: () => step(),
    select: () => ({ maybeSingle: async () => result }),
  });
  return () => step();
}

describe('releaseOracleHold (FR-5)', () => {
  it('requires either --sd or --qf', async () => {
    await expect(releaseOracleHold({ supabaseClient: fakeSupabaseForLookup(null) })).rejects.toThrow(/--sd or --qf/);
  });

  it('looks up the consult row created_at and forwards it as elapsed-wait provenance (never a self-supplied timestamp)', async () => {
    const supabase = fakeSupabaseForLookup({ created_at: '2026-08-01T00:00:00Z' });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const nowMs = Date.parse('2026-08-01T01:00:00Z'); // 1h later, well past BOUNDED_WAIT_MS
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(true);
  });

  // TESTING finding D-5: the bounded wait was computed and logged but never enforced.
  it('D-5: refuses to release when the cited consult row has NOT yet reached the bounded wait', async () => {
    const supabase = fakeSupabaseForLookup({ created_at: '2026-08-01T00:00:00Z' });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const nowMs = Date.parse('2026-08-01T00:00:00Z') + 1000; // 1s later — nowhere near the bound
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('bounded_wait_not_elapsed');
  });

  it('D-5: --force overrides an unelapsed bounded wait (explicit cited-verdict override)', async () => {
    const supabase = fakeSupabaseForLookup({ created_at: '2026-08-01T00:00:00Z' });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const nowMs = Date.parse('2026-08-01T00:00:00Z') + 1000;
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', force: true, supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(true);
  });

  it('sanity: BOUNDED_WAIT_MS is ~30 minutes', () => {
    expect(BOUNDED_WAIT_MS).toBe(30 * 60 * 1000);
  });
});
