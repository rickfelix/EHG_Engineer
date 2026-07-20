// SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 FR-4 — pure metering surface + manifest-drift contract.
import { describe, it, expect } from 'vitest';
import { meterSessions, actualByRole } from '../../../lib/fleet/session-metering.js';
import { computeManifestDrift } from '../../../lib/fleet/session-manifest.js';

describe('session-metering surface (FR-4)', () => {
  const joined = [
    { session_id: 's1', terminal_id: 't1', pid: 100, callsign: 'Alpha', role: 'coordinator', model: 'opus' },
    { session_id: 's2', terminal_id: 't2', pid: 200, callsign: 'Bravo', role: 'worker', model: 'sonnet' },
    { session_id: 's3', terminal_id: 't3', pid: null, callsign: null, role: 'worker', model: 'sonnet' },
  ];

  it('aggregates by role / model / namespace', () => {
    const m = meterSessions(joined);
    expect(m.total).toBe(3);
    expect(m.byRole).toEqual({ coordinator: 1, worker: 2 });
    expect(m.byModel).toEqual({ opus: 1, sonnet: 2 });
    expect(m.byNamespace).toEqual({ session_id: 3, terminal_id: 3, pid: 2, callsign: 2 });
  });

  it('uses injected roleOf/modelOf accessors; missing → unknown', () => {
    const m = meterSessions([{ session_id: 'x' }], { roleOf: () => null, modelOf: () => undefined });
    expect(m.byRole).toEqual({ unknown: 1 });
    expect(m.byModel).toEqual({ unknown: 1 });
  });

  it('empty/absent input → zeroed snapshot', () => {
    expect(meterSessions().total).toBe(0);
    expect(meterSessions(null).byRole).toEqual({});
  });

  it('metering byRole feeds computeManifestDrift (actual side of desired-vs-actual)', () => {
    const snapshot = meterSessions(joined);
    const drift = computeManifestDrift({
      desired: [{ role: 'coordinator', min: 1 }, { role: 'worker', min: 3 }],
      actualByRole: actualByRole(snapshot),
    });
    expect(drift.drift).toBe(true); // worker 2/3 under-provisioned
    expect(drift.under).toEqual([{ role: 'worker', desired: 3, actual: 2 }]);
  });
});
