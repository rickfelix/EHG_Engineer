/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 1: plan position.
 *
 * "Active wave remainder with SD-join status (promoted != done)."
 *
 * THIS SECTION IS A CITATION, NOT A COMPUTATION. That is a ruling, not a preference
 * (coordinator 2c526b33 + 0d80b0df): the report CITES computePlanCheckStatus as the single
 * wave-rollup representation rather than becoming a fourth independent derivation over
 * roadmap_waves. Three such derivations already exist — plan-check-status, the daily-review
 * roadmap-status-doc, and the morning-brief sweep — and single-representation already holds at
 * the view layer (all three read v_plan_of_record_remainder) while breaking above it.
 *
 * ── WHY open_total AND NOT next.length ────────────────────────────────────────────────────
 * `next` is capped at 10 and `committing` at 5. Before the enrichment shipped in this child,
 * the return carried no total and no truncation flag, so a caller could not distinguish "there
 * are 10 open items" from "there are 300 and you were handed 10". For a section whose subject
 * is the REMAINDER, taking next.length would be a wrong number rather than a short list — and
 * it would look completely reasonable in the output. The caps stay a DISPLAY choice; the total
 * is the DATA. Reading next.length here is the single most likely way to get this section
 * wrong, which is why it is called out rather than left to a comment on the field.
 */

import { cite, unmeasurable } from '../citation.js';

export const SECTION_ID = 'plan_position';

/**
 * @param {object} deps
 * @param {Function} deps.computePlanCheckStatus  injected so this is testable without a DB —
 *   and so the citation target is explicit at the call site rather than an import side effect
 * @param {object} deps.supabase
 * @returns {Promise<object>} the section, built entirely from cited values
 */
export async function buildPlanPosition({ computePlanCheckStatus, supabase } = {}) {
  if (typeof computePlanCheckStatus !== 'function') {
    throw new Error('buildPlanPosition: computePlanCheckStatus must be injected — the citation target is part of the contract, not an implementation detail');
  }

  let status;
  try {
    status = await computePlanCheckStatus(supabase);
  } catch (err) {
    // Fail loud, never zero. An unreadable rollup reports UNMEASURABLE with its cause; a 0 here
    // would render as "the plan is complete", which is the most dangerous possible false
    // reading of this particular section.
    return {
      section: SECTION_ID,
      remainder: unmeasurable({
        table: 'v_plan_of_record_remainder',
        predicate: 'open roadmap_wave_items on approved waves of the canonical roadmap, excluding items whose promoted SD is completed',
        reason: `computePlanCheckStatus failed: ${err.message}`,
      }),
    };
  }

  const CITED_SOURCE = 'lib/roadmap/plan-check-status.js computePlanCheckStatus';

  // The enrichment this child shipped is what makes an honest remainder possible at all.
  const hasTotal = Number.isInteger(status.open_total);

  return {
    section: SECTION_ID,

    remainder: hasTotal
      ? cite({
        value: status.open_total,
        table: 'v_plan_of_record_remainder',
        // Deliberately NOT status.next.map(...) — those are the capped ten. Row ids for the
        // full remainder are not available from this return, and claiming the ten as if they
        // were the remainder's rows would be a citation that points at a subset while the
        // value describes the whole. The limitation below says so instead of pretending.
        predicate: 'count of open roadmap_wave_items on approved waves of the canonical roadmap, where an item is open unless its promoted_to_sd_key resolves to a completed SD (promoted != done)',
        source: CITED_SOURCE,
        limitation: status.next_truncated
          ? 'row ids are available only for the first 10 items; the count is the full remainder, the row ids are not'
          : undefined,
      })
      : unmeasurable({
        table: 'v_plan_of_record_remainder',
        predicate: 'count of open roadmap_wave_items on approved waves of the canonical roadmap',
        // The pre-enrichment shape. If this ever fires it means the report is running against
        // a computePlanCheckStatus that predates the enrichment — better to say so than to
        // silently fall back to next.length and report 10 forever.
        reason: 'computePlanCheckStatus returned no open_total — the enrichment is missing, and next.length is a cap rather than a count',
      }),

    // The capped lists are still worth carrying, but they are labelled as what they are.
    next: cite({
      value: status.next.length,
      table: 'v_plan_of_record_remainder',
      row_ids: status.next.map((n) => n.item_id),
      predicate: 'the first 10 open items in wave sequence_rank then priority_rank order — a DISPLAY window, not the remainder',
      source: CITED_SOURCE,
      limitation: status.next_truncated ? 'truncated: more open items exist than are listed here' : undefined,
    }),

    done_recent: cite({
      value: status.done.length,
      table: 'roadmap_wave_items',
      row_ids: status.done.map((d) => d.item_id),
      predicate: 'items whose promoted SD reached completed within the window — a stamped item whose SD was CANCELLED is deliberately excluded',
      source: CITED_SOURCE,
    }),

    slipped: cite({
      value: status.slipped.length,
      table: 'roadmap_wave_items',
      row_ids: status.slipped.map((s) => s.item_id),
      predicate: 'items on the persisted forward list that are still not closed',
      source: CITED_SOURCE,
    }),
  };
}
