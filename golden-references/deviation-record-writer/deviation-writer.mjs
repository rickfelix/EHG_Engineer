// Golden reference — deviation-record writer (REFERENCE ONLY, never wired).
// Source SD: SD-LEO-INFRA-GOLDEN-REFERENCES-CANONICAL-001-E
//
// A deviation record is the venture-build HONESTY control. Straying from a
// planning artifact is ALLOWABLE — building sharpens the picture. What is NOT
// allowable is UNDOCUMENTED drift: a promised item silently dropped with no
// record. This reference defeats the SILENT SCOPE-SHRINK class by making every
// drop RECONCILABLE — an expected item is "covered" only when a deviation
// record is bound to THAT item (by artifactRef) AND carries a qualifying reason.
// A drop with no record, a record that names a DIFFERENT item, or a thin reason
// each leaves an undocumented gap that reconcile() surfaces.
//
// Estate anchor (the real shape this distills):
//   lib/eva/deviation-ledger.js recordDeviation({ artifactRef, what, instead,
//   why, weight }) + readDeviations (records BOUND by artifact_ref; `why` is
//   REQUIRED non-empty for EVERY weight, including declared-descope).
//   lib/eva/post-build-verdict-engine.js splits DEVIATED_WITH_DOCUMENTED_REASON
//   from DEVIATED_UNDOCUMENTED by REASON QUALITY (findQualifyingDeviation:
//   why.trim().length >= 15), NOT by a categorical value. The real silent-shrink
//   query (post_build_verdicts): count(disposition='MISSING' OR (disposition=
//   'PARTIAL' AND deviation_artifact_id IS NULL)) must be 0.
//
// VOCABULARY CAVEAT (do not miscopy): the categorical field here is `weight`
//   {minor, moderate, critical, declared-descope} — the estate's real, closed,
//   chairman-ratified taxonomy where declared-descope IS the documented-skip
//   primitive. It is NOT the post_build_verdicts.disposition column (whose values
//   are BUILT / PARTIAL / MISSING / DEVIATED_*). Do not invent a "disposition"
//   allowlist — that name collides with a real column of different values.
//
// Four doctrines:
//  1. WRITE-AT-DIVERGENCE: recordDeviation is called at the divergence site and
//     BINDS the record to the specific artifactRef it explains — never a
//     post-hoc narrative reconstructed after the walk.
//  2. STRUCTURED-NOT-NARRATIVE: the required trio is artifactRef + a non-empty
//     why + a weight in the closed allowlist; a malformed / free-text-only record
//     is REJECTED (thrown), not silently stored (the token-stuffing failure mode).
//  3. CLOSED WEIGHT ALLOWLIST + REASON-QUALITY LEGALITY: weight must be in the
//     allowlist (throws otherwise); why is required non-empty at write time; but
//     COVERAGE additionally requires a QUALIFYING (non-thin) why — a valid weight
//     with a thin reason does NOT cover (maps to DEVIATED_UNDOCUMENTED).
//  4. RECONCILE DEFEATS SILENT SHRINK: reconcile(expected, delivered, deviations)
//     returns { undocumented } = expected − delivered − { e : ∃ d with
//     d.artifactRef === e AND qualifies(d.why) }. Coverage is REFERENT-BOUND —
//     a record for a DIFFERENT item does not cover — which closes the self-mask
//     hole that greens on the mere EXISTENCE of some deviation.

/** Estate-exact closed weight taxonomy (lib/eva/deviation-ledger.js DEVIATION_WEIGHTS). */
const WEIGHTS = Object.freeze(['minor', 'moderate', 'critical', 'declared-descope']);
/** Distills findQualifyingDeviation: a reason qualifies only if substantive. */
const QUALIFYING_REASON_MIN = 15;

/**
 * A qualifying reason is a non-empty, SUBSTANTIVE why — not a thin placeholder.
 * Distills lib/eva/post-build-verdict-engine.js findQualifyingDeviation
 * (why.trim().length >= 15). Coverage in reconcile() gates on THIS, not on mere
 * presence and not on weight membership.
 * @param {string} why
 * @returns {boolean}
 */
export function qualifies(why) {
  return typeof why === 'string' && why.trim().length >= QUALIFYING_REASON_MIN;
}

/**
 * An INJECTED sink: the durable ledger the divergence site appends to. It is a
 * per-call value, never a module singleton — recordDeviation takes it as a
 * parameter so a delegate's own store (or a real venture_artifacts table adapter)
 * drops in unchanged. Returns append + readAll only (append-only ledger, like
 * the estate's readDeviations returning an array).
 * @returns {{ append: (record: object) => void, readAll: () => object[] }}
 */
export function makeSink() {
  const records = [];
  return {
    append: (record) => { records.push(record); },
    readAll: () => records.slice(),
  };
}

/**
 * Record a deviation AT the moment/site of divergence, BOUND to `artifactRef`
 * (D1). Validates the required trio (D2/D3) — artifactRef present, weight in the
 * closed allowlist, why non-empty — THROWING (not silently accepting) on a
 * malformed or narrative-only record. Writes the structured record to the
 * INJECTED sink; returns the stored record.
 *
 * @param {{ append: (record: object) => void }} sink - the injected ledger.
 * @param {{ artifactRef: string, what?: string, instead?: string, why: string,
 *           weight: 'minor'|'moderate'|'critical'|'declared-descope' }} rec
 * @returns {object} the stored record { artifactRef, what, instead, why, weight }.
 */
export function recordDeviation(sink, rec) {
  const { artifactRef, what, instead, why, weight } = rec || {};
  if (!artifactRef || typeof artifactRef !== 'string') {
    throw new Error('[deviation-writer] recordDeviation requires a string artifactRef (the referent the deviation is bound to)');
  }
  if (!WEIGHTS.includes(weight)) {
    throw new Error(`[deviation-writer] recordDeviation requires weight in [${WEIGHTS.join(', ')}], got: ${JSON.stringify(weight)}`);
  }
  if (!why || !String(why).trim()) {
    throw new Error('[deviation-writer] recordDeviation requires a non-empty why (for every weight, including declared-descope)');
  }
  const record = {
    artifactRef,
    what: what ?? null,
    instead: instead ?? null,
    why: String(why).trim(),
    weight,
  };
  sink.append(record);
  return record;
}

/**
 * Reconcile a planned scope against what was delivered and the deviation ledger
 * (D4). An expected item is UNDOCUMENTED (a silent shrink) unless it was
 * delivered OR a deviation record is bound to THAT item (artifactRef match) AND
 * carries a qualifying reason. Existence of *some* deviation is not enough; a
 * record naming a different item, or with a thin reason, does not cover.
 *
 * @param {string[]} expected - planned scope (referents).
 * @param {string[]} delivered - referents actually delivered.
 * @param {object[]} deviations - records from the sink (sink.readAll()).
 * @returns {{ undocumented: string[], covered: string[] }}
 */
export function reconcile(expected, delivered, deviations) {
  const deliveredSet = new Set(delivered);
  const covered = [];
  const undocumented = [];
  for (const e of expected) {
    if (deliveredSet.has(e)) continue;                 // delivered — not a gap
    const rec = (deviations || []).find(
      (d) => d && d.artifactRef === e && qualifies(d.why) // D4 referent match + D3 reason quality
    );
    if (rec) covered.push(e);
    else undocumented.push(e);                          // silent shrink surfaced
  }
  return { undocumented, covered };
}
