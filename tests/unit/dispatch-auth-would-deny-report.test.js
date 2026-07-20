/**
 * SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-B FR-5 — per-mint-path
 * would_deny evidence report.
 */
import { describe, it, expect } from 'vitest';
import { buildWouldDenyProfile } from '../../scripts/dispatch-auth-would-deny-report.mjs';
import { WOULD_DENY_EVENT_TYPE } from '../../lib/claim/gates/dispatch-authorization.cjs';

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: buildWouldDenyProfile now routes
// through fetchAllPaginated, whose terminal call is .range() (not the implicit await formerly
// used) — chain eq()/order() and resolve {data, error} from .range(), a single short page.
function fakeSupabase(rows) {
  return {
    from(table) {
      let matched = rows;
      const chain = {
        select() { return chain; },
        eq(col, val) {
          if (col === 'event_type' && val !== WOULD_DENY_EVENT_TYPE) matched = [];
          return chain;
        },
        order() { return chain; },
        range() { return Promise.resolve({ data: matched, error: null }); },
      };
      return chain;
    },
  };
}

describe('buildWouldDenyProfile', () => {
  it('groups evidence rows by mint_path and by lane, independently', async () => {
    const supabase = fakeSupabase([
      { payload: { reason: 'x', lane: 'checkin_self_claim', mint_path: 'auto-refill' } },
      { payload: { reason: 'x', lane: 'checkin_self_claim', mint_path: 'convergence-remediation' } },
      { payload: { reason: 'x', lane: 'sd_start_direct_claim', mint_path: 'auto-refill' } },
      { payload: { reason: 'x', lane: 'sd_start_fallback_claim', mint_path: 'unknown' } },
    ]);
    const profile = await buildWouldDenyProfile(supabase);
    expect(profile.total).toBe(4);
    expect(profile.byMintPath).toEqual({ 'auto-refill': 2, 'convergence-remediation': 1, unknown: 1 });
    expect(profile.byLane).toEqual({ checkin_self_claim: 2, sd_start_direct_claim: 1, sd_start_fallback_claim: 1 });
  });

  it('handles the zero-evidence (fresh observe window) case without throwing', async () => {
    const profile = await buildWouldDenyProfile(fakeSupabase([]));
    expect(profile.total).toBe(0);
    expect(profile.byMintPath).toEqual({});
    expect(profile.byLane).toEqual({});
  });

  it('falls back to "unknown" for a row missing mint_path or lane in its payload', async () => {
    const supabase = fakeSupabase([{ payload: { reason: 'x' } }]);
    const profile = await buildWouldDenyProfile(supabase);
    expect(profile.byMintPath).toEqual({ unknown: 1 });
    expect(profile.byLane).toEqual({ unknown: 1 });
  });

  it('surfaces a read error rather than silently returning an empty profile', async () => {
    const supabase = { from: () => ({ select() { return this; }, eq() { return this; }, order() { return this; }, range: () => Promise.resolve({ data: null, error: { message: 'connection reset' } }) }) };
    await expect(buildWouldDenyProfile(supabase)).rejects.toThrow(/would_deny evidence read failed/);
  });
});
