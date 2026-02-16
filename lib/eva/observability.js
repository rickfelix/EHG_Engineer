/**
 * OrchestratorTracer - Observability & Tracing for Eva Orchestrator
 *
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-E
 *
 * Provides structured tracing for processStage() operations:
 * - startSpan/endSpan for timed operations
 * - emitEvent to eva_events table
 * - persistTrace to eva_trace_log table
 * - parentTraceId for cross-operation correlation
 *
 * @module lib/eva/observability
 */

import { randomUUID } from 'crypto';
import { createLogger } from '../logger.js';

// ── Constants ───────────────────────────────────────────────

export const MODULE_VERSION = '1.1.0';

const DEFAULT_RETENTION_DAYS = 30;

// ── OrchestratorTracer ──────────────────────────────────────

export class OrchestratorTracer {
  /**
   * @param {Object} [options]
   * @param {string} [options.parentTraceId] - Parent trace for cross-operation correlation
   * @param {string} [options.ventureId] - Venture context
   * @param {Object} [options.logger] - Logger (defaults to console)
   */
  constructor(options = {}) {
    this.traceId = randomUUID();
    this.parentTraceId = options.parentTraceId || null;
    this.ventureId = options.ventureId || null;
    this.logger = options.logger || createLogger('Tracer', {
      traceId: this.traceId,
      ventureId: this.ventureId,
    });
    this.spans = [];
    this.events = [];
    this._activeSpans = new Map();
    this._startedAt = Date.now();
  }

  /**
   * Start a named span for timing an operation.
   *
   * @param {string} name - Span name (e.g., 'context_load', 'gate_evaluation')
   * @param {Object} [metadata] - Additional span metadata
   * @returns {{ traceId: string, spanId: string, name: string, startTime: string }}
   */
  startSpan(name, metadata = {}) {
    const spanId = randomUUID();
    const startTime = new Date().toISOString();
    const span = {
      traceId: this.traceId,
      spanId,
      name,
      startTime,
      startMs: Date.now(),
      metadata,
      endTime: null,
      durationMs: null,
      status: 'in_progress',
    };
    this._activeSpans.set(spanId, span);
    return { traceId: this.traceId, spanId, name, startTime };
  }

  /**
   * End a previously started span.
   *
   * @param {string} spanId - The spanId returned from startSpan
   * @param {Object} [result] - Span outcome
   * @param {string} [result.status='completed'] - Span status
   * @param {Object} [result.metadata] - Additional result metadata
   * @returns {{ spanId: string, durationMs: number, status: string } | null}
   */
  endSpan(spanId, result = {}) {
    const span = this._activeSpans.get(spanId);
    if (!span) {
      this.logger.warn(`[Tracer] Attempted to end unknown span: ${spanId}`);
      return null;
    }

    span.endTime = new Date().toISOString();
    span.durationMs = Date.now() - span.startMs;
    span.status = result.status || 'completed';
    if (result.metadata) {
      span.metadata = { ...span.metadata, ...result.metadata };
    }

    this._activeSpans.delete(spanId);
    this.spans.push(span);

    return { spanId, durationMs: span.durationMs, status: span.status };
  }

  /**
   * Emit a named event for the trace.
   *
   * @param {string} eventType - Event type (e.g., 'stage_processing_started')
   * @param {Object} [payload] - Event payload
   */
  emitEvent(eventType, payload = {}) {
    const event = {
      traceId: this.traceId,
      eventId: randomUUID(),
      eventType,
      timestamp: new Date().toISOString(),
      ventureId: this.ventureId,
      payload,
    };
    this.events.push(event);
  }

  /**
   * Get the completed trace summary.
   *
   * @returns {Object} Trace summary with spans, events, timing
   */
  getTrace() {
    return {
      traceId: this.traceId,
      parentTraceId: this.parentTraceId,
      ventureId: this.ventureId,
      spans: [...this.spans],
      events: [...this.events],
      totalDurationMs: Date.now() - this._startedAt,
      spanCount: this.spans.length,
      eventCount: this.events.length,
      activeSpanCount: this._activeSpans.size,
    };
  }

  /**
   * Persist the trace to the eva_trace_log table.
   *
   * @param {Object} supabase - Supabase client
   * @returns {Promise<{ persisted: boolean, id?: string, error?: string }>}
   */
  async persistTrace(supabase) {
    if (!supabase) {
      return { persisted: false, error: 'No database client provided' };
    }

    const trace = this.getTrace();

    try {
      const { data, error } = await supabase
        .from('eva_trace_log')
        .insert({
          trace_id: trace.traceId,
          parent_trace_id: trace.parentTraceId,
          venture_id: trace.ventureId,
          spans: trace.spans,
          events: trace.events,
          total_duration_ms: trace.totalDurationMs,
          span_count: trace.spanCount,
          event_count: trace.eventCount,
          metadata: {
            module_version: MODULE_VERSION,
          },
        })
        .select('id')
        .single();

      if (error) {
        this.logger.warn(`[Tracer] Persist failed: ${error.message}`);
        return { persisted: false, error: error.message };
      }

      return { persisted: true, id: data.id };
    } catch (err) {
      this.logger.warn(`[Tracer] Persist error: ${err.message}`);
      return { persisted: false, error: err.message };
    }
  }

  /**
   * Persist events to the eva_events table (bulk insert).
   *
   * @param {Object} supabase - Supabase client
   * @returns {Promise<{ persisted: boolean, count: number, error?: string }>}
   */
  async persistEvents(supabase) {
    if (!supabase || this.events.length === 0) {
      return { persisted: false, count: 0, error: !supabase ? 'No database client' : 'No events' };
    }

    try {
      const rows = this.events.map(e => ({
        event_type: e.eventType,
        trace_id: e.traceId,
        eva_venture_id: e.ventureId,
        event_data: e.payload,
        event_source: 'eva_orchestrator',
      }));

      const { error } = await supabase.from('eva_events').insert(rows);

      if (error) {
        this.logger.warn(`[Tracer] Event persist failed: ${error.message}`);
        return { persisted: false, count: 0, error: error.message };
      }

      return { persisted: true, count: rows.length };
    } catch (err) {
      this.logger.warn(`[Tracer] Event persist error: ${err.message}`);
      return { persisted: false, count: 0, error: err.message };
    }
  }
}

// ── Factory ─────────────────────────────────────────────────

/**
 * Create an OrchestratorTracer instance.
 *
 * @param {Object} [options] - See OrchestratorTracer constructor
 * @returns {OrchestratorTracer}
 */
export function createOrchestratorTracer(options = {}) {
  return new OrchestratorTracer(options);
}

// ── Exported for testing ────────────────────────────────────

export const _internal = {
  DEFAULT_RETENTION_DAYS,
};
