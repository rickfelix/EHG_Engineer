/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B (TR-2) — the citation+predicate shape.
 *
 * C4 requires that report sections "store citations and predicates only — every number
 * re-derivable from its cited query, no copied state". There is NO runtime precedent for that
 * shape in this repo: lib/governance/gauge-registry.js carries a `predicate` field per entry,
 * but it is a static, source-committed catalog of gauge CLASSES, authored once per type, with
 * no row-ids and no per-run binding. So this had to be designed rather than copied.
 *
 * ── AN INTERPRETATION DECISION, STATED RATHER THAN MADE SILENTLY ──────────────────────────
 * Read at its most literal, "no copied state" forbids storing the number at all — you would
 * store only the predicate and compute the value at read time. That reading CANNOT WORK, and
 * the requirement that breaks it is one of this SD's own: section 5 is report-over-report
 * stall deltas. Comparing report N to N+1 requires knowing what N SAID. If nothing is stored,
 * re-deriving report N today yields TODAY's numbers, so every delta would be zero by
 * construction — the stall detector would be structurally incapable of detecting a stall.
 *
 * So the shape here is: THE VALUE IS AN OBSERVATION AT generated_at, AND ITS PROVENANCE TRAVELS
 * WITH IT. What "no copied state" then forbids is the thing it was actually written against —
 * duplicating another system's rollup as an unattributed number that drifts silently from its
 * source. A number whose citation and predicate sit beside it is not copied state; it is a
 * measurement with its instrument attached.
 *
 * This also matches the principle the coordinator used to rule on the score legs: A CITATION
 * PROVES WHERE YOU LOOKED, NOT THE INFERENCE. If re-running the predicate now disagrees with
 * the stored observation, that disagreement is INFORMATION — the world moved — and it is
 * exactly what an auditor wants to see. A store-nothing design throws that away.
 *
 * Flagged to the coordinator rather than decided quietly, because it is an interpretation of a
 * chairman-adjacent guardrail and a later reader should find the reasoning, not just the code.
 */

/** Every cited value carries these. A missing one is a defect, not a default. */
const REQUIRED = ['value', 'table', 'predicate'];

/**
 * PROVENANCE fields — never legitimately null. `table` and `predicate` describe WHERE YOU LOOKED
 * and WHAT COUNTS; there is no observation in which either is meaningfully absent.
 *
 * `value` is deliberately NOT here, and that distinction is the fix below.
 */
const PROVENANCE = ['table', 'predicate'];

/**
 * NULL IS AN OBSERVATION, NOT AN ABSENCE — but only when it says so.
 *
 * The original rule rejected value:null outright, on the reasoning that a null without a reason is
 * a shrug wearing a number's clothes. That is right, and it overcorrected by exactly one notch: in
 * this domain null is frequently the ANSWER. the-next-gate-is-null means every wave is clear;
 * the-blocker-is-null means nothing is blocking. Rejecting those forces a section to either invent
 * a sentinel (0, -1, "none") — which is copied state with extra steps and exactly what C4 forbids —
 * or to omit the observation entirely, which loses the finding.
 *
 * So the discriminator is not null-vs-not-null, it is REASONED-vs-UNREASONED. A null value is
 * admissible iff the caller states what the null MEANS, in `null_means`. That keeps the fail-loud
 * property the original rule was defending: a null nobody explained still throws, and it throws
 * naming the field, so the author cannot satisfy it by accident.
 *
 * Absent / null / empty stay three different things, per the coordinator's C4 ruling lineage:
 *   - undefined  → the field was never supplied. Always a defect.
 *   - null       → an observation OF nothing, admissible with `null_means`.
 *   - []  / 0    → a counted nothing, which needs no special case and never did.
 *
 * Handed over by the prior builder of this SD (Charlie / signal 7f8d09f5) and relayed with the
 * ruling lineage attached, rather than discovered here — recorded so the reasoning outlives us both.
 */
function nullIsExplained(spec) {
  return typeof spec.null_means === 'string' && spec.null_means.trim().length > 0;
}

/**
 * Build a cited value: the observation, plus everything needed to re-derive and audit it.
 *
 * @param {object} spec
 * @param {*}      spec.value      the observation AS OF the run — see the interpretation note
 * @param {string} spec.table      the table (or view) the number came from
 * @param {string} spec.predicate  human-readable statement of WHAT COUNTS, precise enough to re-run
 * @param {string[]} [spec.row_ids] ids of the rows behind the number, when a row grain exists
 * @param {string} [spec.limitation] a stated known-limitation that must travel WITH the emission
 * @param {string} [spec.source]   the code path that computed it, for the reader who wants the how
 * @returns {object} the cited-value record
 */
export function cite(spec = {}) {
  // undefined is ALWAYS a defect — the field was never supplied at all.
  const absent = REQUIRED.filter((k) => spec[k] === undefined);
  // null is a defect for provenance, which can never meaningfully be "nothing"...
  const nullProvenance = PROVENANCE.filter((k) => spec[k] === null);
  const missing = [...absent, ...nullProvenance];
  if (missing.length > 0) {
    // Fail loudly at build time. A citation missing its predicate is indistinguishable from a
    // bare number once it is in the row, and by then nobody knows it was ever supposed to
    // have one.
    throw new Error(`cite(): missing required field(s): ${[...new Set(missing)].join(', ')} — a value without its provenance is the thing C4 forbids`);
  }
  // ...but for the OBSERVATION, null is admissible when the caller says what it means. An
  // unexplained null still throws, and throws loudly enough that it cannot be satisfied by accident.
  if (spec.value === null && !nullIsExplained(spec)) {
    throw new Error(
      'cite(): value is null with no null_means — null is a legitimate observation in this domain '
      + '(no next gate, nothing blocking), but only when you state what it means. Add '
      + 'null_means: "<what the absence signifies>", or supply a real value. An unexplained null is a shrug.',
    );
  }
  if (typeof spec.predicate !== 'string' || spec.predicate.trim().length === 0) {
    throw new Error('cite(): predicate must be a non-empty string stating what counts');
  }

  const out = {
    value: spec.value,
    citation: {
      table: spec.table,
      // Absent rather than empty when there is genuinely no row grain — an empty array reads
      // as "we looked and found none", which is a different claim.
      ...(Array.isArray(spec.row_ids) ? { row_ids: spec.row_ids } : {}),
      ...(spec.source ? { source: spec.source } : {}),
    },
    predicate: spec.predicate.trim(),
  };

  // The limitation is part of the emission, never a footnote elsewhere. leg2's ruling turns on
  // exactly this: the citation is honest BECAUSE the limitation is read alongside it.
  if (spec.limitation) out.limitation = spec.limitation;

  // Same rule, same reason: an explained null is only explained where it is READ. If null_means
  // stayed at the call site, a consumer would see a bare null and be back to guessing whether it
  // meant "nothing blocks" or "nobody looked" — which is the entire distinction being drawn.
  if (spec.value === null) out.null_means = spec.null_means.trim();

  return out;
}

/**
 * A value that could not be measured. NEVER represent this as 0 — a false zero is
 * indistinguishable from a real zero, and the guardrail exists because that mistake is silent.
 * Mirrors the house style in lib/vision/vdr-registry.js computeBuildGauge, which returns
 * available:false with a note rather than a false 0%.
 *
 * @param {object} spec
 * @param {string} spec.table
 * @param {string} spec.predicate  what WOULD have been counted, so the gap is legible
 * @param {string} spec.reason     why it could not be read
 */
export function unmeasurable(spec = {}) {
  if (!spec.reason) throw new Error('unmeasurable(): reason is required — "unmeasurable" without a cause is not a measurement, it is a shrug');
  return {
    value: null,
    unmeasurable: true,
    reason: spec.reason,
    citation: { table: spec.table ?? null },
    predicate: spec.predicate ?? null,
  };
}

export function isUnmeasurable(cited) {
  return !!cited && cited.unmeasurable === true;
}

/**
 * Score a leg out of 2, rendering unmeasurable legs over an explicitly REDUCED DENOMINATOR
 * rather than scoring them 0. Scoring an unreadable leg zero would make an instrument outage
 * look like poor performance — the two must never be confusable.
 *
 * @param {Array<{points: number, cited: object}>} legs
 * @returns {{score: number, denominator: number, unmeasurable_legs: string[]}}
 */
export function scoreLegs(legs = []) {
  const measurable = legs.filter((l) => !isUnmeasurable(l.cited));
  const unmeasurableIds = legs.filter((l) => isUnmeasurable(l.cited)).map((l) => l.id ?? 'unnamed');
  return {
    score: measurable.reduce((sum, l) => sum + (Number(l.points) || 0), 0),
    // The denominator SHRINKS. Native /8 is never rescaled to look like /8 when two legs
    // could not be read — the reduced denominator is how the reader sees the gap.
    denominator: measurable.length * 2,
    unmeasurable_legs: unmeasurableIds,
  };
}
