/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 5: stall deltas.
 *
 * Movement since the prior report, on TWO CLOCKS with different units (FR_D), over TWO
 * SUBJECTS that must not be confused (FR_B).
 *
 * ── WHY THE POSITION IS ITS OWN SUBJECT ───────────────────────────────────────────────────
 * FR_B: "wave-gate distance unchanged across the window fires even while items complete, and
 * item completions that do not move the position NEVER reset the position clock."
 *
 * That is the whole point of the section, and it is the opposite of how the existing machinery
 * works. roadmap_wave_items.remainder_state_stamped_at is ITEM-level and is re-stamped by a
 * trigger whenever an item's own disposition changes — so under that mechanism, closing any
 * item at all looks like progress. A team can close ten items a day, never move a single gate,
 * and every item-level clock resets every day while the plan does not advance. Measured at
 * LEAD: nothing in the repo tracks staleness against a position, for any subject.
 *
 * ── TWO CLOCKS, DIFFERENT UNITS (FR_D) ────────────────────────────────────────────────────
 * Item stalls count REPORTS (the natural unit for something the report itself observes).
 * Position stalls count WALL TIME (the natural unit for "the plan has not moved in two days"),
 * and are PARK-AWARE — a park with a satisfied trigger stops suppressing (FR_A, owned by -E;
 * this module consumes the predicate rather than reimplementing it).
 *
 * ── DEPENDS ON APPEND-ONLY ────────────────────────────────────────────────────────────────
 * Every delta here is measured against what the PRIOR REPORT SAID. If a stored observation
 * could be edited after the fact the baseline would move and a delta would keep rendering a
 * number while meaning nothing. That is enforced in the migration by the freeze trigger; this
 * module is the consumer that makes the enforcement load-bearing rather than theoretical.
 */

import { cite, unmeasurable } from '../citation.js';

export const SECTION_ID = 'stall_deltas';

/**
 * Compare the current position against the prior report's.
 *
 * @param {object} args
 * @param {*} args.currentPosition  a comparable position value (wave-gate distance)
 * @param {object|null} args.priorReport  the previous drive_reports row, or null on first run
 * @param {number} args.nowMs
 * @param {boolean} [args.suppressed]  park predicate result, supplied by -E (FR_A)
 * @returns {object} position stall state, on the WALL-TIME clock
 */
export function computePositionStall({ currentPosition, priorReport, nowMs, suppressed = false } = {}) {
  const prior = priorReport?.sections?.[SECTION_ID]?.position;

  // First ever report: there is no baseline, and saying "unmoved for 0ms" would be a claim we
  // have not earned. A first observation is not a stall of length zero, it is no measurement.
  if (!prior) {
    return {
      position: currentPosition,
      moved: null,
      unmoved_since_ms: null,
      first_observation: true,
    };
  }

  const moved = prior.position !== currentPosition;

  return {
    position: currentPosition,
    moved,
    // THE LINE FR_B IS ABOUT. When the position has not moved we carry the ORIGINAL
    // unmoved-since timestamp forward — we do NOT reset it because this report ran, and we do
    // NOT reset it because items closed underneath. The clock belongs to the position.
    unmoved_since_ms: moved ? nowMs : (prior.unmoved_since_ms ?? nowMs),
    suppressed,
    first_observation: false,
  };
}

/**
 * Item-level movement, on the REPORT-COUNT clock.
 *
 * @param {object} args
 * @param {string[]} args.currentItemIds
 * @param {object|null} args.priorReport
 */
export function computeItemDeltas({ currentItemIds = [], priorReport } = {}) {
  const prior = priorReport?.sections?.[SECTION_ID]?.items;
  if (!prior) {
    return { open: currentItemIds, closed: [], opened: [], unmoved_reports: {}, first_observation: true };
  }

  const priorSet = new Set(prior.open || []);
  const currentSet = new Set(currentItemIds);

  const closed = [...priorSet].filter((id) => !currentSet.has(id));
  const opened = currentItemIds.filter((id) => !priorSet.has(id));

  // Count reports, not time — an item the report has observed unmoved three times is the
  // subject the x2/x3/x5 ladder is defined over.
  const unmoved = {};
  for (const id of currentItemIds) {
    if (priorSet.has(id)) unmoved[id] = ((prior.unmoved_reports || {})[id] ?? 0) + 1;
  }

  return { open: currentItemIds, closed, opened, unmoved_reports: unmoved, first_observation: false };
}

/**
 * @returns {object} the section, with both clocks and the churn-independence made explicit
 */
export function buildStallDeltas({ currentPosition, currentItemIds = [], priorReport = null, nowMs, suppressed = false } = {}) {
  if (!Number.isFinite(nowMs)) {
    // Never invent a clock. A delta computed against an unknown "now" is a number with no
    // meaning, and it would render identically to a real one.
    return {
      section: SECTION_ID,
      deltas: unmeasurable({ table: 'drive_reports', predicate: 'movement since the prior report', reason: 'nowMs was not supplied — a delta needs a clock, and inventing one produces a number that renders like a real measurement' }),
    };
  }

  const position = computePositionStall({ currentPosition, priorReport, nowMs, suppressed });
  const items = computeItemDeltas({ currentItemIds, priorReport });

  return {
    section: SECTION_ID,
    position,
    items,

    summary: cite({
      value: { closed: items.closed.length, opened: items.opened.length, position_moved: position.moved },
      table: 'drive_reports',
      row_ids: priorReport?.id ? [priorReport.id] : undefined,
      predicate: 'movement since the immediately prior drive_reports row: item set difference on the REPORT-COUNT clock, and wave-gate position on the WALL-TIME clock. The two are independent BY DESIGN — item completions that do not move the position never reset the position clock',
      source: 'lib/drive-loop/sections/stall-deltas.js',
      limitation: position.first_observation
        ? 'first observation: there is no prior report, so no delta exists. This is not a zero-length stall'
        : undefined,
    }),
  };
}
