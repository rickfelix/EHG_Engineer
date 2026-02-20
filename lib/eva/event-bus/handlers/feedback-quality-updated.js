/**
 * Handler: feedback.quality_updated
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-E (FR-004)
 *
 * Handles events when feedback items are classified against vision dimensions.
 * Logs for observability and updates aggregate metrics.
 *
 * Payload: { feedbackId, title, dimensionMatches, rubricScore, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register feedback.quality_updated subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerFeedbackQualityUpdatedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED, async ({ feedbackId, title, dimensionMatches }) => {
    const dimCount = dimensionMatches?.length || 0;
    const topDim = dimCount > 0 ? dimensionMatches[0].dimensionId : 'none';
    const topConf = dimCount > 0 ? dimensionMatches[0].confidence : 0;
    console.log(
      `[VisionBus] Feedback classified: ${feedbackId} "${(title || '').substring(0, 60)}" → ${dimCount} dimension(s), top=${topDim} (${topConf})`
    );
  });

  // Subscriber 2: Persist dimension codes to feedback metadata for future aggregation
  subscribeVisionEvent(VISION_EVENTS.FEEDBACK_QUALITY_UPDATED, async ({ feedbackId, dimensionMatches, supabase }) => {
    if (!supabase || !feedbackId) return;
    if (!dimensionMatches || dimensionMatches.length === 0) return;

    try {
      // Read current metadata, merge dimension_codes, write back
      const { data: existing, error: readError } = await supabase
        .from('feedback')
        .select('metadata')
        .eq('id', feedbackId)
        .single();

      if (readError) {
        console.warn(`[VisionBus] Failed to read feedback ${feedbackId}: ${readError.message}`);
        return;
      }

      const metadata = existing?.metadata || {};
      metadata.dimension_codes = dimensionMatches.map(m => m.dimensionId);
      metadata.dimension_classifications = dimensionMatches.map(m => ({
        id: m.dimensionId,
        name: m.name,
        confidence: m.confidence,
      }));

      const { error: updateError } = await supabase
        .from('feedback')
        .update({ metadata, updated_at: new Date().toISOString() })
        .eq('id', feedbackId);

      if (updateError) {
        console.warn(`[VisionBus] Failed to update feedback dimensions: ${updateError.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] feedback dimension persist error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetFeedbackQualityUpdatedHandlers() {
  _registered = false;
}
