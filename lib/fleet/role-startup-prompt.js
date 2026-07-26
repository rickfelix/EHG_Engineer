/**
 * Role -> startup prompt for operator-initiated spawns.
 * SD-LEO-FEAT-FLEET-COLD-START-UX-001, FR-1 and FR-2.
 *
 * WHY THIS EXISTS: before this, `role` was INERT. It was written once
 * (build-session-launch.cjs FLEET_WORKER_ROLE) with zero readers, and addSession forwarded no
 * startup prompt at all — so spawn() always fell through to callsign-namespace selection and
 * handed EVERY operator-started session the worker directive. Clicking "start the coordinator"
 * produced a second headless worker while the UI reported success.
 *
 * *** THIS MODULE IS CONSUMED AT THE ROUTE (server/routes/fleet-actions.js addSession), NEVER
 * INSIDE spawn(). *** That placement is load-bearing, not stylistic. Moving it into spawn() would
 * silently change three untouched consumers that pass a role today:
 *   - spawnReplacement (spawn-control.js) behind restart()/relaunchUnderProfile(), where the role
 *     comes from the EXISTING session — restarting a coordinator would start re-delivering
 *     '/coordinator start' to it,
 *   - canary-provision.js, which spawns with role 'worker' and a Canary- callsign and relies on
 *     namespace selection resolving to NO prompt,
 *   - respawnFleet, whose roles come from fleet_desired_slots and are deliberately un-allowlisted.
 */

import { classifySessionByCallsign, couldBeCanaryCallsign } from './startup-prompt-selection.js';

/** The roles an operator may spawn from the Sessions page. */
export const SPAWNABLE_ROLES = Object.freeze(['coordinator', 'worker', 'solomon', 'adam']);

/**
 * CANARY IS ABSENT DELIBERATELY AND MUST STAY ABSENT.
 * It is an accountProfile, not a role — spawn takes {role, callsign, accountProfile} — and
 * canaries ARE role='worker'. Offering it here would send accountProfile undefined and produce a
 * session that later fails assertCanaryTarget with not_canary_profile, manufacturing exactly the
 * unexplained refusal this SD set out to remove.
 */
const ROLE_STARTUP_PROMPTS = Object.freeze({
  coordinator: '/coordinator start',
  solomon: '/solomon',
  adam: '/adam',
  // worker: DELIBERATELY ABSENT — see resolveRoleSpawnOpts.
});

export function isSpawnableRole(role) {
  return SPAWNABLE_ROLES.includes(role);
}

/**
 * The opts fragment to spread into spawn()'s second argument.
 *
 * *** RETURNS AN EMPTY OBJECT FOR 'worker', AND THAT IS THE ENTIRE POINT. ***
 * spawn-control.js reads `('startupPrompt' in opts) ? opts.startupPrompt : await
 * defaultStartupPrompt(callsign, log)` — it branches on KEY PRESENCE, not on value, with the
 * documented contract "absent => canonical prompt, explicit null => deliberately none".
 *
 * So returning `{ startupPrompt: undefined }` would be a live defect, not a harmless nicety: the
 * key would be PRESENT, defaultStartupPrompt would never run, no pointer positional would be
 * emitted, and every worker started from the page would come up with nothing to do and ghost —
 * re-introducing the exact bug the startupPrompt plumbing was added to fix.
 *
 * The worker arm must keep resolving through callsign namespace, because that is what protects
 * canaries: startup-prompt-selection.js's own header forbids role-keying for precisely this reason.
 */
export function resolveRoleSpawnOpts(role) {
  // Object.hasOwn, not a bare lookup — corrected after review. ROLE_STARTUP_PROMPTS is a plain
  // object literal, so Object.prototype is on its chain and resolveRoleSpawnOpts('toString') or
  // ('constructor') previously returned { startupPrompt: <Function> } with the key PRESENT: the
  // exact pointer-suppression defect this function exists to prevent, reachable by any future
  // caller that does not run the allowlist first. The route does run it, so this was latent rather
  // than live — but the exported function carries no allowlist of its own, and the test's stated
  // guarantee ("omits the key for an unknown role") was broader than the code delivered.
  const prompt = Object.hasOwn(ROLE_STARTUP_PROMPTS, role) ? ROLE_STARTUP_PROMPTS[role] : undefined;
  return prompt === undefined ? {} : { startupPrompt: prompt };
}

/**
 * Cross-check role against the callsign namespace.
 *
 * A HAZARD FR-1 CREATES, closed here. Once roles carry prompts, role='coordinator' with
 * callsign='Canary-pilot' is two individually-legal inputs that together deliver the coordinator
 * directive to a canary — which then runs /coordinator start, calls setActiveCoordinator, and
 * HIJACKS THE FLEET'S COORDINATOR POINTER. The structural backstop in build-session-launch.cjs
 * does not catch it: that throws only when the prompt is byte-equal to the worker directive.
 * Before this SD the combination was harmless because the canary namespace always resolved to a
 * null prompt.
 */
export function assertRoleCallsignCompatible(role, callsign) {
  if (role === 'worker') return { ok: true, reason: null };

  // CASE-INSENSITIVE, via the shared predicate — corrected after a SECURITY review measured the
  // bypass. This shipped delegating to classifySessionByCallsign, which matches 'Canary-' EXACTLY,
  // so 'canary-pilot' and 'CANARY-pilot' were ALLOWED to receive '/coordinator start'. That is the
  // could-this-be-a-canary question asked with the is-this-exactly-a-canary predicate, and the
  // module I delegated to documents that asymmetry in its own SEC-1 block. Worse, SEC-1's own
  // case-insensitive deny is STRUCTURALLY UNREACHABLE from this path: setting opts.startupPrompt
  // short-circuits defaultStartupPrompt, so resolveStartupPromptForCallsign never runs for a
  // non-worker role. This is the only guard, so it must ask the broad question.
  if (couldBeCanaryCallsign(callsign)) {
    return {
      ok: false,
      reason:
        `callsign "${callsign}" is in the canary namespace (matched case-insensitively), which may ` +
        `only be spawned with role "worker" — a canary started as "${role}" would receive that ` +
        `role's directive and, for coordinator, would take over the fleet coordinator pointer`,
    };
  }

  // UNIDENTIFIABLE refuses too. A non-string, empty or whitespace callsign classifies as
  // unidentifiable rather than canary, so branching on kind==='canary' alone let ["Canary-pilot"],
  // {} and "   " through for role=coordinator — the array form being a literal laundering of the
  // value blocked above. This mirrors resolveStartupPromptForCallsign's own unidentifiable arm:
  // an unidentified session must not receive a privileged directive.
  const { kind } = classifySessionByCallsign(callsign);
  if (kind === 'unidentifiable') {
    return {
      ok: false,
      reason:
        `callsign is not a usable identifier, so role "${role}" cannot be granted — an ` +
        'unidentified session must never receive a privileged startup directive',
    };
  }

  return { ok: true, reason: null };
}
