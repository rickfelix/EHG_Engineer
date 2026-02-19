/**
 * Standard U.S. grading scale thresholds (0-100).
 *
 * Each constant represents the MINIMUM score for that grade.
 * Source: Standard U.S. academic grading conventions.
 *
 * Used by:
 *   scripts/eva/vision-scorer.js                         (EVA vision quality gates)
 *   scripts/eva/corrective-sd-generator.mjs              (corrective SD thresholds)
 *   lib/sub-agents/vetting/rubric-evaluator.js           (LLM scoring scale prompt)
 *   scripts/modules/leo-summary/compliance-scorer.js     (handoff compliance gate)
 *   scripts/uat-quality-gate-checker.js                  (UAT pass rate gate)
 *   lib/uat/result-recorder.js                           (GREEN/YELLOW/RED gate)
 *   lib/uat/route-aware-reporter.js                      (route-aware UAT summary)
 *   scripts/leo-sd-validator.js                          (SD validation grade display)
 *   lib/websocket/leo-events.ts                          (gate:updated passed flag)
 */

export const GRADE = {
  A_PLUS:  97,  // 97-100
  A:       93,  // 93-96
  A_MINUS: 90,  // 90-92
  B_PLUS:  87,  // 87-89
  B:       83,  // 83-86
  B_MINUS: 80,  // 80-82
  C_PLUS:  77,  // 77-79
  C:       73,  // 73-76
  C_MINUS: 70,  // 70-72
  D_PLUS:  67,  // 67-69
  D:       63,  // 63-66
  D_MINUS: 60,  // 60-62
  F:        0,  // 0-59
};
