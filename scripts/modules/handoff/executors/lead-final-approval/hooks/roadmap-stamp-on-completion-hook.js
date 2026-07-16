/**
 * roadmap-stamp-on-completion-hook — SD-LEO-INFRA-PLAN-OF-RECORD-LINKAGE-001 (FR-1)
 *
 * On SD completion, flip item_disposition to 'promoted' for any roadmap_wave_items row
 * already linked (promoted_to_sd_key) to the completing SD, so the LEO Roadmap plan-of-record
 * self-maintains instead of drifting stale (today only creation/promotion-time paths stamp
 * promoted_to_sd_key; completion never advances item_disposition). Fire-and-forget, mirroring
 * the sibling hooks in this directory — a failure here must never block or fail the SD
 * completion itself (caller in index.js wraps this call in its own try/catch).
 */
import { stampRoadmapItemsOnCompletion } from '../../../../../../lib/roadmap/roadmap-completion-stamp.js';

/**
 * @param {object} sd the completed SD row (has sd_key/id)
 * @param {object} supabase service-role client
 * @returns {Promise<{outcome: string, updated: number}>}
 */
export async function runRoadmapStampOnCompletionHook(sd, supabase) {
  return stampRoadmapItemsOnCompletion(supabase, sd);
}
