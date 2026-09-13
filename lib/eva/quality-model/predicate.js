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
 * or a non-expired dated waiver. Starts advisory because the programme's own root cause
 * B (unwired producers/readers) means most dimensions fail it today -- see RISK
 * sub-agent mitigation M-3. An EXPIRED or UNDATED waiver (review_by in the past, or a
 * waiver object present but missing dated_at) does NOT suppress the finding: "dated" is
 * enforced, not decorative (TS-8).
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
 * @returns {boolean} true only for a dated, unexpired waiver.
 */
export function isWaiverActive(waiver, now = new Date()) {
  if (!waiver || typeof waiver !== 'object') return false;
  if (!waiver.dated_at) return false; // undated waiver never suppresses (TS-8)
  if (waiver.review_by) {
    const reviewBy = new Date(waiver.review_by);
    if (!Number.isNaN(reviewBy.getTime()) && reviewBy.getTime() < now.getTime()) return false; // expired
  }
  return true;
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
