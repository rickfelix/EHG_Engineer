/**
 * Enforce-flip capability: a gated, currently-inert wrapper computing a REAL pass/fail from
 * sibling A's mergeWork() ladder, ONLY when explicitly enabled (SHIP_WITNESS_ENFORCE_MODE=enforce)
 * AND adoption readiness (lib/ship/witness-adoption.mjs computeAdoptionReadiness) independently
 * confirms it. Neither condition alone is sufficient — belt-and-suspenders, matching Ship-witness
 * B's own "registry promotion alone grants nothing" precedent. lib/ship/merge-witness-ladder.mjs
 * itself is untouched: its evaluateMergeWorkLadder() "observe-only" contract and existing
 * tests/callers are unaffected by this module's existence.
 *
 * Only P1 admission + P2 witness + P3 CI are required to pass — the same three-rung composition
 * Ship-witness B already established for venture PRs, applied here to the general lane. P4
 * (protection integrity) stays not_applicable pre-escapeAuth infra (not built by this SD); P5
 * (post-verify) is post-merge-only and inapplicable to a pre-merge gate decision.
 *
 * NOT wired into the real /ship Step 6 flow by this SD — that activation is deliberately deferred
 * to a future SD, once scripts/ship-witness-enforce-readiness.mjs reports ready=true for real.
 */

import { RUNG_STATUS } from './merge-witness-ladder.mjs';

/** Resolves the current enforce mode from the environment. 'enforce' only on an exact match. */
export function resolveEnforceMode(env = process.env) {
  return env.SHIP_WITNESS_ENFORCE_MODE === 'enforce' ? 'enforce' : 'observe';
}

/**
 * @param {{ verdict: {rungs: Array}, enforceMode?: string, readiness?: {ready: boolean} }} params
 * @returns {{ action: 'observe'|'allow'|'block', reason: string }}
 */
export function evaluateEnforcementDecision({ verdict, enforceMode = resolveEnforceMode(), readiness } = {}) {
  if (enforceMode !== 'enforce') {
    return { action: 'observe', reason: 'SHIP_WITNESS_ENFORCE_MODE is not "enforce" — observe-only (today\'s default)' };
  }
  if (!readiness?.ready) {
    return { action: 'observe', reason: 'adoption readiness not yet met — observe-only regardless of enforce mode' };
  }

  const byId = Object.fromEntries((verdict?.rungs || []).map((r) => [r.id, r.status]));
  const pass = byId.P1 === RUNG_STATUS.PASS && byId.P2 === RUNG_STATUS.PASS && byId.P3 === RUNG_STATUS.PASS;
  return pass
    ? { action: 'allow', reason: 'P1 admission + P2 witness + P3 CI all pass' }
    : { action: 'block', reason: `enforcement active and ready — P1/P2/P3 not all pass (P1=${byId.P1}, P2=${byId.P2}, P3=${byId.P3})` };
}
