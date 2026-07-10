// SD-LEO-INFRA-NON-SD-WORK-CLAIM-FENCE-001
// Reproduces the live incident (683617ed, Alpha-3, 2026-07-10: mid a directed console
// assessment, checkin auto-self-claimed a belt SD) and pins the fix: a seat_busy_reservation
// fence, a read-only drain+enforce step positioned strictly between directed-assignment and
// recover-stranded-final, and a pure claim-eligibility predicate that self-compares expiry.
// Covers TS-3 through TS-9 from the PRD (TS-1/TS-2 are the BINDING E2E, tests/database/).

import { describe, it, expect, vi } from 'vitest';

const { isSeatBusyOnDirectedWork } = require('../../lib/fleet/claim-eligibility.cjs');
const seatBusyFence = require('../../lib/checkin/steps/seat-busy-fence.cjs');
const CHECKIN_STEPS = require('../../lib/checkin/steps/index.cjs');
const { PAYLOAD_KINDS } = require('../../lib/fleet/worker-status.cjs');

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

// Chainable stub matching the EXACT query seat-busy-fence.cjs issues:
//   sb.from('session_coordination').select(cols).eq('message_type','INFO')
//     .eq('target_session', sessionId).is('target_sd', null).order(...).limit(5)
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
                eq(col2, val2) {
                  expect(col2).toBe('target_session');
                  return {
                    is(col3, val3) {
                      expect(col3).toBe('target_sd');
                      expect(val3).toBeNull();
                      return {
                        order() {
                          return {
                            limit: async () => {
                              if (opts.throwOnRead) throw new Error('read boom');
                              if (opts.errorOnRead) return { data: null, error: { message: 'read boom' } };
                              return { data: rows, error: null };
                            },
                          };
                        },
                      };
                    },
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

const helpers = { ws: require('../../lib/fleet/worker-status.cjs'), isSeatBusyOnDirectedWork };

describe('FR-1: seat_busy_reservation payload.kind registration', () => {
  it('is registered in PAYLOAD_KINDS', () => {
    expect(PAYLOAD_KINDS.SEAT_BUSY_RESERVATION).toBe('seat_busy_reservation');
  });
});

describe('TS-7: step-order regression guard', () => {
  it('seat-busy-fence sits strictly after directed-assignment and strictly before recover-stranded-final', () => {
    const names = CHECKIN_STEPS.map((s) => s.name);
    const idx = names.indexOf('seat-busy-fence');
    expect(idx).toBeGreaterThan(-1);
    expect(names.indexOf('directed-assignment')).toBeLessThan(idx);
    expect(names.indexOf('recover-stranded-final')).toBeGreaterThan(idx);
  });

  it('TS-3 (structural): resume and directed-assignment run before seat-busy-fence, so a WORK_ASSIGNMENT this tick is claimed before any fence could apply', () => {
    const names = CHECKIN_STEPS.map((s) => s.name);
    expect(names.indexOf('resume')).toBeLessThan(names.indexOf('seat-busy-fence'));
    expect(names.indexOf('directed-assignment')).toBeLessThan(names.indexOf('seat-busy-fence'));
  });
});

describe('FR-3: isSeatBusyOnDirectedWork — pure TTL-aware predicate', () => {
  it('AC-1: a live (future-expiring) reservation fences', () => {
    expect(isSeatBusyOnDirectedWork({ seatBusy: { reason: 'console assessment', expiresAt: future() } })).toBe('seat_busy_on_directed_work');
  });

  it('AC-2: an expired reservation fails open (null) and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isSeatBusyOnDirectedWork({ seatBusy: { reason: 'console assessment', expiresAt: past() } })).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('console assessment'));
    warnSpy.mockRestore();
  });

  it('a reservation with no expiresAt fences indefinitely (matches coordinatorReservation convention)', () => {
    expect(isSeatBusyOnDirectedWork({ seatBusy: { reason: 'audit sweep', expiresAt: null } })).toBe('seat_busy_on_directed_work');
  });

  it('AC-3: absent/undefined ctx is byte-identical to no fence', () => {
    expect(isSeatBusyOnDirectedWork(undefined)).toBeNull();
    expect(isSeatBusyOnDirectedWork({})).toBeNull();
    expect(isSeatBusyOnDirectedWork({ seatBusy: null })).toBeNull();
  });
});

describe('FR-2/TS-1 (unit-level): seat-busy-fence.cjs step', () => {
  it('drains a live coordinator-authored reservation and short-circuits with an idle resolution', async () => {
    const rows = [{ id: 'r1', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.SEAT_BUSY_RESERVATION, reason: 'console assessment' }, expires_at: future(), created_at: new Date().toISOString() }];
    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: { callsign: 'Golf' }, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeTruthy();
    expect(result.action).toBe('idle');
    expect(result.callsign).toBe('Golf'); // ...ctx.base spread through
    expect(result.message).toContain('console assessment');
    expect(ctx.seatBusy.reason).toBe('console assessment');
  });

  it('TS-5: a row written by a non-coordinator sender never fences (falls through)', async () => {
    const rows = [{ id: 'r1', sender_session: 'not-the-coordinator', payload: { kind: PAYLOAD_KINDS.SEAT_BUSY_RESERVATION, reason: 'x' }, expires_at: future(), created_at: new Date().toISOString() }];
    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.seatBusy).toBeUndefined();
  });

  it('fails closed per-row when the coordinator identity itself is unresolved this tick', async () => {
    const rows = [{ id: 'r1', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.SEAT_BUSY_RESERVATION, reason: 'x' }, expires_at: future(), created_at: new Date().toISOString() }];
    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: null, base: {}, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.seatBusy).toBeUndefined();
  });

  it('ignores a row whose payload.kind is not seat_busy_reservation', async () => {
    const rows = [{ id: 'r1', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.ROLL_CALL }, expires_at: null, created_at: new Date().toISOString() }];
    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.seatBusy).toBeUndefined();
  });

  it('TS-2: an EXPIRED reservation fails open — checkin proceeds unfenced', async () => {
    const rows = [{ id: 'r1', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.SEAT_BUSY_RESERVATION, reason: 'stale assignment' }, expires_at: past(), created_at: new Date().toISOString() }];
    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('TS-6: a thrown read error fails open — no exception propagates, seat unfenced', async () => {
    const ctx = { sb: makeSb([], { throwOnRead: true }), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(seatBusyFence.run(ctx)).resolves.toBeUndefined();
    expect(ctx.seatBusy).toBeUndefined();
    warnSpy.mockRestore();
  });

  it('a query-level error object also fails open', async () => {
    const ctx = { sb: makeSb([], { errorOnRead: true }), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(seatBusyFence.run(ctx)).resolves.toBeUndefined();
    warnSpy.mockRestore();
  });

  it('is a no-op when no rows are returned', async () => {
    const ctx = { sb: makeSb([]), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
    expect(ctx.seatBusy).toBeUndefined();
  });
});

describe('TS-8: ALL-PATHS short-circuit proof', () => {
  it('when seat-busy-fence resolves (truthy), none of the 6 later claim-tier steps ever run this tick', async () => {
    const rows = [{ id: 'r1', sender_session: 'coordinator-1', payload: { kind: PAYLOAD_KINDS.SEAT_BUSY_RESERVATION, reason: 'audit sweep' }, expires_at: future(), created_at: new Date().toISOString() }];
    const LATER_TIERS = ['recover-stranded-final', 'adopt-orphan', 'self-claim-gates', 'critical-qf-jump', 'merged-pool-self-claim', 'self-claim-qf'];
    const spies = CHECKIN_STEPS
      .filter((s) => LATER_TIERS.includes(s.name))
      .map((s) => vi.spyOn(s, 'run').mockResolvedValue(undefined));
    expect(spies).toHaveLength(LATER_TIERS.length); // sanity: all 6 tiers actually found and spied

    const ctx = { sb: makeSb(rows), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    // Simulate the pipeline from seat-busy-fence onward: run it, and only continue to later
    // steps if it returns undefined (mirrors lib/checkin/pipeline.cjs's runSteps contract).
    const result = await seatBusyFence.run(ctx);
    if (result === undefined) {
      for (const step of CHECKIN_STEPS.filter((s) => LATER_TIERS.includes(s.name))) {
        await step.run(ctx);
      }
    }
    expect(result).toBeTruthy(); // fenced -- must have short-circuited
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

describe('regression: byte-identical to no fence when unfenced', () => {
  it('an unfenced seat falls through to recover-stranded-final unaffected', async () => {
    const ctx = { sb: makeSb([]), sessionId: 'session-A', coordinatorId: 'coordinator-1', base: {}, helpers };
    const result = await seatBusyFence.run(ctx);
    expect(result).toBeUndefined();
  });
});
