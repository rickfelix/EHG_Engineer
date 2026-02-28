/**
 * Event Router (Unified) — Tri-Modal Routing
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-03-A
 *
 * Routes events to registered handlers with retry logic,
 * idempotency checking, DLQ routing, and schema versioning.
 *
 * Tri-modal routing:
 * - EVENT: Immediate processing with priority preemption for governance signals
 * - ROUND: Cadence-based routine processing (scheduled)
 * - PRIORITY_QUEUE: Urgent governance events that preempt routine processing
 *
 * Supports BOTH persisted (EVA) and governance-safe modes:
 * - persist: true (default) — idempotency check, DB ledger, DLQ on failure
 * - persist: false — governance signals STILL persisted; only routine events fire-and-forget
 */

/**
 * Event routing modes for tri-modal classification.
 */
export const ROUTING_MODES = {
  EVENT: 'EVENT',           // Standard event processing
  ROUND: 'ROUND',           // Cadence-based routine processing
  PRIORITY_QUEUE: 'PRIORITY_QUEUE', // Urgent governance events with preemption
};

/**
 * Governance event types that MUST be persisted (never fire-and-forget).
 */
const GOVERNANCE_EVENT_TYPES = new Set([
  'guardrail.violated', 'cascade.violated', 'okr.hard_stop',
  'chairman.decision_required', 'chairman.override',
  'sd.blocked', 'gate.blocked', 'constitution.amendment',
]);

/**
 * Schema version for event payloads. Incremented on breaking changes.
 */
export const EVENT_SCHEMA_VERSION = '2.0.0';

/**
 * Classify an event into its routing mode.
 * @param {string} eventType
 * @param {object} payload
 * @returns {string} ROUTING_MODES value
 */
export function classifyRoutingMode(eventType, payload) {
  // Governance signals always go to priority queue
  if (GOVERNANCE_EVENT_TYPES.has(eventType)) return ROUTING_MODES.PRIORITY_QUEUE;
  if (payload?.priority === 'critical' || payload?.urgent === true) return ROUTING_MODES.PRIORITY_QUEUE;

  // Round-based events
  if (eventType.startsWith('round.') || eventType.startsWith('cadence.')) return ROUTING_MODES.ROUND;
  if (payload?.routingMode === ROUTING_MODES.ROUND) return ROUTING_MODES.ROUND;

  // Everything else is a standard event
  return ROUTING_MODES.EVENT;
}

import { getHandlers } from './handler-registry.js';
import { runRound } from '../rounds-scheduler.js';

/**
 * Validate event payload has required fields.
 * @param {string} eventType
 * @param {object} payload
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePayload(eventType, payload) {
  if (!payload) return { valid: false, reason: 'Missing payload' };

  switch (eventType) {
    case 'stage.completed':
      if (!payload.ventureId) return { valid: false, reason: 'Missing required ventureId' };
      if (!payload.stageId) return { valid: false, reason: 'Missing required stageId' };
      return { valid: true };

    case 'decision.submitted':
      if (!payload.ventureId) return { valid: false, reason: 'Missing required ventureId' };
      if (!payload.decisionId) return { valid: false, reason: 'Missing required decisionId' };
      return { valid: true };

    case 'gate.evaluated':
      if (!payload.ventureId) return { valid: false, reason: 'Missing required ventureId' };
      if (!payload.gateId) return { valid: false, reason: 'Missing required gateId' };
      if (!payload.outcome) return { valid: false, reason: 'Missing required outcome' };
      if (!['proceed', 'block', 'kill'].includes(payload.outcome)) {
        return { valid: false, reason: `Invalid outcome: ${payload.outcome}. Must be proceed, block, or kill` };
      }
      return { valid: true };

    case 'sd.completed':
      if (!payload.sdKey) return { valid: false, reason: 'Missing required sdKey' };
      if (!payload.ventureId) return { valid: false, reason: 'Missing required ventureId' };
      return { valid: true };

    default:
      return { valid: true };
  }
}

/**
 * Check if an event has already been processed (idempotency).
 * @param {object} supabase
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
async function isAlreadyProcessed(supabase, eventId) {
  const { data } = await supabase
    .from('eva_event_ledger')
    .select('id')
    .eq('event_id', eventId)
    .eq('status', 'success')
    .limit(1);
  return data && data.length > 0;
}

/**
 * Record processing result in the ledger.
 * @param {object} supabase
 * @param {object} params
 */
async function recordLedgerEntry(supabase, { eventId, eventType, handlerName, status, attempts, errorMessage, errorStack, metadata }) {
  await supabase.from('eva_event_ledger').insert({
    event_id: eventId,
    event_type: eventType,
    handler_name: handlerName,
    status,
    attempts: attempts || 1,
    last_attempt_at: new Date().toISOString(),
    completed_at: status === 'success' ? new Date().toISOString() : null,
    error_message: errorMessage || null,
    error_stack: errorStack || null,
    metadata: metadata || {},
  });
}

/**
 * Route an event to the DLQ.
 * @param {object} supabase
 * @param {object} params
 */
async function routeToDLQ(supabase, { eventId, eventType, payload, errorMessage, errorStack, attemptCount, failureReason, originalErrorMessage }) {
  const enrichedPayload = { ...(payload || {}) };
  if (originalErrorMessage) {
    enrichedPayload._original_error_message = originalErrorMessage;
  }
  await supabase.from('eva_events_dlq').insert({
    event_id: eventId,
    event_type: eventType,
    payload: enrichedPayload,
    error_message: errorMessage,
    error_stack: errorStack || null,
    attempt_count: attemptCount || 1,
    failure_reason: failureReason || 'unknown',
    first_seen_at: new Date().toISOString(),
    last_attempt_at: new Date().toISOString(),
    status: 'dead',
  });
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Classify an error as retryable or not.
 * @param {Error} error
 * @returns {boolean}
 */
function isRetryableError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  // Transient errors
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('econnrefused')) return true;
  if (msg.includes('503') || msg.includes('502') || msg.includes('500')) return true;
  if (msg.includes('temporarily unavailable') || msg.includes('rate limit')) return true;
  // Non-retryable
  if (msg.includes('not found') || msg.includes('validation') || msg.includes('invalid')) return false;
  if (msg.includes('missing required') || msg.includes('not_found')) return false;
  // Default: retryable
  return true;
}

/**
 * Execute a single handler with retry logic.
 * Returns { success, attempts, error? }.
 *
 * @param {object} handler - Handler entry from registry
 * @param {object} payload - Event payload
 * @param {object} context - { supabase, ventureId }
 * @param {object} retryOpts - { maxRetries, baseDelayMs, backoffMultiplier }
 * @returns {Promise<{ success: boolean, attempts: number, firstError?: Error, lastError?: Error }>}
 */
async function executeWithRetry(handler, payload, context, retryOpts) {
  const { maxRetries, baseDelayMs, backoffMultiplier } = retryOpts;
  const effectiveMaxRetries = Math.min(maxRetries, handler.maxRetries ?? maxRetries);
  let firstError = null;
  let lastError = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= effectiveMaxRetries; attempt++) {
    attempts = attempt;
    try {
      await handler.handlerFn(payload, context);
      return { success: true, attempts };
    } catch (error) {
      if (!firstError) firstError = error;
      lastError = error;
      console.log(`[EventRouter] Handler ${handler.name} failed (attempt ${attempt}/${effectiveMaxRetries}): ${error.message}`);

      if (!isRetryableError(error) || handler.retryable === false) {
        break;
      }

      if (attempt < effectiveMaxRetries) {
        const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        await sleep(delay);
      }
    }
  }

  return { success: false, attempts, firstError, lastError };
}

/**
 * Enqueue an event into sub_agent_queue with urgent priority and preemption.
 * Used by PRIORITY_QUEUE routing mode for governance signals.
 * @param {object} supabase
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @returns {Promise<{ success: boolean, status: string, queueId?: string }>}
 */
async function enqueueToPriorityQueue(supabase, event) {
  const { data, error } = await supabase
    .from('sub_agent_queue')
    .insert({
      task_type: event.event_type,
      payload: {
        ...event.event_data,
        _source_event_id: event.id,
        _routing_mode: ROUTING_MODES.PRIORITY_QUEUE,
      },
      priority: 'urgent',
      status: 'pending',
      metadata: {
        preemption: true,
        source: 'event-router-trimodal',
        venture_id: event.eva_venture_id || event.event_data?.ventureId || null,
      },
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[EventRouter] PRIORITY_QUEUE enqueue failed for ${event.event_type}: ${error.message}`);
    return { success: false, status: 'enqueue_failed', error: error.message };
  }

  console.log(`[EventRouter] PRIORITY_QUEUE enqueued: ${event.event_type} → queue id ${data.id}`);
  return { success: true, status: 'enqueued', queueId: data.id };
}

/**
 * Defer a ROUND-classified event to the master scheduler.
 * @param {object} supabase
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @returns {Promise<{ success: boolean, status: string }>}
 */
async function deferToRoundScheduler(supabase, event) {
  const roundType = event.event_type.replace(/^(round\.|cadence\.)/, '');
  try {
    const result = await runRound(roundType, {
      supabase,
      ventureId: event.eva_venture_id || event.event_data?.ventureId,
      payload: event.event_data,
    });
    console.log(`[EventRouter] ROUND deferred to scheduler: ${event.event_type} → ${roundType}`);
    return { success: true, status: 'deferred_to_scheduler', roundResult: result };
  } catch (err) {
    console.warn(`[EventRouter] ROUND scheduler unavailable for ${roundType}, falling back to EVENT mode: ${err.message}`);
    return { success: false, status: 'scheduler_unavailable', error: err.message };
  }
}

/**
 * Dispatch an event based on its routing mode classification.
 * This is the tri-modal dispatch entry point.
 *
 * - EVENT: Direct handler execution (existing pipeline)
 * - ROUND: Defers to master scheduler via runRound()
 * - PRIORITY_QUEUE: Enqueues into sub_agent_queue with urgent priority
 *
 * @param {object} supabase - Supabase client
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @param {object} [options] - { maxRetries, baseDelayMs, backoffMultiplier, persist }
 * @returns {Promise<{ success: boolean, routingMode: string, status: string }>}
 */
export async function dispatchByMode(supabase, event, options = {}) {
  const eventType = event.event_type;
  const payload = event.event_data || {};
  const routingMode = classifyRoutingMode(eventType, payload);

  switch (routingMode) {
    case ROUTING_MODES.ROUND: {
      const result = await deferToRoundScheduler(supabase, event);
      if (result.success) {
        // Record in ledger for observability
        await recordLedgerEntry(supabase, {
          eventId: event.id,
          eventType,
          handlerName: 'round-scheduler',
          status: 'success',
          attempts: 1,
          metadata: { routingMode, roundType: eventType.replace(/^(round\.|cadence\.)/, '') },
        });
        return { success: true, routingMode, status: 'deferred_to_scheduler' };
      }
      // Fallback: process as EVENT mode if scheduler unavailable
      return processEventDirect(supabase, event, options);
    }

    case ROUTING_MODES.PRIORITY_QUEUE: {
      const result = await enqueueToPriorityQueue(supabase, event);
      if (result.success) {
        await recordLedgerEntry(supabase, {
          eventId: event.id,
          eventType,
          handlerName: 'priority-queue-enqueue',
          status: 'success',
          attempts: 1,
          metadata: { routingMode, queueId: result.queueId },
        });
        return { success: true, routingMode, status: 'enqueued' };
      }
      // Fallback: process as EVENT mode if enqueue fails
      console.warn('[EventRouter] PRIORITY_QUEUE enqueue failed, falling back to EVENT mode');
      return processEventDirect(supabase, event, options);
    }

    case ROUTING_MODES.EVENT:
    default:
      return processEventDirect(supabase, event, options);
  }
}

/**
 * Process a single event through the handler pipeline.
 *
 * Supports two modes via options.persist:
 * - persist: true (default) — Full EVA pipeline: idempotency, DB ledger, DLQ, eva_events update.
 *   Processes ALL registered handlers for the event type sequentially.
 * - persist: false — Fire-and-forget mode: execute all handlers in-process,
 *   catch and log errors per handler, no DB writes. Used by Vision events.
 *
 * @param {object} supabase - Supabase client
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @param {object} [options] - { maxRetries, baseDelayMs, backoffMultiplier, persist }
 * @returns {Promise<{ success: boolean, status: string, attempts?: number, error?: string, handlerResults?: Array }>}
 */
export async function processEvent(supabase, event, options = {}) {
  const eventType = event.event_type;
  const payload = event.event_data || {};
  const routingMode = classifyRoutingMode(eventType, payload);

  // Tri-modal dispatch: route ROUND and PRIORITY_QUEUE events to their dedicated paths
  if (routingMode === ROUTING_MODES.ROUND || routingMode === ROUTING_MODES.PRIORITY_QUEUE) {
    return dispatchByMode(supabase, event, options);
  }

  // EVENT mode: use direct handler pipeline
  return processEventDirect(supabase, event, options);
}

/**
 * Direct handler execution pipeline (EVENT mode).
 * This is the original processEvent logic, preserved for EVENT-classified events
 * and as a fallback for ROUND/PRIORITY_QUEUE when their dedicated paths fail.
 *
 * @param {object} supabase - Supabase client
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @param {object} [options] - { maxRetries, baseDelayMs, backoffMultiplier, persist }
 * @returns {Promise<{ success: boolean, status: string, routingMode: string, attempts?: number, error?: string, handlerResults?: Array }>}
 */
async function processEventDirect(supabase, event, options = {}) {
  const eventType = event.event_type;
  const payload = event.event_data || {};
  const persist = options.persist !== false; // default true
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const routingMode = ROUTING_MODES.EVENT;

  // Get all handlers for this event type
  const handlers = getHandlers(eventType);
  if (handlers.length === 0) {
    if (persist) {
      console.log(`[EventRouter] No handler for event type: ${eventType}`);
    }
    return { success: true, status: 'no_handler', routingMode, attempts: 0 };
  }

  // --- Fire-and-forget mode (Vision events) ---
  // EXCEPTION: Governance events are ALWAYS persisted even in fire-and-forget mode
  if (!persist && classifyRoutingMode(eventType, payload) !== ROUTING_MODES.PRIORITY_QUEUE) {
    const context = { supabase, ventureId: event.eva_venture_id || payload.ventureId };
    const handlerResults = [];

    for (const handler of handlers) {
      try {
        await handler.handlerFn(payload, context);
        handlerResults.push({ handler: handler.name, success: true });
      } catch (err) {
        console.error(`[EventRouter] Fire-and-forget handler ${handler.name} error for ${eventType}: ${err.message}`);
        handlerResults.push({ handler: handler.name, success: false, error: err.message });
      }
    }

    const allSucceeded = handlerResults.every(r => r.success);
    return {
      success: allSucceeded,
      status: allSucceeded ? 'success' : 'partial_failure',
      routingMode,
      handlerResults,
    };
  }

  // --- Persisted mode (EVA events) ---
  const eventId = event.id;

  // 1. Check idempotency
  const alreadyProcessed = await isAlreadyProcessed(supabase, eventId);
  if (alreadyProcessed) {
    console.log(`[EventRouter] Duplicate event ${eventId} (${eventType}) - skipping`);
    return { success: true, status: 'duplicate_event', routingMode, attempts: 0 };
  }

  // 2. Validate payload
  const validation = validatePayload(eventType, payload);
  if (!validation.valid) {
    console.log(`[EventRouter] Validation failed for ${eventType}: ${validation.reason}`);

    await routeToDLQ(supabase, {
      eventId, eventType, payload,
      errorMessage: validation.reason,
      attemptCount: 1,
      failureReason: 'validation_error',
    });

    await recordLedgerEntry(supabase, {
      eventId, eventType,
      handlerName: handlers[0].name,
      status: 'dead',
      attempts: 1,
      errorMessage: validation.reason,
    });

    return { success: false, status: 'validation_error', routingMode, error: validation.reason };
  }

  // 3. Execute all handlers with retry
  const context = { supabase, ventureId: event.eva_venture_id || payload.ventureId };
  const retryOpts = { maxRetries, baseDelayMs, backoffMultiplier };
  const handlerResults = [];
  let totalAttempts = 0;
  let anyFailed = false;

  for (const handler of handlers) {
    const result = await executeWithRetry(handler, payload, context, retryOpts);
    totalAttempts += result.attempts;

    if (result.success) {
      await recordLedgerEntry(supabase, {
        eventId, eventType,
        handlerName: handler.name,
        status: 'success',
        attempts: result.attempts,
        metadata: {},
      });
      handlerResults.push({ handler: handler.name, success: true, attempts: result.attempts });
    } else {
      anyFailed = true;
      const failureReason = isRetryableError(result.lastError) ? 'max_retries_exhausted' : 'handler_error';

      await routeToDLQ(supabase, {
        eventId: `${eventId}:${handler.name}`,
        eventType, payload,
        errorMessage: result.lastError?.message || 'Unknown error',
        errorStack: result.lastError?.stack || null,
        attemptCount: result.attempts,
        failureReason,
        originalErrorMessage: result.firstError?.message || null,
      });

      await recordLedgerEntry(supabase, {
        eventId, eventType,
        handlerName: handler.name,
        status: 'dead',
        attempts: result.attempts,
        errorMessage: result.lastError?.message,
        errorStack: result.lastError?.stack,
        metadata: { originalError: result.firstError?.message || null },
      });

      handlerResults.push({
        handler: handler.name,
        success: false,
        attempts: result.attempts,
        error: result.lastError?.message,
      });
    }
  }

  // 4. Update eva_events — mark processed if ALL handlers succeeded
  if (!anyFailed) {
    await supabase.from('eva_events')
      .update({ processed: true, processed_at: new Date().toISOString(), retry_count: totalAttempts })
      .eq('id', eventId);
  } else {
    await supabase.from('eva_events')
      .update({ retry_count: totalAttempts, last_error: handlerResults.find(r => r.error)?.error })
      .eq('id', eventId);
  }

  const allSucceeded = !anyFailed;
  return {
    success: allSucceeded,
    status: allSucceeded ? 'success' : 'partial_failure',
    routingMode,
    schemaVersion: EVENT_SCHEMA_VERSION,
    attempts: totalAttempts,
    handlerResults,
    error: anyFailed ? handlerResults.find(r => r.error)?.error : undefined,
  };
}

/**
 * Replay a DLQ entry by reprocessing the original event.
 * @param {object} supabase
 * @param {string} dlqId - DLQ entry ID
 * @param {object} [options] - { replayedBy }
 * @returns {Promise<{ success: boolean, status: string }>}
 */
export async function replayDLQEntry(supabase, dlqId, options = {}) {
  // Get DLQ entry
  const { data: dlqEntry, error } = await supabase
    .from('eva_events_dlq')
    .select('*')
    .eq('id', dlqId)
    .single();

  if (error || !dlqEntry) {
    return { success: false, status: 'dlq_entry_not_found' };
  }

  if (dlqEntry.status !== 'dead') {
    return { success: false, status: 'already_replayed' };
  }

  // Reconstruct event from DLQ data
  const syntheticEvent = {
    id: dlqEntry.event_id,
    event_type: dlqEntry.event_type,
    event_data: dlqEntry.payload,
    eva_venture_id: dlqEntry.payload?.ventureId || null,
  };

  // Reset the event's processed state if it exists
  if (dlqEntry.event_id) {
    await supabase.from('eva_events')
      .update({ processed: false, processed_at: null, retry_count: 0, last_error: null })
      .eq('id', dlqEntry.event_id);
  }

  // Reprocess
  const result = await processEvent(supabase, syntheticEvent);

  if (result.success) {
    // Mark DLQ entry as replayed
    await supabase.from('eva_events_dlq')
      .update({
        status: 'replayed',
        replayed_at: new Date().toISOString(),
        replayed_by: options.replayedBy || 'system',
      })
      .eq('id', dlqId);

    // Update ledger
    await recordLedgerEntry(supabase, {
      eventId: dlqEntry.event_id,
      eventType: dlqEntry.event_type,
      handlerName: 'dlq-replay',
      status: 'replayed',
      attempts: result.attempts,
      metadata: { dlqId, replayedBy: options.replayedBy || 'system' },
    });
  }

  return result;
}
