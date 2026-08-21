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
// SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — the SAME decision the panel renders.
import { decideSingletonSpawn, isSingletonRole } from '../../lib/fleet/singleton-spawn-decision.mjs';

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
    try {
      const result = await spawn(
        { role: desired.role, callsign: missingSlot.name, accountProfile: desired.account_profile },
        { supabaseClient: supabase },
      );
      results.push({ name: missingSlot.name, ...result });
    } catch (err) {
      // SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-4: spawn()'s guards THROW refusals whose
      // messages carry the remedy (tree-currency names `git pull --ff-only`). Unhandled, the
      // throw escaped to the EVA error handler, which flattens it to a bare 422 with no reason.
      //
      // Caught PER ITERATION rather than around the whole loop, deliberately: a single stale or
      // dirty slot used to abort the entire respawn and discard every other slot's result, so one
      // refusable slot silently cost the operator the whole batch. Now each slot reports its own
      // outcome and the sweep completes. Same {ok:false, reason} shape the sessions page already
      // renders verbatim (QF-20260731-222, PR #6669) — no new client contract.
      results.push({ name: missingSlot.name, ok: false, reason: (err && err.message) || String(err) });
    }
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
  let result;
  try {
    result = await relaunchUnderProfile(target, accountProfile, { supabaseClient: supabase, newSessionId });
  } catch (err) {
    // SD-FDBK-INFRA-SPAWN-SOURCE-CURRENCY-001 FR-4: mirrors the addSession handler shipped in
    // QF-20260731-222 (PR #6669). relaunch crosses the same tree-currency guard as spawn, so an
    // unhandled refusal reached the EVA error handler and surfaced as a bare 422 — the operator
    // saw a status code instead of the remedy the guard had already written for them.
    res.status(422).json({ ok: false, reason: (err && err.message) || String(err) });
    return;
  }
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
/**
 * Holder identity for the singleton-spawn STALENESS CHECK. Injectable purely so the verdict logic
 * is testable without standing up three CJS identity modules.
 *
 * SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001 / FR-1, DECIDED SCOPE (round-2 adversarial critique):
 * adam/solomon use an UNFILTERED lookup (fetchAllAdamsStrict/fetchAllSolomonsStrict) plus the SAME
 * pure canonical picker registration itself uses (pickCanonicalAdam/pickCanonicalSolomon) — NOT
 * getActiveAdamId/getActiveSolomonId. Those two pre-filter to heartbeat_at >= now-600s
 * (ADAM_FRESH_MS/SOLOMON_FRESH_MS), so a genuinely stale-but-present (600–3600s) holder never
 * reaches decideSingletonSpawn at all — it always resolves as "no holder", leaving the amber
 * "Replace the stale X" verdict (singleton-spawn-decision.mjs's holder-past-guard-window branch)
 * unreachable dead code via this route.
 *
 * ROUTE-LOCAL ONLY: getActiveAdamId/getActiveSolomonId themselves, and every OTHER caller of them,
 * are completely unchanged — this route builds its own holder lookup from the same underlying
 * fetch + pick primitives registration already exports, rather than widening the shared resolver's
 * semantics for every caller (a regression test in addsession-singleton-refusal.test.js proves
 * getActiveAdamId's fresh-only behavior is unaffected).
 */
export async function defaultResolveHolderId(supabase, role) {
  if (role === 'adam') {
    const { fetchAllAdamsStrict, pickCanonicalAdam } = await import('../../lib/coordinator/adam-identity.cjs');
    const { rows, error } = await fetchAllAdamsStrict(supabase);
    if (error) return null; // fail-open: an unresolvable holder must not manufacture a refusal
    const winner = pickCanonicalAdam(rows || []);
    return winner ? winner.session_id : null;
  }
  if (role === 'solomon') {
    const { fetchAllSolomonsStrict, pickCanonicalSolomon } = await import('../../lib/coordinator/solomon-identity.cjs');
    const { rows, error } = await fetchAllSolomonsStrict(supabase);
    if (error) return null;
    const winner = pickCanonicalSolomon(rows || []);
    return winner ? winner.session_id : null;
  }
  // coordinator: resolved for LABELLING only — it is never refused.
  const { getActiveCoordinatorId } = await import('../../lib/coordinator/resolve.cjs');
  return getActiveCoordinatorId(supabase);
}

/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4.
 * Resolve the live holder of a singleton role and decide whether a spawn may proceed.
 * Exported for tests. NEVER throws: an unresolvable holder must not manufacture a refusal —
 * spawn()'s own dedup remains the backstop and answers honestly.
 */
export async function resolveSingletonSpawnVerdict(supabase, role, deps = {}) {
  const { decide = decideSingletonSpawn, resolveHolderId = defaultResolveHolderId } = deps;
  try {
    if (!isSingletonRole(role)) return decide({ role, holder: null });

    const holderId = await resolveHolderId(supabase, role);
    if (!holderId) return decide({ role, holder: null });

    // Freshness is computed against the GUARD's window, not the panel's (see the call site).
    const { data: row } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, metadata')
      .eq('session_id', holderId)
      .maybeSingle();
    if (!row) return decide({ role, holder: null });

    const hb = row.heartbeat_at ? Date.parse(row.heartbeat_at) : NaN;
    return decide({
      role,
      holder: {
        session_id: row.session_id,
        identity_kind: (row.metadata && row.metadata.role) || role,
        heartbeat_age_ms: Number.isFinite(hb) ? Date.now() - hb : Infinity,
      },
    });
  } catch {
    // Fail-open: never invent a refusal from a resolver failure.
    return decideSingletonSpawn({ role, holder: null });
  }
}

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

  // SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-4 — SINGLETON REFUSAL AT THE ROUTE.
  //
  // SERVER FIRST, deliberately. A UI-only gate is the failure this SD records as having already
  // happened on this page (`role` written as FLEET_WORKER_ROLE with zero readers: the UI reported
  // success while the session came up on the worker path). The panel calls the SAME
  // decideSingletonSpawn and only renders what this route would answer.
  //
  // Holder IDENTITY comes from the canonical resolvers registration itself uses, so the route and
  // registration can never disagree about WHO holds the role. Only the freshness arithmetic is
  // local, and that is the point: it uses the GUARD's 600s window, not the panel's 3600s. Gating
  // on the panel's would block for up to fifty minutes during which the spawn would have SUCCEEDED.
  //
  // Coordinator is never refused — silent takeover is designed, and refusing it breaks succession.
  // Fail-open: if the holder cannot be resolved we do NOT invent a refusal; spawn()'s own dedup
  // still answers honestly with skipped:already_live.
  // FR-1 (SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001): uiLabel/uiEnabled/holderIsFresh are forwarded
  // on BOTH outcomes below — decideSingletonSpawn already computes a distinct uiLabel for every
  // path (including the amber "Replace the stale X" case, allowed:true), and the panel renders
  // exactly this server-provided data rather than re-deciding anything client-side.
  const singletonVerdict = await resolveSingletonSpawnVerdict(supabase, role);
  if (!singletonVerdict.allowed) {
    res.status(singletonVerdict.httpStatus).json({
      ok: false,
      reason: singletonVerdict.reason,
      uiLabel: singletonVerdict.uiLabel,
      uiEnabled: singletonVerdict.uiEnabled,
      holderIsFresh: singletonVerdict.holderIsFresh,
    });
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
  let result;
  try {
    result = await spawn(
      { role, callsign: resolvedCallsign, accountProfile },
      { supabaseClient: supabase, ...resolveRoleSpawnOpts(role) },
    );
  } catch (err) {
    // Quick-fix QF-20260731-222: spawn()'s guards throw refusals whose messages carry the remedy
    // (tree-currency names `git pull --ff-only`; the launch contract names its violations). Letting
    // them fall through to the EVA error handler flattens them to a bare 422 with no reason field,
    // while the sessions page already renders {ok:false, reason} verbatim — so answer in that shape
    // and the operator sees the refusal instead of a status code.
    res.status(422).json({ ok: false, reason: (err && err.message) || String(err) });
    return;
  }
  // callsign LAST and authoritative: the UI must report the name that was actually spawned, not the
  // (now absent) one the operator typed. uiLabel/uiEnabled/holderIsFresh (FR-1) ride along on the
  // success path too — the amber "Replace the stale X" case is allowed:true, so the label the
  // operator saw before clicking must still be confirmable in the response.
  res.json({
    live: isLiveEnabled(),
    ...result,
    callsign: resolvedCallsign,
    callsign_minted: !supplied,
    uiLabel: singletonVerdict.uiLabel,
    uiEnabled: singletonVerdict.uiEnabled,
    holderIsFresh: singletonVerdict.holderIsFresh,
  });
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
