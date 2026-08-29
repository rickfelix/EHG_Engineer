/**
 * QF-20260829-513 — stampCoordinatorReservation.
 *
 * lib/coordinator/reserve-sd.cjs (reserveSd) is the SHIPPED writer for a COORDINATOR_RESERVATION
 * fence, previously produced ONLY by the auto-promote refill path (softReserveLeaf). The directed
 * WORK_ASSIGNMENT dispatch path (this choke point) wrote no fence at all, so a race between the
 * directive being sent and the assignee acting on it let a different seat self-claim the SD out
 * from under the intended assignee (live-caught: A0's assignment lost to session 2b9045cc).
 *
 * TWO-SIDED per the QF's own acceptance bar:
 *   (a) a directed WORK_ASSIGNMENT for SD X produces a COORDINATOR_RESERVATION row for X via the
 *       EXISTING writer (reserveSd) -- not a second soft-lock mechanism.
 *   (b) an UNRESERVED case (no target_session, no resolvable SD, or a non-WORK_ASSIGNMENT row)
 *       calls reserveSd NOT AT ALL -- a fix that fenced everything would pass (a) while breaking
 *       the belt.
 *
 * reserveFn is injected (same DI shape as refill-auto-promote.js's softReserveLeaf deps.reserveFn)
 * so this suite proves ONLY the wiring -- which inputs call it, with what arguments -- without
 * depending on reserveSd's own live-coordinator resolution (covered by
 * tests/unit/coordinator/reserve-sd.test.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { stampCoordinatorReservation } from '../../../lib/coordinator/dispatch.cjs';

const noopLogger = { warn() {} };

describe('QF-20260829-513 stampCoordinatorReservation', () => {
  let reserveFn;
  beforeEach(() => {
    reserveFn = vi.fn(async () => ({ data: { id: 'res-1' }, error: null }));
  });

  it('(a) reserves the SD for the directed target session, with an expiry, via the existing reserveSd writer', async () => {
    const row = {
      message_type: 'WORK_ASSIGNMENT',
      target_session: 'worker-7',
      payload: { assigned_sd: 'SD-RACE-001' },
    };
    await stampCoordinatorReservation({}, row, noopLogger, reserveFn);
    expect(reserveFn).toHaveBeenCalledTimes(1);
    const [, opts] = reserveFn.mock.calls[0];
    expect(opts.targetSd).toBe('SD-RACE-001');
    expect(opts.reservedForSession).toBe('worker-7');
    expect(typeof opts.expiresAt).toBe('string');
    expect(new Date(opts.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('(b) does NOT reserve for a non-WORK_ASSIGNMENT row', async () => {
    const row = { message_type: 'INFO', target_session: 'worker-7', payload: { assigned_sd: 'SD-RACE-001' } };
    await stampCoordinatorReservation({}, row, noopLogger, reserveFn);
    expect(reserveFn).not.toHaveBeenCalled();
  });

  it('(b) does NOT reserve when the dispatch has no target_session (nothing to fence a specific seat against)', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', payload: { assigned_sd: 'SD-RACE-001' } };
    await stampCoordinatorReservation({}, row, noopLogger, reserveFn);
    expect(reserveFn).not.toHaveBeenCalled();
  });

  it('(b) does NOT reserve a generic nudge with no resolvable SD -- an unnamed SD stays unreserved', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', payload: {} };
    await stampCoordinatorReservation({}, row, noopLogger, reserveFn);
    expect(reserveFn).not.toHaveBeenCalled();
  });

  it('is fail-soft: a reserveSd error never throws and never surfaces as a dispatch failure', async () => {
    reserveFn.mockResolvedValueOnce({ data: null, error: 'no live active coordinator resolved' });
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', payload: { assigned_sd: 'SD-RACE-001' } };
    await expect(stampCoordinatorReservation({}, row, noopLogger, reserveFn)).resolves.toBeUndefined();
  });

  it('is fail-soft: a thrown exception (e.g. resolveAssignmentTargetKey fault surface) never propagates', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', payload: null };
    await expect(stampCoordinatorReservation({}, row, noopLogger, reserveFn)).resolves.toBeUndefined();
  });

  it('defaults to the real reserveSd when reserveFn is omitted (byte-identical call shape for the choke point)', async () => {
    const row = { message_type: 'WORK_ASSIGNMENT', target_session: 'worker-7', payload: { assigned_sd: 'SD-RACE-001' } };
    // No live coordinator resolves in this test environment -> real reserveSd fails safe (no
    // throw, no insert) -- only the non-throw contract is asserted, matching reserve-sd.test.js's
    // own "default resolver (no injection)" precedent.
    await expect(stampCoordinatorReservation({}, row, noopLogger)).resolves.toBeUndefined();
  });
});
