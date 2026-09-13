/**
 * Venture Quality Model v1 — two-limb CI predicate (FR-4).
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B.
 *
 * Limb 1 (BLOCKING): every category emitted by the generated FINDING_CATEGORIES /
 * stage-23 checklist arrays maps to a registry dimension. Trivially true today since
 * both are generated FROM the registry (lib/eva/quality-model/registry.js) -- this
 * guards future drift if either generator is hand-edited to add a category the
 * registry doesn't know about.
 *
 * Limb 2 (ADVISORY): every registry dimension has both a producer and a reader_or_gate,
 * or a waiver that is dated AND carries a real, unexpired, well-formed review_by. Starts
 * advisory because the programme's own root cause B (unwired producers/readers) means
 * most dimensions fail it today -- see RISK sub-agent mitigation M-3. A waiver missing
 * `dated_at`, missing `review_by`, carrying a malformed `review_by`, or carrying an
 * expired `review_by` does NOT suppress the finding -- "dated" means an active revisit
 * commitment, not a permanent one-time grant (TS-8). ADVERSARIAL REVIEW FINDING (PR
 * #8931, HIGH): an earlier version of this function treated an ABSENT review_by as
 * open-ended/never-expiring, which silently suppressed all 22 of this SD's own shipped
 * waivers (all of which have review_by:null) -- exactly the "ungraduated pilot with no
 * revisit trigger" failure class root cause C exists to close, and the opposite of this
 * file's own stated design intent. Fixed: an absent (or malformed) review_by now means
 * the waiver is NOT active, so it correctly surfaces in the advisory report until a real
 * revisit date is set.
 *
 * Pure functions -- no I/O, no supabase client. CI wiring lives in
 * .github/workflows/quality-model-predicate.yml, which imports and calls these.
 *
 * @module lib/eva/quality-model/predicate
 */

/**
 * @param {ReadonlyArray<string>} generatedCategoryIds
 * @param {ReadonlyArray<{id: string}>} dimensions
 * @returns {{ pass: boolean, orphanCategories: string[] }}
 */
export function checkCategoryDimensionMapping(generatedCategoryIds, dimensions) {
  const known = new Set(dimensions.map((d) => d.id));
  const orphanCategories = generatedCategoryIds.filter((c) => !known.has(c));
  return { pass: orphanCategories.length === 0, orphanCategories };
}

/**
 * @param {{ dated_at?: string, review_by?: string|null }|null|undefined} waiver
 * @param {Date} [now]
 * @returns {boolean} true only for a waiver carrying BOTH a dated_at AND a real,
 *   well-formed, unexpired review_by. Missing/malformed/expired review_by => not active.
 */
export function isWaiverActive(waiver, now = new Date()) {
  if (!waiver || typeof waiver !== 'object') return false;
  if (!waiver.dated_at) return false; // undated waiver never suppresses (TS-8)
  if (!waiver.review_by) return false; // no revisit commitment set -- forces visibility, never silently permanent
  const reviewBy = new Date(waiver.review_by);
  if (Number.isNaN(reviewBy.getTime())) return false; // malformed date -- fail closed to visibility
  return reviewBy.getTime() >= now.getTime();
}

/**
 * @param {ReadonlyArray<object>} dimensions
 * @param {Date} [now]
 * @returns {{ findings: Array<{id: string, missing: 'producer'|'reader'|'both'}> }}
 */
export function checkProducerReaderOrWaiver(dimensions, now = new Date()) {
  const findings = [];
  for (const d of dimensions) {
    const hasProducer = typeof d.producer === 'string' && d.producer.length > 0;
    const hasReader = typeof d.reader_or_gate === 'string' && d.reader_or_gate.length > 0;
    if (hasProducer && hasReader) continue;
    if (isWaiverActive(d.waiver, now)) continue;
    const missing = !hasProducer && !hasReader ? 'both' : (!hasProducer ? 'producer' : 'reader');
    findings.push({ id: d.id, missing });
  }
  return { findings };
}

/**
 * Full predicate result for CI reporting.
 * @param {{ generatedCategoryIds: string[], dimensions: object[] }} args
 * @param {Date} [now]
 */
export function evaluateQualityModelPredicate({ generatedCategoryIds, dimensions }, now = new Date()) {
  const limb1 = checkCategoryDimensionMapping(generatedCategoryIds, dimensions);
  const limb2 = checkProducerReaderOrWaiver(dimensions, now);
  return {
    blocking: limb1,
    advisory: limb2,
    // Only limb 1 can fail the run; limb 2 is reported, never blocking (continue-on-error
    // lives at the workflow-step level, mirrored here so the pure function's own
    // "did this predicate pass" answer matches the workflow's exit behavior).
    pass: limb1.pass,
  };
}
