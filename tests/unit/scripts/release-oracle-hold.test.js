/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-5): scripts/release-oracle-hold.js
 */
import { describe, it, expect } from 'vitest';
import { parseReleaseOracleArgs, releaseOracleHold } from '../../../scripts/release-oracle-hold.js';
import { BOUNDED_WAIT_MS } from '../../../lib/fleet/hold-writer.js';

describe('parseReleaseOracleArgs', () => {
  it('parses --sd/--qf/--consult-row/--by/--force/--reason', () => {
    expect(parseReleaseOracleArgs(['--sd', 'SD-1', '--consult-row', 'row-1', '--by', 'solomon']))
      .toEqual({ sdKey: 'SD-1', qfId: null, consultRowId: 'row-1', releasedBy: 'solomon', force: false, reason: null });
    expect(parseReleaseOracleArgs(['--qf', 'QF-1', '--force', '--reason', 'manual override']))
      .toEqual({ sdKey: null, qfId: 'QF-1', consultRowId: null, releasedBy: null, force: true, reason: 'manual override' });
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

  it('D-5: --force with --reason overrides an unelapsed bounded wait (explicit cited-verdict override)', async () => {
    const supabase = fakeSupabaseForLookup({ created_at: '2026-08-01T00:00:00Z' });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const nowMs = Date.parse('2026-08-01T00:00:00Z') + 1000;
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', force: true, reason: 'chairman verbal approval', supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(true);
  });

  // SECURITY finding S-2: no consult row cited, or citing a nonexistent one, previously bypassed
  // the bounded-wait gate entirely (the old gate only fired when a row was BOTH cited AND found).
  it('S-2: refuses to release when NO consult row is cited (fail-closed default)', async () => {
    const supabase = fakeSupabaseForLookup(null);
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: null, supabaseClient: supabaseWithUpdate, nowMs: Date.now() });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('no_consult_row_cited');
  });

  it('S-2: refuses to release when the cited consult row does not exist (no silent WARNING-then-release)', async () => {
    const supabase = fakeSupabaseForLookup(null); // simulates "row not found"
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'nonexistent-row', supabaseClient: supabaseWithUpdate, nowMs: Date.now() });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('consult_row_not_found');
  });

  it('S-2: --force with --reason still permits release with no consult row cited at all (explicit override, never silent)', async () => {
    const supabase = fakeSupabaseForLookup(null);
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination') return supabase.from(table);
        return { update: chainableQfUpdate({ data: { id: 'QF-1' }, error: null }) };
      },
    };
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: null, force: true, reason: 'chairman verbal approval', supabaseClient: supabaseWithUpdate, nowMs: Date.now() });
    expect(result.merged).toBe(true);
  });

  // SECURITY finding S-4: --force with no audit trail.
  it('S-4: --force without --reason is refused (the release stamp must name why the override is safe)', async () => {
    await expect(releaseOracleHold({ qfId: 'QF-1', force: true, supabaseClient: fakeSupabaseForLookup(null), nowMs: Date.now() }))
      .rejects.toThrow(/--reason/);
  });

  it('sanity: BOUNDED_WAIT_MS is ~30 minutes', () => {
    expect(BOUNDED_WAIT_MS).toBe(30 * 60 * 1000);
  });
});
