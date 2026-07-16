/**
 * roadmap-completion-stamp — SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 FR-1
 *
 * Today, roadmap_wave_items.promoted_to_sd_key is stamped at SD-creation/promotion time
 * (lib/sd-creation/source-adapters/roadmap-item.js, lib/integrations/roadmap-manager.js,
 * lib/sourcing-engine/refill-auto-promote.js) but item_disposition never advances to its
 * CHECK-legal terminal value ('promoted') at SD-COMPLETION time. This closes that gap.
 *
 * item_disposition CHECK only allows (pending, selected, deferred, brainstormed, promoted,
 * dropped) — 'done' is NOT legal (DATABASE sub-agent finding, evidence 325c9993). 'promoted'
 * is the terminal marker this stamps.
 *
 * promoted_to_sd_key is NOT unique (up to ~4 wave items can map to one SD), so this is a bulk
 * update, never .single().
 */

/**
 * @param {object} supabase injected Supabase client (service role)
 * @param {{sd_key?: string, id?: string}} sd the just-completed SD row
 * @returns {Promise<{outcome: string, updated: number}>}
 */
export async function stampRoadmapItemsOnCompletion(supabase, sd) {
  const sdKey = sd?.sd_key || sd?.id;
  if (!sdKey) return { outcome: 'no_sd_key', updated: 0 };

  const { data, error } = await supabase
    .from('roadmap_wave_items')
    .update({ item_disposition: 'promoted' })
    .eq('promoted_to_sd_key', sdKey)
    .neq('item_disposition', 'promoted')
    .select('id');

  if (error) throw new Error(`roadmap-completion-stamp: ${error.message}`);

  const updated = Array.isArray(data) ? data.length : 0;
  return { outcome: updated > 0 ? 'stamped' : 'no_match', updated };
}
