/**
 * Handler: vision.process_gap_detected
 * SD: SD-CORR-VIS-A05-EVENT-BUS-001
 *
 * Handles process gap detection events from process-gap-reporter.mjs.
 * Logs for observability and upserts to issue_patterns for tracking.
 *
 * Payload: { gapType, dimension, description, severity, avgScore, sdIds, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register vision.process_gap_detected subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerVisionProcessGapDetectedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, async ({ gapType, description, sdIds, severity }) => {
    const sdInfo = sdIds?.length ? ` [${sdIds.length} SDs]` : '';
    console.log(`[VisionBus] Process gap detected${sdInfo}: type=${gapType} severity=${severity || 'unknown'} — ${description}`);
  });

  // Subscriber 2: Upsert to issue_patterns for tracking
  subscribeVisionEvent(VISION_EVENTS.PROCESS_GAP_DETECTED, async ({ gapType, dimension, description, severity, avgScore, sdIds, supabase }) => {
    if (!supabase || !dimension) return;
    try {
      const patternId = `PGAP-${(dimension || 'unknown').replace(/[^A-Z0-9]/gi, '').substring(0, 13)}`;

      const { data: existing } = await supabase
        .from('issue_patterns')
        .select('id, occurrence_count')
        .eq('pattern_id', patternId)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('issue_patterns')
          .update({
            severity: severity || 'medium',
            issue_summary: description,
            occurrence_count: (existing[0].occurrence_count || 1) + 1,
            trend: 'increasing',
            updated_at: new Date().toISOString(),
            metadata: {
              gap_type: gapType,
              avg_score: avgScore,
              affected_sd_ids: (sdIds || []).slice(0, 5),
              last_event: new Date().toISOString(),
            },
          })
          .eq('id', existing[0].id);
      }
      // New patterns are created by process-gap-reporter directly; handler only updates existing
    } catch (err) {
      console.warn(`[VisionBus] issue_patterns upsert error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetVisionProcessGapDetectedHandlers() {
  _registered = false;
}
