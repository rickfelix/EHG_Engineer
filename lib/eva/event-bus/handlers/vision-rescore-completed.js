/**
 * Handler: vision.rescore_completed
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-D (US-003)
 *
 * Handles events when post-completion rescoring finishes.
 * Logs dimension improvement, updates gap scores, closes resolved gaps,
 * and updates OKR key_results for vision-linked KRs.
 *
 * Payload: { sdKey, previousScore, newScore, dimensionDelta, scoreId, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

const GAP_RESOLUTION_THRESHOLD = 80;

/**
 * Register vision.rescore_completed subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionRescoreCompletedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.RESCORE_COMPLETED, async ({ sdKey, previousScore, newScore, dimensionDelta }) => {
    const delta = newScore - previousScore;
    const direction = delta >= 0 ? '+' : '';
    console.log(`[VisionBus] Rescore completed: ${sdKey} score=${previousScore}→${newScore} (${direction}${delta})`);
    if (dimensionDelta && Object.keys(dimensionDelta).length > 0) {
      for (const [dim, change] of Object.entries(dimensionDelta)) {
        const d = change >= 0 ? '+' : '';
        console.log(`  ${dim}: ${d}${change}`);
      }
    }
  });

  // Subscriber 2: Update eva_vision_gaps scores and close resolved gaps
  subscribeVisionEvent(VISION_EVENTS.RESCORE_COMPLETED, async ({ sdKey, dimensionDelta, supabase }) => {
    if (!supabase) return;
    if (!dimensionDelta || Object.keys(dimensionDelta).length === 0) return;

    try {
      // Fetch open gaps for this SD's dimensions
      const dimensionIds = Object.keys(dimensionDelta);
      const { data: gaps, error: fetchError } = await supabase
        .from('eva_vision_gaps')
        .select('id, dimension_id, score')
        .eq('sd_id', sdKey || '')
        .in('dimension_id', dimensionIds)
        .in('status', ['open', 'in_progress']);

      if (fetchError || !gaps) return;

      for (const gap of gaps) {
        const delta = dimensionDelta[gap.dimension_id] || 0;
        const newScore = (gap.score || 0) + delta;
        const newStatus = newScore >= GAP_RESOLUTION_THRESHOLD ? 'closed' : gap.score < GAP_RESOLUTION_THRESHOLD ? 'open' : 'in_progress';

        const { error: updateError } = await supabase
          .from('eva_vision_gaps')
          .update({
            score: newScore,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gap.id);

        if (updateError) {
          console.warn(`[VisionBus] Failed to update gap ${gap.id}: ${updateError.message}`);
        }
      }
    } catch (err) {
      console.warn(`[VisionBus] eva_vision_gaps rescore update error: ${err.message}`);
    }
  });

  // Subscriber 3: Update OKR key_results for vision-linked KRs
  subscribeVisionEvent(VISION_EVENTS.RESCORE_COMPLETED, async ({ dimensionDelta, supabase }) => {
    if (!supabase) return;
    if (!dimensionDelta || Object.keys(dimensionDelta).length === 0) return;

    try {
      const dimensionCodes = Object.keys(dimensionDelta);

      // Find active KRs linked to these vision dimensions
      const { data: krs, error: krFetchError } = await supabase
        .from('key_results')
        .select('id, vision_dimension_code, current_value')
        .in('vision_dimension_code', dimensionCodes)
        .eq('is_active', true);

      if (krFetchError || !krs) return;

      for (const kr of krs) {
        const delta = dimensionDelta[kr.vision_dimension_code] || 0;
        const newValue = (kr.current_value || 0) + delta;

        const { error: updateError } = await supabase
          .from('key_results')
          .update({
            current_value: newValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', kr.id);

        if (updateError) {
          console.warn(`[VisionBus] Failed to update KR ${kr.id}: ${updateError.message}`);
        }
      }
    } catch (err) {
      console.warn(`[VisionBus] key_results rescore update error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionRescoreCompletedHandlers() {
  _registered = false;
}
