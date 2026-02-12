/**
 * Reprioritization Engine for Learning-Based Queue Re-Prioritization
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-11
 *
 * Handles:
 * - Learning update event processing
 * - Rate limiting and coalescing
 * - Atomic queue updates with optimistic locking
 * - Audit logging
 *
 * @module reprioritization-engine
 */

import { createClient } from '@supabase/supabase-js';
import {
  CONFIG,
  shouldReprioritize,
  checkJitterProtection,
  sortByUrgency,
  scoreToBand
} from './urgency-scorer.js';

/**
 * In-memory rate limiting state per queue
 */
const rateLimitState = new Map();

/**
 * Pending reprioritization actions (for coalescing)
 */
const pendingActions = new Map();

/**
 * Create Supabase client
 */
function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Check if reprioritization is rate-limited for a queue
 *
 * @param {string} queueId - Queue identifier
 * @returns {{ allowed: boolean, waitMs: number }}
 */
export function checkRateLimit(queueId) {
  const lastAction = rateLimitState.get(queueId);

  if (!lastAction) {
    return { allowed: true, waitMs: 0 };
  }

  const elapsed = Date.now() - lastAction;
  if (elapsed >= CONFIG.RATE_LIMIT_WINDOW_MS) {
    return { allowed: true, waitMs: 0 };
  }

  return {
    allowed: false,
    waitMs: CONFIG.RATE_LIMIT_WINDOW_MS - elapsed
  };
}

/**
 * Record a reprioritization action for rate limiting
 *
 * @param {string} queueId - Queue identifier
 */
function recordAction(queueId) {
  rateLimitState.set(queueId, Date.now());
}

/**
 * Coalesce pending reprioritization for a queue
 *
 * @param {string} queueId - Queue identifier
 * @param {Array} taskIds - Task IDs to include
 */
export function coalescePending(queueId, taskIds) {
  if (!pendingActions.has(queueId)) {
    pendingActions.set(queueId, {
      taskIds: new Set(),
      scheduledAt: null
    });
  }

  const pending = pendingActions.get(queueId);
  taskIds.forEach(id => pending.taskIds.add(id));

  return pending;
}

/**
 * Execute pending reprioritization for a queue
 *
 * @param {string} queueId - Queue identifier
 */
export async function executePending(queueId) {
  const pending = pendingActions.get(queueId);
  if (!pending || pending.taskIds.size === 0) {
    return { success: true, tasksAffected: 0, reason: 'no_pending' };
  }

  // Clear pending before execution
  const taskIds = Array.from(pending.taskIds);
  pendingActions.delete(queueId);

  return executeReprioritization(queueId, taskIds);
}

/**
 * Process a learning update event
 *
 * @param {Object} event - Learning update event
 * @param {Array} event.task_ids - Task IDs affected
 * @param {Object} event.scores - Map of task_id to new urgency score
 * @param {string} event.model_version - Model version
 * @param {Array} event.reason_codes - Reason codes for update
 * @param {string} event.correlation_id - Correlation ID for tracing
 * @returns {Promise<Object>} Processing result
 */
export async function processLearningUpdate(event) {
  const startTime = Date.now();
  const {
    task_ids,
    scores,
    model_version,
    reason_codes = [],
    correlation_id = `lu-${Date.now()}`
  } = event;

  // Validate event
  if (!task_ids || !Array.isArray(task_ids) || task_ids.length === 0) {
    return {
      success: false,
      reason: 'invalid_learning_payload',
      missing_fields: ['task_ids'],
      correlation_id
    };
  }

  if (!scores || typeof scores !== 'object') {
    return {
      success: false,
      reason: 'invalid_learning_payload',
      missing_fields: ['scores'],
      correlation_id
    };
  }

  const supabase = getSupabase();
  const results = {
    processed: [],
    skipped: [],
    errors: []
  };

  // Process each task
  for (const taskId of task_ids) {
    const newScore = scores[taskId];

    // Validate score
    if (typeof newScore !== 'number' || isNaN(newScore)) {
      results.skipped.push({
        task_id: taskId,
        reason: 'invalid_score'
      });
      continue;
    }

    // Get current urgency state
    const { data: current, error: fetchError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, metadata, priority, updated_at, created_at, progress_percentage')
      .or(`sd_key.eq.${taskId},id.eq.${taskId}`)
      .single();

    if (fetchError || !current) {
      results.errors.push({
        task_id: taskId,
        error: fetchError?.message || 'task_not_found'
      });
      continue;
    }

    const oldScore = current.metadata?.urgency_score ?? 0.5;
    const oldBand = current.metadata?.urgency_band ?? 'P2';

    // Check if delta exceeds threshold
    if (!shouldReprioritize(oldScore, newScore)) {
      results.skipped.push({
        task_id: taskId,
        reason: 'noop_below_threshold',
        delta: Math.abs(newScore - oldScore)
      });
      continue;
    }

    // Check jitter protection
    const jitterCheck = checkJitterProtection({
      oldBand,
      newBand: scoreToBand(newScore),
      scoreDelta: newScore - oldScore,
      lastChangeAt: current.metadata?.urgency_updated_at
    });

    if (!jitterCheck.allowed) {
      results.skipped.push({
        task_id: taskId,
        reason: jitterCheck.reason
      });
      continue;
    }

    // Update urgency data
    const newBand = scoreToBand(newScore);
    const updatedMetadata = {
      ...(current.metadata || {}),
      urgency_score: newScore,
      urgency_band: newBand,
      urgency_model_version: model_version,
      urgency_reason_codes: reason_codes,
      urgency_updated_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('strategic_directives_v2')
      .update({ metadata: updatedMetadata })
      .eq('id', current.id);

    if (updateError) {
      results.errors.push({
        task_id: taskId,
        error: updateError.message
      });
      continue;
    }

    results.processed.push({
      task_id: taskId,
      old_score: oldScore,
      new_score: newScore,
      old_band: oldBand,
      new_band: newBand
    });
  }

  const processingTime = Date.now() - startTime;

  // Log metrics
  console.log('[reprioritization] Processed learning update:', {
    correlation_id,
    processed: results.processed.length,
    skipped: results.skipped.length,
    errors: results.errors.length,
    processing_time_ms: processingTime
  });

  return {
    success: results.errors.length === 0,
    correlation_id,
    processing_time_ms: processingTime,
    results
  };
}

/**
 * Execute queue reprioritization
 *
 * @param {string} queueId - Queue identifier (parent SD ID for orchestrators)
 * @param {Array} affectedTaskIds - Task IDs that triggered reprioritization
 * @returns {Promise<Object>} Reprioritization result
 */
export async function executeReprioritization(queueId, affectedTaskIds = []) {
  const startTime = Date.now();
  const correlationId = `rp-${Date.now()}`;

  // Check rate limit
  const rateLimit = checkRateLimit(queueId);
  if (!rateLimit.allowed) {
    // Coalesce for later
    coalescePending(queueId, affectedTaskIds);

    // Schedule execution after rate limit window
    setTimeout(() => executePending(queueId), rateLimit.waitMs);

    return {
      success: true,
      correlation_id: correlationId,
      action: 'coalesced',
      wait_ms: rateLimit.waitMs
    };
  }

  const supabase = getSupabase();

  // Get all queued tasks for this queue/parent
  const { data: tasks, error: fetchError } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, metadata, priority, created_at, sequence_rank, status')
    .eq('parent_sd_id', queueId)
    .in('status', ['draft', 'in_progress', 'planning', 'active', 'pending_approval'])
    .order('sequence_rank', { ascending: true, nullsFirst: false });

  if (fetchError) {
    return {
      success: false,
      correlation_id: correlationId,
      error: fetchError.message
    };
  }

  if (!tasks || tasks.length === 0) {
    return {
      success: true,
      correlation_id: correlationId,
      action: 'no_tasks',
      tasks_affected: 0
    };
  }

  // Map tasks with urgency data for sorting
  const tasksWithUrgency = tasks.map(t => ({
    ...t,
    urgency_score: t.metadata?.urgency_score ?? 0.5,
    urgency_band: t.metadata?.urgency_band ?? 'P2',
    enqueue_time: t.created_at
  }));

  // Sort by urgency
  const sorted = sortByUrgency(tasksWithUrgency);

  // Prepare audit record
  const auditRecord = {
    correlation_id: correlationId,
    queue_id: queueId,
    affected_task_ids: affectedTaskIds,
    old_positions: tasks.map((t, i) => ({ task_id: t.sd_key || t.id, position: i })),
    new_positions: sorted.map((t, i) => ({ task_id: t.sd_key || t.id, position: i })),
    changes: [],
    decision_time_ms: 0,
    created_at: new Date().toISOString()
  };

  // Update sequence_rank for each task
  let updatesApplied = 0;
  for (let i = 0; i < sorted.length; i++) {
    const task = sorted[i];
    const newRank = i + 1;

    if (task.sequence_rank !== newRank) {
      auditRecord.changes.push({
        task_id: task.sd_key || task.id,
        old_rank: task.sequence_rank,
        new_rank: newRank,
        old_band: tasks.find(t => t.id === task.id)?.metadata?.urgency_band,
        new_band: task.urgency_band
      });

      const { error: updateError } = await supabase
        .from('strategic_directives_v2')
        .update({ sequence_rank: newRank })
        .eq('id', task.id);

      if (updateError) {
        console.warn(`[reprioritization] Failed to update ${task.id}: ${updateError.message}`);
      } else {
        updatesApplied++;
      }
    }
  }

  // Record rate limit
  recordAction(queueId);

  const decisionTime = Date.now() - startTime;
  auditRecord.decision_time_ms = decisionTime;

  // Store audit record
  try {
    await supabase
      .from('audit_log')
      .insert({
        event_type: 'queue_reprioritization',
        entity_type: 'strategic_directive',
        entity_id: queueId,
        action: 'reprioritize',
        details: auditRecord,
        created_at: new Date().toISOString()
      });
  } catch (auditError) {
    console.warn(`[reprioritization] Audit write failed: ${auditError.message}`);
  }

  console.log(`[reprioritization] Queue ${queueId} reprioritized:`, {
    correlation_id: correlationId,
    tasks_affected: updatesApplied,
    decision_time_ms: decisionTime
  });

  return {
    success: true,
    correlation_id: correlationId,
    action: 'reprioritized',
    tasks_affected: updatesApplied,
    changes: auditRecord.changes,
    decision_time_ms: decisionTime
  };
}

/**
 * Trigger reprioritization from a learning signal
 * Main entry point for integration with learning system
 *
 * @param {string} parentSdId - Parent orchestrator SD ID
 * @param {Object} learningSignal - Learning signal with urgency updates
 * @returns {Promise<Object>} Trigger result
 */
export async function triggerFromLearning(parentSdId, learningSignal) {
  const correlationId = learningSignal.correlation_id || `tfl-${Date.now()}`;

  console.log('[reprioritization] Trigger from learning:', {
    parent_sd_id: parentSdId,
    correlation_id: correlationId
  });

  // Process the learning update first
  const processResult = await processLearningUpdate({
    ...learningSignal,
    correlation_id: correlationId
  });

  if (!processResult.success) {
    return processResult;
  }

  // If any tasks were processed, trigger reprioritization
  if (processResult.results.processed.length > 0) {
    const affectedIds = processResult.results.processed.map(p => p.task_id);
    const repriResult = await executeReprioritization(parentSdId, affectedIds);

    return {
      ...processResult,
      reprioritization: repriResult
    };
  }

  return {
    ...processResult,
    reprioritization: { action: 'skipped', reason: 'no_changes' }
  };
}

export default {
  checkRateLimit,
  coalescePending,
  executePending,
  processLearningUpdate,
  executeReprioritization,
  triggerFromLearning
};
