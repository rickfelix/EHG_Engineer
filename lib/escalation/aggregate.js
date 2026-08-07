/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — the aggregation guard.
 *
 * Two independent properties, and MISSING EITHER ONE PRODUCES A FLOOD OR A SILENCE. Both were
 * established by reading the precedent rather than inheriting the SD scope's summary of it.
 *
 * ── 1. THE CAP IS PER-TICK, NEVER PER-TARGET ────────────────────────────────────────────────
 * lib/adam/inbound-backlog-watchdog.js records why, from a case that already happened:
 *   "NO copy of MAX_PROBES_PER_TICK=5. That cap is per-TARGET, and every inbound row shares a
 *    single target (Adam), so a literal copy structurally collapses to 1 and would cap the
 *    alarm rather than bound it."
 * -E's x5 rung has exactly that shape — every chairman escalation shares ONE target. A
 * per-target cap there does not bound the noise; it SILENCES the alarm, and it does so while
 * looking like prudent rate-limiting. Worse, it passes a naive test: with one target, a single
 * emitted row IS the expected output. Only an N>cap same-target fixture can tell a bound from a
 * silencer, which is what TS-5 exists to be.
 *
 * ── 2. AGGREGATION HAS TWO HALVES, AND THE SD SCOPE NAMES ONLY ONE ──────────────────────────
 * The scope cites lib/adam/stall-alert.js:301-306 as "caps escalation at ONE digest per tick
 * regardless of stall count". VERIFIED TRUE — and incomplete. The same block implements
 * QF-20260703-860, which also caps ACROSS TICKS: while a pending digest exists it is SUPERSEDED
 * (summary/context refreshed in place) instead of a fresh row being inserted.
 *
 * Implementing only the within-tick half yields one row per tick — emitted EVERY tick for as
 * long as the item stays unmoved. Same flood, slower axis. And because the ladder is inherently
 * repeating, an unmoved item is the NORMAL case rather than an edge case, so the omission fires
 * constantly rather than rarely.
 *
 * NO WRITES LIVE HERE. The caller supplies find/insert/update, which keeps this unit testable
 * without a database and keeps -E's acting code off any path reachable from the report job
 * (-B scope bullet 10).
 */

/**
 * Cap on digest decisions emitted in ONE TICK, across all items sharing a lane.
 *
 * NAMED FOR WHAT IT BOUNDS. The name is the guard: `MAX_DIGESTS_PER_TICK` cannot be silently
 * reinterpreted as per-recipient the way a bare `MAX_ESCALATIONS` can. See property 1 above.
 */
export const MAX_DIGESTS_PER_TICK = 1;

/**
 * Aggregate one lane's stalls for one tick into at most MAX_DIGESTS_PER_TICK actions.
 *
 * @param {object[]} stalls        stalls already routed to a single lane this tick
 * @param {object}   io
 * @param {Function} io.findPending  async () => existing pending digest | null
 * @param {Function} io.insert       async (digest) => created row
 * @param {Function} io.update       async (id, patch) => updated row
 * @param {string}   [lane]
 * @returns {Promise<{action:'none'|'inserted'|'superseded', count:number, id:string|null}>}
 */
export async function aggregateLane(stalls, io, lane = 'unknown') {
  const items = Array.isArray(stalls) ? stalls : [];
  if (items.length === 0) return { action: 'none', count: 0, id: null };

  for (const k of ['findPending', 'insert', 'update']) {
    if (typeof io?.[k] !== 'function') {
      throw new TypeError(`[aggregate] io.${k} must be a function — refusing to guess a write path`);
    }
  }

  // The count reported is the count of ITEMS AGGREGATED, not the count of rows emitted. That
  // distinction is the whole point: N stalls collapse to ONE decision, and the decision must
  // still carry N so the reader knows the scale. A cap that also truncated the count would
  // reproduce the silencer.
  const count = items.length;
  const ids = items.map((s) => s.id);

  const existing = await io.findPending();

  if (existing) {
    // CROSS-TICK HALF. Refresh in place. The pending decision keeps its identity, so any
    // downstream "already notified" stamp on it stays valid and the recipient is not re-pinged
    // for a condition they have already seen. This is what makes an item that stays unmoved for
    // 50 ticks produce ~1 row rather than 50.
    await io.update(existing.id, {
      count,
      item_ids: ids,
      lane,
      updated_at: new Date().toISOString(),
    });
    return { action: 'superseded', count, id: existing.id };
  }

  // WITHIN-TICK HALF. One insert regardless of how many items are in `items`.
  const row = await io.insert({ count, item_ids: ids, lane });
  return { action: 'inserted', count, id: row?.id ?? null };
}
