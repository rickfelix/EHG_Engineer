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
import { computeLiveSlotDrift } from '../../lib/fleet/session-registry-adapter.js';

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
 * POST /api/fleet-actions/add-session — "Add session".
 * Maps 1:1 to spawn-control.js's spawn() for a single ad-hoc (non-manifest) session.
 */
export async function addSession(req, res) {
  const supabase = resolveServiceClient(req);
  const { role, callsign, accountProfile } = req.body || {};
  if (!role || !callsign) {
    res.status(400).json({ ok: false, reason: 'role and callsign are required' });
    return;
  }
  const result = await spawn({ role, callsign, accountProfile }, { supabaseClient: supabase });
  res.json({ live: isLiveEnabled(), ...result });
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
