/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 3: four-case belt diagnosis.
 *
 * Unsourced plan work / blocked / pending-chairman / legitimately in-flight.
 *
 * ── WHY THIS IS A NEW CLASSIFIER AND NOT A REUSE ──────────────────────────────────────────
 * Three overlapping classifiers already exist and none of them can serve, measured at LEAD:
 *   - scripts/coordinator-backlog-rank.mjs:257-369 (computeClaimableLeaves skip reasons)
 *   - scripts/coordinator-capacity-forecast.mjs:275-297 (its own independent excludes loop)
 *   - roadmap_wave_items.remainder_state (a third vocabulary)
 *
 * Two failures make them unusable here, and both are the kind that would look fine in output:
 *
 * 1. NONE HAS AN UNSOURCED-PLAN-WORK BUCKET. Every one of them classifies SDs — work that
 *    already exists. A roadmap item with NO SD at all is invisible to all three, because it
 *    never enters their population. That bucket is the whole point of this section: it is the
 *    plan work nobody has materialised, and a belt diagnosis that cannot see it will report a
 *    healthy belt while the plan quietly goes unsourced.
 *
 * 2. TWO OF THEM CONFLATE BLOCKED WITH IN-FLIGHT. dep_blocked and
 *    in_flight_or_sequence_blocked both fold "waiting on something" together with "someone is
 *    working on it". Those are opposite diagnoses — one needs an unblock, the other needs to be
 *    left alone — and separating them is the reason the four-case diagnosis exists. Reusing
 *    either vocabulary unchanged collapses the distinction while still producing four buckets.
 *
 * The classifier is PURE — rows in, buckets out, no client — so the discrimination can be
 * tested directly rather than inferred from a rendered report.
 */

import { cite } from '../citation.js';

export const SECTION_ID = 'belt_diagnosis';

export const CASES = Object.freeze({
  UNSOURCED: 'unsourced_plan_work',
  BLOCKED: 'blocked',
  PENDING_CHAIRMAN: 'pending_chairman',
  IN_FLIGHT: 'in_flight',
});

/**
 * Classify ONE roadmap item. Order matters and is deliberate.
 *
 * @param {object} item roadmap_wave_items row joined to its SD (sd may be null)
 * @returns {string|null} a CASES value, or null when the item is not belt-relevant
 */
export function classifyItem(item = {}) {
  const sd = item.sd || null;

  // Terminal or discarded items are not belt state at all. Returning null rather than a
  // fifth bucket keeps "the four cases" literally true instead of nearly true.
  if (item.remainder_state === 'void' || item.item_disposition === 'dropped') return null;
  if (sd && ['completed', 'cancelled'].includes(sd.status)) return null;

  // PENDING-CHAIRMAN FIRST. A chairman-gated item may ALSO look blocked or unsourced; the
  // gate is the operative fact because it names who has to act. Checked before the others so
  // an item waiting on the chairman is never reported as something the fleet can unblock.
  if (item.remainder_state === 'gated_on_chairman' || item.lane === 'chairman-gated') {
    return CASES.PENDING_CHAIRMAN;
  }

  // UNSOURCED: plan work with no SD behind it. THE BUCKET NO EXISTING CLASSIFIER HAS, because
  // all three start from a population of SDs and this item never joins one.
  if (!item.promoted_to_sd_key || !sd) return CASES.UNSOURCED;

  // BLOCKED vs IN-FLIGHT — the distinction two existing vocabularies collapse.
  // Blocked means something else must happen first. It is a property of the DEPENDENCY, and
  // it is NOT implied by the absence of a claim.
  const blockedLane = typeof item.lane === 'string' && item.lane.startsWith('blocked-on-');
  if (blockedLane || sd.status === 'blocked' || (Array.isArray(sd.unmet_dependencies) && sd.unmet_dependencies.length > 0)) {
    return CASES.BLOCKED;
  }

  // In-flight means someone is actually working it — an active claim, not merely a non-blocked
  // SD. An unclaimed, unblocked SD is NEITHER: it is sourced work waiting on the belt, which
  // is in-flight only in the sense that it exists. Treating "not blocked" as "in flight" is
  // how a starved belt reports as busy.
  if (sd.claiming_session_id || ['in_progress', 'active', 'pending_approval'].includes(sd.status)) {
    return CASES.IN_FLIGHT;
  }

  // Sourced, unblocked, unclaimed — dispatchable and waiting. It belongs with unsourced work
  // in the sense that nobody is acting on it, but it is NOT unsourced: the SD exists. Reported
  // as its own honest answer rather than forced into one of the four.
  return null;
}

/**
 * @param {object[]} items roadmap items joined to their SDs
 * @returns {object} the section, every count a cited value
 */
export function buildBeltDiagnosis(items = []) {
  const buckets = {
    [CASES.UNSOURCED]: [],
    [CASES.BLOCKED]: [],
    [CASES.PENDING_CHAIRMAN]: [],
    [CASES.IN_FLIGHT]: [],
  };

  for (const item of items) {
    const c = classifyItem(item);
    if (c) buckets[c].push(item);
  }

  const PREDICATES = {
    [CASES.UNSOURCED]: 'open roadmap_wave_items with no promoted SD — plan work nobody has materialised. Invisible to every existing belt classifier, because all three start from a population of SDs this item never joins',
    [CASES.BLOCKED]: 'items whose SD is blocked, carries unmet dependencies, or sits on a blocked-on-* lane — something else must happen first. NOT implied by the absence of a claim',
    [CASES.PENDING_CHAIRMAN]: 'items gated on the chairman. Evaluated FIRST, because a gated item may also look blocked or unsourced and the gate is the fact that names who must act',
    [CASES.IN_FLIGHT]: 'items whose SD is actively claimed or in progress — someone is working it. An unclaimed unblocked SD is NOT in-flight; treating not-blocked as in-flight is how a starved belt reports as busy',
  };

  const section = { section: SECTION_ID, cases: {} };
  for (const [key, rows] of Object.entries(buckets)) {
    section.cases[key] = cite({
      value: rows.length,
      table: 'roadmap_wave_items',
      row_ids: rows.map((r) => r.id),
      predicate: PREDICATES[key],
      source: 'lib/drive-loop/sections/belt-diagnosis.js classifyItem',
    });
  }
  return section;
}
