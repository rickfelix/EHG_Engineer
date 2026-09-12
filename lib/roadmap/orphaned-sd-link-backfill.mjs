/**
 * Orphaned SD-link backfill + exit predicate — QF-20260911-229.
 *
 * ROOT CAUSE: applyWaveDisposition (lib/roadmap/wave-disposition.js) inserted roadmap_wave_items
 * rows carrying metadata.source_key = the caller's sourceKey (which for the
 * 'orchestrator_sd_creation' / sd-creation-pipeline callers IS the just-created SD's own sd_key)
 * WITHOUT ever stamping promoted_to_sd_key in that same write. Six live rows proved the gap: each
 * named an existing (five already-completed) SD while sitting item_disposition='pending',
 * promoted_to_sd_key=NULL indefinitely -- refill-auto-promote re-selected them hourly and
 * promoted 0 every time. wave-disposition.js is now fixed to stamp the link at insert time (when
 * sourceKey resolves to an existing SD); this module is the CORRECTIVE backfill for rows created
 * before that fix, reusable as the (c) exit predicate so a regression or an unrelated register
 * path introducing the same gap is caught going forward.
 *
 * Uses ONLY the pre-existing canonical writers -- no raw/ad-hoc UPDATE:
 *   - buildTwoWayStamp (lib/sourcing-engine/register-first.js) stamps promoted_to_sd_key.
 *   - stampRoadmapItemsOnCompletion (lib/roadmap/roadmap-completion-stamp.js) then advances
 *     item_disposition to 'promoted' for items whose linked SD is ALREADY completed -- never
 *     hand-picked, and never applied to a non-terminal SD (a row linked to a draft/active/deferred
 *     SD keeps its current disposition; it advances naturally once that SD completes, now that the
 *     link exists for the completion-stamp trigger to find).
 *   - remainder_state is never hand-set: the roadmap_wave_items_stamp_remainder DB trigger
 *     recomputes it automatically on every UPDATE this module performs.
 */
import { buildTwoWayStamp } from '../sourcing-engine/register-first.js';
import { stampRoadmapItemsOnCompletion } from './roadmap-completion-stamp.js';
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

/**
 * Find every roadmap_wave_items row that is item_disposition='pending', promoted_to_sd_key=NULL,
 * and carries a metadata.source_key that resolves to a REAL, existing strategic_directives_v2 row
 * -- the exact orphan shape. This IS the (c) exit predicate: candidates.length === 0 means the
 * defect class has zero live instances.
 * @param {object} supabase
 * @returns {Promise<Array<{item: object, sd: {sd_key: string, status: string}}>>}
 */
export async function findOrphanedSdLinkedItems(supabase) {
  const rows = await fetchAllPaginated(() => supabase
    .from('roadmap_wave_items')
    .select('id, item_disposition, promoted_to_sd_key, source_type, source_id, metadata')
    .eq('item_disposition', 'pending')
    .is('promoted_to_sd_key', null)
    .order('id', { ascending: true }));

  const candidates = rows.filter((r) => typeof r.metadata?.source_key === 'string' && r.metadata.source_key.trim());
  if (candidates.length === 0) return [];

  const keys = [...new Set(candidates.map((r) => r.metadata.source_key))];
  const { data: sds, error } = await supabase
    .from('strategic_directives_v2').select('sd_key, status').in('sd_key', keys);
  if (error) throw new Error(`findOrphanedSdLinkedItems: SD lookup failed: ${error.message}`);

  const sdByKey = new Map((sds || []).map((s) => [s.sd_key, s]));
  return candidates
    .filter((r) => sdByKey.has(r.metadata.source_key))
    .map((r) => ({ item: r, sd: sdByKey.get(r.metadata.source_key) }));
}

/**
 * Backfill every orphan found by findOrphanedSdLinkedItems. Dry-run by default (counts what WOULD
 * happen, writes nothing), matching this repo's dormant-safe backfill convention.
 * @param {object} supabase
 * @param {{apply?: boolean}} [opts]
 * @returns {Promise<{candidates:number, stamped:number, promoted:number, dry_run:boolean, errors:Array}>}
 */
export async function backfillOrphanedSdLinkedItems(supabase, { apply = false } = {}) {
  const orphans = await findOrphanedSdLinkedItems(supabase);
  const result = { candidates: orphans.length, stamped: 0, promoted: 0, dry_run: !apply, errors: [] };
  if (orphans.length === 0) return result;

  const completedSdKeys = new Set();
  for (const { item, sd } of orphans) {
    if (!apply) {
      result.stamped++;
      if (sd.status === 'completed') completedSdKeys.add(sd.sd_key);
      continue;
    }
    const stamp = buildTwoWayStamp(item, sd.sd_key, null);
    const { error } = await supabase.from('roadmap_wave_items').update(stamp.roadmap).eq('id', item.id);
    if (error) { result.errors.push({ id: item.id, error: error.message }); continue; }
    result.stamped++;
    if (sd.status === 'completed') completedSdKeys.add(sd.sd_key);
  }

  if (!apply) { result.promoted = completedSdKeys.size; return result; }

  for (const sdKey of completedSdKeys) {
    try {
      const { updated } = await stampRoadmapItemsOnCompletion(supabase, { sd_key: sdKey });
      result.promoted += updated;
    } catch (e) {
      result.errors.push({ sd_key: sdKey, error: e.message });
    }
  }
  return result;
}
