/**
 * SD-LEO-INFRA-OUTCOME-SHAPED-LEDGER-001 — outcome_ref shape classification.
 *
 * WHY THIS EXISTS. `outcome_sd_key` is 3.4% populated and the SD read that as a wiring defect.
 * It is not: a correct writer exists (scripts/coordinator-ack-adam.cjs:249) which DERIVES the key
 * from `outcome_ref`, and 853 of 865 populated refs are narrative prose. The measure is starved by
 * its INPUT, not its wiring.
 *
 * THE FAILURE MODE THIS MODULE GUARDS AGAINST IS A NUMBER THAT IS TRUE AND MISLEADING.
 * "3.4% populated" against an implied 100% reads as a broken writer. The same 3.4% against a
 * DERIVABLE CEILING of ~0.1% reads as an absent input. Same number, opposite conclusion — and the
 * SD was written from the first reading. So:
 *   - `summarise()` REFUSES to return a population without its ceiling.
 *   - applicability always carries THREE buckets, never two. A narrative outcome is NOT-APPLICABLE
 *     (outside the mechanism's domain), not NOT-YET (awaiting work). Collapsing them turns a
 *     ceiling into a backlog, and a backlog invites the very wiring this SD had to refuse.
 */

/** The only shape the deriver can use: uppercase SD key. */
export const ELIGIBLE = /^SD-[A-Z0-9-]+$/;

export const SHAPE = Object.freeze({
  ELIGIBLE: 'eligible-sd-key',
  CASE_DRIFT: 'sd-key-case-drift',
  EXCLUDED_QF: 'qf-excluded-by-design',
  COMMIT_SHA: 'commit-sha',
  NARRATIVE: 'narrative-prose',
  EMPTY: 'empty',
});

/** Bucket names. NOT_APPLICABLE is a first-class outcome, never folded into NOT_YET. */
export const BUCKET = Object.freeze({
  RESOLVABLE: 'RESOLVABLE',
  NOT_YET: 'NOT_YET',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
});

/**
 * Classify a single outcome_ref value.
 *
 * CASE_DRIFT is deliberately its own shape rather than being folded into ELIGIBLE. Deriving from a
 * lowercase ref would produce a key that never resolves (sd_key is stored uppercase), and an
 * unresolvable key is WORSE than none: the reconciler re-selects that row on every scheduled batch
 * forever, burning a slot and logging a skip each time. Reporting the drift lets someone fix the
 * SOURCE; silently upcasing it would raise the coverage number while creating dead rows.
 */
export function classifyRef(ref) {
  if (ref === null || ref === undefined || String(ref).trim() === '') return SHAPE.EMPTY;
  const s = String(ref).trim();
  if (ELIGIBLE.test(s)) return SHAPE.ELIGIBLE;
  if (/^SD-/i.test(s)) return SHAPE.CASE_DRIFT;
  if (/^QF-/i.test(s)) return SHAPE.EXCLUDED_QF;
  if (/^[0-9a-f]{7,40}$/i.test(s)) return SHAPE.COMMIT_SHA;
  return SHAPE.NARRATIVE;
}

/**
 * Which applicability bucket a row falls in.
 *
 * A NARRATIVE outcome can never yield a resolvable key — the advice did not become an artifact, so
 * the forward reconciliation path simply does not apply to it. That is not a gap to be closed.
 */
export function bucketFor({ outcome_ref: ref, outcome_sd_key: key } = {}) {
  if (key && String(key).trim()) return BUCKET.RESOLVABLE;
  const shape = classifyRef(ref);
  if (shape === SHAPE.ELIGIBLE) return BUCKET.NOT_YET;      // derivable, simply not derived yet
  if (shape === SHAPE.CASE_DRIFT) return BUCKET.NOT_YET;    // fixable at source, still in-domain
  if (shape === SHAPE.EMPTY) return BUCKET.NOT_YET;         // no ref yet; nothing decided
  return BUCKET.NOT_APPLICABLE;                             // prose, sha, QF — out of domain
}

/**
 * Whole-population summary.
 *
 * THROWS rather than returning a population without a ceiling. This is the module's central
 * guarantee, and it is enforced in code because the SD itself was written from a bare percentage.
 * A caller that wants only the numerator is asking for the misleading form.
 */
export function summarise(rows, { includeCeiling = true } = {}) {
  if (!Array.isArray(rows)) throw new Error('summarise: rows must be an array');
  if (!includeCeiling) {
    throw new Error(
      'summarise: refusing to report a population without its derivable ceiling. '
      + 'A coverage figure judged against an implied 100% reads as a broken writer; judged against '
      + 'the ceiling it reads as an absent input. Emitting the bare number is the defect this SD exists to remove.',
    );
  }

  const shapes = {};
  const buckets = { [BUCKET.RESOLVABLE]: 0, [BUCKET.NOT_YET]: 0, [BUCKET.NOT_APPLICABLE]: 0 };
  let populated = 0;
  let refPopulated = 0;

  for (const r of rows) {
    const shape = classifyRef(r?.outcome_ref);
    shapes[shape] = (shapes[shape] || 0) + 1;
    if (shape !== SHAPE.EMPTY) refPopulated += 1;
    if (r?.outcome_sd_key && String(r.outcome_sd_key).trim()) populated += 1;
    buckets[bucketFor(r)] += 1;
  }

  // The ceiling: rows that already have a key, plus rows whose ref could yield one.
  const derivable = (shapes[SHAPE.ELIGIBLE] || 0) + (shapes[SHAPE.CASE_DRIFT] || 0);
  const ceiling = buckets[BUCKET.RESOLVABLE] + buckets[BUCKET.NOT_YET];

  return {
    total: rows.length,
    outcome_sd_key_populated: populated,
    outcome_ref_populated: refPopulated,
    shapes,
    buckets,                 // always all three keys, even at zero
    derivable_from_refs: derivable,
    ceiling,                 // the honest denominator
    pct_of_total: rows.length ? +(100 * populated / rows.length).toFixed(1) : 0,
    pct_of_ceiling: ceiling ? +(100 * populated / ceiling).toFixed(1) : null,
  };
}

/**
 * Human-facing line. Never prints the population alone — the ceiling travels with it, because the
 * pair is what carries the meaning and either half alone invites the wrong conclusion.
 */
export function formatSummary(s) {
  return [
    `rows ${s.total} | outcome_sd_key ${s.outcome_sd_key_populated} (${s.pct_of_total}% of total)`,
    `CEILING ${s.ceiling} → ${s.pct_of_ceiling === null ? 'n/a' : s.pct_of_ceiling + '% of what is achievable'}`,
    `buckets: RESOLVABLE ${s.buckets.RESOLVABLE} | NOT_YET ${s.buckets.NOT_YET} | NOT_APPLICABLE ${s.buckets.NOT_APPLICABLE}`,
  ].join('\n');
}
