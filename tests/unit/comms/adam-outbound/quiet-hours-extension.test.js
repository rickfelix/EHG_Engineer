// QF-20260720-824: chairman quiet-hours window-extension check. Fail-safe throughout —
// only a valid, unexpired, chairman-set extension flips allowQuietHours to true; every
// other case (absent/malformed/expired/error) leaves the standard 22:00-06:00 ET window
// in force.
import { describe, it, expect, vi } from 'vitest';
import { resolveAllowQuietHours, CHAIRMAN_ID, EXTEND_KEY } from '../../../../lib/comms/adam-outbound/quiet-hours-extension.js';

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
