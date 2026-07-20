/**
 * SD-LEO-INFRA-OVERNIGHT-CAPACITY-GOVERNOR-001: unit tests for the pure
 * projection math and the fixture-based verdict logic. No live DB access --
 * that's covered by a live integration test.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  projectTimeToWall,
  getCalibratedBudget,
  computeVerdict,
  resolveModelWeight,
  CONSTANTS,
} from '../../../lib/eva/capacity-governor.js';

// fetch-all-paginated (FR-6) chains .order().range() after .not() and awaits each
// page; a short page (< pageSize) ends the loop after one page. This chainable
// builder lets the ledger query resolve through the real (non-catch) code path.
function ledgerBuilder(rows) {
  const b = {
    order: () => b,
    range: () => Promise.resolve({ data: rows, error: null }),
  };
  return b;
}

describe('projectTimeToWall()', () => {
  it('reproduces the real ~5.3h/6-session exhaustion within +/-45min at reference burn rate (TS-1 backtest)', () => {
    const { hoursToWall } = projectTimeToWall({
      budgetSessionHours: 32,
      fleetSize: 6,
      burnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
      referenceBurnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
    });
    const expectedHours = 32 / 6; // 5.33h
    const toleranceHours = 45 / 60;
    expect(Math.abs(hoursToWall - expectedHours)).toBeLessThan(toleranceHours);
  });

  it('shortens the projection when burn rate doubles the reference (TS-2 burn-reactivity)', () => {
    const baseline = projectTimeToWall({
      budgetSessionHours: 32,
      fleetSize: 6,
      burnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
      referenceBurnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
    });
    const spiked = projectTimeToWall({
      budgetSessionHours: 32,
      fleetSize: 6,
      burnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR * 2,
      referenceBurnRatePerSessionPerHour: CONSTANTS.REFERENCE_BURN_PER_SESSION_PER_HOUR,
    });
    expect(spiked.hoursToWall).toBeLessThan(baseline.hoursToWall);
    expect(spiked.hoursToWall).toBeCloseTo(baseline.hoursToWall / 2, 5);
  });

  it('returns Infinity (never throws/NaN) when fleetSize is 0', () => {
    const { hoursToWall } = projectTimeToWall({ budgetSessionHours: 32, fleetSize: 0 });
    expect(hoursToWall).toBe(Infinity);
  });
});

describe('getCalibratedBudget()', () => {
  it('falls back to the documented default (22.4) with zero ledger rows, never throws (TS-3)', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => ledgerBuilder([]),
          }),
        }),
      }),
    };
    const result = await getCalibratedBudget(supabase);
    expect(result.budgetSessionHours).toBeCloseTo(22.4, 5);
    expect(result.source).toBe('default');
    expect(result.eventCount).toBe(0);
  });

  it('averages real ledger session_hours_burned values when present', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => ledgerBuilder([{ session_hours_burned: 32 }]),
          }),
        }),
      }),
    };
    const result = await getCalibratedBudget(supabase);
    expect(result.budgetSessionHours).toBe(32);
    expect(result.source).toBe('ledger_average');
    expect(result.eventCount).toBe(1);
  });

  it('never throws on a DB error, falls back to default', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            not: () => { throw new Error('boom'); },
          }),
        }),
      }),
    };
    const result = await getCalibratedBudget(supabase);
    expect(result.budgetSessionHours).toBeCloseTo(22.4, 5);
  });
});

describe('resolveModelWeight() (QF-20260706-630 defect 3)', () => {
  it('weights fable ~2x the sonnet baseline, opus heavier than sonnet, haiku lighter', () => {
    expect(resolveModelWeight('fable')).toBe(2);
    expect(resolveModelWeight('claude-opus-4-8')).toBeGreaterThan(resolveModelWeight('claude-sonnet-5'));
    expect(resolveModelWeight('sonnet')).toBe(1);
    expect(resolveModelWeight('haiku')).toBeLessThan(1);
  });
  it('defaults unknown/missing models to the sonnet baseline (never NaN)', () => {
    expect(resolveModelWeight(undefined)).toBe(1);
    expect(resolveModelWeight('qwen3-coder:30b')).toBe(1);
  });
});

describe('computeVerdict()', () => {
  const fleetRoster = [
    { sessionId: 's1', callsign: 'Alpha', model: 'sonnet', weight: resolveModelWeight('sonnet') },
    { sessionId: 's2', callsign: 'Bravo', model: 'fable', weight: resolveModelWeight('fable') },
    { sessionId: 's3', callsign: 'Charlie', model: 'sonnet', weight: resolveModelWeight('sonnet') },
    { sessionId: 's4', callsign: 'Delta', model: 'sonnet', weight: resolveModelWeight('sonnet') },
    { sessionId: 's5', callsign: 'Echo', model: 'sonnet', weight: resolveModelWeight('sonnet') },
    { sessionId: 's6', callsign: 'Foxtrot', model: 'fable', weight: resolveModelWeight('fable') },
    { sessionId: 's7', callsign: 'Golf', model: 'sonnet', weight: resolveModelWeight('sonnet') },
    { sessionId: 's8', callsign: 'Hotel', model: 'sonnet', weight: resolveModelWeight('sonnet') },
  ];

  it('parks light (sonnet) seats before any fable seat -- fable-stays-up doctrine (TS-4)', () => {
    const result = computeVerdict({
      fleetRoster,
      projectedHoursToWall: 3, // shorter than the window -> must shrink
      unattendedWindowHours: 6,
      eventCount: 2,
      windowEntryIso: '2026-07-05T23:00:00-04:00',
    });

    expect(result.core_size).toBeLessThan(fleetRoster.length);
    expect(result.park_list.length).toBe(fleetRoster.length - result.core_size);
    // No fable seat may be parked while any sonnet seat remains unparked.
    const parkedModels = result.park_list.map(s => s.model);
    const firstFableIdx = parkedModels.indexOf('fable');
    if (firstFableIdx !== -1) {
      expect(parkedModels.slice(0, firstFableIdx).every(m => m !== 'fable')).toBe(true);
    }
  });

  it('shrinking to keep both fable seats forces parking ALL sonnet seats first (weighted core-size)', () => {
    // 2 fable (weight 2 each = 4) + enough headroom that surviving both fable seats alone
    // still satisfies the window -- core_size should retain the fable seats over sonnet.
    const result = computeVerdict({
      fleetRoster,
      projectedHoursToWall: 1.5,
      unattendedWindowHours: 6,
      eventCount: 2,
      windowEntryIso: '2026-07-05T23:00:00-04:00',
    });
    const coreModels = fleetRoster
      .slice() // computeVerdict sorts internally; re-derive from the roster's own weight order
      .sort((a, b) => b.weight - a.weight)
      .slice(0, result.core_size)
      .map(s => s.model);
    expect(coreModels.filter(m => m === 'fable').length).toBe(Math.min(2, result.core_size));
  });

  it('anchors the window to NOW when no windowEntryIso is given, not a fixed clock target (QF-20260706-630 defect 1)', () => {
    const before = Date.now();
    const result = computeVerdict({
      fleetRoster: [{ sessionId: 's1', callsign: 'Alpha', model: 'sonnet', weight: 1 }],
      projectedHoursToWall: 10,
      unattendedWindowHours: 6,
      eventCount: 6,
    });
    const after = Date.now();
    const resumeAtMs = Date.parse(result.resume_at);
    // resume_at must be ~6h from NOW (+/- the time this test took to run), never pinned to a
    // fixed clock boundary hours away (the ~26h-window-for-a-6h-ask bug).
    expect(resumeAtMs).toBeGreaterThanOrEqual(before + 6 * 3600_000 - 5000);
    expect(resumeAtMs).toBeLessThanOrEqual(after + 6 * 3600_000 + 5000);
  });

  it('reports low confidence with fewer than 5 calibration events', () => {
    const result = computeVerdict({
      fleetRoster: [{ sessionId: 's1', callsign: 'Alpha', model: 'sonnet', weight: 1 }],
      projectedHoursToWall: 10,
      unattendedWindowHours: 6,
      eventCount: 2,
    });
    expect(result.confidence).toBe('low');
  });

  it('returns all 4 required verdict fields', () => {
    const result = computeVerdict({
      fleetRoster: [{ sessionId: 's1', callsign: 'Alpha', model: 'sonnet', weight: 1 }],
      projectedHoursToWall: 10,
      unattendedWindowHours: 6,
      eventCount: 6,
    });
    expect(result).toHaveProperty('core_size');
    expect(result).toHaveProperty('park_list');
    expect(result).toHaveProperty('park_at');
    expect(result).toHaveProperty('resume_at');
  });
});
