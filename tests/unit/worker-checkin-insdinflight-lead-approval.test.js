// QF-20260621-219 (PART 2): isSdInFlight must treat LEAD_APPROVAL as an INITIAL (claimable) phase,
// not "already started". The strategic_directives_v2.current_phase column DEFAULT is 'LEAD_APPROVAL',
// so a brand-new never-touched auto-refilled draft sits at LEAD_APPROVAL; before this fix isSdInFlight
// returned true for it (phase !== 'LEAD') and the worker skipped it BEFORE claim_sd, leaving an
// eligible belt 0% claimable (the chairman-escalated claim-stall). Both LEAD and LEAD_APPROVAL are
// un-started states (phase only advances on an ACCEPTED handoff).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isSdInFlight } = require('../../scripts/worker-checkin.cjs');

// Stub: query 1 is from('strategic_directives_v2')...maybeSingle(); query 2 is
// from('v_active_sessions')...limit(). Route by table name.
function stub({ phase = null, liveSessions = [] } = {}) {
  return {
    from(table) {
      if (table === 'v_active_sessions') {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          neq() { return chain; },
          limit() { return Promise.resolve({ data: liveSessions, error: null }); },
        };
        return chain;
      }
      // strategic_directives_v2
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() { return Promise.resolve({ data: phase === undefined ? null : { current_phase: phase }, error: null }); },
      };
      return chain;
    },
  };
}

describe('QF-20260621-219: isSdInFlight treats LEAD_APPROVAL as claimable (not in-flight)', () => {
  it('returns FALSE for a LEAD draft (the canonical initial phase)', async () => {
    expect(await isSdInFlight(stub({ phase: 'LEAD' }), 'SD-REFILL-X', 'me')).toBe(false);
  });

  it('returns FALSE for a LEAD_APPROVAL draft (the column-default initial phase — the fix)', async () => {
    expect(await isSdInFlight(stub({ phase: 'LEAD_APPROVAL' }), 'SD-REFILL-X', 'me')).toBe(false);
  });

  it('returns TRUE for a genuinely-started SD (phase advanced past the initial draft)', async () => {
    expect(await isSdInFlight(stub({ phase: 'PLAN_PRD' }), 'SD-REFILL-X', 'me')).toBe(true);
    expect(await isSdInFlight(stub({ phase: 'EXEC' }), 'SD-REFILL-X', 'me')).toBe(true);
  });

  it('returns TRUE when a LIVE foreign session holds it, even at LEAD_APPROVAL', async () => {
    expect(await isSdInFlight(stub({ phase: 'LEAD_APPROVAL', liveSessions: [{ session_id: 'other' }] }), 'SD-REFILL-X', 'me')).toBe(true);
  });

  it('fails OPEN (returns false) so a guard error never blocks self_claim', async () => {
    const throwing = { from() { throw new Error('db down'); } };
    expect(await isSdInFlight(throwing, 'SD-REFILL-X', 'me')).toBe(false);
  });
});
