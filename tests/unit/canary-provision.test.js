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
import { assertCanaryTarget } from '../../lib/fleet/canary-guard.js';

const CANARY_SLOT = { name: 'Canary-pilot', role: 'worker', account_profile: 'canary', model: 'opus' };
const RESOLVED = { resolved: true, identity: { callsign: 'Canary-pilot', account_profile: 'canary' } };
const NOT_FOUND = { resolved: false, reason: 'not_found' };
// QF-20260725-529: the state the LIVE canary was actually stuck in -- session resolves, profile
// stamped, but NO Canary- callsign, so assertCanaryTarget rejects it as 'not_canary_callsign'.
const HALF_PROVISIONED = { resolved: true, identity: { callsign: null, account_profile: 'canary' } };

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

  // ---- QF-20260725-529: the gate-predicate schism -------------------------------------------
  // These are the pins the ORIGINAL suite lacked. Every test above passes against the OLD weak
  // predicate Boolean(resolution.resolved === true), because RESOLVED happens to carry both
  // conjuncts -- so the suite was green while the defect was live. A test that cannot fail on the
  // buggy code is not evidence.

  it('REGRESSION: a live session with the profile but NO Canary- callsign is NOT provisioned', () => {
    // Fails against the pre-fix predicate, which returned true here and made provisionCanary
    // short-circuit at already_live without ever minting the callsign.
    expect(isProvisioned(HALF_PROVISIONED)).toBe(false);
  });

  it('REGRESSION: a live session with a Canary- callsign but a non-canary profile is NOT provisioned', () => {
    const wrongProfile = { resolved: true, identity: { callsign: 'Canary-pilot', account_profile: 'primary' } };
    expect(isProvisioned(wrongProfile)).toBe(false);
  });

  it('CONTRACT: readiness agrees with assertCanaryTarget on every case — they can never drift apart', () => {
    // The anti-drift pin. isProvisioned must BE the guard, not a parallel re-derivation of it;
    // any future weakening of one side without the other fails here.
    const cases = [
      RESOLVED,
      HALF_PROVISIONED,
      NOT_FOUND,
      { resolved: true, identity: { callsign: 'Canary-pilot', account_profile: 'primary' } },
      { resolved: true, identity: { callsign: 'Alpha-3', account_profile: 'canary' } },
      { resolved: true, identity: {} },
      { resolved: true },
      {},
      null,
      undefined,
    ];
    for (const c of cases) {
      expect(isProvisioned(c)).toBe(assertCanaryTarget(c).ok);
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

  it('REGRESSION (QF-20260725-529): a callsign-less canary is NOT already_live — it gets provisioned', async () => {
    // THE defect, end-to-end: the live canary had the profile but no callsign, so the weak
    // readiness predicate reported already_live and the provisioner declined to act -- refusing to
    // fix the very state it exists to fix, leaving all three target-scoped CP3 legs un-runnable.
    // Post-fix the first probe rejects, so the spawn runs and the poll waits for a FULL identity.
    let spawned = 0;
    let probes = 0;
    const res = await provisionCanary({
      ...base, live: true,
      // half-provisioned until the spawn lands, then fully targetable
      resolveFn: async () => (++probes === 1 ? HALF_PROVISIONED : RESOLVED),
      spawnFn: async () => { spawned++; return { live: true }; },
    });
    expect(spawned).toBe(1);
    expect(res).toMatchObject({ ok: true, reason: 'provisioned' });
    expect(res.alreadyLive).toBeUndefined();
  });

  it('REGRESSION (QF-20260725-529): the post-spawn poll does not accept a callsign-less session as registered', async () => {
    // The same schism on the OTHER side of the spawn: the readiness poll must not declare victory
    // on a session the guard would still reject, or provisioning reports ok while CP3 stays blocked.
    let spawned = 0;
    const res = await provisionCanary({
      ...base, live: true, maxAttempts: 3,
      resolveFn: async () => HALF_PROVISIONED, // never gains a callsign
      spawnFn: async () => { spawned++; return { live: true }; },
    });
    expect(spawned).toBe(1);
    expect(res).toMatchObject({ ok: false, reason: 'registration_timeout', attempts: 3 });
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
