/**
 * Event Router
 * SD: SD-EVA-FEAT-EVENT-BUS-001
 *
 * Routes events to registered handlers with retry logic,
 * idempotency checking, and DLQ routing.
 */

import { getHandler } from './handler-registry.js';
import { createLogger } from '../../logger.js';

const log = createLogger('EventRouter');

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
 * Process a single event through the handler pipeline.
 *
 * @param {object} supabase - Supabase client
 * @param {object} event - { id, event_type, event_data, eva_venture_id }
 * @param {object} [options] - { maxRetries, baseDelayMs, backoffMultiplier }
 * @returns {Promise<{ success: boolean, status: string, attempts?: number, error?: string }>}
 */
export async function processEvent(supabase, event, options = {}) {
  const eventId = event.id;
  const eventType = event.event_type;
  const payload = event.event_data || {};
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const backoffMultiplier = options.backoffMultiplier ?? 2;

  // 1. Check idempotency
  const alreadyProcessed = await isAlreadyProcessed(supabase, eventId);
  if (alreadyProcessed) {
    log.info('Duplicate event - skipping', { eventId, eventType });
    return { success: true, status: 'duplicate_event', attempts: 0 };
  }

  // 2. Find handler
  const handler = getHandler(eventType);
  if (!handler) {
    log.info('No handler for event type', { eventType });
    return { success: true, status: 'no_handler', attempts: 0 };
  }

  // 3. Validate payload
  const validation = validatePayload(eventType, payload);
  if (!validation.valid) {
    log.warn('Validation failed', { eventType, reason: validation.reason });

    await routeToDLQ(supabase, {
      eventId, eventType, payload,
      errorMessage: validation.reason,
      attemptCount: 1,
      failureReason: 'validation_error',
    });

    await recordLedgerEntry(supabase, {
      eventId, eventType,
      handlerName: handler.name,
      status: 'dead',
      attempts: 1,
      errorMessage: validation.reason,
    });

    return { success: false, status: 'validation_error', error: validation.reason };
  }

  // 4. Execute handler with retry
  const context = { supabase, ventureId: event.eva_venture_id || payload.ventureId };
  let firstError = null;
  let lastError = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts = attempt;
    try {
      const result = await handler.handlerFn(payload, context);

      // Success
      await recordLedgerEntry(supabase, {
        eventId, eventType,
        handlerName: handler.name,
        status: 'success',
        attempts,
        metadata: { result },
      });

      // Mark event as processed in eva_events
      await supabase.from('eva_events')
        .update({ processed: true, processed_at: new Date().toISOString(), retry_count: attempts })
        .eq('id', eventId);

      return { success: true, status: 'success', attempts };

    } catch (error) {
      if (!firstError) firstError = error;
      lastError = error;
      log.warn('Handler failed', { handler: handler.name, attempt, maxRetries, error: error.message });

      if (!isRetryableError(error) || handler.retryable === false) {
        // Non-retryable error OR handler explicitly marked non-retryable
        break;
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        await sleep(delay);
      }
    }
  }

  // All retries exhausted or non-retryable error
  const failureReason = isRetryableError(lastError) ? 'max_retries_exhausted' : 'handler_error';

  await routeToDLQ(supabase, {
    eventId, eventType, payload,
    errorMessage: lastError?.message || 'Unknown error',
    errorStack: lastError?.stack || null,
    attemptCount: attempts,
    failureReason,
    originalErrorMessage: firstError?.message || null,
  });

  await recordLedgerEntry(supabase, {
    eventId, eventType,
    handlerName: handler.name,
    status: 'dead',
    attempts,
    errorMessage: lastError?.message,
    errorStack: lastError?.stack,
    metadata: { originalError: firstError?.message || null },
  });

  // Update eva_events with retry count and last error
  await supabase.from('eva_events')
    .update({ retry_count: attempts, last_error: lastError?.message })
    .eq('id', eventId);

  return {
    success: false,
    status: failureReason,
    attempts,
    error: lastError?.message,
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
