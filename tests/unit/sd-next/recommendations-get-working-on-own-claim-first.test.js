// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-2).
//
// recommendations.js's getWorkingOnSD used an unscoped .or('claiming_session_id.not.is.null,
// is_working_on.eq.true').single() query. .single() throws/returns null data on 0 OR >=2 row
// matches, and the code never checked `error` -- so on a fleet with >=2 SDs claimed (the
// live-measured state at incident time, per prospective TESTING evidence: 3 claimed SDs), this
// silently returned null, hiding the CALLING session's own legitimate claim along with
// everyone else's. Ported the own-claim-first pattern proven in scripts/get-working-on-sd.js
// (QF-20260703-742): resolve THIS session's claim first via a session-scoped array query, and
// only fall back to the (now also array-based, not .single()) global spotlight when the caller
// holds nothing.

import { describe, it, expect } from 'vitest';
import { getWorkingOnSD } from '../../../scripts/modules/sd-next/display/recommendations.js';

// Table-aware-by-filter Supabase stub. Both the own-claim query and the spotlight fallback
// query target strategic_directives_v2 and both terminate on .lt() -- they're distinguished by
// whether .eq('claiming_session_id', ...) was applied in *this* chain instance.
function makeSupabase({ ownClaimResult, spotlightResult }) {
  return {
    from: () => {
      let usedOwnClaimFilter = false;
      const chain = {
        select: () => chain,
        eq: (col) => {
          if (col === 'claiming_session_id') usedOwnClaimFilter = true;
          return chain;
        },
        or: () => chain,
        lt: async () => (usedOwnClaimFilter ? ownClaimResult : spotlightResult),
      };
      return chain;
    },
  };
}

describe('FR-2: getWorkingOnSD resolves own claim first on a multi-claim fleet', () => {
  it('returns the caller\'s own claim even when other SDs are also claimed fleet-wide (no PGRST116/null)', async () => {
    const supabase = makeSupabase({
      ownClaimResult: {
        data: [{ id: '1', sd_key: 'SD-MINE-001', title: 'Mine', progress_percentage: 40, claiming_session_id: 'session-ME' }],
        error: null,
      },
      // Old .single() against this shape (>=1 other claimed row alongside the caller's own) is
      // exactly what used to throw/null out. Own-claim-first never even reaches this query.
      spotlightResult: { data: null, error: { code: 'PGRST116', message: 'multiple rows returned' } },
    });

    const result = await getWorkingOnSD(supabase, { currentSession: { session_id: 'session-ME' }, activeSessions: [] });

    expect(result).not.toBeNull();
    expect(result.sd_key).toBe('SD-MINE-001');
    expect(result._claimedByOther).toBeUndefined();
  });

  it('falls back to the spotlight and marks _claimedByOther when the caller holds no claim', async () => {
    const supabase = makeSupabase({
      ownClaimResult: { data: [], error: null },
      spotlightResult: {
        data: [{ id: '2', sd_key: 'SD-OTHER-001', title: 'Other', progress_percentage: 10, claiming_session_id: 'session-OTHER' }],
        error: null,
      },
    });

    const result = await getWorkingOnSD(supabase, { currentSession: { session_id: 'session-ME' }, activeSessions: [] });

    expect(result.sd_key).toBe('SD-OTHER-001');
    expect(result._claimedByOther).toBe(true);
  });

  it('degrades to the first row on a multi-row spotlight instead of erroring/returning null (old .single() crash)', async () => {
    const supabase = makeSupabase({
      ownClaimResult: { data: [], error: null },
      spotlightResult: {
        data: [
          { id: '3', sd_key: 'SD-OTHER-A', title: 'A', progress_percentage: 5, claiming_session_id: 'session-A' },
          { id: '4', sd_key: 'SD-OTHER-B', title: 'B', progress_percentage: 5, claiming_session_id: 'session-B' },
        ],
        error: null,
      },
    });

    const result = await getWorkingOnSD(supabase, { currentSession: { session_id: 'session-ME' }, activeSessions: [] });

    expect(result).not.toBeNull();
    expect(['SD-OTHER-A', 'SD-OTHER-B']).toContain(result.sd_key);
  });

  it('returns null when nobody holds a claim and nothing is is_working_on (regression control)', async () => {
    const supabase = makeSupabase({
      ownClaimResult: { data: [], error: null },
      spotlightResult: { data: [], error: null },
    });

    const result = await getWorkingOnSD(supabase, { currentSession: { session_id: 'session-ME' }, activeSessions: [] });

    expect(result).toBeNull();
  });
});
