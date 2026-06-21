/**
 * SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001 — self-only authorization pins.
 * (a) isBuildForbiddenSession predicate (non_fleet/role=adam, fail-safe);
 * (b) claimVirtualSession self-only guard (virtual-only target).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBuildForbiddenSession } from '../../lib/claim-validity-gate.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

describe('shared predicate single-source (no writer/consumer asymmetry)', () => {
  it('the gate re-export and the shared cjs module agree on all cases (one source of truth)', () => {
    const shared = require('../../lib/claim/build-forbidden-session.cjs').isBuildForbiddenSession;
    for (const md of [{ role: 'adam' }, { non_fleet: true }, { role: 'worker' }, {}, null, undefined, { non_fleet: 'true' }]) {
      expect(isBuildForbiddenSession(md)).toBe(shared(md));
    }
    // and the gate exposes it (worker-checkin requires the same cjs module directly)
    expect(typeof shared).toBe('function');
  });
});

describe('isBuildForbiddenSession (FR-1 predicate)', () => {
  it('rejects an explicit non_fleet session', () => {
    expect(isBuildForbiddenSession({ non_fleet: true })).toBe(true);
  });
  it('rejects a role=adam session', () => {
    expect(isBuildForbiddenSession({ role: 'adam' })).toBe(true);
  });
  // SD-REFILL-001KNKE4: a coordinator session must never hold/acquire a build claim. Critically,
  // a worker colliding onto the coordinator's session row (shared CLAUDE_SESSION_ID) reads
  // is_coordinator=true here and is short-circuited, so it can't write a worker claim onto the
  // coordinator row and corrupt coordinator identity.
  it('rejects an is_coordinator session', () => {
    expect(isBuildForbiddenSession({ is_coordinator: true })).toBe(true);
    expect(isBuildForbiddenSession({ is_coordinator: true, role: 'coordinator', callsign: 'Coord' })).toBe(true);
  });
  it('allows a normal fleet session', () => {
    expect(isBuildForbiddenSession({ role: 'worker', callsign: 'Bravo' })).toBe(false);
  });
  it('fail-safe: missing / empty / non-boolean metadata is NOT forbidden', () => {
    expect(isBuildForbiddenSession(null)).toBe(false);
    expect(isBuildForbiddenSession(undefined)).toBe(false);
    expect(isBuildForbiddenSession({})).toBe(false);
    expect(isBuildForbiddenSession({ non_fleet: 'true' })).toBe(false); // string, not boolean true
    expect(isBuildForbiddenSession({ is_coordinator: 'true' })).toBe(false); // string, not boolean true
    expect(isBuildForbiddenSession({ is_coordinator: false })).toBe(false);
  });
});

// claimVirtualSession self-only guard — mock the service client factory.
const rows = new Map();
function fakeClient() {
  return {
    from() {
      return {
        _id: null,
        select() { return this; },
        eq(col, val) { if (col === 'session_id') this._id = val; return this; },
        maybeSingle() { return Promise.resolve({ data: rows.get(this._id) || null, error: null }); },
        update() {
          return {
            eq(col, val) {
              // chained .eq().eq(); resolve on the terminal call
              return {
                eq: () => Promise.resolve({ error: null }),
                then: (res) => res({ error: null }),
              };
            },
          };
        },
      };
    },
  };
}

vi.mock('../../lib/supabase-client.js', () => ({
  createSupabaseServiceClient: () => fakeClient(),
}));

describe('claimVirtualSession (FR-2 self-only guard)', () => {
  let claimVirtualSession;
  beforeEach(async () => {
    rows.clear();
    ({ claimVirtualSession } = await import('../../lib/virtual-session-factory.mjs'));
  });

  it('refuses a non-virtual (real fleet) session', async () => {
    rows.set('real-worker', { session_id: 'real-worker', is_virtual: false });
    const { error } = await claimVirtualSession('real-worker', 'SD-X-001');
    expect(error).toMatch(/not a virtual session/);
  });

  it('refuses a non-existent session', async () => {
    const { error } = await claimVirtualSession('ghost', 'SD-X-001');
    expect(error).toMatch(/not found/);
  });

  it('allows a virtual drain session', async () => {
    rows.set('drain-1', { session_id: 'drain-1', is_virtual: true });
    const { error } = await claimVirtualSession('drain-1', 'SD-X-001');
    expect(error).toBeUndefined();
  });
});

// FR-1 acquisition guard: a propose-only session must short-circuit to idle in
// resolveCheckin BEFORE any tryClaim/self-claim tier (the witnessed a159d1ec gap).
describe('resolveCheckin acquisition guard (FR-1, worker-checkin)', () => {
  let resolveCheckin, tryClaim;
  beforeEach(() => {
    ({ resolveCheckin, tryClaim } = require('../../scripts/worker-checkin.cjs'));
  });

  // Minimal fake sb: claude_sessions returns the given metadata + no current sd_key,
  // so resolveCheckin reaches the acquisition guard. rpc is a spy that MUST NOT be called.
  function fakeSb(metadata) {
    const rpc = vi.fn(() => Promise.resolve({ data: { success: true }, error: null }));
    return {
      rpc,
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle() { return Promise.resolve({ data: { metadata, sd_key: null }, error: null }); },
          insert() { return Promise.resolve({ error: null }); },
          update() { return { eq() { return Promise.resolve({ error: null }); } }; },
        };
      },
    };
  }

  it('an Adam (role=adam) session returns action=idle and never calls claim_sd', async () => {
    const sb = fakeSb({ role: 'adam' });
    const res = await resolveCheckin(sb, 'adam-sess', { getCoordinator: async () => null });
    expect(res.action).toBe('idle');
    expect(res.message).toMatch(/propose-only/i);
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('a non_fleet session returns action=idle and never calls claim_sd', async () => {
    const sb = fakeSb({ non_fleet: true });
    const res = await resolveCheckin(sb, 'nonfleet-sess', { getCoordinator: async () => null });
    expect(res.action).toBe('idle');
    expect(sb.rpc).not.toHaveBeenCalled();
  });
});
