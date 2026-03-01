/**
 * Orchestrator Audit Trail — Unified Decision Logging
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-B
 *
 * Captures all orchestrator decisions: event routing, handler selection,
 * state transitions, and escalation choices. Writes to eva_orchestration_events.
 *
 * @module lib/eva/orchestrator-audit-trail
 */

import { randomUUID } from 'crypto';

// Decision types for structured querying
export const DECISION_TYPES = Object.freeze({
  ROUTING: 'routing_decision',
  HANDLER_SELECTION: 'handler_selection',
  STATE_TRANSITION: 'state_transition',
  ESCALATION: 'escalation_decision',
  HEALTH_CHECK: 'health_check_result',
  STRATEGY_OVERRIDE: 'strategy_override',
});

// In-memory buffer for failed writes
let _writeBuffer = [];
const MAX_BUFFER_SIZE = 100;

/**
 * Log an orchestrator decision to the audit trail.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} decision
 * @param {string} decision.type - Decision type (from DECISION_TYPES)
 * @param {string} decision.eventType - Event type that triggered the decision
 * @param {string} [decision.routingMode] - Routing mode chosen (EVENT/ROUND/PRIORITY_QUEUE)
 * @param {string} [decision.handlerName] - Handler selected
 * @param {Object} [decision.context] - Decision context snapshot
 * @param {string} [decision.correlationId] - Correlation ID for tracing
 * @param {string} [decision.ventureId] - Related venture
 * @param {string} [decision.outcome] - Decision outcome
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ logged: boolean, entryId: string, error?: string }>}
 */
export async function logDecision(supabase, decision, options = {}) {
  const { logger = console } = options;
  const entryId = randomUUID();

  const entry = {
    event_id: entryId,
    event_type: decision.type || DECISION_TYPES.ROUTING,
    event_source: 'orchestrator_audit_trail',
    venture_id: decision.ventureId || null,
    event_data: {
      eventType: decision.eventType,
      routingMode: decision.routingMode,
      handlerName: decision.handlerName,
      context: decision.context || {},
      correlationId: decision.correlationId || null,
      outcome: decision.outcome || 'recorded',
      timestamp: new Date().toISOString(),
    },
    chairman_flagged: false,
    created_at: new Date().toISOString(),
  };

  if (!supabase) {
    _bufferEntry(entry);
    return { logged: false, entryId, error: 'No supabase client - buffered' };
  }

  try {
    // Flush any buffered entries first
    await _flushBuffer(supabase, logger);

    const { error } = await supabase
      .from('eva_orchestration_events')
      .insert(entry);

    if (error) {
      logger.warn(`[AuditTrail] Write failed: ${error.message}`);
      _bufferEntry(entry);
      return { logged: false, entryId, error: error.message };
    }

    return { logged: true, entryId };
  } catch (err) {
    logger.warn(`[AuditTrail] Error: ${err.message}`);
    _bufferEntry(entry);
    return { logged: false, entryId, error: err.message };
  }
}

/**
 * Query audit trail entries by filters.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} filters
 * @param {string} [filters.correlationId] - Filter by correlation ID
 * @param {string} [filters.eventType] - Filter by decision type
 * @param {string} [filters.ventureId] - Filter by venture
 * @param {string} [filters.since] - ISO timestamp for time range start
 * @param {string} [filters.until] - ISO timestamp for time range end
 * @param {number} [filters.limit] - Max entries to return (default: 50)
 * @returns {Promise<{ entries: Object[], error?: string }>}
 */
export async function queryAuditTrail(supabase, filters = {}) {
  if (!supabase) {
    return { entries: [], error: 'No supabase client' };
  }

  try {
    let query = supabase
      .from('eva_orchestration_events')
      .select('*')
      .eq('event_source', 'orchestrator_audit_trail')
      .order('created_at', { ascending: false })
      .limit(filters.limit || 50);

    if (filters.eventType) {
      query = query.eq('event_type', filters.eventType);
    }
    if (filters.ventureId) {
      query = query.eq('venture_id', filters.ventureId);
    }
    if (filters.since) {
      query = query.gte('created_at', filters.since);
    }
    if (filters.until) {
      query = query.lte('created_at', filters.until);
    }

    const { data, error } = await query;

    if (error) {
      return { entries: [], error: error.message };
    }

    // Filter by correlationId in event_data (JSONB query)
    let entries = data || [];
    if (filters.correlationId) {
      entries = entries.filter(e =>
        e.event_data?.correlationId === filters.correlationId
      );
    }

    return { entries };
  } catch (err) {
    return { entries: [], error: err.message };
  }
}

/**
 * Get the number of buffered (unflushed) entries.
 * @returns {number}
 */
export function getBufferSize() {
  return _writeBuffer.length;
}

/**
 * Clear the write buffer (for testing).
 */
export function clearBuffer() {
  _writeBuffer = [];
}

// ── Internal helpers ─────────────────────────────────────────

function _bufferEntry(entry) {
  if (_writeBuffer.length >= MAX_BUFFER_SIZE) {
    _writeBuffer.shift(); // Drop oldest
  }
  _writeBuffer.push(entry);
}

async function _flushBuffer(supabase, logger) {
  if (_writeBuffer.length === 0) return;

  const toFlush = [..._writeBuffer];
  _writeBuffer = [];

  try {
    const { error } = await supabase
      .from('eva_orchestration_events')
      .insert(toFlush);

    if (error) {
      logger.warn(`[AuditTrail] Buffer flush failed: ${error.message}`);
      // Re-buffer the entries
      _writeBuffer = [...toFlush, ..._writeBuffer].slice(0, MAX_BUFFER_SIZE);
    }
  } catch {
    _writeBuffer = [...toFlush, ..._writeBuffer].slice(0, MAX_BUFFER_SIZE);
  }
}
