/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 4: the dispatch order, and the next ACT per item.
 *
 * FR-5 calls this a SPLIT: the ORDER is citable from existing state, the ACT and the OWNER are new.
 *   ORDER — metadata.dispatch_rank, already computed (coordinator-backlog-rank.mjs:139-161). Reused.
 *   ACT   — NEW. No script emits a per-item next act anywhere.
 *   OWNER — NEW, and derived from the SD, never from a routing lane (same trap as section 2).
 *
 * ── A REASON IS NOT AN ACT, AND THE TYPE SYSTEM SAYS SO ───────────────────────────────────
 * The near-miss FR-5 names: wsjf-priority-fetcher returns a descriptive REASON STRING — "high
 * value, low effort, unblocked" — and it is top-THREE, not the full order. Prose explaining why
 * something ranks reads exactly like guidance and tells a reader nothing to DO. Someone reaching
 * for it would ship a section that looks complete and moves nothing.
 *
 * So `act` is not a string. It is a member of ACTS, a closed set of imperatives, which makes a
 * descriptive sentence structurally unrepresentable rather than merely discouraged. A free-text
 * field would have been one careless commit away from becoming a reason string again, and nothing
 * would have failed.
 *
 * ── AN UNOWNED ITEM IS REPORTED UNOWNED ───────────────────────────────────────────────────
 * Same decision as section 2, and for the same reason: roadmap_wave_items.lane is the
 * sourcing-engine INTAKE-ROUTING lane, not an owner. Rendering it as one would populate the field
 * on nearly every row, look entirely correct, and name the wrong party. An unowned item at the head
 * of the dispatch order is a real and urgent state — it must be visible, not papered over.
 */

import { cite, unmeasurable } from '../citation.js';

export const SECTION_ID = 'next_acts';

/**
 * The closed set of next acts. Each is an imperative naming what a human or worker DOES next —
 * never a description of the item's condition.
 */
export const ACTS = Object.freeze({
  CLAIM: 'claim',                  // ready, unclaimed: someone picks it up
  UNBLOCK: 'unblock',              // blocked on a named thing: go clear that thing
  SOURCE: 'source',                // plan work with no SD: materialise one
  AWAIT_DECISION: 'await_decision', // blocked on a human ruling: nobody can act but the decider
  RESUME: 'resume',                // claimed but stalled: the holder continues
});
const ACT_VALUES = Object.freeze(Object.values(ACTS));

/** Decide the single next act for one item. Returns a member of ACTS — never prose. */
export function nextAct(item = {}) {
  const sd = item.sd || null;
  if (!sd) return ACTS.SOURCE;
  if (sd.status === 'blocked') {
    // A ruling nobody can substitute for is a different act from a dependency anyone can go clear.
    return sd.blocked_on_decision ? ACTS.AWAIT_DECISION : ACTS.UNBLOCK;
  }
  if (Array.isArray(sd.unmet_dependencies) && sd.unmet_dependencies.length > 0) return ACTS.UNBLOCK;
  if (sd.claiming_session_id) return ACTS.RESUME;
  return ACTS.CLAIM;
}

/** Owner from the SD, or null. NEVER item.lane — that is intake routing, not ownership. */
export function ownerOf(item = {}) {
  const sd = item.sd || null;
  if (sd?.claiming_session_id) return { owner: sd.claiming_session_id, basis: 'active claim on the SD' };
  if (sd?.owner_lane) return { owner: sd.owner_lane, basis: 'SD owner_lane' };
  return { owner: null, basis: sd ? 'SD exists but is unclaimed and has no owner lane' : 'no SD — the item is unsourced' };
}

/**
 * @param {object[]} items backlog items carrying {id, title, metadata:{dispatch_rank}, sd}
 */
export function buildNextActs(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      section: SECTION_ID,
      order: unmeasurable({
        table: 'strategic_directives_v2',
        predicate: 'backlog items ordered by metadata.dispatch_rank',
        reason: 'no backlog items were readable — an empty dispatch order and an unreadable one are '
          + 'different claims, and reporting the second as the first would show a clear belt',
      }),
    };
  }

  // Items with no dispatch_rank are NOT rank 0 — that would sort them to the front of the queue.
  const ranked = items.filter((i) => Number.isFinite(i?.metadata?.dispatch_rank));
  const unranked = items.filter((i) => !Number.isFinite(i?.metadata?.dispatch_rank));
  const sorted = [...ranked].sort((a, b) => a.metadata.dispatch_rank - b.metadata.dispatch_rank);

  const acts = sorted.map((i) => {
    const { owner, basis } = ownerOf(i);
    return {
      item_id: i.id,
      title: i.title,
      dispatch_rank: i.metadata.dispatch_rank,
      act: nextAct(i),        // a member of ACTS, never prose
      owner,
      owner_basis: basis,
    };
  });

  return {
    section: SECTION_ID,
    order: cite({
      value: acts,
      table: 'strategic_directives_v2',
      row_ids: sorted.map((i) => i.id),
      predicate: 'backlog items ordered by the EXISTING metadata.dispatch_rank (coordinator-backlog-rank), '
        + 'each carrying the single next ACT to take. `act` is a member of a closed imperative set, '
        + 'never a descriptive reason string — prose explaining why an item ranks reads like guidance '
        + `and moves nothing. Items with no dispatch_rank (${unranked.length} here) are EXCLUDED rather `
        + 'than defaulted to 0, which would sort them to the front of the queue',
      limitation: unranked.length > 0
        ? `${unranked.length} item(s) have no dispatch_rank and are absent from this order entirely`
        : undefined,
      source: 'lib/drive-loop/sections/next-acts.js buildNextActs',
    }),
    unowned_count: cite({
      value: acts.filter((a) => a.owner === null).length,
      table: 'strategic_directives_v2',
      row_ids: acts.filter((a) => a.owner === null).map((a) => a.item_id),
      predicate: 'items in the dispatch order with no derivable owner. Owner comes from the SD only — '
        + 'roadmap_wave_items.lane is intake routing and would name the wrong party on nearly every row',
      source: 'lib/drive-loop/sections/next-acts.js buildNextActs',
    }),
  };
}

/** Exported for the test that proves no act can be prose. */
export function isAct(v) {
  return ACT_VALUES.includes(v);
}
