/**
 * QF-20260725-757 — canary provisioning for CP3.
 *
 * The bug: fleet_desired_slots had an enabled Canary-pilot row and canary_seed_pending=false, so the
 * playbook read as drill-ready — but every canary session was status=released (~304 min stale) and
 * resolveCanaryTarget returned resolved:false/not_found. A seeded SLOT and a running SESSION are
 * different facts. The gate must be session-liveness, never slot existence.
 *
 * Pure/seam-injected only — no real fleet, no claude_sessions access.
 */
import { describe, it, expect } from 'vitest';
import { selectCanarySlot, isProvisioned, provisionCanary } from '../../lib/fleet/canary-provision.js';

const CANARY_SLOT = { name: 'Canary-pilot', role: 'worker', account_profile: 'canary', model: 'opus' };
const RESOLVED = { resolved: true, identity: { callsign: 'Canary-pilot', account_profile: 'canary' } };
const NOT_FOUND = { resolved: false, reason: 'not_found' };

describe('isProvisioned — the gate', () => {
  it('REGRESSION: a seeded slot with no live session is NOT provisioned', () => {
    // The exact CP3 state: slot seeded, canary_seed_pending=false, zero live sessions.
    expect(isProvisioned(NOT_FOUND)).toBe(false);
  });

  it('is true only on an explicit resolved:true', () => {
    expect(isProvisioned(RESOLVED)).toBe(true);
  });

  it('fails closed on malformed/absent resolutions', () => {
    for (const bad of [null, undefined, {}, { resolved: 'true' }, { resolved: 1 }]) {
      expect(isProvisioned(bad)).toBe(false);
    }
  });
});

describe('selectCanarySlot', () => {
  it('picks the canary-profile slot and ignores production slots', () => {
    const slots = [{ name: 'Alpha-3', account_profile: 'primary' }, CANARY_SLOT];
    expect(selectCanarySlot(slots)).toEqual(CANARY_SLOT);
  });

  it('returns null when nothing is seeded, and tolerates junk input', () => {
    expect(selectCanarySlot([{ name: 'Alpha-3', account_profile: 'primary' }])).toBeNull();
    expect(selectCanarySlot([])).toBeNull();
    expect(selectCanarySlot(undefined)).toBeNull();
    expect(selectCanarySlot([null, { account_profile: 'canary' }])).toBeNull(); // nameless slot rejected
  });
});

describe('provisionCanary', () => {
  const base = {
    supabase: {},
    loadSlotsFn: async () => [CANARY_SLOT],
    sleepFn: async () => {},
  };

  it('is idempotent — an already-live canary is never spawned again', async () => {
    let spawned = 0;
    const res = await provisionCanary({
      ...base, live: true,
      resolveFn: async () => RESOLVED,
      spawnFn: async () => { spawned++; return {}; },
    });
    expect(res).toMatchObject({ ok: true, reason: 'already_live', alreadyLive: true });
    expect(spawned).toBe(0);
  });

  it('DEFAULTS TO DRY-RUN: never claims readiness and never spawns live', async () => {
    let liveFlag;
    const res = await provisionCanary({
      ...base,
      resolveFn: async () => NOT_FOUND,
      spawnFn: async (_t, opts) => { liveFlag = opts.live; return { live: false }; },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('dry_run');
    expect(liveFlag).toBe(false);
  });

  it('reports the unseeded case distinctly from the seeded-but-dead case', async () => {
    const res = await provisionCanary({
      ...base, live: true,
      loadSlotsFn: async () => [],
      resolveFn: async () => NOT_FOUND,
      spawnFn: async () => { throw new Error('must not spawn without a slot'); },
    });
    expect(res).toMatchObject({ ok: false, reason: 'no_canary_slot_seeded' });
  });

  it('waits for REGISTRATION, not merely a returned spawn', async () => {
    let calls = 0;
    // Spawn "succeeds" immediately but the session only registers on the 3rd poll.
    const res = await provisionCanary({
      ...base, live: true, maxAttempts: 5,
      resolveFn: async () => (++calls >= 4 ? RESOLVED : NOT_FOUND),
      spawnFn: async () => ({ live: true, pid: 123 }),
    });
    expect(res).toMatchObject({ ok: true, reason: 'provisioned', attempts: 3 });
  });

  it('REGRESSION: a spawn that never registers is a FAILURE, not a pass', async () => {
    // The ghosting canary — process started, session never came up. Must not report ok.
    const res = await provisionCanary({
      ...base, live: true, maxAttempts: 3,
      resolveFn: async () => NOT_FOUND,
      spawnFn: async () => ({ live: true, pid: 123 }),
    });
    expect(res).toMatchObject({ ok: false, reason: 'registration_timeout', attempts: 3 });
  });
});
