/**
 * gap_class — ratified finding-code taxonomy.
 *
 * SD-LEO-INFRA-MINUS-CARGO-INSTRUMENTS-001
 *
 * Provenance: ratified in .artifacts/adam-plans/w3-altifyai-stage0-traversal-final.md §5.
 * Prior to this SD the 8-value set had zero code references — only that archived plan doc.
 * This module is now its code source of truth; the archived doc is historical provenance
 * only, not a live reference.
 *
 * This SD mints only the 3 codes its own defects can produce (see MINTED_BY_THIS_SD below).
 * The remaining 5 are documented here so a future SD extending the taxonomy has one place
 * to add to, instead of re-deriving the ratified set from the archived doc a second time.
 */

export const GAP_CLASS = Object.freeze({
  GATE_CANNOT_FAIL: 'GATE_CANNOT_FAIL',
  NO_DEFINITION_OF_DONE: 'NO_DEFINITION_OF_DONE',
  UNPREDICTED_CHAIRMAN_KEYSTROKE: 'UNPREDICTED_CHAIRMAN_KEYSTROKE',
  PAPER_STAGE_NO_MACHINERY: 'PAPER_STAGE_NO_MACHINERY',
  UNCOVERED_OPERATIONAL_NEED: 'UNCOVERED_OPERATIONAL_NEED',
  GATE_BYPASSED: 'GATE_BYPASSED',
  CRITERIA_DRIFT: 'CRITERIA_DRIFT',
  INSTRUMENT_LIE: 'INSTRUMENT_LIE',
});

/** The 3 codes this SD's own defects can produce (see PRD FR-5). */
export const MINTED_BY_THIS_SD = Object.freeze([
  GAP_CLASS.GATE_CANNOT_FAIL,
  GAP_CLASS.INSTRUMENT_LIE,
  GAP_CLASS.GATE_BYPASSED,
]);

/**
 * gap_class values that make a criterion's fire-readiness precondition fail (FR-4): a known-
 * broken instrument must not be allowed to fire a kill until the finding is resolved.
 */
export const BLOCKING_GAP_CLASSES = Object.freeze(new Set([
  GAP_CLASS.GATE_CANNOT_FAIL,
  GAP_CLASS.INSTRUMENT_LIE,
  GAP_CLASS.GATE_BYPASSED,
]));

/** @param {string} value @returns {boolean} */
export function isRatifiedGapClass(value) {
  return Object.values(GAP_CLASS).includes(value);
}

export default { GAP_CLASS, MINTED_BY_THIS_SD, BLOCKING_GAP_CLASSES, isRatifiedGapClass };
