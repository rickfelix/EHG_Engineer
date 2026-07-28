/**
 * THE NAMED CONSUMER of inactive_reason. SD-LEO-INFRA-PURE-GUARD-UNWIRED-001 FR-4.
 *
 * WHY THIS FILE IS THE POINT OF FR-4, and why FR-4 was demoted from first to last. Instance 3
 * ALREADY emits inactive_reason — shipped by SD-LEO-INFRA-ADAM-WORK-SELECTION-001, three distinct
 * reasons at rationale-bar.js:214/:230/:252 — and detectability did not change at all, because
 * nothing read them. The emit was correct and insufficient. The SD's own counterfactual is exactly
 * this: six months on, the emits exist, no consumer reads them, and the codebase has three more log
 * lines and the same blindness.
 *
 * So the deliverable is NOT another emit. It is a reader that CHANGES ITS ANSWER because the signal
 * is there. This converts a term's self-reported reason into the observation record FR-2's alarm
 * consumes, which is what turns "0 blocks this week" into either "quiet" or "structurally unable".
 *
 * Pure: no fs, no DB, no clock.
 */
'use strict';

/**
 * Reasons that mean THE GUARD NEVER GOT ITS DATA, as opposed to reasons that mean it evaluated
 * and found nothing. The two are different findings and must not collapse:
 *   - no-data      → the guard could not have blocked; chasing "why didn't it fire" is wasted work
 *   - evaluated    → the guard ran on real input and legitimately found nothing
 */
export const NO_DATA_REASONS = Object.freeze(new Set([
  'zero_waves_or_no_alignment',
  'no_gaps_supplied',
  'candidate_has_no_capability',
  'capability_absent_from_gap_map',
  'gap_value_not_a_number',
]));

/** Reasons that mean the guard DID have data and still declined to act. */
export const EVALUATED_REASONS = Object.freeze(new Set([
  'empty_aligned_set',
  'id_space_mismatch',
]));

/**
 * Fold a batch of term results into the observation record FR-2's alarm consumes.
 *
 * THE BEHAVIOURAL CHANGE FR-4 REQUIRES (AC-3): the presence of inactive_reason alters the output.
 * Without it a batch of inactive terms yields observations>0 and no explanation, so FR-2 reports
 * SUSPECT and an operator goes looking for a cause. With it, the same batch reports WHICH input was
 * absent and how often — turning an investigation into a fix.
 *
 * @param {string} guard
 * @param {Array<{active?:boolean, inactive_reason?:string}>} results one entry per evaluation
 * @returns {{guard, observations, blocked, permissiveNoData, missingInput, reasons}}
 */
export function foldTermResults(guard, results = []) {
  const list = Array.isArray(results) ? results : [];
  const reasons = new Map();
  let permissiveNoData = 0;
  let blocked = 0;

  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    if (r.active === true) { blocked += 1; continue; }   // an ACTIVE term is one that did something
    const reason = typeof r.inactive_reason === 'string' ? r.inactive_reason : null;
    if (reason) reasons.set(reason, (reasons.get(reason) || 0) + 1);
    if (reason && NO_DATA_REASONS.has(reason)) permissiveNoData += 1;
  }

  // The dominant no-data reason IS the missing input, named. This is the whole value of the emit:
  // a consumer that had to re-derive it would be doing the work the signal exists to save.
  let missingInput = null;
  let top = 0;
  for (const [reason, n] of reasons) {
    if (NO_DATA_REASONS.has(reason) && n > top) { top = n; missingInput = reason; }
  }

  return {
    guard,
    observations: list.length,
    blocked,
    permissiveNoData,
    missingInput,
    reasons: Object.fromEntries(reasons),
  };
}
