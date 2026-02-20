/**
 * Handler: leo.pattern_resolved
 * SD: SD-EHG-ORCH-INTELLIGENCE-INTEGRATION-001-D (US-001)
 *
 * Handles events when /learn workflow resolves issue_patterns via resolveLearningItems().
 * Marks resolved patterns in issue_patterns table and logs for memory pruning triggers.
 *
 * Payload: { sdKey, resolvedPatternIds, resolvedCount, supabase }
 */

import { subscribeVisionEvent, VISION_EVENTS } from '../vision-events.js';

let _registered = false;

/**
 * Register leo.pattern_resolved subscribers.
 * Idempotent — safe to call multiple times.
 */
export function registerLeoPatternResolvedHandlers() {
  if (_registered) return;

  // Subscriber 1: Log for observability
  subscribeVisionEvent(VISION_EVENTS.PATTERN_RESOLVED, async ({ sdKey, resolvedPatternIds, resolvedCount }) => {
    const count = resolvedCount || (resolvedPatternIds || []).length;
    console.log(`[VisionBus] Patterns resolved: ${count} pattern(s) via SD ${sdKey || '(unknown)'}`);
  });

  // Subscriber 2: Mark patterns as resolved in issue_patterns
  subscribeVisionEvent(VISION_EVENTS.PATTERN_RESOLVED, async ({ sdKey, resolvedPatternIds, supabase }) => {
    if (!supabase) return;
    if (!resolvedPatternIds || resolvedPatternIds.length === 0) return;

    try {
      const { error } = await supabase
        .from('issue_patterns')
        .update({
          status: 'resolved',
          resolution_notes: `Resolved by SD ${sdKey || '(unknown)'}`,
          updated_at: new Date().toISOString(),
        })
        .in('id', resolvedPatternIds);

      if (error) {
        console.warn(`[VisionBus] Failed to resolve patterns: ${error.message}`);
      }
    } catch (err) {
      console.warn(`[VisionBus] issue_patterns resolve error: ${err.message}`);
    }
  });

  _registered = true;
}

/** Reset registration flag (for testing only). */
export function _resetLeoPatternResolvedHandlers() {
  _registered = false;
}
