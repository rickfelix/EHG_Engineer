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
export const SD_TYPE_PASS_THRESHOLDS = {
  // Documentation-only SDs: Very lenient (focus on clarity)
  documentation: 50,

  // Infrastructure SDs: Lenient (internal tooling)
  infrastructure: 55,

  // Feature SDs: Moderate baseline
  feature: 60,

  // Database SDs: Slightly stricter (data integrity)
  database: 65,

  // Security SDs: Stricter (but not blocking)
  security: 65,

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
  refactor: 65
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
