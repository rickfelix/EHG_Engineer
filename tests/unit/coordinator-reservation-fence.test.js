// SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C
// Reproduces the live incident (a Fable-reserved worker seat belt-claimed a Sonnet-lane SD) and
// pins the fix: a coordinator_reservation fence, a read-only drain step positioned strictly
// between adopt-orphan.cjs and self-claim-gates.cjs, and a claim-eligibility axis that
// self-compares expiry. Covers TS-1 through TS-8 from the PRD.

import { describe, it, expect } from 'vitest';

const { coordinatorReservation, classifyDispatchIneligibility } = require('../../lib/fleet/claim-eligibility.cjs');
const drainReservations = require('../../lib/checkin/steps/drain-reservations.cjs');
const CHECKIN_STEPS = require('../../lib/checkin/steps/index.cjs');
const { PAYLOAD_KINDS, DIRECTIVE_KINDS } = require('../../lib/fleet/worker-status.cjs');

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

// Chainable stub matching the EXACT query drain-reservations.cjs issues:
//   sb.from('session_coordination').select(cols).eq('message_type','INFO')
//     .is('target_session', null).not('target_sd', 'is', null)
function makeSb(rows, opts = {}) {
  return {
    from(table) {
      expect(table).toBe('session_coordination');
      return {
        select() {
          return {
            eq(col, val) {
              expect(col).toBe('message_type');
              expect(val).toBe('INFO');
              return {
                is(col2, val2) {
                  expect(col2).toBe('target_session');
                  expect(val2).toBeNull();
                  return {
                    // Paginated via fetchAllPaginated (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001
                    // FR-6 batch 8): chainable .order(), single .range() page carries the throw/error
                    // behavior so it's properly awaited (not an orphaned rejected promise).
                    not: () => ({
                      order: () => ({
                        range: async () => {
                          if (opts.throwOnRead) throw new Error('read boom');
                          if (opts.errorOnRead) return { data: null, error: { message: 'read boom' } };
                          return { data: rows, error: null };
                        },
                      }),
                    }),
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

const helpers = { ws: require('../../lib/fleet/worker-status.cjs') };

describe('FR-1: coordinator_reservation payload.kind registration', () => {
  it('is registered in PAYLOAD_KINDS', () => {
    expect(PAYLOAD_KINDS.COORDINATOR_RESERVATION).toBe('coordinator_reservation');
  });
  it('is deliberately NOT a DIRECTIVE_KIND (a fence is never surfaced/acked as action-required)', () => {
    expect(DIRECTIVE_KINDS).not.toContain('coordinator_reservation');
  });
});

describe('TS-4: claim-order invariant via source pin', () => {
  it('drain-reservations sits strictly after directed-assignment/recover-stranded-final/adopt-orphan and strictly before self-claim-gates/merged-pool-self-claim/self-claim-qf', () => {
    const names = CHECKIN_STEPS.map((s) => s.name);
    const drainIdx = names.indexOf('drain-reservations');
    expect(drainIdx).toBeGreaterThan(-1);
    for (const before of ['directed-assignment', 'recover-stranded-final', 'adopt-orphan']) {
      expect(names.indexOf(before)).toBeLessThan(drainIdx);
    }
    for (const after of ['self-claim-gates', 'merged-pool-self-claim', 'self-claim-qf']) {
      expect(names.indexOf(after)).toBeGreaterThan(drainIdx);
    }
  });
});

describe('TS-3: directed WORK_ASSIGNMENT and own-claim resume are unaffected (structural)', () => {
  it('resume and directed-assignment run before drain-reservations, so ctx.reservations does not exist yet when they run', () => {
    const names = CHECKIN_STEPS.map((s) => s.name);
    expect(names.indexOf('resume')).toBeLessThan(names.indexOf('drain-reservations'));
    expect(names.indexOf('directed-assignment')).toBeLessThan(names.indexOf('drain-reservations'));
  });
});

describe('TS-1/TS-2: coordinatorReservation axis — the claim-order invariant', () => {
  const row = { sd_key: 'SD-X' };

  it('TS-1: refuses a session that does not match reserved_for_session (the incident reproduction)', () => {
    const ctx = { sessionId: 'session-B', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBe('reserved_for_other_session');
  });

  it('TS-2: the reserved-for session remains eligible', () => {
    const ctx = { sessionId: 'session-A', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('refuses a worker tier that does not match reserved_for_tier', () => {
    const ctx = { worker_tier_rank: 2, reservations: { 'SD-X': [{ sd: 'SD-X', reservedForTier: 4, expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBe('reserved_for_other_tier');
  });

  it('the reserved-for tier remains eligible', () => {
    const ctx = { worker_tier_rank: 4, reservations: { 'SD-X': [{ sd: 'SD-X', reservedForTier: 4, expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('is wired into classifyDispatchIneligibility ahead of the tier axes — a reservation wins over a tier-based block', () => {
    const ctx = {
      sessionId: 'session-B',
      reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: future() }] },
      tiering_active: true,
      worker_tier_rank: 9,
    };
    // min_tier_rank: 1 would otherwise pass the tier axis cleanly for a rank-9 worker — the
    // reservation must still win and refuse it.
    expect(classifyDispatchIneligibility({ sd_key: 'SD-X', metadata: { min_tier_rank: 1 } }, ctx)).toBe('reserved_for_other_session');
  });
});

describe('TS-5: expired reservation does not fence', () => {
  it('returns null once expires_at is in the past, even though the row still (conceptually) exists', () => {
    const row = { sd_key: 'SD-X' };
    const ctx = { sessionId: 'session-B', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: past() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });
});

describe('regression: absent/empty ctx.reservations is byte-identical to pre-SD behavior', () => {
  const row = { sd_key: 'SD-X' };
  it('returns null when ctx.reservations is entirely absent', () => {
    expect(coordinatorReservation(row, { sessionId: 'session-B' })).toBeNull();
    expect(coordinatorReservation(row, undefined)).toBeNull();
  });
  it('returns null when ctx.reservations has no entry for this sd_key', () => {
    expect(coordinatorReservation(row, { reservations: { 'SD-OTHER': [{ sd: 'SD-OTHER', reservedForSession: 'x', expiresAt: future() }] } })).toBeNull();
  });
});

describe('TS-6/TS-7: drain-reservations.cjs step', () => {
  it('threads a coordinator-authored reservation into ctx.reservations, keyed by target_sd', async () => {
    const rows = [{ id: 'r1', target_sd: 'SD-X', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION, reserved_for_session: 'session-A' }, expires_at: future() }];
    const ctx = { sb: makeSb(rows), coordinatorId: 'coordinator-1', helpers };
    const result = await drainReservations.run(ctx);
    expect(result).toBeUndefined(); // never short-circuits the pipeline
    expect(ctx.reservations['SD-X']).toHaveLength(1);
    expect(ctx.reservations['SD-X'][0].reservedForSession).toBe('session-A');
  });

  it('TS-6: a reservation written by a non-coordinator sender is ignored', async () => {
    const rows = [{ id: 'r1', target_sd: 'SD-X', sender_session: 'not-the-coordinator', payload: { kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION, reserved_for_session: 'session-A' }, expires_at: future() }];
    const ctx = { sb: makeSb(rows), coordinatorId: 'coordinator-1', helpers };
    await drainReservations.run(ctx);
    expect(ctx.reservations).toBeUndefined();
  });

  it('fails closed per-row when the coordinator identity itself is unresolved this tick', async () => {
    const rows = [{ id: 'r1', target_sd: 'SD-X', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.COORDINATOR_RESERVATION, reserved_for_session: 'session-A' }, expires_at: future() }];
    const ctx = { sb: makeSb(rows), coordinatorId: null, helpers };
    await drainReservations.run(ctx);
    expect(ctx.reservations).toBeUndefined();
  });

  it('ignores a row whose payload.kind is not coordinator_reservation', async () => {
    const rows = [{ id: 'r1', target_sd: 'SD-X', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.ROLL_CALL }, expires_at: null }];
    const ctx = { sb: makeSb(rows), coordinatorId: 'coordinator-1', helpers };
    await drainReservations.run(ctx);
    expect(ctx.reservations).toBeUndefined();
  });

  it('TS-7: a thrown read error fails open — ctx.reservations stays absent, no exception propagates', async () => {
    const ctx = { sb: makeSb([], { throwOnRead: true }), coordinatorId: 'coordinator-1', helpers };
    await expect(drainReservations.run(ctx)).resolves.toBeUndefined();
    expect(ctx.reservations).toBeUndefined();
  });

  it('TS-7: a query-level error object also fails open', async () => {
    const ctx = { sb: makeSb([], { errorOnRead: true }), coordinatorId: 'coordinator-1', helpers };
    await expect(drainReservations.run(ctx)).resolves.toBeUndefined();
    expect(ctx.reservations).toBeUndefined();
  });

  it('is a no-op (undefined ctx.reservations) when no rows are returned', async () => {
    const ctx = { sb: makeSb([]), coordinatorId: 'coordinator-1', helpers };
    await drainReservations.run(ctx);
    expect(ctx.reservations).toBeUndefined();
  });
});

describe('TS-8: reservation rows are never consumed', () => {
  it('drain-reservations.cjs never writes read_at or acknowledged_at (source-pinned — non-consuming/broadcast semantics)', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync(new URL('../../lib/checkin/steps/drain-reservations.cjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/read_at\s*:/);
    expect(src).not.toMatch(/acknowledged_at\s*:/);
  });
});
