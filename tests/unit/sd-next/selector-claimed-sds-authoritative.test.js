// SD-FDBK-ENH-ROUTING-RECOMMENDATION-SURFACES-001 (FR-4, SDNextSelector.js half).
//
// SDNextSelector.loadActiveSessions() used to build claimedSDs from session.sd_id -- an alias
// v_active_sessions exposes for claude_sessions.sd_key (a self-reported cache mirror; see
// database/migrations/20260727_v_active_sessions_expose_tick_and_silence.sql's "cs.sd_key AS
// sd_id"). It now sources claimedSDs directly from strategic_directives_v2.claiming_session_id,
// the authoritative ownership column, instead.
//
// Tests via SDNextSelector.prototype.loadActiveSessions.call(fakeThis) -- deliberately NOT
// `new SDNextSelector()`, whose constructor pulls in venture-context / multi-repo / dotenv
// machinery unrelated to this one method.

import { describe, it, expect } from 'vitest';
import { SDNextSelector } from '../../../scripts/modules/sd-next/SDNextSelector.js';

function makeSupabase(claimedRows) {
  return {
    from: (table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ not: async () => ({ data: claimedRows, error: null }) }) };
      }
      // claude_sessions silence-enrichment path (non-fatal, only reached when activeSessions
      // is non-empty) -- shape doesn't matter beyond not throwing.
      return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
    },
  };
}

describe('FR-4: SDNextSelector.loadActiveSessions sources claimedSDs from claiming_session_id', () => {
  it('populates claimedSDs from strategic_directives_v2.claiming_session_id', async () => {
    const fakeThis = {
      sessionManager: { getActiveSessions: async () => [] },
      supabase: makeSupabase([{ sd_key: 'SD-AUTH-001', claiming_session_id: 'session-AUTH' }]),
      claimedSDs: new Map(),
      activeSessions: [],
    };

    await SDNextSelector.prototype.loadActiveSessions.call(fakeThis);

    expect(fakeThis.claimedSDs.get('SD-AUTH-001')).toBe('session-AUTH');
  });

  it('does not trust session.sd_id (the old cache-alias source) even when a session reports one', async () => {
    const fakeThis = {
      sessionManager: {
        // session.sd_id is the OLD source this fix stops trusting -- it names an SD that has
        // NO authoritative claim below. Pre-fix this would have populated claimedSDs from it.
        getActiveSessions: async () => [{ session_id: 'session-STALE', sd_id: 'SD-STALE-001' }],
      },
      supabase: makeSupabase([]), // nothing authoritatively claimed
      claimedSDs: new Map(),
      activeSessions: [],
    };

    await SDNextSelector.prototype.loadActiveSessions.call(fakeThis);

    expect(fakeThis.claimedSDs.has('SD-STALE-001')).toBe(false);
  });

  it('reflects an idle session\'s claim (no getClaimedSessions supplement needed -- the claim lives on the SD row itself)', async () => {
    const fakeThis = {
      // An idle session that holds a claim but isn't in the "active" set at all.
      sessionManager: { getActiveSessions: async () => [] },
      supabase: makeSupabase([{ sd_key: 'SD-IDLE-HOLDER-001', claiming_session_id: 'session-IDLE' }]),
      claimedSDs: new Map(),
      activeSessions: [],
    };

    await SDNextSelector.prototype.loadActiveSessions.call(fakeThis);

    expect(fakeThis.claimedSDs.get('SD-IDLE-HOLDER-001')).toBe('session-IDLE');
  });
});
