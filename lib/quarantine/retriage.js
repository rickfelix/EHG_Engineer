/**
 * SD-LEO-INFRA-TRIAGE-2026-BULK-001 — re-triage discrimination core.
 *
 * THE CLASS: `assertion-drift` is not a neutral description. It encodes a VERDICT — the test's
 * expectation is stale — and a label that presumes its own conclusion converts an open question
 * into a closed one at zero cost. At least one of the 2026-06-11 entries was the opposite: a real
 * regression whose test was correctly asserting something a code change had broken.
 *
 * THE DISCIPLINE, which this module enforces structurally rather than by exhortation:
 *   - UNDETERMINED is the DEFAULT, not a fallback. An entry earns drift or regression by evidence.
 *   - A verdict without a citation is rejected. That is the shape of the label being replaced.
 *   - Sharing an error signature with the one proven regression is a REASON TO LOOK FIRST and
 *     nothing more. `signatureRank` returns an ORDER; it never returns a verdict.
 */

/** Verdicts. UNDETERMINED is a real outcome, not a failure to try. */
export const DRIFT = 'drift';
export const REGRESSION = 'regression';
export const UNDETERMINED = 'undetermined';

/** The bulk-shelving date. Only entries from this day carry the bulk-event argument. */
export const BULK_DATE = '2026-06-11';

/** The proven regression's signature, recovered from git (entry removed by 071758279d1). */
export const CALIBRATION_SIGNATURE = 'AssertionError: expected true to be false';
/** Its inverse — the same boolean-inversion shape, pointing the other way. */
export const INVERSE_SIGNATURE = 'AssertionError: expected false to be true';

/**
 * Split assertion-drift entries into the bulk cohort and the individually-dated ones.
 *
 * The 11 individually-dated entries were separate judgements on separate days. Folding them into
 * a single 117 figure would manufacture a bulk event that did not happen and hand them an argument
 * they were never part of — a small over-generalisation inside an SD about over-generalisation.
 */
export function splitCohorts(entries) {
  const drift = (entries || []).filter((e) => e && e.reason_class === 'assertion-drift');
  const bulk = drift.filter((e) => String(e.quarantined_at || '').startsWith(BULK_DATE));
  const individual = drift.filter((e) => !String(e.quarantined_at || '').startsWith(BULK_DATE));
  return { bulk, individual, totalAssertionDrift: drift.length };
}

/**
 * Look-first ordering. LOWER RANK = EXAMINE EARLIER.
 *
 * THIS IS NOT A VERDICT AND MUST NEVER BE READ AS ONE. Rank 0 means "shares the signature of the
 * one case we know was a regression", which makes an entry worth opening first. It says nothing
 * about what the entry IS. Every ranked entry still requires full discrimination, and some rank-0
 * entries will be genuine drift. Inferring 18 verdicts from 1 measurement is structurally what
 * produced 106 same-day judgements — the error this SD exists to correct, pointed the other way.
 */
export function signatureRank(entry) {
  const sig = String(entry?.error_signature || '');
  if (sig.startsWith(CALIBRATION_SIGNATURE)) return 0;
  if (sig.startsWith(INVERSE_SIGNATURE)) return 1;
  if (/^AssertionError/.test(sig)) return 2;
  return 3;
}

/** Order a cohort for examination. Stable within rank so runs are reproducible. */
export function examinationOrder(entries) {
  return [...(entries || [])]
    .map((e, i) => ({ e, i, r: signatureRank(e) }))
    .sort((a, b) => (a.r - b.r) || (a.i - b.i))
    .map((x) => x.e);
}

/**
 * Record a discrimination. Returns a verdict object or throws on an unusable one.
 *
 * A verdict WITHOUT a citation is refused, because that is exactly the artifact being replaced:
 * a confident label nobody can check. The gate that caught this SD's own metadata put it best —
 * a bare name is an endorsement; the citation is the proof.
 */
export function recordVerdict({ file, verdict, citation, note } = {}) {
  if (!file) throw new Error('recordVerdict: file is required');
  if (![DRIFT, REGRESSION, UNDETERMINED].includes(verdict)) {
    throw new Error(`recordVerdict: verdict must be drift|regression|undetermined, got ${JSON.stringify(verdict)}`);
  }
  const cite = typeof citation === 'string' ? citation.trim() : '';
  if (verdict !== UNDETERMINED && !cite) {
    throw new Error(`recordVerdict: a ${verdict} verdict requires a citation — an uncitable verdict is the label being replaced`);
  }
  if (verdict === UNDETERMINED && !cite && !note) {
    throw new Error('recordVerdict: undetermined requires a note saying WHAT could not be recovered');
  }
  return { file, verdict, citation: cite || null, note: note || null };
}

/**
 * Summarise. Counts UNDETERMINED as its own bucket — it is never folded into either side.
 *
 * `unprocessed` is reported separately from `undetermined`: "we could not determine this" and
 * "we did not look at this" are different claims, and collapsing them would let an unfinished
 * run read as a complete one.
 */
export function summarise(cohort, verdicts) {
  const byFile = new Map((verdicts || []).map((v) => [v.file, v]));
  const counts = { [DRIFT]: 0, [REGRESSION]: 0, [UNDETERMINED]: 0, unprocessed: 0 };
  for (const e of cohort || []) {
    const v = byFile.get(e.file);
    if (!v) counts.unprocessed += 1;
    else counts[v.verdict] += 1;
  }
  return { total: (cohort || []).length, ...counts };
}

/**
 * Every processed verdict must carry a citation (or, for undetermined, a note). Returns the
 * offending entries so the report can exit non-zero naming them, rather than printing a total
 * that looks complete.
 */
export function findUncitedVerdicts(verdicts) {
  return (verdicts || []).filter((v) => {
    if (v.verdict === UNDETERMINED) return !v.citation && !v.note;
    return !v.citation;
  });
}

/**
 * TS-7's guard, mechanised: do the rank-0/1 entries share one rationale?
 *
 * A run where every boolean-inversion candidate carries the same citation string is the shortcut
 * this SD forbids — 18 verdicts inferred from 1 measurement. It fails even when each verdict is
 * individually correct, because the right answer reached by the wrong method is what produced the
 * original bulk. Returns the shared citation when detected, null when the rationales are per-entry.
 */
export function detectSharedRationale(entries, verdicts) {
  const ranked = new Set((entries || []).filter((e) => signatureRank(e) <= 1).map((e) => e.file));
  const cites = (verdicts || [])
    .filter((v) => ranked.has(v.file) && v.verdict !== UNDETERMINED && v.citation)
    .map((v) => v.citation);
  if (cites.length < 2) return null;
  const distinct = new Set(cites);
  return distinct.size === 1 ? cites[0] : null;
}
