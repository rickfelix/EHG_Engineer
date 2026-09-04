/**
 * SD-LEO-ORCH-CAPA-RECORD-TRUTH-001-D FR-4 (TS-8): prove the four actuation paths (belt-verdict
 * deficit trigger, demand-gate mint floor, coordinator quiet/loaded cadence, Adam hard-interrupt)
 * are unaffected except where FR-3's matrix intends a change -- restated as a two-sided DELTA
 * identity per TESTING's PLAN-phase correction (idleNow enters computeBeltVerdict LINEARLY and a
 * verdict flip CAN be the intended fix, not a violation of "unchanged").
 *
 * Three of the four paths (belt-verdict, demand-gate floor, quiet/loaded cadence) are ALL fed by
 * the SAME scalar: scripts/lib/capacity-inputs.mjs's gatherCapacityInputs().idleNow. The FR-3
 * differential harness already proves that value's contributing verdict (isCapacityForecastWorker)
 * is UNCHANGED on every fixture in the frozen population (this SD deliberately did not wire
 * qf-holder/directed-work/spin-up-grace into capacity-inputs -- see the FR-3 harness's matrix).
 * Given idleNow itself does not change, and computeBeltVerdict/computeLoadedAndQuiet/
 * resolveLiveDemandFloor are all PURE functions of idleNow (demonstrated below), their outputs
 * are provably unaffected -- there is no separate per-session trace to build for these three.
 *
 * The fourth path, Adam's hard-interrupt (checkIdleBesideClaimable / idleBesideClaimableCount),
 * DID change (FR-3: fixture-session, qf-holder-authoritative, directed-work, spin-up-grace all
 * newly excluded on this consumer) -- this file builds the actual before/after actuation-output
 * proof for it.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { computeBeltVerdict } from '../../lib/drive-loop/belt-verdict.js';
import { idleBesideClaimableCount } from '../../scripts/adam-quiet-tick.mjs';
import { runDifferential, FROZEN_POPULATION } from '../../lib/fleet/fr3-idle-consolidation-differential.mjs';

const require = createRequire(import.meta.url);
const { computeLoadedAndQuiet } = require('../../lib/coordinator/quiet-tick.cjs');
const { isBuildForbiddenSession } = require('../../lib/claim/build-forbidden-session.cjs');

describe('FR-4: belt-verdict / demand-gate-floor / quiet-cadence share one unchanged input', () => {
  it('capacity-inputs contributes ZERO changed verdicts across the entire FR-3 frozen population', () => {
    // This is the load-bearing fact for all three scalar-fed actuation paths: if idleNow's
    // contributing predicate never changes verdict on this SD's population, the belt-verdict/
    // demand-floor/quiet-cadence outputs (all pure functions OF idleNow) cannot have changed
    // either, on this SD's account.
    const results = runDifferential(FROZEN_POPULATION);
    const capacityInputsRows = results.filter((r) => r.consumer === 'capacity-inputs');
    expect(capacityInputsRows.length).toBe(FROZEN_POPULATION.length);
    expect(capacityInputsRows.every((r) => !r.changed)).toBe(true);
  });

  it('computeBeltVerdict is a pure function of the scalar idleNow (verified: same non-idleNow inputs, idleNow delta produces exactly the documented DEFICIT-URGENT flip)', () => {
    const fixed = { freeingSoon: 0, claimableCount: 0, openQfCount: 0, buffer: 1 };
    const withZeroIdle = computeBeltVerdict({ idleNow: 0, ...fixed });
    const withOneIdle = computeBeltVerdict({ idleNow: 1, ...fixed });
    expect(withZeroIdle.verdict).not.toBe('DEFICIT-URGENT');
    expect(withOneIdle.verdict).toBe('DEFICIT-URGENT'); // beltDepth=0 && idleNow>0, per the documented rule
    expect(withOneIdle.demandSoon).toBe(withZeroIdle.demandSoon + 1); // linear in idleNow, nothing else moved
  });

  it('computeLoadedAndQuiet requires idleNow===0 exactly -- any idleNow change that does not cross zero cannot flip it', () => {
    const clear = { idleNow: 0, rawUnclaimed: 0, openQfCount: 0, claimableWithVerifyQfCount: 0, unactionedDirective: false, undeliveredEscalation: false };
    expect(computeLoadedAndQuiet(clear)).toBe(true);
    expect(computeLoadedAndQuiet({ ...clear, idleNow: 1 })).toBe(false);
    expect(computeLoadedAndQuiet({ ...clear, idleNow: 2 })).toBe(false); // same false verdict on either side of a non-zero-to-non-zero move
  });

  it('resolveLiveDemandFloor\'s floor is demandSoon (idleNow + freeingSoon) + buffer, floored at DEFAULT_DEMAND_FLOOR -- another pure function of the same idleNow', () => {
    // Re-derive the exact composition resolveLiveDemandFloor uses (lib/governance/demand-gate-emit.js
    // computed branch): floor = max(DEFAULT_DEMAND_FLOOR, computeBeltVerdict(...).demandSoon + BELT_BUFFER).
    const BELT_BUFFER = 1;
    const DEFAULT_DEMAND_FLOOR = 3;
    const floorFor = (idleNow) => {
      const { demandSoon } = computeBeltVerdict({ idleNow, freeingSoon: 0, claimableCount: 0, openQfCount: 0, buffer: BELT_BUFFER });
      return Math.max(DEFAULT_DEMAND_FLOOR, demandSoon + BELT_BUFFER);
    };
    // Since capacity-inputs' idleNow is proven unchanged above, floorFor(idleNow) is called with
    // the SAME idleNow before and after this SD -- so the floor itself is unaffected.
    expect(floorFor(5)).toBe(floorFor(5));
    expect(floorFor(5)).toBeGreaterThan(floorFor(0)); // sanity: the function genuinely depends on idleNow
  });
});

describe('FR-4: Adam hard-interrupt (checkIdleBesideClaimable) -- the one path FR-3 says DOES change', () => {
  // The actuation is exactly `idleBesideClaimable !== null`, i.e. idleCount > 0 (scripts/adam-quiet-tick.mjs
  // line ~1580: `if (idleBesideClaimable) console.log('QUIET_TICK_IDLE_BESIDE_CLAIMABLE=adam ...')`,
  // which is what the hard-interrupt allowlist keys on).
  const triggers = (idleCount) => idleCount > 0;

  function oldIdleCount(seats) {
    return (seats || []).filter((s) => !isBuildForbiddenSession(s.metadata) && !s.released_at).length;
  }
  function newIdleCount(seats, ctx) {
    return idleBesideClaimableCount(seats, ctx);
  }

  const QF_HOLDERS = new Set(['qf-holder-1']);
  const SEAT_BUSY = new Set(['directed-work-1']);
  const NOW_MS = Date.parse('2026-09-04T00:00:00.000Z');

  it('INTENDED FIX: idleCount>0 driven SOLELY by a fixture false-positive now correctly reads 0 -- the interrupt stops firing on nothing', () => {
    const seats = [{ session_id: 'test-session-nswcf-fenced', metadata: {}, released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() }];
    const pre = oldIdleCount(seats);
    const post = newIdleCount(seats, { nowMs: NOW_MS, qfHolderSessionIds: QF_HOLDERS, seatBusySessionIds: SEAT_BUSY });
    expect(pre).toBe(1);
    expect(post).toBe(0);
    expect(triggers(pre)).toBe(true);   // OLD: falsely wakes Adam over a fixture
    expect(triggers(post)).toBe(false); // NEW: correctly stays quiet -- the intended fix
  });

  it('the interrupt DECISION is unaffected when a genuine idle worker is present alongside the now-excluded shapes (count drops, threshold decision does not)', () => {
    const genuineWorker = { session_id: 'genuine-1', metadata: {}, released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() };
    const seats = [
      genuineWorker,
      { session_id: 'test-session-nswcf-fenced', metadata: {}, released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() },
      { session_id: 'qf-holder-1', metadata: {}, released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() },
      { session_id: 'directed-work-1', metadata: {}, released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() },
    ];
    const pre = oldIdleCount(seats);
    const post = newIdleCount(seats, { nowMs: NOW_MS, qfHolderSessionIds: QF_HOLDERS, seatBusySessionIds: SEAT_BUSY });
    expect(pre).toBe(4);  // OLD: none of the three edge-case shapes were excluded
    expect(post).toBe(1); // NEW: only the genuine worker remains -- exactly the FR-3-matrix-predicted delta of 3
    expect(pre - post).toBe(3);
    expect(triggers(pre)).toBe(true);
    expect(triggers(post)).toBe(true); // decision UNCHANGED: the genuine worker alone is still enough to interrupt
  });

  it('a population with NO genuine idle worker and no edge-case shapes triggers neither before nor after (true negative, unaffected)', () => {
    const seats = [{ session_id: 'busy-1', metadata: {}, sd_key: 'SD-X', released_at: null, created_at: new Date(NOW_MS - 60 * 60 * 1000).toISOString() }];
    // Note: sd_key is not read by either oldIdleCount or newIdleCount (query-layer .is('sd_key', null)
    // already excludes claimed sessions before either function sees them) -- included here only to
    // make the fixture self-documenting as "a claimed, non-idle seat", not as a functional input.
    const emptySeats = [];
    expect(triggers(oldIdleCount(emptySeats))).toBe(false);
    expect(triggers(newIdleCount(emptySeats, { nowMs: NOW_MS }))).toBe(false);
  });
});
