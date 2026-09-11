/**
 * Verdict-emitted provenance — QF-20260903-379.
 *
 * The gate-evidence provenance ratification (chairman-ratified 2026-09-02, 6c263823) covers the
 * INPUT side: no completion gate may accept evidence authored by the party it gates, and every
 * artifact a gate READS must carry producer/run/hash. Nothing covered the OUTPUT side: a gate
 * VERDICT carries a score and a pass/fail, but nothing naming WHAT was actually measured to
 * produce it. Three confidently-wrong verdicts on correct work in one night (QF-20260903-379's
 * measured premise) were each distinguishable from the real defect only by reading the write
 * site — a serialised object, a derived cache, a different function's return value.
 *
 * This is the mirror, minimal and additive: an OPTIONAL `measured` field a validator may attach
 * to the object it passes into ValidatorRegistry.normalizeResult(), naming the `subject` (the
 * field/artifact actually inspected) and the `producer` (the function that computed the
 * verdict). Omitting it is unchanged behavior (fail-open) — this establishes the contract and
 * wires ONE exemplar (prdQualityValidation, the gate QF-20260903-722 fixed after it matched
 * field names/ids/structure instead of prose), not a retrofit of every existing gate; that
 * retrofit is deliberately out of scope here (repeating "fix instances, not the class" is the
 * mistake this row exists to stop).
 */

/**
 * True when a gate result carries enough to identify what was measured from its own output.
 * @param {{measured?: {subject?: string, producer?: string}}} gateResult
 * @returns {boolean}
 */
export function hasMeasuredProvenance(gateResult) {
  return Boolean(gateResult?.measured?.subject && gateResult?.measured?.producer);
}

/**
 * Format the measured-provenance line for the PLAN-TO-EXEC precheck display
 * (HandoffOrchestrator.js's "📊 GATE SCORES (Precheck)" loop). Returns null when the gate
 * result carries no `measured` field — the loop prints nothing extra for it, matching every
 * gate's behavior before this QF.
 * @param {{measured?: {subject?: string, producer?: string}}} gateResult
 * @returns {string|null}
 */
export function formatMeasuredLine(gateResult) {
  if (!hasMeasuredProvenance(gateResult)) return null;
  return `      ↳ measured: ${gateResult.measured.subject} (via ${gateResult.measured.producer})`;
}
