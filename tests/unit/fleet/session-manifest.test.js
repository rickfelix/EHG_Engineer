// SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 FR-3 — manifest = DESIRED state + drift (coordinator amendment).
// Fully in-memory (no DB): proves the manifest models the TARGET fleet shape and surfaces drift.
import { describe, it, expect } from 'vitest';
import { normalizeDesiredManifest, computeManifestDrift, summarizeManifestDrift } from '../../../lib/fleet/session-manifest.js';

describe('session-manifest = DESIRED state (FR-3)', () => {
  const desired = [{ role: 'coordinator', min: 1 }, { role: 'adam', min: 1 }, { role: 'worker', min: 3 }];

  it('normalizes desired entries (default min=1, drops role-less)', () => {
    const n = normalizeDesiredManifest([{ role: 'coordinator' }, { role: 'worker', min: 4 }, { min: 2 }]);
    expect(n).toEqual([{ role: 'coordinator', min: 1 }, { role: 'worker', min: 4 }]);
  });

  it('DRIFT when a desired role is under-provisioned', () => {
    const v = computeManifestDrift({ desired, actualByRole: { coordinator: 1, adam: 0, worker: 2 } });
    expect(v.drift).toBe(true);
    expect(v.under).toEqual([{ role: 'adam', desired: 1, actual: 0 }, { role: 'worker', desired: 3, actual: 2 }]);
    expect(v.satisfied).toEqual([{ role: 'coordinator', actual: 1 }]);
  });

  it('NO drift when the fleet meets/exceeds the desired manifest', () => {
    const v = computeManifestDrift({ desired, actualByRole: { coordinator: 1, adam: 1, worker: 5 } });
    expect(v.drift).toBe(false);
    expect(v.under).toEqual([]);
  });

  it('surfaces unexpected live roles not in the manifest (observable, not a shortfall)', () => {
    const v = computeManifestDrift({ desired, actualByRole: { coordinator: 1, adam: 1, worker: 3, ghost: 2 } });
    expect(v.drift).toBe(false);
    expect(v.unexpected).toEqual(['ghost']);
  });

  it('summarizeManifestDrift → remediation on drift, null when satisfied', () => {
    const drifted = computeManifestDrift({ desired, actualByRole: { coordinator: 0 } });
    expect(summarizeManifestDrift(drifted).remediation).toMatch(/coordinator/);
    const ok = computeManifestDrift({ desired, actualByRole: { coordinator: 1, adam: 1, worker: 3 } });
    expect(summarizeManifestDrift(ok).remediation).toBeNull();
  });

  it('empty/absent input is drift-free (conservative)', () => {
    expect(computeManifestDrift().drift).toBe(false);
    expect(computeManifestDrift({ desired: [] }).drift).toBe(false);
  });
});
