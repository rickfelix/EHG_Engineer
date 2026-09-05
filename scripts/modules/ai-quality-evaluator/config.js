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
// SINGLE SOURCE OF TRUTH (QF-20260830-735): this table, resolved through
// getPassThreshold() in scoring.js, is the only place a threshold is read at
// gate time -- there is no separate "threshold table" and no live ambiguity
// here. v_ai_quality_tuning_recommendations.current_threshold is a DIFFERENT,
// historical value: the pass_threshold recorded on each ai_quality_assessments
// row at the time it was scored. A pair can show several distinct
// current_threshold rows in that view simply because this table's value for
// that pair changed over the 4-week window (see the tuning-QF comments below),
// which is expected drift-history, not a live duplicate to resolve here.
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
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (2026-09-05): both keys' pre-fix shadow_rescore
  // feedback rows (d0f48dd8-595e-49b6-96c0-978500564328 / 7a84cf34-9f66-4565-b37a-830f4e4f7bf6 for
  // prd; 042e66f1-4a89-485d-b429-ff1210f19fbd / 925e6b07-e0b7-4584-a012-5011a4c08d8c for
  // retrospective) are VACUOUS -- gate-threshold-shadow-rescore.mjs filtered by the view's
  // historical current_threshold (55), re-scoring only the PRE-raise population. DO NOT cite those
  // rows as safety evidence. The REAL post-raise numbers, queried directly against
  // ai_quality_assessments WHERE pass_threshold=60: prd n=101, pass=101/101 (100%); retrospective
  // n=138, pass=133/138 (96.4%) -- both clear the >=10 sample floor, confirm both keys remain
  // healthy under their live bar.
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
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B (2026-09-05): prd was independently re-verified
  // AFTER this QF, not before it. Parent SD-003's shadow re-score row
  // feedback.id=1cdcaecd-bb34-4dc9-82ba-7c5270dace77 (full UUID on one line for greppability)
  // is VACUOUS -- gate-threshold-shadow-rescore.mjs:59 filters by the view's historical
  // current_threshold (60), so it only re-scored the PRE-raise population (the same
  // 33-row group this QF's own "n=34" cites); it never touched a single assessment scored under
  // the live 65. DO NOT cite that row as safety evidence. The REAL post-raise number, queried
  // directly against ai_quality_assessments WHERE pass_threshold=65: n=10, pass=9/10 (90.0%),
  // window 2026-08-28..2026-09-05 -- meets the >=10 sample floor, confirms prd remains healthy
  // under its live bar.
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (2026-09-05): retrospective's pre-fix shadow_rescore
  // rows (7b34135c-7158-41ad-ba6c-a7089a171e3f / 9638675f-4a83-4da6-8dfe-de47380e9763) are VACUOUS
  // for the same reason as prd above -- current_threshold=60 (historical), never the live 65. DO
  // NOT cite those rows. The REAL post-raise number, queried directly against
  // ai_quality_assessments WHERE pass_threshold=65: n=25, pass=25/25 (100%) -- clears the >=10
  // sample floor, confirms retrospective remains healthy under its live bar. (feature/retrospective
  // is one of the two three-flip pairs held per Solomon's hold 9a3e1a95 -- this is verification
  // evidence for child D's audit, not a decision to keep or roll back.)
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
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B (2026-09-05): user_story's "65->70" line above is
  // the ORIGINAL raise (2026-08-16). Parent SD-003 later measured this SAME cell again and its
  // shadow re-score row 22cbb767-741c-44d0-a669-e8cb62448bbd is VACUOUS -- it re-scored the
  // PRE-raise 65-group (n=17, matching this cell's own "n=17" cited above), never a single
  // assessment scored under the live 70. DO NOT cite that row as post-raise safety evidence. The
  // REAL post-raise number, queried directly against ai_quality_assessments WHERE
  // pass_threshold=70: n=31, pass=27/31 (87.1%), window 2026-08-16..2026-08-29 -- clears the
  // >=10 sample floor, confirms user_story remains healthy under its live bar.
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (2026-09-05): retrospective's pre-fix shadow_rescore
  // rows (d8ae6ef7-f0fc-406e-bd83-1008f0af2516 / 36ab9644-ed14-4c7e-b604-db735d079046) are VACUOUS
  // -- current_threshold=70 (historical), never the live 75. DO NOT cite those rows. The REAL
  // post-raise number, queried directly against ai_quality_assessments WHERE pass_threshold=75:
  // n=2, pass=2/2 (100%) -- BELOW the >=10 sample floor. Unlike the other pairs in this file,
  // this one is INSUFFICIENT DATA under its live bar, not confirmed healthy; flagged as live
  // evidence for child D's audit, not a decision to keep or roll back.
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
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-B (2026-09-05): prd was independently re-verified
  // AFTER this QF, not before it. Parent SD-003's shadow re-score row
  // feedback.id=d9ad5522-654c-4fc2-81e1-ee92ea05c16f (full UUID on one line for greppability)
  // is VACUOUS -- it re-scored the PRE-raise 60-group (n=32), never a single
  // assessment scored under the live 65. DO NOT cite that row as safety evidence. The REAL
  // post-raise number, queried directly against ai_quality_assessments WHERE pass_threshold=65:
  // n=46, pass=45/46 (97.8%), window 2026-08-29..2026-09-05 -- confirms prd remains healthy
  // under its live bar.
  //
  // SD-LEO-INFRA-GATE-THRESHOLD-TUNING-003-E (2026-09-05): retrospective's pre-fix shadow_rescore
  // rows (67062f8d-8208-454a-a4d3-9dbdf5bd6af7 / f73b3e27-09d1-453b-b729-00ffc524be3d) are VACUOUS
  // -- current_threshold=60 (historical), never the live 65. DO NOT cite those rows. The REAL
  // post-raise number, queried directly against ai_quality_assessments WHERE pass_threshold=65:
  // n=76, pass=76/76 (100%) -- clears the >=10 sample floor, confirms retrospective remains
  // healthy under its live bar. (bugfix/retrospective is one of the two three-flip pairs held per
  // Solomon's hold 9a3e1a95 -- this is verification evidence for child D's audit, not a decision
  // to keep or roll back.)
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
