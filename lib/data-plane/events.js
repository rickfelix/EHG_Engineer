/**
 * Data-Plane Event Emission Helper
 * SD-LEO-SELF-IMPROVE-001L - Phase 7a: Data-Plane Integration
 *
 * Provides consistent event emission across all pipeline stages.
 * Events are written to leo_events table with idempotency support.
 *
 * @module lib/data-plane/events
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Singleton Supabase client
let supabaseClient = null;

/**
 * Get or create Supabase client
 * @returns {Object} Supabase client instance
 */
function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Missing Supabase credentials for data-plane events');
    }

    supabaseClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return supabaseClient;
}

/**
 * Event type constants for pipeline stages
 */
export const EVENT_TYPES = {
  // Feedback stage
  FEEDBACK_RECEIVED: 'feedback.received',
  FEEDBACK_SKIPPED: 'feedback.skipped',

  // Proposal stage
  PROPOSAL_CREATED: 'proposal.created',
  PROPOSAL_SKIPPED: 'proposal.skipped',

  // Prioritization stage
  PRIORITIZATION_STARTED: 'prioritization.started',
  PRIORITIZATION_COMPLETED: 'prioritization.completed',
  PRIORITIZATION_SKIPPED: 'prioritization.skipped',

  // Execution stage
  EXECUTION_ENQUEUED: 'execution.enqueued',
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_SKIPPED: 'execution.skipped'
};

/**
 * Entity type constants for pipeline stages
 */
export const ENTITY_TYPES = {
  FEEDBACK_INTAKE: 'feedback_intake',
  PROPOSAL_CREATION: 'proposal_creation',
  PRIORITIZATION: 'prioritization',
  EXECUTION_ENQUEUE: 'execution_enqueue'
};

/**
 * Generate a deterministic idempotency key
 * Format: {stage}:{entity_type}:{entity_id}:v{version}
 *
 * @param {string} stage - Pipeline stage (e.g., 'proposal.created')
 * @param {string} entityType - Entity type (e.g., 'feedback')
 * @param {string} entityId - Entity ID (UUID or unique identifier)
 * @param {number} version - Version number (default: 1)
 * @returns {string} Deterministic idempotency key
 */
export function generateIdempotencyKey(stage, entityType, entityId, version = 1) {
  return `${stage}:${entityType}:${entityId}:v${version}`;
}

/**
 * Generate a correlation ID for tracing related events
 * Uses the feedback_id or proposal_id as the base to correlate events
 *
 * @param {string} baseId - Base entity ID to derive correlation from
 * @returns {string} UUID correlation ID
 */
export function generateCorrelationId(baseId) {
  // Create deterministic UUID from base ID
  const hash = crypto.createHash('md5').update(baseId).digest('hex');
  // Format as UUID v4 (with version bits set)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Emit a pipeline event to leo_events table
 *
 * @param {Object} params - Event parameters
 * @param {string} params.eventType - Event type (use EVENT_TYPES constants)
 * @param {string} params.entityType - Entity type (use ENTITY_TYPES constants)
 * @param {string} params.entityId - Entity UUID
 * @param {string} params.correlationId - Correlation ID for tracing
 * @param {Object} params.payload - Event payload data
 * @param {string} [params.idempotencyKey] - Optional idempotency key (auto-generated if not provided)
 * @param {string} [params.actorType='system'] - Actor type (human, agent, system)
 * @param {string} [params.severity='info'] - Severity level (info, warning, error)
 * @param {Object} [params.supabase] - Optional Supabase client override
 * @returns {Promise<{ success: boolean, id?: string, duplicate?: boolean, error?: string }>}
 */
export async function emitEvent({
  eventType,
  entityType,
  entityId,
  correlationId,
  payload,
  idempotencyKey,
  actorType = 'system',
  severity = 'info',
  supabase = null
}) {
  try {
    const client = supabase || getSupabase();

    // Auto-generate idempotency key if not provided
    const key = idempotencyKey || generateIdempotencyKey(
      eventType,
      entityType,
      entityId
    );

    // Build event record
    const event = {
      actor_type: actorType,
      event_name: eventType,
      entity_type: entityType,
      entity_id: entityId,
      correlation_id: correlationId,
      idempotency_key: key,
      payload: {
        ...payload,
        emitted_at: new Date().toISOString()
      },
      severity,
      pii_level: 'none'
    };

    // Insert event (unique index on idempotency_key will handle duplicates)
    const { data, error } = await client
      .from('leo_events')
      .insert(event)
      .select('id')
      .single();

    if (error) {
      // Check for unique constraint violation (duplicate idempotency_key)
      if (error.code === '23505' && error.message.includes('idempotency_key')) {
        return { success: true, duplicate: true };
      }
      throw error;
    }

    return { success: true, id: data.id, duplicate: false };

  } catch (error) {
    console.error(`[DataPlane] Failed to emit event ${eventType}:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark an event as processed
 * Updates the processed_at timestamp to indicate event was handled
 *
 * @param {string} eventId - Event UUID
 * @param {Object} [supabase] - Optional Supabase client override
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function markEventProcessed(eventId, supabase = null) {
  try {
    const client = supabase || getSupabase();

    const { error } = await client
      .from('leo_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', eventId);

    if (error) throw error;

    return { success: true };
  } catch (error) {
    console.error(`[DataPlane] Failed to mark event ${eventId} as processed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Check if an event with given idempotency key has been processed
 *
 * @param {string} idempotencyKey - Idempotency key to check
 * @param {Object} [supabase] - Optional Supabase client override
 * @returns {Promise<{ exists: boolean, processed: boolean, eventId?: string }>}
 */
export async function checkEventExists(idempotencyKey, supabase = null) {
  try {
    const client = supabase || getSupabase();

    const { data, error } = await client
      .from('leo_events')
      .select('id, processed_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { exists: false, processed: false };
    }

    return {
      exists: true,
      processed: data.processed_at !== null,
      eventId: data.id
    };
  } catch (error) {
    console.error('[DataPlane] Failed to check event existence:', error.message);
    return { exists: false, processed: false, error: error.message };
  }
}

/**
 * Get events by correlation ID for trace reconstruction
 *
 * @param {string} correlationId - Correlation ID to query
 * @param {Object} [supabase] - Optional Supabase client override
 * @returns {Promise<Array>} Array of events sorted by created_at
 */
export async function getEventsByCorrelation(correlationId, supabase = null) {
  try {
    const client = supabase || getSupabase();

    const { data, error } = await client
      .from('leo_events')
      .select('*')
      .eq('correlation_id', correlationId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('[DataPlane] Failed to get events by correlation:', error.message);
    return [];
  }
}

/**
 * Calculate latency between two event types in a trace
 *
 * @param {string} correlationId - Correlation ID
 * @param {string} fromEventType - Start event type
 * @param {string} toEventType - End event type
 * @param {Object} [supabase] - Optional Supabase client override
 * @returns {Promise<{ latencyMs: number | null, fromEvent?: Object, toEvent?: Object }>}
 */
export async function calculateStageLatency(correlationId, fromEventType, toEventType, supabase = null) {
  try {
    const client = supabase || getSupabase();

    const { data, error } = await client
      .from('leo_events')
      .select('event_name, created_at')
      .eq('correlation_id', correlationId)
      .in('event_name', [fromEventType, toEventType])
      .order('created_at', { ascending: true });

    if (error) throw error;

    const fromEvent = data?.find(e => e.event_name === fromEventType);
    const toEvent = data?.find(e => e.event_name === toEventType);

    if (!fromEvent || !toEvent) {
      return { latencyMs: null, fromEvent, toEvent };
    }

    const latencyMs = new Date(toEvent.created_at) - new Date(fromEvent.created_at);
    return { latencyMs, fromEvent, toEvent };
  } catch (error) {
    console.error('[DataPlane] Failed to calculate latency:', error.message);
    return { latencyMs: null };
  }
}

export default {
  EVENT_TYPES,
  ENTITY_TYPES,
  generateIdempotencyKey,
  generateCorrelationId,
  emitEvent,
  markEventProcessed,
  checkEventExists,
  getEventsByCorrelation,
  calculateStageLatency
};
