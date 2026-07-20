// SD-LEO-INFRA-SOFT-RESERVE-LONGEST-IDLE-001 (FR-3): the net-new reserved-session-liveness fail-open.
// TS-4 (dead reserved session -> open to all immediately, before TTL) at BOTH seams:
//   (a) coordinatorReservation voids a fence stamped reservedForSessionLive:false, and
//   (b) drain-reservations stamps reservedForSessionLive from one live-fleet resolve per tick.
// Plus the no-stranding invariant (dead OR expired OR read-error => always eventually claimable).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { coordinatorReservation, classifyDispatchIneligibility } = require('../../../lib/fleet/claim-eligibility.cjs');
const drainReservations = require('../../../lib/checkin/steps/drain-reservations.cjs');
const { PAYLOAD_KINDS } = require('../../../lib/fleet/worker-status.cjs');

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();
const helpers = { ws: require('../../../lib/fleet/worker-status.cjs') };

// Chainable stub matching drain-reservations' session_coordination query:
//   .select().eq('message_type','INFO').is('target_session',null).not('target_sd','is',null)
//   .order('id',...) — paginated via fetchAllPaginated (SD-LEO-INFRA-COUNT-TRUNCATION-
//   DISCIPLINE-001 FR-6 batch 8); a single short .range() page returns all `rows`.
function makeSb(rows) {
  return {
    from(table) {
      expect(table).toBe('session_coordination');
      return {
        select: () => ({
          eq: () => ({
            is: () => ({
              not: () => ({
                order: () => ({
                  range: async () => ({ data: rows, error: null }),
                }),
              }),
            }),
          }),
        }),
      };
    },
  };
}

describe('TS-4a: coordinatorReservation voids a fence whose reserved session is DEAD', () => {
  const row = { sd_key: 'SD-X' };

  it('a peer can claim immediately when reservedForSessionLive===false (before TTL expiry)', () => {
    const ctx = { sessionId: 'peer', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'dead-worker', reservedForSessionLive: false, expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull(); // void -> not fencing
  });

  it('even the (dead) reserved session is not fenced — the leaf is open to ALL', () => {
    const ctx = { sessionId: 'dead-worker', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'dead-worker', reservedForSessionLive: false, expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('still ENFORCES while the reserved session is live (reservedForSessionLive===true) — peer blocked, reserved admitted', () => {
    const base = { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'live-worker', reservedForSessionLive: true, expiresAt: future() }] };
    expect(coordinatorReservation(row, { sessionId: 'peer', reservations: base })).toBe('reserved_for_other_session');
    expect(coordinatorReservation(row, { sessionId: 'live-worker', reservations: base })).toBeNull();
  });

  it('an UNSTAMPED fence (liveness unknown) still enforces — backward-compatible, TTL-backstopped', () => {
    const ctx = { sessionId: 'peer', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'w', expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBe('reserved_for_other_session');
  });

  it('is enforced through classifyDispatchIneligibility (dead fence -> eligible on this axis)', () => {
    const ctx = { sessionId: 'peer', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'dead', reservedForSessionLive: false, expiresAt: future() }] } };
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X' }, ctx)).toBeNull();
  });
});

describe('TS-4b: drain-reservations stamps reservedForSessionLive from the live-fleet set', () => {
  const mkRow = (session) => ({ id: 'r1', target_sd: 'SD-X', sender_session: 'coord-1', payload: { kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION, reserved_for_session: session }, expires_at: future() });

  it('stamps TRUE when the reserved session is in the live set', async () => {
    const ctx = { sb: makeSb([mkRow('alpha')]), coordinatorId: 'coord-1', helpers, liveFleetSessionsFn: async () => [{ session_id: 'alpha' }, { session_id: 'beta' }] };
    await drainReservations.run(ctx);
    expect(ctx.reservations['SD-X'][0].reservedForSessionLive).toBe(true);
  });

  it('stamps FALSE when the reserved session is NOT live (dead-session immediate open)', async () => {
    const ctx = { sb: makeSb([mkRow('ghost')]), coordinatorId: 'coord-1', helpers, liveFleetSessionsFn: async () => [{ session_id: 'alpha' }] };
    await drainReservations.run(ctx);
    expect(ctx.reservations['SD-X'][0].reservedForSessionLive).toBe(false);
    // downstream: coordinatorReservation now voids it for any session
    expect(coordinatorReservation({ sd_key: 'SD-X' }, { sessionId: 'peer', reservations: ctx.reservations })).toBeNull();
  });

  it('leaves the stamp UNDEFINED (fences keep enforcing) when the live-set resolve throws', async () => {
    const ctx = { sb: makeSb([mkRow('alpha')]), coordinatorId: 'coord-1', helpers, liveFleetSessionsFn: async () => { throw new Error('live boom'); } };
    await drainReservations.run(ctx); // must not reject
    expect(ctx.reservations['SD-X'][0].reservedForSessionLive).toBeUndefined();
    expect(coordinatorReservation({ sd_key: 'SD-X' }, { sessionId: 'peer', reservations: ctx.reservations })).toBe('reserved_for_other_session');
  });
});

describe('TS-8 / AC-3 no-stranding invariant: a leaf is ALWAYS eventually claimable', () => {
  const row = { sd_key: 'SD-X' };
  const peer = 'peer';
  it('dead reserved-session OR expired TTL OR (no fence at all) each yield null for a peer', () => {
    // dead session, TTL still live
    expect(coordinatorReservation(row, { sessionId: peer, reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'w', reservedForSessionLive: false, expiresAt: future() }] } })).toBeNull();
    // live session but TTL expired
    expect(coordinatorReservation(row, { sessionId: peer, reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'w', reservedForSessionLive: true, expiresAt: past() }] } })).toBeNull();
    // read error / no fence drained at all
    expect(coordinatorReservation(row, { sessionId: peer })).toBeNull();
  });
});
