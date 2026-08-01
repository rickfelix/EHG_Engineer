/**
 * AXIS 6 — LEARNING-LOOP CONVERSION. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-3.
 *
 * "Recorded lessons become preventions."
 *
 * THIS AXIS SHIPS PINNED TO UNMEASURABLE, AND THAT IS THE MOST IMPORTANT LINE OF OUTPUT IN THE SD.
 * Conversion is not measured anywhere in this repo, and the gap is a deliberate design exclusion
 * rather than an oversight:
 *
 *   lib/governance/per-loop-health-gauges.js declares LOOPS_WITHOUT_PREVENT containing
 *   'C_retro_learn' and returns {applicable:false, count:0} for it. The gauge registry builds its
 *   entry with a COMPUTED id — `loop-health-${loopId}` over LOOP_IDS — and a
 *   tripWhen of (result) => (result?.count || 0) > 0.
 *
 * VERIFIED BY EXECUTION, not by grep: LOOP_IDS contains C_retro_learn, loop-health-C_retro_learn is
 * registered with enabled=true, and tripWhen({count:0}) returns false. So the one loop that literally
 * IS "recorded lessons become preventions" is registered, enabled, and STRUCTURALLY INCAPABLE OF
 * TRIPPING. (A reviewer refuted this with a text search and found nothing — because the id is
 * interpolated, a literal grep is the wrong instrument and its empty result was not a refutation.)
 *
 * Its INPUTS are also broken, routed separately as critical and explicitly out of scope here: the
 * write path throws a unique violation so a recorded lesson is DESTROYED rather than duplicated, and
 * the read path samples a categorically-ineligible slice so zero eligible patterns can ever surface.
 *
 * SO: the discriminator below is implemented and tested against constructed state, ready the moment
 * those inputs are repaired — but the adapter reports UNMEASURABLE WITH A CITATION. Reporting CLEAR
 * here would be the exact defect this SD exists to detect, committed inside the detector for it.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');

const AXIS = 'learning_conversion';

/** Why this axis cannot be measured today. Cited verbatim in the verdict so a reader can check it. */
const BLOCKED_REASON = 'conversion_gauge_structurally_untrippable';
const BLOCKED_CITATION =
  'learning-conversion: UNMEASURABLE — per-loop-health-gauges LOOPS_WITHOUT_PREVENT contains ' +
  'C_retro_learn returning count:0, and the registry tripWhen is count>0, so loop-health-C_retro_learn ' +
  'is registered+enabled yet can never trip (verified by execution). Inputs are separately broken and ' +
  'routed as critical: recorded lessons are destroyed on write, and the read path surfaces none.';

/**
 * THE DISCRIMINATOR, ready for the repaired world. Pure, no I/O, no wall clock.
 *
 * Conversion is measured as: a lesson that was RECORDED and then RE-WITNESSED after its prevention
 * landed did NOT convert. A lesson recorded, prevented, and not seen again DID. Counting recorded
 * lessons — which is all the existing statistics do — measures filing, not prevention.
 *
 * @param {object} s {recorded:number, prevented:number, reWitnessedAfterPrevention:number}
 */
function classifyConversion(s) {
  if (!s || typeof s.recorded !== 'number' || typeof s.prevented !== 'number') return null;
  if (s.recorded === 0) return { state: STATE.UNMEASURABLE, reason: 'no_lessons_recorded' };
  if (typeof s.reWitnessedAfterPrevention !== 'number') return { state: STATE.UNMEASURABLE, reason: 'recurrence_unmeasured' };
  // A prevention that did not prevent is the stall. Filing more lessons is not motion on this axis.
  return s.reWitnessedAfterPrevention > 0
    ? { state: STATE.STALLED, reason: 'prevention_did_not_prevent' }
    : { state: STATE.CLEAR, reason: 'no_recurrence_after_prevention' };
}

// eslint-disable-next-line no-unused-vars
async function fetch(_supabase, _opts) {
  // Deliberately fetches nothing. The inputs this axis would need are broken upstream, and querying
  // them would produce numbers that look like measurements — a recorded-lesson count is not a
  // conversion rate, and presenting one as the other is the confusion this axis exists to refuse.
  return { blocked: true };
}

function classify(state, clock) {
  return {
    axis: AXIS,
    state: STATE.UNMEASURABLE,
    reason: BLOCKED_REASON,
    citation: BLOCKED_CITATION,
    owed: null, in_motion: null, stalled: null,
    action_taken: ACTION.UNVERIFIABLE
  };
}

module.exports = { AXIS, fetch, classify, classifyConversion, BLOCKED_REASON, BLOCKED_CITATION };
