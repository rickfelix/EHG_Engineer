/**
 * AXIS 3 — ROADMAP MOTION. SD-FDBK-INFRA-ENCODE-FULL-SPECTRUM-001, FR-2.
 *
 * "Does committed roadmap work advance?"
 *
 * SHIPS UNMEASURABLE. Unlike axis 6, which is pinned because its inputs are broken upstream, this
 * axis is pinned because MOTION IS A RATE AND NO CLOCK EXISTS TO DIVIDE BY. Every figure below was
 * measured against the live population (1864 rows, not a sample) on 2026-08-01.
 *
 * FOUR FINDINGS, in the order they killed four different implementations:
 *
 * 1. THE ORDINAL IS VESTIGIAL, NOT NEGLECTED. roadmap_wave_items.priority_rank is non-null on 17 of
 *    1864 rows (0.9%), and 16 of those 17 are still 'pending'. The roadmap does not order by numeric
 *    rank at all — it organizes by `lane` and `item_disposition`, the latter non-null on 1864 of 1864.
 *    So the PRD's original "ordinal position" requirement asked for a concept this domain does not
 *    use. Populating priority_rank would fill a column nothing reads.
 *
 * 2. THE COMMITMENT STAMP IS A ONE-SHOT BACKFILL, NOT A PER-ITEM CLOCK. remainder_state_stamped_at
 *    is non-null on 1864 of 1864 — which reads like a complete commitment clock and is not one.
 *    1843 of 1864 carry a stamp 8-14 days old, written by a SINGLE writer
 *    ('stamp_plan_of_record_remainder_state') in one pass. Only 21 coincide with created_at.
 *    CONSEQUENCE, VERIFIED: the query "promotable_now, stamped more than 14d ago, never promoted"
 *    returns ZERO — not because nothing is stalled, but because NOTHING IN THE TABLE IS OLDER THAN
 *    THE BACKFILL. A stall detector built on that threshold reports CLEAR forever and its test passes.
 *    This is the same structural blindness as axis 1's `escalated: false` — a threshold the input
 *    cannot cross — and it was one probe away from being shipped here.
 *
 * 3. WRITING promoted_to_sd_key IS NOT ADVANCEMENT. 364 rows carry one; all 348 distinct keys resolve
 *    to real SDs. The outcomes are 226 cancelled, 121 completed, 14 deferred, 3 draft. Counting the
 *    key as motion would have scored 364 advances where the majority were abandonments.
 *
 * 4. ...AND THE ABANDONMENTS ARE MOSTLY DELIBERATE, SO THE INVERSE READING IS ALSO WRONG. The
 *    cross-tabulation is a PERFECT PARTITION: every cancelled SD's item is 'void', every completed
 *    SD's item is 'satisfied_elsewhere', zero crossover. remainder_state is therefore a PROJECTION OF
 *    strategic_directives_v2.status, not an independent signal — treating both as evidence would
 *    double-count one observation. And the cancellation reasons that exist read "Chairman final cut",
 *    "Chairman dropped", "All items already built in codebase", "Product pivot — chairman-authorized".
 *    Voiding an item after a chairman cut is the roadmap WORKING. Reporting STALLED on that ratio
 *    would be a false alarm — the mirror image of the blindness this SD exists to detect.
 *
 * WHAT WOULD MAKE IT MEASURABLE. Not a store: roadmap_baseline_snapshots already exists, is TIER-1
 * extendable, has a live writer (lib/integrations/baseline-manager.js) and appends without collision.
 * It holds 2 rows, versions 1 and 2, from 2026-03-08/09 — and its own approved_at is NULL on both
 * because baseline-manager.js:68-77 never writes that column. What is missing is a PER-ITEM
 * COMMITMENT DATE and a RE-BASELINE CADENCE, so that two observations exist to difference. Motion
 * cannot be computed from one snapshot of state, however completely that state is populated.
 *
 * Sourced as a named child rather than guessed at: SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001.
 */

'use strict';

const { STATE, ACTION } = require('../contract.cjs');

const AXIS = 'roadmap_motion';

const BLOCKED_REASON = 'no_per_item_commitment_clock';
const BLOCKED_CITATION =
  'roadmap-motion: UNMEASURABLE — motion is a rate and no clock exists. Measured 2026-08-01 over the ' +
  'full 1864-row population: priority_rank non-null on 17 (0.9%, vestigial — the roadmap orders by ' +
  'lane/disposition); remainder_state_stamped_at non-null on 1864 but 1843 carry one bulk backfill ' +
  'stamp 8-14d old from a single writer, so the "stalled past 14d" query returns 0 by construction, ' +
  'not by health; and remainder_state partitions PERFECTLY with SD status (cancelled=void 226, ' +
  'completed=satisfied_elsewhere 121, zero crossover), making it a projection of that status rather ' +
  'than independent evidence. Storage is NOT the blocker — roadmap_baseline_snapshots exists, is ' +
  'TIER-1 extendable, and holds 2 rows from 2026-03. A per-item commitment date plus a re-baseline ' +
  'cadence are required to difference two observations. Child: SD-FDBK-INFRA-ROADMAP-COMMITMENT-CLOCK-001.';

/**
 * THE DISCRIMINATOR, ready for a world that has a commitment clock. Pure, no I/O, no wall clock.
 *
 * Deliberately takes commitment DATES, not states — because the whole finding above is that state is
 * fully populated and still insufficient. If a future caller can only supply states, this signature
 * makes that shortfall a type error rather than a silent CLEAR.
 *
 * @param {object} s {committed:[{id, committedAt}], advanced:Set<id>, voidedByDecision:Set<id>, asOf:number, stallDays:number}
 */
function classifyMotion(s) {
  if (!s || !Array.isArray(s.committed) || !(s.advanced instanceof Set)) return null;
  if (s.committed.length === 0) return { state: STATE.UNMEASURABLE, reason: 'no_committed_items' };

  const dated = s.committed.filter((c) => Number.isFinite(Date.parse(c && c.committedAt)));
  if (dated.length === 0) return { state: STATE.UNMEASURABLE, reason: 'no_parseable_commitment_dates' };

  // A single distinct commitment date across the whole set is a backfill, not a clock — the exact
  // condition measured live today. Refuse rather than compute an age against a batch timestamp.
  const distinctDays = new Set(dated.map((c) => Math.floor(Date.parse(c.committedAt) / 86400000)));
  if (distinctDays.size <= 1) return { state: STATE.UNMEASURABLE, reason: 'commitment_dates_are_a_single_backfill' };

  const cutoff = s.asOf - (s.stallDays || 30) * 86400000;
  const voided = s.voidedByDecision instanceof Set ? s.voidedByDecision : new Set();
  // Deliberately excluded from the stall set: an item voided by an explicit decision did not fail to
  // move, it was removed from the plan. Counting it as a stall reports scope discipline as neglect.
  const stalled = dated.filter((c) => !s.advanced.has(c.id) && !voided.has(c.id) && Date.parse(c.committedAt) < cutoff);

  return stalled.length > 0
    ? { state: STATE.STALLED, reason: 'committed_items_past_stall_window', stalled: stalled.length }
    : { state: STATE.CLEAR, reason: 'no_committed_item_past_stall_window', stalled: 0 };
}

// eslint-disable-next-line no-unused-vars
async function fetch(_supabase, _opts) {
  // Fetches nothing, for the same reason axis 6 does: the counts this axis could return (1426
  // promotable_now, 364 promoted, 121 completed) are real numbers that are not a motion rate, and
  // presenting a state census as motion is precisely the confusion being refused.
  return { blocked: true };
}

// eslint-disable-next-line no-unused-vars
function classify(_state, _clock) {
  return {
    axis: AXIS,
    state: STATE.UNMEASURABLE,
    reason: BLOCKED_REASON,
    citation: BLOCKED_CITATION,
    owed: null, in_motion: null, stalled: null,
    action_taken: ACTION.UNVERIFIABLE
  };
}

module.exports = { AXIS, fetch, classify, classifyMotion, BLOCKED_REASON, BLOCKED_CITATION };
