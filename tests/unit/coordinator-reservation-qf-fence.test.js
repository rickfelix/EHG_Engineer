// QF-20260911-004: extend the SD-only coordinator_reservation fence
// (SD-LEO-INFRA-DISPATCH-AUTH-AUTO-AUTHORIZE-001-C) so a reservation keyed by a QUICK-FIX id
// also fences quick-fix self-claim, closing the race Solomon measured: three seats each lost
// the freshly-freed QF-20260911-117 to a competing self-claim in the 78-84s gap between it
// becoming queue head and the coordinator's directed WORK_ASSIGNMENT landing.
//
// FOLDED scope (Adam 49eabb23, 2026-09-11 22:5xZ): the row-borne form already exists for SDs;
// this SD/QF ships (a) reserveWorkItem (honestly-named alias of reserveSd — the column was
// always a plain string), (b) claim-eligibility.cjs's coordinatorReservation keyed by
// row.sd_key OR row.id, and (c) self-claim-qf.cjs / selfClaimQuickFix consulting
// ctx.reservations before self-claim. The coordinator's own PROACTIVE write-at-queue-head
// trigger (item d) is deliberately NOT wired here -- reserveSd/reserveWorkItem has no
// automatic caller for SDs either (grepped: zero call sites outside its own definition file),
// so wiring an automatic QF-side trigger would be net-new coordinator automation with no SD
// precedent to mirror, not a QF-sized extension of existing behavior. Disclosed, not silently
// dropped -- see the PR body.
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { coordinatorReservation } = require('../../lib/fleet/claim-eligibility.cjs');
const { reserveSd, reserveWorkItem } = require('../../lib/coordinator/reserve-sd.cjs');
const selfClaimQfStep = require('../../lib/checkin/steps/self-claim-qf.cjs');

const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

describe('coordinatorReservation keyed by row.id (quick_fixes have no sd_key)', () => {
  const row = { id: 'QF-20260911-117' };

  it('fences a session that does not match reserved_for_session', () => {
    const ctx = { sessionId: 'session-B', reservations: { 'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'session-A', expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBe('reserved_for_other_session');
  });

  it('exempts the reserved-for session', () => {
    const ctx = { sessionId: 'session-A', reservations: { 'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'session-A', expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('a dead reserved-for session (reservedForSessionLive:false) voids the fence immediately, before TTL', () => {
    const ctx = { sessionId: 'peer', reservations: { 'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'dead-worker', reservedForSessionLive: false, expiresAt: future() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('an expired reservation does not fence', () => {
    const ctx = { sessionId: 'session-B', reservations: { 'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'session-A', expiresAt: past() }] } };
    expect(coordinatorReservation(row, ctx)).toBeNull();
  });

  it('an sd_key row and a QF id row do not collide when both keys happen to appear in ctx.reservations', () => {
    const ctx = {
      sessionId: 'session-B',
      reservations: {
        'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: future() }],
        'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'session-A', expiresAt: future() }],
      },
    };
    expect(coordinatorReservation({ sd_key: 'SD-X' }, ctx)).toBe('reserved_for_other_session');
    expect(coordinatorReservation({ id: 'QF-20260911-117' }, ctx)).toBe('reserved_for_other_session');
    expect(coordinatorReservation({ id: 'QF-UNRELATED' }, ctx)).toBeNull();
  });

  it('prefers sd_key over id when a row somehow carries both (SDs are never demoted by this change)', () => {
    const ctx = { sessionId: 'session-B', reservations: { 'SD-X': [{ sd: 'SD-X', reservedForSession: 'session-A', expiresAt: future() }] } };
    expect(coordinatorReservation({ sd_key: 'SD-X', id: 'unrelated-uuid' }, ctx)).toBe('reserved_for_other_session');
  });
});

describe('reserveWorkItem / reserveSd — honestly-named alias, same behavior for a QF id', () => {
  it('reserveSd is a thin alias of reserveWorkItem (same function reference)', () => {
    expect(reserveSd).toBe(reserveWorkItem);
  });

  it('writes a reservation row keyed by a QF id exactly like it does for an SD key', async () => {
    const inserted = [];
    const sb = {
      from(table) {
        expect(table).toBe('session_coordination');
        return {
          insert(row) {
            inserted.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'res-qf-1', created_at: '2026-09-11T22:12:00Z' }, error: null }) }) };
          },
        };
      },
    };
    const result = await reserveWorkItem(sb, {
      targetSd: 'QF-20260911-117',
      reservedForSession: 'session-A',
      expiresAt: future(),
      resolveCoordinatorId: async () => 'coordinator-1',
    });
    expect(result.error).toBeNull();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].target_sd).toBe('QF-20260911-117');
    expect(inserted[0].sender_session).toBe('coordinator-1');
  });
});

describe('self-claim-qf.cjs threads ctx.reservations + tierCtx into selfClaimQuickFix', () => {
  // SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-3): self-claim-qf.cjs now calls getMyClaims(sb,
  // sessionId) before anything else -- a bare `{}` sb (no .from) makes that call fail-closed
  // (a read error must never let self-claim proceed silently), so selfClaimQuickFix would never
  // be reached at all. This minimal stub answers both of getMyClaims' queries with "no claims
  // held", which is what these tests intend (they exist to verify argument threading, not the
  // new guard), so selfClaimQuickFix is reached exactly as before.
  const noClaimsSb = () => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
  });

  it('passes reservations and worker_tier_rank as the 5th argument', async () => {
    const selfClaimQuickFix = vi.fn().mockResolvedValue(null);
    const ctx = {
      sb: noClaimsSb(),
      sessionId: 'session-A',
      base: { ok: true },
      helpers: { selfClaimQuickFix },
      reservations: { 'QF-20260911-117': [{ sd: 'QF-20260911-117', reservedForSession: 'session-B', expiresAt: future() }] },
      tierCtx: { worker_tier_rank: 3 },
    };
    await selfClaimQfStep.run(ctx);
    expect(selfClaimQuickFix).toHaveBeenCalledTimes(1);
    const args = selfClaimQuickFix.mock.calls[0];
    expect(args[0]).toBe(ctx.sb);
    expect(args[1]).toBe('session-A');
    expect(args[2]).toBe(ctx.base);
    expect(args[4]).toEqual({ reservations: ctx.reservations, worker_tier_rank: 3 });
  });

  it('degrades to undefined reservations/worker_tier_rank when neither ctx field is present (byte-identical no-op shape)', async () => {
    const selfClaimQuickFix = vi.fn().mockResolvedValue(null);
    const ctx = { sb: noClaimsSb(), sessionId: 'session-A', base: {}, helpers: { selfClaimQuickFix } };
    await selfClaimQfStep.run(ctx);
    const args = selfClaimQuickFix.mock.calls[0];
    expect(args[4]).toEqual({ reservations: undefined, worker_tier_rank: undefined });
  });
});
