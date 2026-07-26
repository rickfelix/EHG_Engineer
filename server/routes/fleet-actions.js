/**
 * Fleet action-button routes — SD-LEO-INFRA-LEO-LAUNCHER-SHELL-001-C
 *
 * Surfaces the 4 real design buttons from the ratified mockup-1 image (docs/design/
 * mockup-1-fleet-launcher.png): "Respawn fleet from manifest", "Relaunch session under other
 * account", "Add session", "Snapshot manifest". These call the existing spawn-control.js verbs
 * (many-to-one, not a 1:1 six-verb-as-six-button mapping) plus one genuinely new capability
 * (snapshot). stop/drainAndRestart are explicitly OUT of this MVP -- the ratified image shows no
 * per-row context menu or secondary-action affordance for them.
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { spawn, relaunchUnderProfile, isLiveEnabled } from '../../lib/fleet/spawn-control.js';
import { loadDesiredSlots } from '../../lib/fleet/desired-slots-store.js';
import { computeLiveSlotDrift, loadLiveSessionIdentity } from '../../lib/fleet/session-registry-adapter.js';
import {
  SPAWNABLE_ROLES,
  isSpawnableRole,
  resolveRoleSpawnOpts,
  assertRoleCallsignCompatible,
} from '../../lib/fleet/role-startup-prompt.js';
import fleetIdentityPool from '../../scripts/assign-fleet-identities.cjs';

// QF-20260726-607: reuse the coordinator cron's pool + picker rather than inventing a second
// naming path. assign-fleet-identities.cjs:119-122 states outright that nextAvailable was hoisted
// and exported so every writer allocates IDENTICALLY -- if two writers diverge,
// dedupeAssignedCallsigns' string equality breaks and duplicate identities stop reconciling.
const { NATO, nextAvailable } = fleetIdentityPool;

const router = Router();

// Resolve a service-role Supabase client. Prefers an injected client
// (req.app.locals.supabase) so route tests can supply a mock; falls back to a
// fresh service-role client for the running server. Mirrors server/routes/ventures.js
// and server/routes/fleet-panel.js.
function resolveServiceClient(req) {
  return (
    req?.app?.locals?.supabase ||
    createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
  );
}

/**
 * POST /api/fleet-actions/respawn-fleet — "Respawn fleet from manifest".
 * Compares fleet_desired_slots against live sessions (computeLiveSlotDrift) and spawns only the
 * missing/stale slots. Reuses spawn()'s own dedup-by-callsign check -- never a second, competing
 * comparison layer.
 */
export async function respawnFleet(req, res) {
  const supabase = resolveServiceClient(req);
  const desiredSlots = await loadDesiredSlots(supabase);
  const drift = await computeLiveSlotDrift(supabase, { desiredSlots });

  const results = [];
  for (const missingSlot of drift.missing) {
    const desired = desiredSlots.find((d) => d.name === missingSlot.name) || {};
    const result = await spawn(
      { role: desired.role, callsign: missingSlot.name, accountProfile: desired.account_profile },
      { supabaseClient: supabase },
    );
    results.push({ name: missingSlot.name, ...result });
  }

  res.json({ live: isLiveEnabled(), respawned: results, unchanged: drift.present.length });
}

/**
 * POST /api/fleet-actions/relaunch-under-profile — "Relaunch session under other account".
 * Maps 1:1 to spawn-control.js's relaunchUnderProfile().
 */
export async function relaunchSessionUnderProfile(req, res) {
  const supabase = resolveServiceClient(req);
  const { target, accountProfile, newSessionId } = req.body || {};
  if (!target || !accountProfile) {
    res.status(400).json({ ok: false, reason: 'target and accountProfile are required' });
    return;
  }
  const result = await relaunchUnderProfile(target, accountProfile, { supabaseClient: supabase, newSessionId });
  res.json({ live: isLiveEnabled(), ...result });
}

/**
 * QF-20260726-607: mint a PROVISIONAL callsign for a spawn the operator did not name.
 *
 * Provisional, not authoritative. worker-checkin.cjs (assignFleetIdentityAtCheckin) already mints
 * the real identity at first check-in via pickCallsignForTier + SET_IDENTITY, and callsignInTierBand
 * RE-DERIVES a callsign sitting in the wrong tier band -- so a bootstrap name self-heals rather than
 * sticking as a wrong-tier identity. This exists solely to break a chicken-and-egg: a session with
 * no callsign gets prompt:null from startup-prompt-selection (the 'unidentifiable' arm, "an
 * unidentified session must not claim work"), so it never runs /checkin, so it never reaches the
 * self-assign that would have named it. spawn-control.js:186-188 documents the result in its own
 * words -- such sessions "came up with nothing to do, heartbeat once, and ghosted".
 *
 * Allocates against the SAME live-callsign set spawn() dedups on (spawn-control.js:197-199), so a
 * minted name can never come back as skipped:already_live -- which would make the button a silent
 * no-op.
 */
export async function mintCallsign(supabase) {
  const { callsignBySession } = await loadLiveSessionIdentity(supabase);
  const used = new Set(Object.values(callsignBySession || {}).filter(Boolean));
  return nextAvailable(NATO, used);
}

/**
 * POST /api/fleet-actions/add-session — "Add session".
 * Maps 1:1 to spawn-control.js's spawn() for a single ad-hoc (non-manifest) session.
 *
 * QF-20260726-607 (chairman): callsign is no longer an operator input. Callsigns are ASSIGNED, not
 * chosen -- a hand-typed one either collides with a live worker or is silently replaced at first
 * check-in, and the operator watching the name he typed disappear reasonably concludes the spawn
 * failed. An explicitly supplied callsign is still honoured for the manifest/canary callers that
 * legitimately name their slots; only the requirement is dropped.
 */
export async function addSession(req, res) {
  const supabase = resolveServiceClient(req);
  const { role, callsign, accountProfile } = req.body || {};
  if (!role) {
    res.status(400).json({ ok: false, reason: 'role is required' });
    return;
  }
  // SD-LEO-FEAT-FLEET-COLD-START-UX-001 FR-2: role was previously validated for TRUTHINESS ONLY,
  // so any non-empty string was accepted and none was honoured. Now that roles carry startup
  // prompts (FR-1) an unrecognised role must be refused with a stated reason rather than silently
  // becoming a worker. respawnFleet is deliberately NOT allowlisted — its roles come from
  // fleet_desired_slots, not from an operator.
  if (!isSpawnableRole(role)) {
    res.status(400).json({ ok: false, reason: `role must be one of ${SPAWNABLE_ROLES.join(', ')}` });
    return;
  }

  // QF-20260726-607 x COLD-START-UX-001 FR-2 — the mint is ROLE-AWARE, and deliberately so.
  //
  // A NATO name is right for a worker and WRONG for everything else: the singleton roles already
  // run under callsign === their role name ('coordinator', 'solomon', 'adam'), which is what
  // fleet-panel reports for the live rows today. Minting 'Charlie' for a coordinator would invent a
  // second naming convention for a seat that already has one.
  //
  // Both branches must still produce an IDENTIFIABLE callsign, because assertRoleCallsignCompatible
  // below refuses a callsign-less privileged role through its 'unidentifiable' arm — that refusal is
  // a security guard (it is what stops an unnamespaced session receiving '/coordinator start'), so
  // the mint must satisfy it rather than route around it. Verified: classifySessionByCallsign
  // returns an identifiable kind for every role name, so neither branch weakens the guard.
  //
  // A second coordinator therefore comes back from spawn()'s dedup as skipped:already_live, which is
  // the honest answer for a singleton and is already rendered by describeSpawn.
  const supplied = typeof callsign === 'string' ? callsign.trim() : '';
  const resolvedCallsign = supplied || (role === 'worker' ? await mintCallsign(supabase) : role);

  // Compatibility is checked on the RESOLVED callsign, not the request's — a minted name must face
  // the same guard a typed one does.
  const compatible = assertRoleCallsignCompatible(role, resolvedCallsign);
  if (!compatible.ok) {
    res.status(400).json({ ok: false, reason: compatible.reason });
    return;
  }
  // FR-1: spread CONDITIONALLY. resolveRoleSpawnOpts returns {} for 'worker' so the key is ABSENT,
  // which is what makes spawn() fall through to callsign-namespace selection. Passing
  // `startupPrompt: undefined` would make the key present and suppress the pointer entirely.
  const result = await spawn(
    { role, callsign: resolvedCallsign, accountProfile },
    { supabaseClient: supabase, ...resolveRoleSpawnOpts(role) },
  );
  // callsign LAST and authoritative: the UI must report the name that was actually spawned, not the
  // (now absent) one the operator typed.
  res.json({ live: isLiveEnabled(), ...result, callsign: resolvedCallsign, callsign_minted: !supplied });
}

/**
 * GET /api/fleet-actions/snapshot-manifest — "Snapshot manifest".
 * NEW read-only capability (confirmed via repo-wide grep at PLAN phase: no existing function does
 * this): a timestamped export combining the desired manifest and live-session drift state. Never
 * mutates fleet_desired_slots or claude_sessions. Degrades to an empty snapshot (never a crash) if
 * fleet_desired_slots is unapplied -- matches desired-slots-store.js's own fail-soft contract.
 */
export async function snapshotManifest(req, res) {
  const supabase = resolveServiceClient(req);
  let desiredSlots = [];
  let drift = { drift: false, missing: [], present: [], unexpected: [] };
  try {
    desiredSlots = await loadDesiredSlots(supabase);
    drift = await computeLiveSlotDrift(supabase, { desiredSlots });
  } catch {
    // fail-soft: matches loadDesiredSlots' own contract for a missing/unapplied table
  }
  res.json({ snapshot_at: new Date().toISOString(), desiredSlots, drift });
}

router.post('/respawn-fleet', respawnFleet);
router.post('/relaunch-under-profile', relaunchSessionUnderProfile);
router.post('/add-session', addSession);
router.get('/snapshot-manifest', snapshotManifest);

export default router;
