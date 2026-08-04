/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-B — Section 2: chain to the next wave gate.
 *
 * "The single chain, current blocker, owner lane."
 *
 * ── ENTIRELY NEW, WHICH MEANS THE DEFINITIONS ARE MINE ────────────────────────────────────
 * Measured at LEAD: no chain, next-gate or owner-lane concept exists anywhere in the repo.
 * Nothing to reuse means nothing to inherit, so the three definitions below are decisions, and
 * they are written down rather than left implicit in the code:
 *
 *   GATE    — the lowest-sequence_rank approved wave that still has open items. A wave with no
 *             open items has been passed; the gate is the first one you have not.
 *   CHAIN   — the open items in that gate wave, ordered by priority_rank. Not every open item
 *             everywhere: the point of "the SINGLE chain" is that it names what stands between
 *             now and the next gate, and a list spanning three waves is a backlog, not a chain.
 *   BLOCKER — the FIRST item in that chain that cannot proceed. Not the first item; the first
 *             STUCK one. A chain whose head is simply unclaimed is not blocked, it is waiting,
 *             and reporting "waiting" as "blocked" sends someone to unblock nothing.
 *
 * ── THE TRAP, MEASURED AND NAMED ──────────────────────────────────────────────────────────
 * roadmap_wave_items.lane carries a parametric blocked-on-X value, and lib/sourcing-engine/
 * deferred-watcher.js:36 already parses the blocker id back out of it. That parser is genuinely
 * reusable. THE LANE ITSELF IS NOT AN OWNER — it is the sourcing-engine INTAKE-ROUTING lane for
 * pre-promotion items. Rendering lane as owner would populate the field on every row and look
 * entirely correct while naming the wrong thing, and nobody downstream could tell.
 *
 * So the owner is derived from the SD, or reported UNOWNED. An unowned blocker is a real and
 * important state — it means the thing standing in front of the gate has nobody accountable —
 * and it must be visible rather than papered over with a plausible-looking lane string.
 */

import { cite, unmeasurable } from '../citation.js';

export const SECTION_ID = 'chain_to_gate';
export const BLOCKED_LANE_PREFIX = 'blocked-on-';

/** @returns {string|null} the blocker id a blocked-on-* lane names, or null */
export function parseBlockedOn(lane) {
  if (typeof lane !== 'string' || !lane.startsWith(BLOCKED_LANE_PREFIX)) return null;
  const id = lane.slice(BLOCKED_LANE_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

/**
 * Who owns this item. Derived from the SD — NEVER from item.lane.
 * @returns {{owner: string|null, basis: string}} basis says HOW we know, so a reader can judge it
 */
export function resolveOwner(item = {}) {
  const sd = item.sd || null;
  if (sd?.claiming_session_id) return { owner: sd.claiming_session_id, basis: 'active claim on the SD' };
  if (sd?.owner_lane) return { owner: sd.owner_lane, basis: 'SD owner_lane' };
  // Deliberately NOT falling back to item.lane. It would fill this field on nearly every row
  // with an intake-routing value and read as an owner.
  return { owner: null, basis: sd ? 'SD exists but is unclaimed and has no owner lane' : 'no SD — the item is unsourced' };
}

/**
 * @param {object[]} waves approved waves with {id, title, sequence_rank}
 * @param {object[]} items open roadmap items joined to their SDs
 */
export function resolveChain(waves = [], items = []) {
  const openByWave = new Map();
  for (const it of items) {
    if (!openByWave.has(it.wave_id)) openByWave.set(it.wave_id, []);
    openByWave.get(it.wave_id).push(it);
  }

  const gate = [...waves]
    .sort((a, b) => (a.sequence_rank ?? Infinity) - (b.sequence_rank ?? Infinity))
    .find((w) => (openByWave.get(w.id) || []).length > 0) || null;

  if (!gate) return { gate: null, chain: [], blocker: null };

  const chain = (openByWave.get(gate.id) || [])
    .slice()
    .sort((a, b) => (a.priority_rank ?? Infinity) - (b.priority_rank ?? Infinity));

  // The first STUCK item, not the first item. Waiting is not blocked.
  const blocker = chain.find((it) => {
    if (parseBlockedOn(it.lane)) return true;
    if (it.sd?.status === 'blocked') return true;
    if (Array.isArray(it.sd?.unmet_dependencies) && it.sd.unmet_dependencies.length > 0) return true;
    return false;
  }) || null;

  return { gate, chain, blocker };
}

export function buildChainToGate({ waves = [], items = [] } = {}) {
  if (!Array.isArray(waves) || waves.length === 0) {
    return {
      section: SECTION_ID,
      gate: unmeasurable({ table: 'roadmap_waves', predicate: 'lowest-sequence_rank approved wave with open items', reason: 'no approved waves were readable — the chain cannot be located, which is different from having reached the last gate' }),
    };
  }

  const { gate, chain, blocker } = resolveChain(waves, items);

  if (!gate) {
    return {
      section: SECTION_ID,
      gate: cite({
        value: null,
        table: 'roadmap_waves',
        predicate: 'lowest-sequence_rank approved wave with open items — none found, meaning every approved wave is clear',
        // The null IS the finding: a cleared plan. Required by cite() since 738432e4e04, which
        // admits a null observation only when the caller states what it signifies — otherwise a
        // consumer reading a bare null cannot tell "nothing is next" from "nobody looked".
        null_means: 'no wave is gating — every approved wave is clear',
        source: 'lib/drive-loop/sections/chain-to-gate.js resolveChain',
      }),
      chain_length: cite({ value: 0, table: 'roadmap_wave_items', row_ids: [], predicate: 'open items in the gate wave', source: 'lib/drive-loop/sections/chain-to-gate.js' }),
      blocker: null,
    };
  }

  const ownerInfo = blocker ? resolveOwner(blocker) : null;

  return {
    section: SECTION_ID,

    gate: cite({
      value: { wave_id: gate.id, title: gate.title, sequence_rank: gate.sequence_rank },
      table: 'roadmap_waves',
      row_ids: [gate.id],
      predicate: 'the lowest-sequence_rank approved wave that still has open items — the first gate not yet passed',
      source: 'lib/drive-loop/sections/chain-to-gate.js resolveChain',
    }),

    chain_length: cite({
      value: chain.length,
      table: 'roadmap_wave_items',
      row_ids: chain.map((c) => c.id),
      predicate: 'open items in the GATE WAVE ONLY, ordered by priority_rank. Deliberately not open items across all waves — that is a backlog, and "the single chain" means what stands between now and the next gate',
      source: 'lib/drive-loop/sections/chain-to-gate.js resolveChain',
    }),

    blocker: blocker
      ? cite({
        value: {
          item_id: blocker.id,
          title: blocker.title,
          blocked_on: parseBlockedOn(blocker.lane),
          owner: ownerInfo.owner,
          owner_basis: ownerInfo.basis,
        },
        table: 'roadmap_wave_items',
        row_ids: [blocker.id],
        predicate: 'the FIRST item in the chain that cannot proceed — a blocked-on-* lane, a blocked SD, or unmet dependencies. NOT merely the first item: an unclaimed head is waiting, not blocked, and reporting waiting as blocked sends someone to unblock nothing',
        source: 'lib/drive-loop/sections/chain-to-gate.js resolveChain',
        limitation: ownerInfo.owner === null
          ? `blocker has no derivable owner (${ownerInfo.basis}). Reported as unowned rather than falling back to item.lane, which is the sourcing-engine intake-routing lane and would name the wrong thing on nearly every row`
          : undefined,
      })
      : cite({
        value: null,
        table: 'roadmap_wave_items',
        predicate: 'no item in the chain is blocked — the chain is moving or waiting on capacity, which is a different diagnosis from blocked',
        // "Nothing blocks" is an answer, not an absence of one — and it is a DIFFERENT answer from
        // "waiting on capacity", which is why it must be said rather than left as a bare null.
        null_means: 'nothing in the chain is blocked — moving or waiting on capacity, not blocked',
        source: 'lib/drive-loop/sections/chain-to-gate.js resolveChain',
      }),
  };
}
