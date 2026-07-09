/**
 * T1 source-REACHED probe/predicate — L1 runtime anti-stub dimension
 * (docs/design/value-authenticity-system-design.md §1-L1, criterion
 * VA-T1-source-reached, the PRIMARY hard catcher). SD-LEO-INFRA-VALUE-AUTHENTICITY-APA-001.
 *
 * Follows lib/apa/assertion-library.mjs's {id, category, probe, predicate}
 * pattern: probe/predicate LOGIC only, run against an INJECTED synthetic
 * evidence bundle — NOT a live sandbox. Live instrumentation (actually
 * observing a running APA Child A instance) is explicitly deferred to Child
 * A integration; this module defines the contract that live wiring will
 * eventually satisfy.
 *
 * Keys on the PRODUCT-LEVEL claim (the user-facing assertion, e.g. "WTP
 * derived from real market research"), never an in-code string — an
 * in-code string match is defeatable by renaming a variable while leaving
 * the underlying stub in place.
 *
 * @module lib/apa/value-authenticity-t1
 */

/**
 * Assert that a product-level claim's declared instrumented call site was
 * actually observed in the (injected) evidence bundle.
 * @param {object} opts
 * @param {string} opts.productLevelClaim - the user-facing claim this call site backs
 * @param {string} opts.instrumentedCallSite - the exact call site APA instruments
 * @param {{claimsPresented: string[], observedCallSites: string[]}} opts.evidenceBundle - injected synthetic evidence
 * @returns {{finding: boolean, reason: string}}
 */
export function checkSourceReached({ productLevelClaim, instrumentedCallSite, evidenceBundle }) {
  if (!evidenceBundle || !Array.isArray(evidenceBundle.claimsPresented) || !Array.isArray(evidenceBundle.observedCallSites)) {
    throw new Error('[value-authenticity-t1] checkSourceReached requires evidenceBundle.{claimsPresented, observedCallSites} arrays');
  }

  const claimPresented = evidenceBundle.claimsPresented.includes(productLevelClaim);
  const callSiteObserved = evidenceBundle.observedCallSites.includes(instrumentedCallSite);

  if (claimPresented && !callSiteObserved) {
    return {
      finding: true,
      reason: `T1 source-REACHED: product-level claim "${productLevelClaim}" was presented, but the instrumented call site "${instrumentedCallSite}" was never observed at runtime — the declared source was not actually consulted. Per VA-T1-source-reached.`,
    };
  }

  if (!claimPresented) {
    return { finding: false, reason: `T1 source-REACHED: claim "${productLevelClaim}" was not presented — no assertion to verify.` };
  }

  return { finding: false, reason: `T1 source-REACHED: claim "${productLevelClaim}" is backed by an observed call to "${instrumentedCallSite}".` };
}

export default { checkSourceReached };
