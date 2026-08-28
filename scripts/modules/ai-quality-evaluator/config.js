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
  // prd/retrospective raised by QF-20260817-837 (evidence: v_ai_quality_tuning_recommendations,
  // re-read live at claim). default (55) is unchanged, so infrastructure x user_story (MONITOR,
  // n=996, the largest cell in the whole view, avg=69.4, pass=90.3%) is untouched -- this is
  // exactly the collateral SD-LEO-INFRA-GATE-THRESHOLD-TUNING-002/003 refused to risk before
  // the per-content_type override shape existed.
  // prd: 55 -> 60 (n=267, avg_score=81.4, pass_rate=100% -- INCREASE recommendation).
  // retrospective: 55 -> 60 (n=198, avg_score=91.3, pass_rate=99% -- INCREASE recommendation).
  // BEFORE VALUE FOR ROLLBACK: delete the prd/retrospective keys, leaving `{ default: 55 }`.
  infrastructure: { default: 55, prd: 60, retrospective: 60 },

  // Feature SDs: Moderate baseline
  // prd/retrospective raised by QF-20260817-837 (evidence: v_ai_quality_tuning_recommendations,
  // re-read live at claim). default (60) is unchanged, so feature x user_story (this SD's own
  // scan-time INEFFECTIVE-CHANGE flag re-measured live at claim as OPTIMAL, n=138, avg=65.6,
  // pass=79.7%) is untouched either way -- per the QF's AC-3, this cell is a content-quality
  // signal, not a threshold problem, and gets no threshold change regardless of its live label.
  // prd: 60 -> 65 (n=34, avg_score=81, pass_rate=97.1% -- INCREASE recommendation).
  // retrospective: 60 -> 65 (n=67, avg_score=84.5, pass_rate=94% -- INCREASE recommendation).
  // BEFORE VALUE FOR ROLLBACK: delete the prd/retrospective keys, leaving `{ default: 60 }`.
  feature: { default: 60, prd: 65, retrospective: 65 },

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
  // retrospective raised 70 -> 75 by QF-20260817-837 (evidence: n=14, avg_score=87.3,
  // pass_rate=92.9% -- INCREASE recommendation, re-read live at claim, clears the >=10
  // assessment bar). default (70) is unchanged, so security x prd (n=7/5, both
  // INSUFFICIENT DATA) and security x user_story (already-current at 70/MONITOR, and a
  // separate stale-historical-group row at 65/INCREASE that already resolved when the
  // shared default was raised to 70 by QF-20260807-698) are both untouched.
  // BEFORE VALUE FOR ROLLBACK: delete the retrospective key, leaving `{ default: 70 }`.
  security: { default: 70, retrospective: 75 },

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
  refactor: { default: 65 },

  // Bugfix SDs: QF-20260817-837 (evidence: database/migrations/20251205_russian_judge_sd_type_awareness_fixed.sql's
  // v_ai_quality_tuning_recommendations, re-read live at claim per the QF's own instruction, not
  // the 6-row count recorded at scan time). bugfix had no dedicated key before this change and
  // fell through to DEFAULT_THRESHOLD (60) for every content_type -- `default: 60` here is
  // byte-identical to that prior fallback, so bugfix x user_story (n=183, avg=64.9, pass=73.8%,
  // OPTIMAL) is completely unaffected.
  // prd: 60 -> 65 (n=43 assessments/4wk, avg_score=80.1, pass_rate=97.7% -- INCREASE recommendation).
  // retrospective: 60 -> 65 (n=85, avg_score=84.7, pass_rate=91.8% -- INCREASE recommendation).
  // Both clear >=10 assessments (AC-1). BEFORE VALUE FOR ROLLBACK: delete this whole key: bugfix
  // reverts to falling through to DEFAULT_THRESHOLD (60) for every content_type, exactly as before.
  bugfix: { default: 60, prd: 65, retrospective: 65 }
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
