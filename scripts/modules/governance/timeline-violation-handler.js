/**
 * Timeline Violation Handler
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-007-03 (FR-003)
 *
 * When the Day-28 blocking gate fires during sd-start.js, this module:
 * 1. Creates an escalation record in eva_orchestration_events
 * 2. Bumps SD priority to 'critical' if currently lower
 * 3. Returns a structured error for the caller
 */

import { createClient } from '@supabase/supabase-js';

const DEFAULT_AGE_THRESHOLD_DAYS = 28;

/**
 * Load the SD age block threshold from leo_config.
 * @param {Object} supabase
 * @returns {Promise<number>}
 */
export async function loadAgeThreshold(supabase) {
  try {
    const { data } = await supabase
      .from('leo_config')
      .select('value')
      .eq('key', 'sd_age_block_days')
      .single();

    if (data?.value != null) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_AGE_THRESHOLD_DAYS;
}

/**
 * Check if an SD exceeds the age threshold.
 *
 * @param {Object} options
 * @param {Object} options.supabase - Supabase client
 * @param {string} options.sdKey - SD key (e.g., SD-XXX-001)
 * @param {string} options.sdUuid - SD UUID
 * @param {string} options.createdAt - SD created_at timestamp
 * @param {number} [options.thresholdDays] - Override threshold (default: from leo_config or 28)
 * @returns {Promise<{blocked: boolean, ageDays: number, threshold: number}>}
 */
export async function checkSDAge({ supabase, sdKey, sdUuid, createdAt, thresholdDays = null }) {
  const threshold = thresholdDays ?? await loadAgeThreshold(supabase);
  const created = new Date(createdAt);
  const now = new Date();
  const ageDays = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

  return {
    blocked: ageDays > threshold,
    ageDays,
    threshold,
  };
}

/**
 * Handle a timeline violation: create escalation event and bump priority.
 *
 * @param {Object} options
 * @param {Object} options.supabase - Supabase client
 * @param {string} options.sdKey - SD key
 * @param {string} options.sdUuid - SD UUID
 * @param {number} options.ageDays - SD age in days
 * @param {number} options.threshold - Threshold that was exceeded
 * @param {string} options.currentPriority - Current SD priority
 * @param {boolean} [options.isOverride=false] - Whether --force was used
 * @returns {Promise<{escalationEventId: string|null, priorityBumped: boolean, error: string|null}>}
 */
export async function handleTimelineViolation({
  supabase,
  sdKey,
  sdUuid,
  ageDays,
  threshold,
  currentPriority,
  isOverride = false,
}) {
  let escalationEventId = null;
  let priorityBumped = false;

  // 1. Create escalation event in eva_orchestration_events
  try {
    const eventData = {
      sd_key: sdKey,
      sd_id: sdUuid,
      age_days: ageDays,
      threshold,
      violation_type: 'sd_age_exceeded',
      recommended_actions: [
        'Complete the SD immediately if work is near-done',
        'Defer the SD to next cycle if blocked',
        'Cancel the SD if it is no longer relevant',
        'Escalate to chairman for review',
      ],
      override_used: isOverride,
    };

    const { data, error } = await supabase
      .from('eva_orchestration_events')
      .insert({
        event_type: isOverride ? 'chairman_override' : 'escalation',
        event_source: 'timeline_violation_handler',
        event_data: eventData,
        chairman_flagged: true,
      })
      .select('event_id')
      .single();

    if (error) {
      console.warn(`[timeline-violation] Failed to persist escalation event: ${error.message}`);
    } else {
      escalationEventId = data.event_id;
    }
  } catch (err) {
    console.warn(`[timeline-violation] Event creation error: ${err.message}`);
  }

  // 2. Bump SD priority to 'critical' if currently lower (and not an override)
  if (!isOverride && currentPriority !== 'critical') {
    try {
      const { error: updateErr } = await supabase
        .from('strategic_directives_v2')
        .update({ priority: 'critical' })
        .eq('id', sdUuid);

      if (updateErr) {
        console.warn(`[timeline-violation] Priority bump failed: ${updateErr.message}`);
      } else {
        priorityBumped = true;
      }
    } catch (err) {
      console.warn(`[timeline-violation] Priority bump error: ${err.message}`);
    }
  }

  return { escalationEventId, priorityBumped, error: null };
}

/**
 * Build the structured error message for the blocked SD.
 *
 * @param {Object} options
 * @param {string} options.sdKey
 * @param {number} options.ageDays
 * @param {number} options.threshold
 * @returns {string}
 */
export function formatBlockMessage({ sdKey, ageDays, threshold }) {
  return [
    '',
    `  ❌ SD AGE BLOCK: ${sdKey}`,
    `  ${'═'.repeat(50)}`,
    `  Age:       ${ageDays} days`,
    `  Threshold: ${threshold} days`,
    `  Status:    BLOCKED — SD exceeds maximum age`,
    '',
    '  Recommended Actions:',
    '    1. Complete the SD if work is near-done',
    '    2. Defer to next cycle if blocked on dependencies',
    '    3. Cancel if no longer relevant',
    '    4. Use --force flag for chairman override',
    '',
    `  Override: npm run sd:start ${sdKey} -- --force`,
    `  ${'═'.repeat(50)}`,
    '',
  ].join('\n');
}
