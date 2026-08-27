// SD-LEO-INFRA-PERMISSION-FREEZE-STUCK-001 -- EXEC-phase non-prospective TESTING fix (D1).
//
// A 40-row live claude_sessions census found metadata.fleet_identity is an OBJECT on 28/28
// non-null rows -- {role, color, callsign, assigned_at, accountUuid8, display_name} -- never a
// bare string. This module is the single extraction point both consumers (fleet-health.cjs's
// citation and stuck-seat-keystroke-packet.cjs's renderer) now share, so the fix lives in one
// place instead of being duplicated (and potentially drifting) across both.
import { describe, it, expect } from 'vitest';
import { extractFleetIdentityLabel } from '../../../lib/fleet/fleet-identity-label.cjs';

describe('extractFleetIdentityLabel', () => {
  it('extracts .callsign from the real object shape', () => {
    const fleetIdentity = { role: 'worker', color: 'blue', callsign: 'Golf-5', assigned_at: '2026-08-01T00:00:00.000Z', accountUuid8: 'abcd1234', display_name: 'Golf-5 Worker' };
    expect(extractFleetIdentityLabel(fleetIdentity)).toBe('Golf-5');
  });

  it('falls back to .display_name when .callsign is absent', () => {
    expect(extractFleetIdentityLabel({ display_name: 'Nameless Worker' })).toBe('Nameless Worker');
  });

  it('returns null for an object with neither callsign nor display_name', () => {
    expect(extractFleetIdentityLabel({ role: 'worker', color: 'blue' })).toBeNull();
  });

  it('passes a bare string through unchanged (defensive -- not the real shape, but not an error)', () => {
    expect(extractFleetIdentityLabel('Alpha')).toBe('Alpha');
  });

  it('returns null for null/undefined/empty-string input, never "[object Object]" or "null"', () => {
    expect(extractFleetIdentityLabel(null)).toBeNull();
    expect(extractFleetIdentityLabel(undefined)).toBeNull();
    expect(extractFleetIdentityLabel('')).toBeNull();
  });
});
