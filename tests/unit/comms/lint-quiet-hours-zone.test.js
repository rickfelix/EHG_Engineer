/**
 * SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001 FR-3 (TS-1, TS-9): etHour/inQuietHours become
 * chairman-zone-aware via an optional context.chairmanZone, staying byte-identical to ET
 * when absent, and never throwing on a malformed zone (defense in depth, TR-5).
 */
import { describe, it, expect } from 'vitest';
import { etHour, inQuietHours } from '../../../lib/comms/adam-outbound/rubric-engine/lint.js';

describe('etHour / inQuietHours — chairman zone awareness', () => {
  it('TS-1: a Jamaica zone preference shifts the quiet-hours boundary by the ET/EDT-vs-no-DST offset', () => {
    // 2026-08-11T02:30:00Z: ET (EDT, UTC-4) local 22:30 -- inside the old hardcoded window.
    // Jamaica (UTC-5, no DST) local 21:30 -- NOT inside the 22:00-06:00 window.
    const now = new Date('2026-08-11T02:30:00.000Z');
    expect(inQuietHours({ now, chairmanZone: 'America/Jamaica' })).toBe(false);
    // The old hardcoded-ET behavior (no chairmanZone) DOES call this instant quiet.
    expect(inQuietHours({ now })).toBe(true);
  });

  it('a Jamaica zone preference still blocks once actually inside Jamaica local quiet hours', () => {
    // 2026-08-11T03:30:00Z: Jamaica local 22:30 -- inside the window.
    const now = new Date('2026-08-11T03:30:00.000Z');
    expect(inQuietHours({ now, chairmanZone: 'America/Jamaica' })).toBe(true);
  });

  it('absent chairmanZone is byte-identical to pre-SD ET-only behavior', () => {
    const now = new Date('2026-08-11T02:30:00.000Z');
    expect(etHour({ now })).toBe(22);
    expect(etHour({ now, chairmanZone: '' })).toBe(22);
    expect(etHour({ now, chairmanZone: undefined })).toBe(22);
  });

  it('nowHourET explicit override still wins even when chairmanZone is also present', () => {
    const now = new Date('2026-08-11T02:30:00.000Z');
    expect(etHour({ nowHourET: 5, chairmanZone: 'America/Jamaica', now })).toBe(5);
  });

  it('TS-9: a malformed chairmanZone reaching etHour directly never throws -- falls back to ET', () => {
    const now = new Date('2026-08-11T02:30:00.000Z');
    for (const bad of ['not-a-real-zone', 'america/new_york', '   ', 'XYZ123']) {
      expect(() => etHour({ now, chairmanZone: bad })).not.toThrow();
    }
    expect(etHour({ now, chairmanZone: 'not-a-real-zone' })).toBe(22);
  });

  it('the fail-closed no-clock-source contract is unchanged: still throws with neither nowHourET nor now', () => {
    expect(() => etHour({ chairmanZone: 'America/Jamaica' })).toThrow(/needs context.nowHourET/);
  });
});
