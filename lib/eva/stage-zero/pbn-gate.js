/**
 * Proven/Better/New (PBN) hard gate rules — SD-LEO-FEAT-PROVEN-BETTER-NEW-001 FR-2/FR-3/FR-5.
 *
 * Pure module: no DB / fs / network / LLM (mirrors thesis-contract.js's pure/impure split —
 * pbn-scoring.js is the LLM-calling half, this is the deterministic evaluation half).
 *
 * Persisted shape (matches venture_nursery.pbn_verdict's CHECK constraint, TR-2):
 *   { proven: {mechanic, citations, coverage}, better: {hypothesis, friction_point, citations,
 *     coverage}, new: {wedge, wedge_count, coverage}, verdict: PASS|REJECT|TRIM,
 *     measured_at: ISO-8601, rule_trace: [{rule_id, fired, detail}] }
 *
 * SCOPE NOTE (SECURITY sub-agent, EXEC-TO-PLAN handoff, F7): this gate is PROCESS ASSURANCE,
 * not a security control. resolveCitation is a well-formedness/length check (FR-5), not a live
 * resolution of the citation against reality — a scorer that confidently emits a plausible-but-
 * false citation (e.g. a real-sounding but fabricated market referent) satisfies every hard
 * rule here. Do not cite this gate downstream as proof a PROVEN claim is TRUE, only that it is
 * well-formed and was not silently invented from an empty search.
 */

/** Named rule ids for rule_trace — FR-2's hard rules. */
export const PBN_RULES = Object.freeze({
  EMPTY_PROVEN: 'EMPTY_PROVEN',
  NEW_MULTI_WEDGE: 'NEW_MULTI_WEDGE',
  NO_RESOLVABLE_REFERENT: 'NO_RESOLVABLE_REFERENT',
});

export const PBN_VERDICTS = Object.freeze(['PASS', 'REJECT', 'TRIM']);

/**
 * FR-5 citation resolution (PLAN-resolved definition): a HERMETIC, opt-in check. Verifies a
 * citation object has a well-formed, non-trivial reference field matching its declared shape.
 * No live network lookup — that is explicitly out of scope for this SD's fixture-based
 * two-sided control (may be added by a future SD only if citation/reality drift becomes a
 * measured problem).
 *
 * Length floors mirror the existing citation-enforcement discipline in invariant-library.js
 * (verified: invariant-library.js:132,137 — source.trim().length>=8, measured.trim().length>=20;
 * FR-3's own description names this file as the discipline to mirror) — a bare `{source:"x"}`
 * is a trivial assertion, not a real citation, and must not resolve (US-001 AC #2/FR-1 AC #2:
 * "never a bare assertion").
 *
 * @param {Object} citation - {source, measured, reference}
 * @returns {boolean} true if the citation is well-formed and resolvable
 */
export function resolveCitation(citation) {
  if (!citation || typeof citation !== 'object') return false;
  const hasSource = typeof citation.source === 'string' && citation.source.trim().length >= 8;
  const hasMeasured = typeof citation.measured === 'string' && citation.measured.trim().length >= 20;
  const hasReference = typeof citation.reference === 'string' && citation.reference.trim().length > 0;
  return hasSource && hasMeasured && hasReference;
}

/**
 * Recompute a bucket's coverage against its ACTUAL citations, never trusting the LLM's
 * self-reported coverage flag alone (FR-3: an un-evidenceable bucket is marked, never
 * fabricated — this is the deterministic backstop against a scorer that claims coverage:true
 * without a real citation).
 *
 * @param {Object} bucket - {citations, coverage} (LLM-reported coverage is advisory input only)
 * @returns {boolean} the RESOLVED coverage — true only if reported true AND >=1 citation resolves
 */
export function resolveBucketCoverage(bucket) {
  if (!bucket?.coverage) return false;
  const citations = Array.isArray(bucket.citations) ? bucket.citations : [];
  return citations.length > 0 && citations.some(resolveCitation);
}

/**
 * Apply FR-2's hard, codeable, two-sided gate rules to a scored bucket set.
 *
 * TRIM-vs-REJECT discriminator (resolved during PLAN, PRD TR/FR-2 addendum):
 *   - TRIM: new.wedge_count > 1 AND proven IS evidenced — a viable foundation, too many wedges.
 *   - REJECT: new.wedge_count > 1 AND proven is NOT evidenced — no foundation to trim onto
 *     (rules compound; rule_trace names BOTH firing rules).
 *   - REJECT: proven is NOT evidenced alone (empty-proven auto-fails, the framework's own law).
 *   - PASS: proven evidenced AND wedge_count <= 1.
 *
 * @param {Object} buckets - {proven, better, new} raw buckets (e.g. from scorePbnBuckets)
 * @returns {{verdict: 'PASS'|'REJECT'|'TRIM', rule_trace: Array<{rule_id: string, fired: boolean, detail: string}>, resolved: Object}}
 */
export function evaluatePbnVerdict(buckets = {}) {
  const provenCoverage = resolveBucketCoverage(buckets.proven);
  const betterCoverage = resolveBucketCoverage(buckets.better);
  const wedgeCount = Number.isFinite(buckets.new?.wedge_count)
    ? buckets.new.wedge_count
    : (buckets.new?.wedge ? 1 : 0);

  const ruleTrace = [];
  const emptyProvenFired = !provenCoverage;
  const multiWedgeFired = wedgeCount > 1;

  if (emptyProvenFired) {
    ruleTrace.push({
      rule_id: PBN_RULES.EMPTY_PROVEN,
      fired: true,
      detail: 'proven bucket has no resolvable citation — empty-proven auto-fails (FR-2 i)',
    });
  }
  if (multiWedgeFired) {
    ruleTrace.push({
      rule_id: PBN_RULES.NEW_MULTI_WEDGE,
      fired: true,
      detail: `new bucket contains ${wedgeCount} novel wedges (>1) — trim-or-reject (FR-2 ii)`,
    });
  }

  // FR-3 coverage-not-completeness reporting: give every un-evidenceable bucket a
  // machine-readable rule_trace home (US-006 AC #3), independent of whether it also
  // drove a verdict-changing rule above — EMPTY_PROVEN answers "did this fail the gate",
  // NO_RESOLVABLE_REFERENT answers "could this bucket be evidenced at all" (better is
  // routinely coverage=false by design per FR-2 iii and still deserves a trace entry).
  // `new` is excluded — it is the pre-declared-novel bucket, not subject to citation
  // evidencing in the same sense as proven/better.
  if (!provenCoverage) {
    ruleTrace.push({
      rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT,
      fired: true,
      bucket: 'proven',
      detail: 'proven bucket coverage=false — no citation resolved (FR-3 coverage-not-completeness)',
    });
  }
  if (!betterCoverage) {
    ruleTrace.push({
      rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT,
      fired: true,
      bucket: 'better',
      detail: 'better bucket coverage=false — no citation resolved (FR-3 coverage-not-completeness)',
    });
  }

  let verdict;
  if (emptyProvenFired && multiWedgeFired) {
    verdict = 'REJECT'; // compounding: no foundation AND too many wedges — nothing to trim onto
  } else if (emptyProvenFired) {
    verdict = 'REJECT';
  } else if (multiWedgeFired) {
    verdict = 'TRIM'; // viable foundation, just too many wedges
  } else {
    verdict = 'PASS';
  }

  return {
    verdict,
    rule_trace: ruleTrace,
    resolved: { proven_coverage: provenCoverage, better_coverage: betterCoverage, wedge_count: wedgeCount },
  };
}

/**
 * Assemble the full persisted pbn_verdict shape from raw scored buckets — the single function
 * chairman-review.js's integration point calls (wraps evaluatePbnVerdict, adds measured_at,
 * folds resolved coverage back into each bucket so the persisted shape reflects the
 * deterministic re-check, never the LLM's raw self-report alone).
 *
 * @param {Object} buckets - raw buckets from scorePbnBuckets (or a hand-built fixture)
 * @param {Object} [opts]
 * @param {Date|string} [opts.now] - injectable clock (tests)
 * @returns {Object} the shape to write to venture_nursery.pbn_verdict / venture.metadata.stage_zero.pbn_verdict
 */
export function buildPbnVerdict(buckets = {}, opts = {}) {
  const { verdict, rule_trace, resolved } = evaluatePbnVerdict(buckets);
  const measuredAt = new Date(opts.now || Date.now()).toISOString();

  return {
    proven: {
      mechanic: buckets.proven?.mechanic ?? null,
      citations: Array.isArray(buckets.proven?.citations) ? buckets.proven.citations : [],
      coverage: resolved.proven_coverage,
    },
    better: {
      hypothesis: buckets.better?.hypothesis ?? null,
      friction_point: buckets.better?.friction_point ?? null,
      citations: Array.isArray(buckets.better?.citations) ? buckets.better.citations : [],
      coverage: resolved.better_coverage,
    },
    new: {
      wedge: buckets.new?.wedge ?? null,
      wedge_count: resolved.wedge_count,
      coverage: buckets.new?.coverage === true,
    },
    verdict,
    measured_at: measuredAt,
    rule_trace,
  };
}

export default {
  PBN_RULES,
  PBN_VERDICTS,
  resolveCitation,
  resolveBucketCoverage,
  evaluatePbnVerdict,
  buildPbnVerdict,
};
