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
  CONSTANTS,
} from '../../../lib/eva/capacity-governor.js';

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
            not: () => Promise.resolve({ data: [], error: null }),
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
            not: () => Promise.resolve({ data: [{ session_hours_burned: 32 }], error: null }),
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

describe('computeVerdict()', () => {
  it('parks burst/fable-tier sessions before any standard-tier session (TS-4)', () => {
    const fleetRoster = [
      { sessionId: 's1', callsign: 'Alpha', model: 'sonnet', seatTier: 'standard' },
      { sessionId: 's2', callsign: 'Bravo', model: 'fable', seatTier: 'burst' },
      { sessionId: 's3', callsign: 'Charlie', model: 'sonnet', seatTier: 'standard' },
      { sessionId: 's4', callsign: 'Delta', model: 'sonnet', seatTier: 'standard' },
      { sessionId: 's5', callsign: 'Echo', model: 'sonnet', seatTier: 'standard' },
      { sessionId: 's6', callsign: 'Foxtrot', model: 'fable', seatTier: 'burst' },
      { sessionId: 's7', callsign: 'Golf', model: 'sonnet', seatTier: 'standard' },
      { sessionId: 's8', callsign: 'Hotel', model: 'sonnet', seatTier: 'standard' },
    ];
    const result = computeVerdict({
      fleetRoster,
      projectedHoursToWall: 3, // shorter than the window -> must shrink
      unattendedWindowHours: 6,
      eventCount: 2,
      windowEntryIso: '2026-07-05T23:00:00-04:00',
    });

    expect(result.core_size).toBeLessThan(fleetRoster.length);
    expect(result.park_list.length).toBe(fleetRoster.length - result.core_size);
    // Every burst-tier seat that got parked must appear before considering any
    // standard-tier seat is parked -- i.e. no standard-tier park without both
    // burst seats already parked.
    const parkedTiers = result.park_list.map(s => s.seatTier);
    const firstStandardIdx = parkedTiers.indexOf('standard');
    if (firstStandardIdx !== -1) {
      const burstCount = fleetRoster.filter(s => s.seatTier === 'burst').length;
      const burstParkedBeforeStandard = parkedTiers.slice(0, firstStandardIdx).filter(t => t === 'burst').length;
      expect(burstParkedBeforeStandard).toBe(Math.min(burstCount, firstStandardIdx));
    }
  });

  it('reports low confidence with fewer than 5 calibration events', () => {
    const result = computeVerdict({
      fleetRoster: [{ sessionId: 's1', callsign: 'Alpha', model: 'sonnet', seatTier: 'standard' }],
      projectedHoursToWall: 10,
      unattendedWindowHours: 6,
      eventCount: 2,
    });
    expect(result.confidence).toBe('low');
  });

  it('returns all 4 required verdict fields', () => {
    const result = computeVerdict({
      fleetRoster: [{ sessionId: 's1', callsign: 'Alpha', model: 'sonnet', seatTier: 'standard' }],
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
