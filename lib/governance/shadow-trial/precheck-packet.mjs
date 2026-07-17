/**
 * // @wire-check-exempt: library module for the shadow-trial sandbox; production
 * // consumer is child C (SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-C shadow-run
 * // core), whose acceptance criteria mandate wiring one real producer end-to-end
 * // (staged proposal -> shadow-run -> packet -> ratification row). Until child C
 * // ships, reachability is via the test suites + this documented seam.
 * Precheck-packet composer — shadow-trial ratification sandbox.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A (FR-3).
 *
 * PURE function: maps shadow-run per-case results into the one chairman-facing verdict
 * object appended to a ratification request. EVIDENCE ONLY (CONST-002): the packet FEEDS
 * the chairman's decision and never replaces it; nothing here has apply authority.
 *
 * The `experimental: true` watermark is HARD-CODED in this child: the observe-first
 * concordance ladder (N>=10 graded verdict-vs-chairman-decision agreements) that could
 * ever change how much weight a packet claims is an explicitly gated future SD — until
 * then every packet self-identifies as experimental evidence.
 *
 * This module's exported shape is the CONTRACT child C composes against — additive
 * changes only.
 */

export const RECOMMENDATIONS = Object.freeze({
  SAFE: 'looks_safe',
  REGRESSIONS: 'has_regressions',
  INSUFFICIENT: 'insufficient_evidence',
});

/** Shape guard for one shadow-run case result. */
export function isCaseResult(entry) {
  return !!entry
    && typeof entry === 'object'
    && typeof entry.case_id === 'string'
    && 'current_verdict' in entry
    && 'proposed_verdict' in entry
    && typeof entry.regression === 'boolean';
}

/**
 * Compose the chairman-facing precheck packet.
 * @param {Array} results - per-case shadow-run results
 *   [{ case_id, current_verdict, proposed_verdict, delta, regression }]
 * @param {Object} opts
 * @param {string} opts.proposalId - governed_change_proposals.id this packet describes
 * @param {string|Date} [opts.generatedAt] - injectable clock for determinism in tests
 * @returns {Object} packet — see data contract in the PRD
 */
export function composePrecheckPacket(results, { proposalId, generatedAt } = {}) {
  const valid = (Array.isArray(results) ? results : []).filter(isCaseResult);
  const casesTotal = valid.length;
  const regressions = valid.filter((r) => r.regression === true).length;
  const passes = casesTotal - regressions;

  let recommendation;
  if (casesTotal === 0) recommendation = RECOMMENDATIONS.INSUFFICIENT;
  else if (regressions > 0) recommendation = RECOMMENDATIONS.REGRESSIONS;
  else recommendation = RECOMMENDATIONS.SAFE;

  // Deterministic, deliberately modest confidence: pass-rate scaled by corpus size
  // (fewer than 5 cases can never claim full confidence), 0 when there is no evidence.
  const confidence = casesTotal === 0
    ? 0
    : Math.round((passes / casesTotal) * Math.min(1, casesTotal / 5) * 100) / 100;

  return {
    proposal_id: proposalId ?? null,
    per_case: valid.map((r) => ({
      case_id: r.case_id,
      current_verdict: r.current_verdict,
      proposed_verdict: r.proposed_verdict,
      delta: r.delta ?? null,
      regression: r.regression,
    })),
    summary: { cases_total: casesTotal, regressions, passes },
    recommendation,
    confidence,
    experimental: true,
    generated_at: generatedAt
      ? new Date(generatedAt).toISOString()
      : new Date().toISOString(),
  };
}
