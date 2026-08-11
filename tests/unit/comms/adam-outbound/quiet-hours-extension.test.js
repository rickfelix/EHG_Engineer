// QF-20260720-824: chairman quiet-hours window-extension check. Fail-safe throughout —
// only a valid, unexpired, chairman-set extension flips allowQuietHours to true; every
// other case (absent/malformed/expired/error) leaves the standard 22:00-06:00 ET window
// in force.
import { describe, it, expect, vi } from 'vitest';
import {
  resolveAllowQuietHours, resolveChairmanZone, resolveQuietHoursContext, deriveChairmanZone,
  CHAIRMAN_ID, EXTEND_KEY, ZONE_KEY, DEFAULT_ZONE,
} from '../../../../lib/comms/adam-outbound/quiet-hours-extension.js';

function fakeStore(pref) {
  return { getPreference: vi.fn().mockResolvedValue(pref) };
}

describe('resolveAllowQuietHours', () => {
  const now = new Date('2026-07-20T23:00:00.000-04:00'); // 23:00 ET — inside the quiet window

  it('returns false when no preference is set', async () => {
    const store = fakeStore(null);
    expect(await resolveAllowQuietHours(now, { store })).toBe(false);
  });

  it('returns true when a valid, unexpired extension is recorded', async () => {
    const store = fakeStore({ value: '2026-07-20T23:30:00.000-04:00' }); // 23:30 ET, still ahead of `now`
    expect(await resolveAllowQuietHours(now, { store })).toBe(true);
    expect(store.getPreference).toHaveBeenCalledWith({ chairmanId: CHAIRMAN_ID, key: EXTEND_KEY });
  });

  it('returns false when the recorded extension has already expired', async () => {
    const store = fakeStore({ value: '2026-07-20T22:30:00.000-04:00' }); // 22:30 ET, before `now`
    expect(await resolveAllowQuietHours(now, { store })).toBe(false);
  });

  it('returns false when the recorded value is not a parseable timestamp', async () => {
    const store = fakeStore({ value: 'not-a-date' });
    expect(await resolveAllowQuietHours(now, { store })).toBe(false);
  });

  it('returns false when the recorded value is not a string', async () => {
    const store = fakeStore({ value: 12345 });
    expect(await resolveAllowQuietHours(now, { store })).toBe(false);
  });

  it('fails safe (false) when the store throws', async () => {
    const store = { getPreference: vi.fn().mockRejectedValue(new Error('db down')) };
    expect(await resolveAllowQuietHours(now, { store })).toBe(false);
  });
});

// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-2 (TS-4, TS-6): the chairman-zone resolver.
describe('resolveChairmanZone / deriveChairmanZone', () => {
  const now = new Date('2026-08-11T02:30:00.000Z');

  it("returns {zone: America/New_York, source: 'default'} when no preference is set", async () => {
    const store = { getPreference: vi.fn().mockResolvedValue(null) };
    const result = await resolveChairmanZone(now, { store });
    expect(result).toEqual({ zone: DEFAULT_ZONE, source: 'default' });
    expect(store.getPreference).toHaveBeenCalledWith({ chairmanId: CHAIRMAN_ID, key: ZONE_KEY });
  });

  it("returns the stored zone with source 'chairman_preference' for a valid bare-string IANA zone", async () => {
    const store = { getPreference: vi.fn().mockResolvedValue({ value: 'America/Jamaica' }) };
    expect(await resolveChairmanZone(now, { store })).toEqual({ zone: 'America/Jamaica', source: 'chairman_preference' });
  });

  it('returns the stored zone for a valid composite {zone, until} value when not yet expired', async () => {
    const store = { getPreference: vi.fn().mockResolvedValue({ value: { zone: 'America/Jamaica', until: '2026-08-14T12:00:00.000Z' } }) };
    expect(await resolveChairmanZone(now, { store })).toEqual({ zone: 'America/Jamaica', source: 'chairman_preference' });
  });

  it("falls back to ET with source 'invalid_fallback' (never 'default') for a malformed/non-canonical zone string, and never throws", async () => {
    for (const bad of ['Etc/GMT+5', 'not-a-zone', 'america/new_york', '']) {
      const store = { getPreference: vi.fn().mockResolvedValue({ value: bad }) };
      // eslint-disable-next-line no-await-in-loop
      expect(await resolveChairmanZone(now, { store })).toEqual({ zone: DEFAULT_ZONE, source: 'invalid_fallback' });
    }
  });

  it("falls back to ET with source 'invalid_fallback' when the composite value's until has already passed", async () => {
    const store = { getPreference: vi.fn().mockResolvedValue({ value: { zone: 'America/Jamaica', until: '2026-08-10T00:00:00.000Z' } }) };
    expect(await resolveChairmanZone(now, { store })).toEqual({ zone: DEFAULT_ZONE, source: 'invalid_fallback' });
  });

  it('never throws when the store throws -- falls back to invalid_fallback', async () => {
    const store = { getPreference: vi.fn().mockRejectedValue(new Error('db down')) };
    expect(await resolveChairmanZone(now, { store })).toEqual({ zone: DEFAULT_ZONE, source: 'invalid_fallback' });
  });

  it('deriveChairmanZone (pure, no store) matches the same contract directly', () => {
    expect(deriveChairmanZone(now, null)).toEqual({ zone: DEFAULT_ZONE, source: 'default' });
    expect(deriveChairmanZone(now, { value: 'America/Jamaica' })).toEqual({ zone: 'America/Jamaica', source: 'chairman_preference' });
    expect(deriveChairmanZone(now, { value: ['America/Jamaica'] })).toEqual({ zone: DEFAULT_ZONE, source: 'invalid_fallback' });
  });
});

// SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-2/FR-3: batched resolution for the hot send path.
describe('resolveQuietHoursContext', () => {
  const now = new Date('2026-08-11T02:30:00.000Z');

  it('batches both keys in a SINGLE getPreferences call, not two getPreference calls', async () => {
    const map = new Map([[ZONE_KEY, { value: 'America/Jamaica' }]]);
    const store = { getPreferences: vi.fn().mockResolvedValue(map) };
    const result = await resolveQuietHoursContext(now, { store });
    expect(store.getPreferences).toHaveBeenCalledTimes(1);
    expect(store.getPreferences).toHaveBeenCalledWith({ chairmanId: CHAIRMAN_ID, keys: [EXTEND_KEY, ZONE_KEY] });
    expect(result).toEqual({ allowQuietHours: false, chairmanZone: 'America/Jamaica', chairmanZoneSource: 'chairman_preference' });
  });

  it('resolves both an active extension AND a zone from the same batch', async () => {
    const map = new Map([
      [EXTEND_KEY, { value: '2026-08-11T03:00:00.000Z' }],
      [ZONE_KEY, { value: 'America/Jamaica' }],
    ]);
    const store = { getPreferences: vi.fn().mockResolvedValue(map) };
    expect(await resolveQuietHoursContext(now, { store })).toEqual({
      allowQuietHours: true, chairmanZone: 'America/Jamaica', chairmanZoneSource: 'chairman_preference',
    });
  });

  it('defaults both when the batch returns an empty map (no preferences set)', async () => {
    const store = { getPreferences: vi.fn().mockResolvedValue(new Map()) };
    expect(await resolveQuietHoursContext(now, { store })).toEqual({
      allowQuietHours: false, chairmanZone: DEFAULT_ZONE, chairmanZoneSource: 'default',
    });
  });

  it('fails safe on both when the store throws', async () => {
    const store = { getPreferences: vi.fn().mockRejectedValue(new Error('db down')) };
    expect(await resolveQuietHoursContext(now, { store })).toEqual({
      allowQuietHours: false, chairmanZone: DEFAULT_ZONE, chairmanZoneSource: 'invalid_fallback',
    });
  });
});
