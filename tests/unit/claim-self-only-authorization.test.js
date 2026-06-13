/**
 * SD-FDBK-FIX-SELF-ONLY-AUTHORIZATION-001 — self-only authorization pins.
 * (a) isBuildForbiddenSession predicate (non_fleet/role=adam, fail-safe);
 * (b) claimVirtualSession self-only guard (virtual-only target).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isBuildForbiddenSession } from '../../lib/claim-validity-gate.js';

describe('isBuildForbiddenSession (FR-1 predicate)', () => {
  it('rejects an explicit non_fleet session', () => {
    expect(isBuildForbiddenSession({ non_fleet: true })).toBe(true);
  });
  it('rejects a role=adam session', () => {
    expect(isBuildForbiddenSession({ role: 'adam' })).toBe(true);
  });
  it('allows a normal fleet session', () => {
    expect(isBuildForbiddenSession({ role: 'worker', callsign: 'Bravo' })).toBe(false);
  });
  it('fail-safe: missing / empty / non-boolean metadata is NOT forbidden', () => {
    expect(isBuildForbiddenSession(null)).toBe(false);
    expect(isBuildForbiddenSession(undefined)).toBe(false);
    expect(isBuildForbiddenSession({})).toBe(false);
    expect(isBuildForbiddenSession({ non_fleet: 'true' })).toBe(false); // string, not boolean true
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
