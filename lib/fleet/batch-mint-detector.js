/**
 * Batch-mint detector — SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001 (FR-1).
 *
 * IDEMPOTENT RE-SCAN SWEEP, not a mint-time-only check (TESTING finding T-2): a mint-time check can
 * only hold the item currently being minted, so the 1st and 2nd members of an eventual batch may
 * already have flowed (and been claimed) before the 3rd arrives. A periodic re-scan sweep instead
 * groups recent mints per creator and retroactively holds ALL members of any group whose size
 * exceeds BATCH_THRESHOLD within BATCH_WINDOW_MS of the group's first member — including members
 * that already flowed. Because the sweep recomputes the FULL group from scratch every run (rather
 * than incrementally tracking "have I seen 3 yet"), it is also TOCTOU-safe under concurrent mints
 * (TS-10): whichever sweep runs after all racing inserts have landed sees the true group size and
 * holds every member, regardless of what an earlier, partially-informed sweep saw.
 *
 * SCOPE: quick_fixes only (mirrors FR-2/FR-3's QF-scoped correction — strategic_directives_v2 has
 * no comparable creator/routing_tier surface measured live). A mixed QF+SD batch by one creator is
 * NOT detected — creator/created_at live in separate tables with no shared batch key (TS-12).
 */

/** Wall-clock window a batch group is measured within. */
export const BATCH_WINDOW_MS = 10 * 60 * 1000;

/** A group larger than this (i.e. 3rd+ mint) is held. Exactly 2 is NOT held. */
export const BATCH_THRESHOLD = 2;

/**
 * Pure grouping/detection over already-fetched mint rows. No DB, no clock — nowMs is unused for
 * detection itself (grouping is relative to each group's own anchor) but kept in the signature for
 * symmetry with other pure detectors in this codebase and future staleness-based extensions.
 *
 * BOUNDARY: the window test is INCLUSIVE (`delta <= BATCH_WINDOW_MS`) — a mint at exactly the
 * 10:00.000 boundary from the group's anchor is IN the group (TS-12).
 *
 * @param {Array<{id:string, created_by:string, created_at:string}>} mints
 * @returns {{heldIds:Set<string>, groups:Array<{creator:string, memberIds:string[], anchorAt:string}>}}
 */
export function detectBatchMintGroups(mints) {
  const byCreator = new Map();
  for (const m of mints || []) {
    if (!m || !m.created_by || !m.created_at || !m.id) continue;
    const t = Date.parse(m.created_at);
    if (!Number.isFinite(t)) continue;
    if (!byCreator.has(m.created_by)) byCreator.set(m.created_by, []);
    byCreator.get(m.created_by).push({ id: m.id, created_at: m.created_at, _t: t });
  }

  const heldIds = new Set();
  const groups = [];
  for (const [creator, list] of byCreator) {
    list.sort((a, b) => a._t - b._t);
    let i = 0;
    while (i < list.length) {
      const anchor = list[i];
      const group = [anchor];
      let j = i + 1;
      while (j < list.length && (list[j]._t - anchor._t) <= BATCH_WINDOW_MS) {
        group.push(list[j]);
        j++;
      }
      if (group.length > BATCH_THRESHOLD) {
        for (const g of group) heldIds.add(g.id);
        groups.push({ creator, memberIds: group.map((g) => g.id), anchorAt: anchor.created_at });
      }
      // Next candidate group starts fresh after this window — a run of e.g. 5 mints 2min apart from
      // one creator forms ONE group (all within 10min of the anchor), not overlapping sub-groups.
      i = j > i ? j : i + 1;
    }
  }
  return { heldIds, groups };
}

/**
 * DB-fetching wrapper: scan recent QF mints (bounded lookback window) and re-scan for batch groups.
 * Read-only — callers apply the hold (lib/fleet/hold-writer.js writeQfOracleHold) per held id.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{lookbackMs?:number, nowMs?:number}} [opts]
 */
export async function scanRecentQfMintsForBatches(supabaseClient, { lookbackMs = 60 * 60 * 1000, nowMs = Date.now() } = {}) {
  const sinceIso = new Date(nowMs - lookbackMs).toISOString();
  const { data, error } = await supabaseClient
    .from('quick_fixes')
    .select('id, created_by, created_at')
    .gte('created_at', sinceIso)
    .not('created_by', 'is', null);
  if (error) throw new Error(`scanRecentQfMintsForBatches: ${error.message}`);
  return detectBatchMintGroups(data || []);
}

export default { BATCH_WINDOW_MS, BATCH_THRESHOLD, detectBatchMintGroups, scanRecentQfMintsForBatches };
