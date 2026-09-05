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

/**
 * SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 (FR-1): lookupConsultRowRecord queries
 * session_coordination first, then chains TWO .eq() calls against retention_archive on a miss —
 * this mock's .eq() must itself be chainable (return an object with both .eq() and
 * .maybeSingle()) rather than terminal, to support that second query shape.
 * archivedRow (optional) simulates a retention_archive hit: { row_data: {...} }.
 */
function fakeSupabaseForLookup(consultRow, archivedRow = null) {
  const chain = (result) => ({ eq: () => chain(result), maybeSingle: async () => result });
  return {
    from: (table) => ({
      select: () => chain(
        table === 'session_coordination' ? { data: consultRow, error: null }
          : table === 'retention_archive' ? { data: archivedRow, error: null }
            : { data: null, error: null }
      ),
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

/**
 * quick_fixes table mock exposing BOTH a read chain (select().eq().maybeSingle(), used by
 * lookupQfOwnConsultRowId's auto-resolve probe) and a write chain (update()...maybeSingle()).
 * ownConsultReleaseCondition defaults to null (no embedded citation), so auto-resolve is a no-op
 * unless a test explicitly wants to exercise it.
 */
function qfTable({ updateResult, ownConsultReleaseCondition = null } = {}) {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { release_condition: ownConsultReleaseCondition }, error: null }) }) }),
    update: chainableQfUpdate(updateResult),
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
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

  // VALIDATION finding V-2: the release-side gate had no producer -- nothing wrote a consult row
  // and cited it, so every real hold was releasable only via --force. Now the QF's OWN marker
  // (embedded by batch-mint-sweep.mjs) is auto-resolved when --consult-row is omitted.
  it('V-2: auto-resolves the consult row id embedded in the QF\'s own oracle-hold marker', async () => {
    const consultRowId = '11111111-1111-1111-1111-111111111111';
    const supabase = fakeSupabaseForLookup({ created_at: '2026-08-01T00:00:00Z' });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({
          updateResult: { data: { id: 'QF-1' }, error: null },
          ownConsultReleaseCondition: `[oracle_read_pending] review_at=2026-09-01T00:00:00Z consult=${consultRowId} :: batch mint detected`,
        });
      },
    };
    const nowMs = Date.parse('2026-08-01T01:00:00Z'); // well past the bound
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: null, supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(true);
  });

  it('sanity: BOUNDED_WAIT_MS is ~30 minutes', () => {
    expect(BOUNDED_WAIT_MS).toBe(30 * 60 * 1000);
  });

  // SD-LEO-FIX-SPECIFIED-PRIMARY-RELEASE-001 FR-1 / TS-1: a consult row deleted by
  // cleanup_expired_coordination (1h after creation) previously read consult_row_not_found
  // forever, requiring --force on every release past that hour.
  it('FR-1/TS-1: releases WITHOUT --force when the cited consult row exists ONLY in retention_archive', async () => {
    // session_coordination miss (null), retention_archive hit with the archived row_data.
    const supabase = fakeSupabaseForLookup(null, { row_data: { created_at: '2026-08-01T00:00:00Z' } });
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
      },
    };
    const nowMs = Date.parse('2026-08-01T01:00:00Z'); // well past the bound, using the ARCHIVED created_at
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', supabaseClient: supabaseWithUpdate, nowMs });
    expect(result.merged).toBe(true);
  });

  // TS-2: absent from BOTH tables stays fail-closed, unchanged.
  it('FR-1/TS-2: still refuses without --force when the cited consult row is absent from BOTH session_coordination and retention_archive', async () => {
    const supabase = fakeSupabaseForLookup(null, null);
    const supabaseWithUpdate = {
      ...supabase,
      from: (table) => {
        if (table === 'session_coordination' || table === 'retention_archive') return supabase.from(table);
        return qfTable({ updateResult: { data: { id: 'QF-1' }, error: null } });
      },
    };
    const result = await releaseOracleHold({ qfId: 'QF-1', consultRowId: 'row-1', supabaseClient: supabaseWithUpdate, nowMs: Date.now() });
    expect(result.merged).toBe(false);
    expect(result.cause).toBe('consult_row_not_found');
  });
});
