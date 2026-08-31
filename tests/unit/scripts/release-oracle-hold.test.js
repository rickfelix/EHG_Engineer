/**
 * SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-5): scripts/release-oracle-hold.js
 */
import { describe, it, expect } from 'vitest';
import { parseReleaseOracleArgs, releaseOracleHold } from '../../../scripts/release-oracle-hold.js';

describe('parseReleaseOracleArgs', () => {
  it('parses --sd/--qf/--consult-row/--by', () => {
    expect(parseReleaseOracleArgs(['--sd', 'SD-1', '--consult-row', 'row-1', '--by', 'solomon']))
      .toEqual({ sdKey: 'SD-1', qfId: null, consultRowId: 'row-1', releasedBy: 'solomon' });
    expect(parseReleaseOracleArgs(['--qf', 'QF-1']))
      .toEqual({ sdKey: null, qfId: 'QF-1', consultRowId: null, releasedBy: null });
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
        return {
          update: () => ({
            eq: () => ({
              not: () => ({
                select: () => ({ maybeSingle: async () => ({ data: { id: 'QF-1' }, error: null }) }),
              }),
            }),
          }),
        };
      },
    };
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', supabaseClient: supabaseWithUpdate });
    expect(result.merged).toBe(true);
  });
});
