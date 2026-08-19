/**
 * AI Quality Evaluator - Configuration
 * Band thresholds, SD-type thresholds, and blocking thresholds
 */

// Scoring band thresholds (v1.2.0)
// Bands stabilize pass/fail decisions even when exact scores vary
export const BAND_THRESHOLDS = {
  PASS: 80,        // 80+ = PASS
  NEEDS_REVIEW: 50 // 50-79 = NEEDS_REVIEW, <50 = FAIL
};

// SD-type-aware pass thresholds
// PHASE 1: Start lenient, tighten based on data
//
// SHAPE (SD-LEO-INFRA-QUALITY-GATE-TYPE-001): each sd_type maps to an object with a mandatory
// `default` (the threshold used when no content_type-specific override exists) plus optional
// per-content_type overrides, e.g. `{ default: 55, prd: 60 }`. getPassThreshold() in scoring.js
// resolves content_type -> default -> DEFAULT_THRESHOLD. This unblocks per-(sd_type, content_type)
// tuning recommendations (from v_ai_quality_tuning_recommendations) that were previously refused
// whenever raising the shared sd_type-level number would collaterally raise a sibling content_type
// cell that could not bear it -- see scripts/quality/tuning-002/003/004-disposition.mjs for the
// three review rounds this structural gap stalled. This SD changed ONLY the shape; every `default`
// value below is byte-identical to the flat number it replaces.
export const SD_TYPE_PASS_THRESHOLDS = {
  // Documentation-only SDs: Very lenient (focus on clarity)
  documentation: { default: 50 },

  // Infrastructure SDs: Lenient (internal tooling)
  infrastructure: { default: 55 },

  // Feature SDs: Moderate baseline
  feature: { default: 60 },

  // Database SDs: Slightly stricter (data integrity)
  database: { default: 65 },

  // Security SDs: raised 65 -> 70 by QF-20260807-698 (re-measured at claim per Adam addendum
  // 2026-08-16, superseding the 3-set recorded at filing).
  // BEFORE VALUE FOR ROLLBACK: 65 (the value SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002 shipped).
  // Restoring 65 is the whole rollback.
  //
  // SAME GRANULARITY TRAP AS refactor's OWN COMMENT BELOW: the tuning view recommends per
  // (sd_type x content_type), but this table is keyed by sd_type ALONE, so a per-cell
  // recommendation can only be applied when EVERY content_type cell under that sd_type clears
  // the new bar. Re-measured live 2026-08-16: security's actionable cell (user_story, n=17,
  // avg=81.5, 100% pass) supports 70, and its two low-n siblings (prd n=5 avg=84.4;
  // retrospective n=9 avg=83.4 — both INSUFFICIENT_DATA on their own) already sit comfortably
  // above 70, so raising the shared key has no collateral. This is the ONLY one of six
  // live-2026-08-16 INCREASE recommendations that clears this test; see
  // scripts/quality/tuning-003-disposition.mjs for the full snapshot and the collateral
  // measurement that refused the other five (bugfix, feature, infrastructure x2, orchestrator).
  security: { default: 70 },

  // Refactor SDs: raised 60 -> 65 by SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002.
  // BEFORE VALUE FOR ROLLBACK: no key at all — refactor fell through to DEFAULT_THRESHOLD (60).
  // Deleting this line restores the prior behaviour exactly; that is the whole rollback.
  //
  // WHY THIS ONE AND NOT THE OTHER THREE RECOMMENDED. The tuning view recommends per
  // (sd_type x content_type), but this table is keyed by sd_type ALONE and
  // scripts/modules/ai-quality-evaluator/scoring.js:88 never passes content_type — so a per-cell
  // recommendation cannot be applied without moving every other content_type in that type.
  // refactor is the only one where that is harmless: ALL THREE of its cells clear 65 (prd 78.5,
  // retrospective 88.4, user_story 82.4), so one key satisfies two recommendations with no
  // collateral. feature 60->65 and infrastructure 55->60 were REFUSED, because each would also
  // raise the bar on its user_story cell — feature x user_story at 40.5 avg / 15.6% pass, and
  // infrastructure x user_story at 41.5 / 21.4% over n=1466, the largest cell in the view. Both are
  // lanes SD-LEO-INFRA-GATE-THRESHOLD-TUNING-001 deliberately HELD, so raising them would be the
  // exact opposite of what the same view recommends for them.
  //
  // CONSEQUENCE, RECORDED RATHER THAN LEFT AS A SIDE EFFECT: refactor x user_story is the control
  // TUNING-001 used to exonerate the scorer — the healthy user_story lane proving the same scorer
  // CAN pass user stories. This raises that control's bar on 2026-08-04. Anyone re-reading that
  // exoneration needs to know the instrument moved, and when.
  refactor: { default: 65 }
};

// SD-type-aware blocking thresholds for feedback generation
// Aligns blocking behavior with pass thresholds by SD type
export const SD_TYPE_BLOCKING_THRESHOLDS = {
  // Documentation SDs: Very lenient - almost never block on criterion scores
  documentation: { severeThreshold: 1, majorThreshold: 2 },

  // Infrastructure SDs: Lenient - only block on truly severe failures
  infrastructure: { severeThreshold: 2, majorThreshold: 3 },

  // Feature SDs: Standard thresholds (default behavior)
  feature: { severeThreshold: 3, majorThreshold: 5 },

  // Database SDs: Moderate
  database: { severeThreshold: 3, majorThreshold: 4 },

  // Security SDs: Strict - maintain high standards
  security: { severeThreshold: 3, majorThreshold: 5 }
};

// Orchestrator SD threshold (very lenient - coordination, not direct work)
export const ORCHESTRATOR_THRESHOLD = 50;

// Default threshold when SD type is unknown
export const DEFAULT_THRESHOLD = 60;
