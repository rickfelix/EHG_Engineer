/**
 * Unit pins for wiring genuine-stall detection to the EXISTING chairman escalation
 * channel (lib/chairman/record-pending-decision.mjs). SD-LEO-INFRA-UPSCALE-ADAM-
 * PROJECT-MANAGEMENT-DISCIPLINE-001-B (Child B / FR-3).
 *
 * recordPendingDecision already has its own dedicated test coverage
 * (tests/unit/chairman/record-pending-decision-escalation.test.js) — this suite tests
 * ONLY the wiring: does a genuine stall call it with the right args, does an intended
 * hold correctly NOT call it at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { bumpMovementTicks, checkAndAlertStalls } from '../../../lib/adam/stall-alert.js';
import { DEFAULT_STALE_TICKS } from '../../../lib/adam/stall-detector.js';

vi.mock('../../../lib/chairman/record-pending-decision.mjs', () => ({
  recordPendingDecision: vi.fn(async () => ({ recorded: true, id: 'dec-1', escalated: true })),
}));
import { recordPendingDecision } from '../../../lib/chairman/record-pending-decision.mjs';

beforeEach(() => { recordPendingDecision.mockClear(); });

describe('bumpMovementTicks', () => {
  it('resets to 0 when updated_at differs from the snapshot (real movement)', () => {
    const node = { id: 'p1', updated_at: '2026-07-01T12:00:00Z' };
    const prev = { p1: { updated_at: '2026-07-01T11:00:00Z', ticks: 5 } };
    expect(bumpMovementTicks(node, prev)).toBe(0);
  });

  it('increments when updated_at is unchanged (no movement)', () => {
    const node = { id: 'p1', updated_at: '2026-07-01T11:00:00Z' };
    const prev = { p1: { updated_at: '2026-07-01T11:00:00Z', ticks: 5 } };
    expect(bumpMovementTicks(node, prev)).toBe(6);
  });

  it('starts at 0 for a node with no prior snapshot entry', () => {
    expect(bumpMovementTicks({ id: 'new', updated_at: 'x' }, {})).toBe(0);
  });
});

describe('checkAndAlertStalls', () => {
  const sb = {}; // never touched directly — recordPendingDecision is mocked

  it('TS-4: a genuine stall on a critical-path parent calls recordPendingDecision(raisedBy:adam, blocking:true)', async () => {
    const parents = [{ id: 'p1', title: 'Run#5 GO', updated_at: 'fixed', inFlightNextStep: false }];
    // pre-seed the snapshot so this node is already at the stale threshold
    const prevSnapshot = { p1: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).toHaveBeenCalledTimes(1);
    const call = recordPendingDecision.mock.calls[0][1];
    expect(call.raisedBy).toBe('adam');
    expect(call.blocking).toBe(true);
    expect(alerted).toEqual([{ id: 'p1', title: 'Run#5 GO', escalated: true }]);
  });

  it('TS-5: an intended hold does NOT call recordPendingDecision — no escalation noise', async () => {
    const parents = [{ id: 'p2', title: 'Daemon reswap in flight', updated_at: 'fixed', inFlightNextStep: true }];
    const prevSnapshot = { p2: { updated_at: 'fixed', ticks: DEFAULT_STALE_TICKS - 1 } };

    const { alerted } = await checkAndAlertStalls(sb, parents, prevSnapshot);

    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('a fresh node (below the stale threshold) does not escalate', async () => {
    const parents = [{ id: 'p3', title: 'Just started', updated_at: 'x', inFlightNextStep: false }];
    const { alerted } = await checkAndAlertStalls(sb, parents, {});
    expect(recordPendingDecision).not.toHaveBeenCalled();
    expect(alerted).toEqual([]);
  });

  it('returns an updated snapshot for every parent processed', async () => {
    const parents = [{ id: 'p4', title: 'x', updated_at: 'v1', inFlightNextStep: false }];
    const { snapshot } = await checkAndAlertStalls(sb, parents, {});
    expect(snapshot.p4).toEqual({ updated_at: 'v1', ticks: 0 });
  });
});
