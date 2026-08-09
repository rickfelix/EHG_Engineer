/**
 * The coordinator pending gauge must see the WHOLE lane, at ANY age.
 * SD-LEO-INFRA-COORDINATION-LANE-DRAIN-001 / FR-4.
 *
 * THE DEFECT. ADAM_ADVISORIES_PENDING is kind-scoped to adam_advisory, so any pending row of any
 * other kind reads as ZERO. That is the false all-clear that let 20 rows aged 20-27h sit while the
 * gauge printed 0 — the coordinator's own health signal, invisible on its own dashboard.
 *
 * WHY THE THIRD ARM IS NON-NEGOTIABLE. The obvious control is "a pending row makes it non-zero,
 * retiring the row makes it zero". That control PASSES VACUOUSLY here, because the neighbouring
 * salience counter is windowed to 30 minutes while the defect is rows aged 20-27 HOURS. A
 * freshly-inserted fixture row goes non-zero under a correct unwindowed gauge AND under a broken
 * 30-minute-windowed one, so two arms cannot tell them apart. Arm (c) — a ~24h-old pending row must
 * ALSO count — is the only one that discriminates, and without it EXEC could "fix" this by widening
 * a kind filter inside a window that was never the problem, and watch the control go green.
 *
 * WHY THIS DOES NOT JOIN retention_archive, stated because the opposite was required elsewhere in
 * this SD: no DRAIN RATE is computable from session_coordination alone, since the live table is
 * ~8% of all rows ever written and rows leave on an age/read basis regardless of whether anyone
 * acted — a rate computed from the live table measures the purge. A PENDING BACKLOG is a different
 * quantity: a pending row is by definition still live, so archived rows are not merely unnecessary
 * here, they would be wrong to include. The constraint is real; it binds rates, not backlogs.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const { summarizePendingLane } = createRequire(import.meta.url)('../../../lib/coordination/lane-pending-gauge.cjs');

const NOW = Date.parse('2026-08-07T13:00:00.000Z');
const HOUR = 3600 * 1000;
const ago = (ms) => new Date(NOW - ms).toISOString();

const pending = (kind, ageMs, over = {}) => ({
  id: `${kind}-${ageMs}`,
  created_at: ago(ageMs),
  acknowledged_at: null,
  payload: { kind },
  ...over
});

describe('FR-4 three-armed control — all three arms mandatory', () => {
  it('ARM (a): a fresh pending NON-adam_advisory row makes the gauge non-zero', () => {
    // Today this reads zero: the gauge is kind-scoped to adam_advisory.
    const out = summarizePendingLane([pending('coordinator_request', 2 * 60 * 1000)], { nowMs: NOW });
    expect(out.actionable).toBe(1);
    expect(out.total).toBe(1);
  });

  it('ARM (b): retiring the row returns the gauge to ZERO', () => {
    // A gauge that fires and never clears is a permanent alarm, and permanent alarms get switched off.
    const acked = pending('coordinator_request', 2 * 60 * 1000, { acknowledged_at: ago(60 * 1000) });
    expect(summarizePendingLane([acked], { nowMs: NOW }).actionable).toBe(0);
  });

  it('ARM (c): a pending row aged ~24h ALSO counts — the arm that discriminates', () => {
    // THE decisive assertion. A 30-min-windowed gauge returns 0 here while arms (a) and (b) still
    // pass, which is exactly how a wrong fix would have shipped green.
    const out = summarizePendingLane([pending('coordinator_request', 24 * HOUR)], { nowMs: NOW });
    expect(out.actionable).toBe(1);
    expect(out.oldestActionableAgeMs).toBeGreaterThan(20 * HOUR);
  });

  it('CONTROL: a 30-minute-windowed implementation would FAIL arm (c) while passing (a) and (b)', () => {
    // Demonstrates the vacuity directly rather than asserting it in prose, so the reasoning is
    // executable and cannot rot into a comment nobody rechecks.
    const rows = [pending('coordinator_request', 24 * HOUR)];
    const windowed = rows.filter((r) => NOW - Date.parse(r.created_at) <= 30 * 60 * 1000);
    expect(windowed).toHaveLength(0);
    expect(summarizePendingLane(rows, { nowMs: NOW }).actionable).toBe(1);
  });
});

describe('informational kinds must not inflate the gauge', () => {
  it('roll_call and friends are excluded — otherwise the gauge is permanently red', () => {
    // roll_call alone is ~1,295 rows and is undrained BY DESIGN. Counting it as pending would
    // manufacture a permanent breach out of correct behaviour, and a permanently-red gauge is
    // indistinguishable from a broken one within a week.
    const rows = [pending('roll_call', 3 * HOUR), pending('periodic_liveness_flag', 5 * HOUR)];
    const out = summarizePendingLane(rows, { nowMs: NOW });
    expect(out.actionable).toBe(0);
    expect(out.informational).toBe(2);
  });

  it('a mixed lane reports each class separately rather than one blended number', () => {
    const rows = [
      pending('roll_call', 3 * HOUR),
      pending('coordinator_request', 26 * HOUR),
      pending('totally_unknown_kind', 4 * HOUR)
    ];
    const out = summarizePendingLane(rows, { nowMs: NOW });
    expect(out).toMatchObject({ actionable: 1, informational: 1, unrecognized: 1, total: 3 });
  });
});

describe('unrecognized kinds stay VISIBLE', () => {
  it('an unclassified pending kind is counted, not silently dropped', () => {
    // If unrecognized rows were excluded, the first ownerless kind anyone introduces would be
    // invisible on this gauge from the day it shipped — the defect this SD exists to fix, rebuilt.
    const out = summarizePendingLane([pending('brand_new_kind', 8 * HOUR)], { nowMs: NOW });
    expect(out.unrecognized).toBe(1);
    expect(out.total).toBe(1);
  });

  it('a friction signal with no payload.kind is counted as actionable', () => {
    const row = { id: 'sig', created_at: ago(2 * HOUR), acknowledged_at: null, payload: { signal_type: 'stuck' } };
    expect(summarizePendingLane([row], { nowMs: NOW }).actionable).toBe(1);
  });
});

describe('robustness', () => {
  it('an empty lane reports zeros, not NaN', () => {
    expect(summarizePendingLane([], { nowMs: NOW })).toMatchObject({ actionable: 0, total: 0, oldestActionableAgeMs: 0 });
  });

  it('tolerates null input and malformed rows', () => {
    expect(() => summarizePendingLane(null, { nowMs: NOW })).not.toThrow();
    expect(() => summarizePendingLane([null, {}], { nowMs: NOW })).not.toThrow();
  });
});
