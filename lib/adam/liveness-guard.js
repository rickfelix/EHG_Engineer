/**
 * Liveness guard — suppress class-B (cross-venture) advisories when the live
 * venture corpus is too thin to generalize. SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001.
 *
 * Today only 2 ventures are active+non-demo; the other ~7 venture-kind apps are
 * synthetic. A cross-venture pattern claim drawn from fewer than K=3 distinct
 * live ventures is statistically meaningless, so it is suppressed. The harness
 * and platform scopes are NEVER gated by this guard (they have their own
 * O-GOV anchors).
 */
export const MIN_LIVE_VENTURES_FOR_CROSS_VENTURE = 3; // K

/**
 * @param {number} distinctLiveVentures - active non-demo ventures evaluated in window
 * @returns {{ allowed: boolean, threshold: number, observed: number, reason: string }}
 */
export function crossVentureAdvisoryAllowed(distinctLiveVentures) {
  const n = Number.isFinite(distinctLiveVentures) ? distinctLiveVentures : 0;
  const allowed = n >= MIN_LIVE_VENTURES_FOR_CROSS_VENTURE;
  return {
    allowed,
    threshold: MIN_LIVE_VENTURES_FOR_CROSS_VENTURE,
    observed: n,
    reason: allowed
      ? `live venture corpus n=${n} >= K=${MIN_LIVE_VENTURES_FOR_CROSS_VENTURE}`
      : `live venture corpus n=${n} < K=${MIN_LIVE_VENTURES_FOR_CROSS_VENTURE} — cross-venture advisory suppressed`,
  };
}

/**
 * Filter a candidate list, dropping class-B (cross_venture=true) candidates when
 * the guard is closed. Single-scope (class-A) candidates always pass.
 * @param {Array} candidates
 * @param {number} distinctLiveVentures
 * @returns {{ kept: Array, dropped: Array, guard: object }}
 */
export function applyLivenessGuard(candidates, distinctLiveVentures) {
  const guard = crossVentureAdvisoryAllowed(distinctLiveVentures);
  const kept = [];
  const dropped = [];
  for (const c of candidates || []) {
    if (c && c.cross_venture && !guard.allowed) dropped.push(c);
    else kept.push(c);
  }
  return { kept, dropped, guard };
}
