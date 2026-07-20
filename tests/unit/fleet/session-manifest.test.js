// SD-LEO-INFRA-FLEET-REGISTRY-MANIFEST-001 FR-3 — manifest = DESIRED state + drift (coordinator amendment).
// Fully in-memory (no DB): proves the manifest models the TARGET fleet shape and surfaces drift.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  normalizeDesiredManifest, computeManifestDrift, summarizeManifestDrift,
  normalizeDesiredSlots, computeSlotDrift,
} from '../../../lib/fleet/session-manifest.js';

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

  // REGRESSION PIN (TS-2, SD-LEO-INFRA-LEO-COMPLETION-001-B): the three functions above are a live
  // runtime dependency of lib/fleet/session-registry-adapter.js — this exact signature/shape must
  // never change. Failing this test means a breaking change reached the pure core.
  it('REGRESSION PIN: {role,min} core signatures/shapes are unchanged (live consumer: session-registry-adapter.js)', () => {
    expect(normalizeDesiredManifest([{ role: 'worker', min: 2 }])).toEqual([{ role: 'worker', min: 2 }]);
    const v = computeManifestDrift({ desired: [{ role: 'worker', min: 2 }], actualByRole: { worker: 1 } });
    expect(v).toEqual({ drift: true, under: [{ role: 'worker', desired: 2, actual: 1 }], satisfied: [], unexpected: [] });
  });
});

// DESIRED-STATE SLOT SCHEMA (SD-LEO-INFRA-LEO-COMPLETION-001-B, FR-1/FR-2) — additive, keyed by name.
describe('session-manifest DESIRED-STATE SLOTS (FR-1, Solomon checkpoint-1 amendment verbatim)', () => {
  const fullSlot = { name: 'Alpha-5', color: 'blue', role: 'worker', account_profile: 'default', model: 'sonnet', effort: 'high', worktree: 'C:/wt/alpha5', resume_uuid: 'uuid-1' };

  it('normalizeDesiredSlots keeps the full 8-field slot shape and drops name-less entries', () => {
    const n = normalizeDesiredSlots([fullSlot, { color: 'red' }, { name: 'Beta-1' }]);
    expect(n).toEqual([
      fullSlot,
      { name: 'Beta-1', color: null, role: null, account_profile: null, model: null, effort: null, worktree: null, resume_uuid: null },
    ]);
  });

  it('computeSlotDrift: MISSING when a desired slot has no actual entry', () => {
    const v = computeSlotDrift({ desired: [fullSlot], actualByKey: {} });
    expect(v.drift).toBe(true);
    expect(v.missing).toEqual([{ name: 'Alpha-5' }]);
  });

  it('computeSlotDrift: present + field-level mismatches surfaced (not just presence)', () => {
    const v = computeSlotDrift({ desired: [fullSlot], actualByKey: { 'Alpha-5': { ...fullSlot, model: 'opus' } } });
    expect(v.drift).toBe(false);
    expect(v.present).toEqual([{ name: 'Alpha-5', mismatches: ['model'] }]);
  });

  it('computeSlotDrift: unexpected actual entries not in the desired list are surfaced', () => {
    const v = computeSlotDrift({ desired: [fullSlot], actualByKey: { 'Alpha-5': fullSlot, 'ghost': { name: 'ghost' } } });
    expect(v.unexpected).toEqual(['ghost']);
  });

  it('computeSlotDrift: keyed by name, not role -- two same-role slots are distinct entries', () => {
    const desired = [{ ...fullSlot, name: 'Alpha-5' }, { ...fullSlot, name: 'Alpha-6' }];
    const v = computeSlotDrift({ desired, actualByKey: { 'Alpha-5': fullSlot } });
    expect(v.missing).toEqual([{ name: 'Alpha-6' }]);
  });

  it('empty/absent input is drift-free (conservative, mirrors {role,min} core)', () => {
    expect(computeSlotDrift().drift).toBe(false);
    expect(computeSlotDrift({ desired: [] }).drift).toBe(false);
  });

  // STRUCTURAL TRIM-DETECTOR (TS-4): asserts the 8-field slot shape is present AND that the live
  // consumers reference the new schema by name -- fails if either the shape or the reference is
  // absent, i.e. if the {role,min} shape were ever reinstated as the ONLY manifest interface.
  it('TRIM-DETECTOR: the 8-field desired-state slot shape exists and is referenced by both migrated consumers', () => {
    const slotFields = ['name', 'color', 'role', 'account_profile', 'model', 'effort', 'worktree', 'resume_uuid'];
    const sample = normalizeDesiredSlots([{ name: 'x' }])[0];
    expect(Object.keys(sample).sort()).toEqual([...slotFields].sort());

    const adapterSrc = readFileSync(new URL('../../../lib/fleet/session-registry-adapter.js', import.meta.url), 'utf8');
    expect(adapterSrc).toMatch(/normalizeDesiredSlots/);
    expect(adapterSrc).toMatch(/computeSlotDrift/);

    const meteringSrc = readFileSync(new URL('../../../lib/fleet/session-metering.js', import.meta.url), 'utf8');
    expect(meteringSrc).toMatch(/actualByName/);
  });
});
