// SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001 — pure decision logic for the fleet-down operator alert.
// Oscillation-robust (sustained window, not point-in-time), claimable-gated, and edge-trigger-deduped
// so a long outage emails once rather than every 15-min run.
import { describe, it, expect } from 'vitest';
import { evaluateFleetDownAlert, evaluateDeadCoordinatorAlert } from '../../scripts/fleet-down-alert.mjs';

// Helper: build a newest-first pulse list from active_count values.
const pulses = (...active) => active.map((a) => ({ active_count: a }));

describe('evaluateFleetDownAlert (SD-LEO-INFRA-FLEET-DOWN-EMAIL-ALERT-001)', () => {
  it('ALERTS on 3 consecutive active=0 pulses with claimable work (prior pulse was up)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 5, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
    expect(r.reason).toMatch(/FLEET DOWN/);
  });

  it('ALERTS when there is no prior pulse (exactly the window, all zero)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0), claimableCount: 1, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
  });

  it('does NOT alert when there is no claimable work (idle empty queue is not an outage)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 0, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/no claimable work/);
  });

  it('does NOT alert on a single dip (oscillation self-recovers)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 3, 2, 1), claimableCount: 9, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/not sustained-down/);
  });

  it('does NOT alert with insufficient pulse history', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0), claimableCount: 4, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/insufficient pulse history/);
  });

  it('DEDUPS: does not re-alert when the pulse before the window was already 0 (mid-outage)', () => {
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 0), claimableCount: 7, requiredConsecutive: 3 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/already alerted/);
  });

  it('re-ALERTS after a recovery then a new sustained-down (prior pulse was up)', () => {
    // newest-first: down,down,down, up(recovery), down,down...  → prior to window is up → fire again
    const r = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 5, 0, 0), claimableCount: 3, requiredConsecutive: 3 });
    expect(r.alert).toBe(true);
  });

  it('honors a custom requiredConsecutive threshold', () => {
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 4), claimableCount: 2, requiredConsecutive: 2 }).alert).toBe(true);
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 4), claimableCount: 2, requiredConsecutive: 3 }).alert).toBe(false);
  });

  it('is total / fail-safe on odd input', () => {
    expect(evaluateFleetDownAlert().alert).toBe(false);
    expect(evaluateFleetDownAlert({ pulses: null, claimableCount: NaN }).alert).toBe(false);
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 0), claimableCount: 1, requiredConsecutive: 0 }).alert).toBe(true); // clamps to default 3
  });

  it('counts the leading zero-run in consecutiveZero', () => {
    expect(evaluateFleetDownAlert({ pulses: pulses(0, 0, 3), claimableCount: 1 }).consecutiveZero).toBe(2);
    expect(evaluateFleetDownAlert({ pulses: pulses(1, 0, 0), claimableCount: 1 }).consecutiveZero).toBe(0);
  });
});

// SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001 / FR-3 — dead-coordinator chairman-SMS page.
// Independent predicate from evaluateFleetDownAlert() above (TS-10 non-regression scenario):
// this describe block never touches the worker-fleet-down pulses/claimable inputs.
describe('evaluateDeadCoordinatorAlert (SD-LEO-INFRA-DURABLE-COORDINATOR-LOOPS-001)', () => {
  const NOW = new Date('2026-07-19T22:00:00.000Z');
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();

  it('TS-4: fires exactly once per outage — first tick past the threshold alerts', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(16), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(true);
    expect(r.reason).toMatch(/DEAD COORDINATOR/);
  });

  it('TS-4: does not re-fire on a later tick while still dead (edge-trigger dedup)', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(45), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/already past the first alertable tick/);
  });

  it('TS-5: heartbeat within the staleness window does not fire', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(5), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/within the/);
  });

  it('TS-5: heartbeat exactly at the staleness boundary fires (>=)', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(15), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(r.alert).toBe(true);
  });

  it('TS-6: defaults are independently named from resolve.cjs STALE_THRESHOLD_MIN (15min default, not 10)', () => {
    // 12min elapsed: dead under resolve.cjs's 10min internal constant, but NOT dead under this
    // alert's own default (15min) — proves the two thresholds are not silently sharing a value.
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(12), now: NOW });
    expect(r.alert).toBe(false);
  });

  it('no coordinator ever seen -> insufficient history, does not alert', () => {
    const r = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: null, now: NOW });
    expect(r.alert).toBe(false);
    expect(r.reason).toMatch(/insufficient history/);
  });

  it('is total / fail-safe on odd input', () => {
    expect(evaluateDeadCoordinatorAlert().alert).toBe(false);
    expect(evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: 'not-a-date', now: NOW }).alert).toBe(false);
  });

  it('TS-10 (non-regression): evaluateFleetDownAlert is unaffected by dead-coordinator inputs and vice versa', () => {
    // Worst case simultaneously: fleet is down AND coordinator is dead — each predicate must
    // reach its own independent verdict from its own inputs only.
    const fleetVerdict = evaluateFleetDownAlert({ pulses: pulses(0, 0, 0, 2), claimableCount: 5, requiredConsecutive: 3 });
    const coordVerdict = evaluateDeadCoordinatorAlert({ lastCoordinatorHeartbeatAt: minutesAgo(16), now: NOW, staleMin: 15, cronIntervalMin: 15 });
    expect(fleetVerdict.alert).toBe(true);
    expect(coordVerdict.alert).toBe(true);
    expect(fleetVerdict.reason).toMatch(/FLEET DOWN/);
    expect(coordVerdict.reason).toMatch(/DEAD COORDINATOR/);
  });
});
