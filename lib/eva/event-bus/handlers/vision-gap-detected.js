/**
 * Handler: vision.gap_detected
 * SD: SD-CORR-VIS-A05-EVENT-BUS-001
 *
 * Writes detected vision gaps to the eva_vision_gaps table for tracking
 * and triggers downstream corrective workflows.
 *
 * Payload: { sdKey, dimension, dimId, score, threshold, scoreId, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.gap_detected subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionGapDetectedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async ({ sdKey, dimension, score, threshold }) => {
    console.log(`[VisionBus] Gap detected: ${sdKey} dimension=${dimension} score=${score} threshold=${threshold}`);
  });

  // Subscriber 2: Write gap to eva_vision_gaps table.
  // Live columns: dimension_key, dimension_score, vision_score_id — the legacy
  // names did not exist, and threshold/detection timestamps have no live columns.
  // eva_vision_gaps has NO unique constraint on (sd_id, dimension_key), so an
  // on-conflict upsert is invalid — select-then-update-else-insert instead
  // (SD-LEO-FIX-FIX-PHANTOM-COLUMN-002).
  subscribeVisionEvent(VISION_EVENTS.GAP_DETECTED, async ({ sdKey, dimension, dimId, score, threshold: _threshold, scoreId, supabase }) => {
    if (!supabase) return;
    try {
      const dimensionKey = dimId || dimension;
      const { data: existing, error: selectError } = await supabase
        .from('eva_vision_gaps')
        .select('id')
        .eq('sd_id', sdKey)
        .eq('dimension_key', dimensionKey)
        .limit(1)
        .maybeSingle();

      if (selectError) {
        console.warn(`[VisionBus] Failed to check existing gap: ${selectError.message}`);
        return;
      }

      const row = {
        sd_id: sdKey,
        dimension_key: dimensionKey,
        dimension_name: dimension,
        dimension_score: score,
        vision_score_id: scoreId || null,
        status: 'open',
      };

      const { error } = existing
        ? await supabase.from('eva_vision_gaps').update({ ...row, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from('eva_vision_gaps').insert(row);

      if (error) {
        console.warn(`[VisionBus] Failed to write gap to eva_vision_gaps: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] eva_vision_gaps write error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionGapDetectedHandlers() {
  _registered = false;
}
