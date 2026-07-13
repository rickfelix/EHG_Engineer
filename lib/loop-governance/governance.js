/**
 * Loop-governance: registration enforcement + two-tier regress escape.
 * (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001, FR-4 / FR-6 / FR-7)
 *
 * - FR-4: closure-predicate REQUIRED-AT-REGISTRATION. A loop cannot enroll without a
 *   machine-checkable closure probe; this composes the shared closure-engine validator
 *   (no duplicated logic) and is callable from the D8 operator-contract seam.
 * - FR-6: D4 verifier-alive watch (fast tier) — is the closure-verifier dark?
 * - FR-7: monthly chairman loop-health digest (slow tier, govern-by-exception).
 */
import { validateClosurePredicate, distanceToRung, LOOP_STATUS } from './closure-engine.js';
import { registerArmedMachinery, armedProcessKey } from '../machinery-class/armed-registration.js';
import { VERIFIER_PROCESS_KEY } from './verifier.js';

export const DIGEST_LOGICAL_KEY = 'loop-health-monthly-digest';
export const DIGEST_PROCESS_KEY = armedProcessKey(DIGEST_LOGICAL_KEY);
const MONTHLY_SECONDS = 30 * 86400;

/**
 * FR-4 — closure-predicate required-at-registration. Returns a gate-style verdict so
 * the D8 operator-contract seam can BLOCK a loop-registering SD that lacks a probe.
 *
 * @param {Object} loopRegistration - the loop the SD is registering (predicate_type, closure_predicate)
 * @returns {{ok: boolean, reason: string, missing: string[]}}
 */
export function assertLoopRegistrationHasPredicate(loopRegistration) {
  const v = validateClosurePredicate(loopRegistration || {});
  if (v.valid) return { ok: true, reason: 'LOOP_CLOSURE_PREDICATE_PRESENT', missing: [] };
  return {
    ok: false,
    reason: `LOOP_CLOSURE_PREDICATE_MISSING — ${v.reasons.join('; ')}`,
    missing: v.reasons,
  };
}

/**
 * FR-6 — D4 verifier-alive watch. Given the verifier's periodic_process_registry row,
 * decide alive vs dark by witness (last_fired_at) staleness against its expected
 * interval (× a tolerance multiplier).
 *
 * @param {Object|null} registryRow - the g3-armed-loop-closure-verifier row (or null if unregistered)
 * @param {Date} [now]
 * @param {number} [toleranceMult=2] - allow up to N intervals of lateness before "dark"
 * @returns {{alive: boolean, dark: boolean, reason: string, process_key: string}}
 */
export function verifierHealth(registryRow, now = new Date(), toleranceMult = 2) {
  if (!registryRow) {
    return { alive: false, dark: true, reason: 'verifier not registered in periodic_process_registry', process_key: VERIFIER_PROCESS_KEY };
  }
  const interval = Number(registryRow.expected_interval_seconds);
  const lastFired = registryRow.last_fired_at ? Date.parse(registryRow.last_fired_at) : null;
  if (lastFired == null) {
    // ARMED but never fired — not yet dark (it is waiting for its first run), unless
    // it has been armed far longer than its interval with no fire.
    return { alive: true, dark: false, reason: 'verifier ARMED, awaiting first run', process_key: VERIFIER_PROCESS_KEY };
  }
  const staleMs = now.getTime() - lastFired;
  const budgetMs = (Number.isFinite(interval) && interval > 0 ? interval : MONTHLY_SECONDS) * 1000 * toleranceMult;
  if (staleMs > budgetMs) {
    return { alive: false, dark: true, reason: `verifier DARK — last fired ${registryRow.last_fired_at} (> ${toleranceMult}× interval)`, process_key: VERIFIER_PROCESS_KEY };
  }
  return { alive: true, dark: false, reason: `verifier alive — last fired ${registryRow.last_fired_at}`, process_key: VERIFIER_PROCESS_KEY };
}

/**
 * FR-7 — monthly chairman loop-health digest. Summarizes closure health + distance-to-V1
 * and, given the previous snapshot, the DRIFT (loops that flipped closed→open). Govern-by-
 * exception: exceptions (newly-open + still-open + drift) are highlighted.
 *
 * @param {Array<{loop_key, status, vision_ladder_rung_id}>} loops - current loop_registry rows
 * @param {Object} [opts]
 * @param {string|null} [opts.v1RungId] - the V1 rung id to compute distance-to-V1
 * @param {Array<{loop_key, status}>} [opts.previous] - previous snapshot for drift
 * @returns {{summary: Object, distanceToV1: Object|null, drift: string[], exceptions: string[]}}
 */
export function buildLoopHealthDigest(loops = [], opts = {}) {
  const summary = distanceToRung(loops); // total/closed/open/starved/unknown/distance across all loops
  const v1Loops = opts.v1RungId ? loops.filter((l) => l.vision_ladder_rung_id === opts.v1RungId) : [];
  const distanceToV1 = opts.v1RungId ? distanceToRung(v1Loops) : null;

  // DRIFT: loops that were closed last snapshot but are now open/starved.
  const drift = [];
  if (Array.isArray(opts.previous)) {
    const prev = new Map(opts.previous.map((p) => [p.loop_key, p.status]));
    for (const l of loops) {
      if (prev.get(l.loop_key) === LOOP_STATUS.CLOSED && (l.status === LOOP_STATUS.OPEN || l.status === LOOP_STATUS.STARVED)) {
        drift.push(l.loop_key);
      }
    }
  }

  const exceptions = loops
    .filter((l) => l.status === LOOP_STATUS.OPEN || l.status === LOOP_STATUS.STARVED)
    .map((l) => `${l.loop_key}:${l.status}`);

  return { summary, distanceToV1, drift, exceptions };
}

/** FR-7 — arm the monthly digest cadence (Operator-Contract witness). */
export async function registerDigestCadence(supabase) {
  return registerArmedMachinery(
    supabase,
    { sd_key: DIGEST_LOGICAL_KEY },
    { activationTrigger: 'monthly_chairman_loop_health_digest', owner: 'loop-governance', expectedIntervalSeconds: MONTHLY_SECONDS },
  );
}
