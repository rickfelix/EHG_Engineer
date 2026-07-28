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
 * It is called from lib/adam/rationale-bar.js selectAdvisory — a production path — because a
 * consumer imported only by its own test is the very thing FR-1 exists to catch, and shipping one
 * would have been this SD failing its own thesis one indirection deeper.
 *
 * Pure: no fs, no DB, no clock.
 */
'use strict';

/**
 * Own-property read. Everything below reads caller-supplied objects, and an INHERITED property is
 * indistinguishable from a supplied one on a normal read — so `Object.prototype.active = true`
 * would make every empty result count as a block and drive the alarm to HEALTHY. Every failure
 * direction there is permissive, which is this module's entire subject pointed at itself.
 */
const own = (o, k) => {
  // The read is wrapped because a throwing getter would escape an otherwise total fold.
  try {
    return o != null && typeof o === 'object' && Object.hasOwn(o, k) ? o[k] : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Reasons meaning THE GUARD NEVER GOT ITS DATA — it could not have blocked, so "why didn't it
 * fire" is answered, not open.
 *
 * ALL SEVEN LIVE REASONS ARE NO-DATA, and I had two of them filed as the opposite. The first
 * version of this module put `empty_aligned_set` and `id_space_mismatch` under EVALUATED, on the
 * reasoning that waves existed so the guard "had its data". The file that emits them says the
 * opposite, twenty lines from the emit: rationale-bar.js:221 "Waves exist but NOTHING is linked =>
 * this term cannot judge alignment", and :248 "Wholly disjoint id spaces mean this term cannot
 * judge alignment, and a term that cannot judge must not judge — the same doctrine as the empty-set
 * case above." Cannot-judge IS no-data.
 *
 * The consequence was measured, not theorised, on the SD's own flagship instance — 8 waves, 0 of
 * 261 roadmap_wave_items carrying linkages, 27 evaluations: the fold reported permissiveNoData: 0
 * and missingInput: null while the no-data branch had fired all 27 times, so FR-2 emitted "no-data
 * branch taken 0x" and named nothing. The alarm built to catch instance 3 was blind to instance 3,
 * in the permissive direction, because of a classification I asserted instead of read. Recorded
 * rather than quietly corrected: this is FR-5's failure mode (an artifact of the SD propagating a
 * claim the SD's own evidence refutes) committed inside the SD itself.
 */
export const NO_DATA_REASONS = Object.freeze([
  // waveAlignmentTerm — all three are "cannot judge" per the emitting file's own docblocks.
  'zero_waves_or_no_alignment',
  'empty_aligned_set',
  'id_space_mismatch',
  // capabilityGapTerm
  'no_gaps_supplied',
  'candidate_has_no_capability',
  'capability_absent_from_gap_map',
  'gap_value_not_a_number',
]);

/**
 * Reasons meaning the guard HAD its data and still declined to act. EMPTY, and deliberately kept.
 *
 * No producer in this repo emits one today: a term that can judge and finds nothing returns
 * `active: true` with a 1.0 multiplier, carrying no reason at all. This is the empty set, not an
 * unpopulated registry — the distinction is real and a future evaluated-and-declined reason must
 * land here rather than inflating the no-data count. Naming it costs one line and stops the next
 * reader from re-deriving the classification from scratch, which is how the inversion above
 * happened.
 */
export const EVALUATED_REASONS = Object.freeze([]);

// Frozen ARRAYS above, private Sets here. `Object.freeze(new Set([...]))` reports isFrozen === true
// while .add/.delete/.clear all still work — a false immutability guarantee, and clearing the set
// would silently collapse permissiveNoData to 0 and suppress the AC-4 explanation. The lookup
// structures are therefore not reachable from outside this module at all.
const NO_DATA = new Set(NO_DATA_REASONS);
const EVALUATED = new Set(EVALUATED_REASONS);

export const REASON_CLASS = Object.freeze({
  NO_DATA: 'no_data',
  EVALUATED: 'evaluated',
  UNCLASSIFIED: 'unclassified',
});

/**
 * Classify one reason string.
 *
 * AN UNKNOWN REASON COUNTS AS NO-DATA, and the direction is the whole decision. Treating it as
 * "not no-data" would mean a newly-added emit silently stops contributing to the count — the
 * permissive answer, arriving quietly, which is the defect class this SD exists to remove.
 * Treating it as no-data can at worst over-report a guard as unable, which is loud and gets fixed.
 * It is also surfaced separately by the fold so an unrecognised reason is visible rather than
 * absorbed into a number that looks deliberate.
 */
export function classifyReason(reason) {
  if (typeof reason !== 'string' || reason.length === 0) return null;
  if (EVALUATED.has(reason)) return REASON_CLASS.EVALUATED;
  if (NO_DATA.has(reason)) return REASON_CLASS.NO_DATA;
  return REASON_CLASS.UNCLASSIFIED;
}

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
 * @returns {{guard, observations, blocked, permissiveNoData, unclassified, missingInput, reasons}}
 */
export function foldTermResults(guard, results = []) {
  const list = Array.isArray(results) ? results : [];
  const reasons = new Map();
  let permissiveNoData = 0;
  let unclassified = 0;
  let blocked = 0;

  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    if (own(r, 'active') === true) { blocked += 1; continue; }  // an ACTIVE term is one that did something
    const reason = typeof own(r, 'inactive_reason') === 'string' ? r.inactive_reason : null;
    if (!reason) continue;
    reasons.set(reason, (reasons.get(reason) || 0) + 1);
    const cls = classifyReason(reason);
    if (cls === REASON_CLASS.NO_DATA) permissiveNoData += 1;
    else if (cls === REASON_CLASS.UNCLASSIFIED) { permissiveNoData += 1; unclassified += 1; }
  }

  // The dominant no-data reason IS the missing input, named. This is the whole value of the emit:
  // a consumer that had to re-derive it would be doing the work the signal exists to save.
  let missingInput = null;
  let top = 0;
  for (const [reason, n] of reasons) {
    if (classifyReason(reason) === REASON_CLASS.EVALUATED) continue;
    if (n > top) { top = n; missingInput = reason; }
  }

  return {
    guard,
    observations: list.length,
    blocked,
    permissiveNoData,
    unclassified,
    missingInput,
    // Null-prototype: the keys are caller-supplied strings, and a `__proto__` or `constructor`
    // key on an ordinary object literal is a foothold this record does not need to offer.
    reasons: Object.assign(Object.create(null), Object.fromEntries(reasons)),
  };
}
