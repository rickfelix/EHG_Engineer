/**
 * QF-20260830-454 — stampSeatBusyReservation.
 *
 * A dispatched WORK_ASSIGNMENT writes NO row on either claim table, so the executing seat is
 * indistinguishable from an idle one to every capacity gauge (measured: Hotel-5, directive
 * 98f2a4b5 — released both his QFs to run a dispatched task, then immediately received a
 * competing idle-capacity claim hint). This stamp gives the dispatch itself a representation:
 * the SAME seat_busy_reservation payload kind already drained worker-side by
 * lib/checkin/steps/seat-busy-fence.cjs, but with no producer anywhere in the codebase before
 * this QF.
 *
 * TWO-SIDED per the QF's own acceptance bar:
 *   (a) a directed WORK_ASSIGNMENT produces a seat_busy_reservation INFO row targeting the seat.
 *   (b) a non-WORK_ASSIGNMENT row, or one with no target_session/sender_session, writes nothing.
 */
import { describe, it, expect, vi } from 'vitest';
import { stampSeatBusyReservation } from '../../../lib/coordinator/dispatch.cjs';

const noopLogger = { warn() {} };

function makeSupabase(insertFn) {
  return { from: () => ({ insert: insertFn }) };
}

describe('QF-20260830-454 stampSeatBusyReservation', () => {
  it('(a) writes a seat_busy_reservation INFO row targeting the seat, with a future expiry', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', sender_session: 'coord-1' };
    await stampSeatBusyReservation(makeSupabase(insertFn), row, noopLogger);
    expect(insertFn).toHaveBeenCalledTimes(1);
    const payload = insertFn.mock.calls[0][0];
    expect(payload.message_type).toBe('INFO');
    expect(payload.target_session).toBe('worker-7');
    expect(payload.target_sd).toBeNull();
    expect(payload.sender_session).toBe('coord-1');
    expect(payload.payload.kind).toBe('seat_busy_reservation');
    expect(new Date(payload.expires_at).getTime()).toBeGreaterThan(Date.now());
    // QF-20260901-039 regression guard: session_coordination.subject is NOT NULL. This insert
    // omitted it entirely, so every write failed the column constraint and the seat-busy guard
    // never actually held a reservation on any WORK_ASSIGNMENT since this stamp was introduced.
    expect(typeof payload.subject).toBe('string');
    expect(payload.subject.length).toBeGreaterThan(0);
  });

  it('(b) does NOT write for a non-WORK_ASSIGNMENT row', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const row = { message_type: 'INFO', target_session: 'worker-7', sender_session: 'coord-1' };
    await stampSeatBusyReservation(makeSupabase(insertFn), row, noopLogger);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('(b) does NOT write when the dispatch has no target_session', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const row = { message_type: 'WORK_ASSIGNMENT', sender_session: 'coord-1' };
    await stampSeatBusyReservation(makeSupabase(insertFn), row, noopLogger);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('(b) does NOT write when there is no sender_session (fence must be coordinator-authored)', async () => {
    const insertFn = vi.fn(async () => ({ error: null }));
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7' };
    await stampSeatBusyReservation(makeSupabase(insertFn), row, noopLogger);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it('is fail-soft: an insert error never throws', async () => {
    const insertFn = vi.fn(async () => ({ error: { message: 'insert failed' } }));
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', sender_session: 'coord-1' };
    await expect(stampSeatBusyReservation(makeSupabase(insertFn), row, noopLogger)).resolves.toBeUndefined();
  });

  it('is fail-soft: a thrown exception never propagates', async () => {
    const throwingSupabase = { from: () => { throw new Error('boom'); } };
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', sender_session: 'coord-1' };
    await expect(stampSeatBusyReservation(throwingSupabase, row, noopLogger)).resolves.toBeUndefined();
  });
});
