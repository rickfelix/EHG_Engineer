/**
 * Canary PROVISIONING step -- QF-20260725-757.
 *
 * THE GAP THIS CLOSES: the CP3 playbook goes reset-worktree -> unfence -> one --live run, presuming a
 * live canary that nothing creates. fleet_desired_slots holds an enabled Canary-pilot row and
 * metadata.canary_seed_pending=false is ACCURATE -- but a seeded SLOT and a running SESSION are
 * different facts, and only the slot was ever checked. With no session, resolveCanaryTarget returns
 * resolved:false/not_found, the drill fail-closes at the guard on all three legs, emits zero
 * fleet_verb_ rows, and burns the single clean run on a PARTIAL with nothing recoverable.
 *
 * THE GATE IS DRILL-TARGETABILITY, NOT SLOT EXISTENCE. isProvisioned() below delegates to
 * assertCanaryTarget, so a seeded slot alone -- and, since QF-20260725-529, a live-but-callsign-less
 * session -- can never read as drill-ready.
 *
 * SURVIVABILITY: canary sessions previously died of the QF-20260724-290 keepalive drop. That QF fixed
 * buildLiveSpawnInvocation and the respawn runner, but spawn() -- the verb provisioning must use --
 * was a THIRD hop that still passed no startupPrompt, so a provisioned canary would have ghosted
 * exactly as before. Fixed in spawn-control.js's spawn() alongside this module; without that fix this
 * provisioning step could not produce a surviving canary.
 *
 * SAFETY: dry-run by default. A live spawn requires an explicit live:true from the caller -- this
 * module never infers it. Running the CP3 drill itself is NOT in scope (Solomon owns legs S4-S7).
 */
import { loadDesiredSlots } from './desired-slots-store.js';
import { resolveCanaryTarget, assertCanaryTarget } from './canary-guard.js';
import { spawn as spawnControlSpawn } from './spawn-control.js';

import { CANARY_CALLSIGN_PREFIX } from './startup-prompt-selection.js';

const CANARY_PROFILE = 'canary';

// FR-4: the PREFIX is shared; assessCanarySlotNaming below is deliberately NOT folded into the
// shared classifier. It answers a different question — "is this canary SLOT named correctly",
// where the slot is already known to be a canary — so a name like "Charlie" is a misconfiguration
// to it and a valid kind:'worker' to the classifier. Merging them would conflate the two and drop
// its reason codes. Share the prefix, not the predicate.

/**
 * Pick the enabled canary slot from the desired-slots manifest. Pure.
 * Returns null when the manifest has no canary slot (S3 seeding genuinely incomplete) -- distinct
 * from "slot seeded but no session", which is the case this whole module exists for.
 * @param {Array<object>} slots  normalized desired slots
 */
export function selectCanarySlot(slots = []) {
  const list = Array.isArray(slots) ? slots : [];
  return list.find((s) => s && s.account_profile === CANARY_PROFILE && s.name) || null;
}

/**
 * SD-LEO-INFRA-LAUNCHER-CAN-HOST-001: does the selected slot's name actually satisfy the TARGETABILITY
 * guard? Pure.
 *
 * WHY THIS EXISTS. The slot name becomes the canary's callsign, and assertCanaryTarget is a two-conjunct
 * guard requiring account_profile==='canary' AND a 'Canary-' callsign. selectCanarySlot enforces only the
 * profile, NOT the namespace -- so a slot legitimately marked account_profile=canary but named e.g.
 * "Bravo" would provision a canary that is discoverable and permanently UNTARGETABLE, with nothing in the
 * pipeline saying why. Today's data happens to be right (the single enabled slot is "Canary-pilot"), which
 * is exactly the condition under which this silently rots.
 *
 * Returns a reason rather than throwing: provisioning should still run and report, not fail-closed on a
 * naming problem an operator can see and fix.
 */
export function assessCanarySlotNaming(slot) {
  const name = slot && slot.name;
  if (typeof name !== 'string' || !name) return { ok: false, reason: 'no_slot_name' };
  if (!name.startsWith(CANARY_CALLSIGN_PREFIX)) {
    return { ok: false, reason: 'slot_name_outside_canary_namespace', name };
  }
  return { ok: true, name };
}

/**
 * THE gate predicate: is a canary actually PROVISIONED -- i.e. is it TARGETABLE by the drill? Pure.
 * Deliberately reads only the resolution -- never a slot row -- so slot-existence can never be
 * mistaken for drill-readiness.
 *
 * QF-20260725-529 -- GATE-PREDICATE SCHISM. This used to be Boolean(resolution.resolved === true):
 * ONE conjunct, satisfied by account_profile alone. assertCanaryTarget (canary-guard.js) requires
 * TWO -- account_profile === 'canary' AND a Canary- prefixed callsign. The provisioner's readiness
 * test was therefore WEAKER than the guard it provisions FOR, which is fail-OPEN relative to that
 * guard, not the fail-closed this comment used to claim. A half-provisioned canary (profile set,
 * callsign absent) permanently satisfied the weak predicate, so provisionCanary short-circuited at
 * `already_live` and never minted the callsign -- the provisioner refusing to act because of the
 * very defect it exists to fix, while all three target-scoped CP3 legs stayed un-runnable.
 *
 * This is the follow-on SD-LEO-INFRA-LAUNCHER-CAN-HOST-001 explicitly deferred: that commit minted
 * the callsign at SPAWN time (the guard's second conjunct) but recorded as a KNOWN LIMITATION that
 * isProvisioned still read discoverability only, so an already-live half-provisioned canary never
 * reached the new mint. Both halves are needed: theirs makes a fresh spawn targetable, this one makes
 * the provisioner willing to spawn.
 *
 * We now DELEGATE to the guard rather than re-derive a parallel predicate: readiness is by
 * construction whatever the guard will actually accept, so the two can never drift apart again.
 * Note the direction -- provisioning is tightened UP to the guard; the guard is never relaxed DOWN,
 * which would let CP3 target any profile-stamped session.
 * @param {{resolved?:boolean, identity?:object}} resolution  a resolveCanaryTarget result
 */
export function isProvisioned(resolution) {
  // SEQUENCING NOTE (SD-LEO-INFRA-LAUNCHER-CAN-HOST-001), added alongside QF-20260725-529's fix
  // because the ORDER this landed in is load-bearing and invisible from the code alone:
  //
  // This two-conjunct gate is only safe BECAUSE spawn() already mints the 'Canary-' callsign. With a
  // gate demanding both conjuncts and a spawn that stamps only account_profile, every provisioning run
  // would spawn a fresh canary that STILL failed the gate — an unbounded spawn loop, windows piling up,
  // no convergence. Taken in the other order this predicate is a foot-gun rather than a fix.
  //
  // So: do not port this predicate to a tree whose spawn path does not mint the callsign. The residual
  // re-spawn risk here is bounded by spawn()'s own dedup-by-callsign — once a canary carries
  // 'Canary-pilot', a second provisioning finds it live and skips.
  return assertCanaryTarget(resolution).ok === true;
}

/**
 * Provision the canary for the seeded slot and WAIT until it registers a live, resolvable session.
 *
 * Order is deliberate: check first (idempotent -- an already-live canary is a no-op, never a second
 * spawn), then spawn, then poll the GATE. Every seam is injectable so this is testable without
 * touching a real fleet.
 *
 * @param {object}   args
 * @param {object}   args.supabase
 * @param {boolean}  [args.live=false]      false => dry-run; a live spawn requires an explicit true
 * @param {number}   [args.maxAttempts=10]  registration polls after spawning
 * @param {number}   [args.delayMs=3000]    delay between polls
 * @param {Function} [args.loadSlotsFn]     defaults to loadDesiredSlots
 * @param {Function} [args.resolveFn]       defaults to resolveCanaryTarget
 * @param {Function} [args.spawnFn]         defaults to spawn-control spawn()
 * @param {Function} [args.sleepFn]         defaults to real setTimeout
 * @param {Function} [args.logFn]
 * @returns {Promise<{ok:boolean, reason:string, slot?:object, alreadyLive?:boolean, attempts?:number, spawn?:object}>}
 */
export async function provisionCanary({
  supabase,
  live = false,
  maxAttempts = 10,
  delayMs = 3000,
  loadSlotsFn = loadDesiredSlots,
  resolveFn = resolveCanaryTarget,
  spawnFn = spawnControlSpawn,
  sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)),
  logFn = () => {},
} = {}) {
  const byProfile = { by: 'account_profile', value: CANARY_PROFILE };

  // Idempotence: an already-resolvable canary needs no spawn.
  const pre = await resolveFn(supabase, byProfile);
  if (isProvisioned(pre)) {
    logFn('[canary-provision] canary already live — no spawn needed');
    return { ok: true, reason: 'already_live', alreadyLive: true, attempts: 0 };
  }

  const slot = selectCanarySlot(await loadSlotsFn(supabase));
  if (!slot) {
    // Genuinely unseeded — a provisioning step cannot invent a slot; S3 seeding must run first.
    return { ok: false, reason: 'no_canary_slot_seeded' };
  }

  // Surface a naming problem BEFORE spawning: the slot name becomes the callsign, and a name outside
  // the canary namespace yields a canary that is discoverable but permanently untargetable.
  const naming = assessCanarySlotNaming(slot);
  if (!naming.ok) {
    logFn(`[canary-provision] WARNING slot name ${JSON.stringify(slot.name)} is outside the 'Canary-' namespace `
      + `(${naming.reason}) — the spawned session will be DISCOVERABLE but NOT targetable by assertCanaryTarget`);
  }

  const spawnResult = await spawnFn(
    { role: slot.role || 'worker', callsign: slot.name, accountProfile: CANARY_PROFILE },
    { supabaseClient: supabase, live, log: logFn },
  );

  if (!live) {
    // Dry-run reports the PLAN and makes the un-met gate explicit; it never claims readiness.
    logFn(`[canary-provision] DRY-RUN would spawn canary ${slot.name}; gate still unmet`);
    return { ok: false, reason: 'dry_run', slot, spawn: spawnResult, attempts: 0 };
  }

  // Poll the GATE (session resolvable), not the spawn's own return -- a spawned process that never
  // registers is exactly the failure mode this step exists to catch.
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await sleepFn(delayMs);
    const resolution = await resolveFn(supabase, byProfile);
    if (isProvisioned(resolution)) {
      logFn(`[canary-provision] canary registered after ${attempt} attempt(s)`);
      return { ok: true, reason: 'provisioned', slot, spawn: spawnResult, attempts: attempt };
    }
  }

  return { ok: false, reason: 'registration_timeout', slot, spawn: spawnResult, attempts: maxAttempts };
}
