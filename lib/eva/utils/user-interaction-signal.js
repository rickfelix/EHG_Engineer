/**
 * SD-LEO-INFRA-S19-DECOMPOSITION-COVERAGE-001: shared heuristic for whether a sprint item's
 * title/description/acceptance-criteria imply a user-facing surface (and therefore need a
 * ui-layer grandchild). Used by both the S19 planner (to opt a feature item into layered
 * decomposition) and the lifecycle bridge (to assert ui-layer coverage), so the two checks
 * cannot drift apart. Biased toward recall over precision: a missed customer-facing feature
 * (the original defect) is far more costly than an extra ui-layer child on a borderline item.
 *
 * @module lib/eva/utils/user-interaction-signal
 */

const UI_SIGNAL_PATTERNS = [
  /\bpage\b/, /\bpages\b/, /\bscreen\b/, /\bscreens\b/, /\blanding\b/,
  /\bsignup\b/, /\bsign-up\b/, /\bsign up\b/, /\bsignin\b/, /\bsign-in\b/, /\bsign in\b/,
  /\blogin\b/, /\blog-in\b/, /\blog in\b/, /\blogout\b/,
  /\bregistration\b/, /\bregister\b/, /\bform\b/, /\bforms\b/, /\bbutton\b/, /\bbuttons\b/,
  /\bcta\b/, /\bcall-to-action\b/, /\bcall to action\b/,
  /\bdashboard\b/, /\bfrontend\b/, /\bfront-end\b/, /\bmodal\b/, /\bdialog\b/,
  /\bwidget\b/, /\bwidgets\b/, /\bcomponent\b/, /\bcomponents\b/, /\bresponsive\b/,
  /\bcheckout\b/, /\bcart\b/, /\bprofile\b/, /\bonboarding\b/, /\bhero\b/, /\bwireframe\b/,
  /\bbrowser\b/, /\bwebpage\b/, /\bweb page\b/, /\buser interface\b/, /\bui layer\b/,
  /\bsignup flow\b/, /\bsign-up flow\b/,
];

/**
 * @param {Object} item - Sprint item (planner or bridge shape)
 * @param {string} [item.title]
 * @param {string} [item.description]
 * @param {string} [item.acceptanceCriteria]
 * @param {string} [item.acceptance_criteria]
 * @param {string} [item.success_criteria]
 * @returns {boolean}
 */
export function impliesUserInteraction(item) {
  const text = [
    item?.title,
    item?.description,
    item?.acceptanceCriteria,
    item?.acceptance_criteria,
    item?.success_criteria,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (!text) return false;
  return UI_SIGNAL_PATTERNS.some(pattern => pattern.test(text));
}

export { UI_SIGNAL_PATTERNS };
