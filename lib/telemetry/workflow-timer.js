/**
 * WorkflowTimer - Non-blocking telemetry for LEO Protocol workflow execution
 *
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A
 *
 * Creates timing spans for workflow phases, gates, and sub-agent calls.
 * All public APIs are exception-safe (no-throw). Persistence is async
 * and never blocks workflow execution.
 *
 * Usage:
 *   import { startSpan, endSpan, persist, createTraceContext } from './workflow-timer.js';
 *
 *   const ctx = createTraceContext(workflowExecutionId);
 *   const root = startSpan('workflow.execute', { span_type: 'workflow' }, ctx);
 *   const phase = startSpan('step.loadSD', { span_type: 'phase', step_name: 'loadSD' }, ctx, root);
 *   endSpan(phase);
 *   endSpan(root);
 *   await persist(ctx); // fire-and-forget in production
 */

import { randomUUID } from 'crypto';

// ============================================================
// Configuration (env-driven, checked at call time)
// ============================================================

function isEnabled() {
  return process.env.TELEMETRY_WORKFLOW_TRACE_ENABLED !== 'false';
}

function getBatchSize() {
  return parseInt(process.env.TELEMETRY_PERSIST_BATCH_SIZE || '100', 10);
}

function getMaxQueueSize() {
  return parseInt(process.env.TELEMETRY_PERSIST_MAX_QUEUE_SIZE || '5000', 10);
}

// ============================================================
// Metrics counters (in-process, lightweight)
// ============================================================

const metrics = {
  spans_created: 0,
  spans_persisted: 0,
  spans_dropped: 0,
  persist_errors: 0,
  persist_batches: 0,
};

/**
 * Get current telemetry pipeline metrics
 * @returns {object} Copy of metrics counters
 */
export function getMetrics() {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics() {
  metrics.spans_created = 0;
  metrics.spans_persisted = 0;
  metrics.spans_dropped = 0;
  metrics.persist_errors = 0;
  metrics.persist_batches = 0;
}

// ============================================================
// Attribute allowlist (TR-4: prevent PII leakage)
// ============================================================

const ALLOWED_ATTRIBUTES = new Set([
  'workflow_execution_id',
  'sd_id',
  'step_name',
  'executor_class',
  'gate_name',
  'gate_runner_class',
  'result',
  'error_class',
  'error_message',
  'subagent_name',
  'request_id',
  'transport',
  'span_type',
  'handoff_type',
  'phase',
  'telemetry_version',
]);

function sanitizeAttributes(attrs) {
  if (!attrs || typeof attrs !== 'object') return {};
  const sanitized = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (ALLOWED_ATTRIBUTES.has(key)) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// ============================================================
// Trace Context
// ============================================================

/**
 * Create a trace context for a workflow execution.
 * All spans within a single workflow share a trace_id.
 *
 * @param {string} workflowExecutionId - Unique ID for this workflow run
 * @param {object} [opts] - Optional overrides
 * @param {string} [opts.sdId] - Strategic directive ID
 * @returns {object} Trace context with spans buffer
 */
export function createTraceContext(workflowExecutionId, opts = {}) {
  try {
    return {
      trace_id: randomUUID(),
      workflow_execution_id: workflowExecutionId || randomUUID(),
      sd_id: opts.sdId || null,
      spans: [],
    };
  } catch {
    return {
      trace_id: 'fallback-' + Date.now(),
      workflow_execution_id: workflowExecutionId || 'unknown',
      sd_id: opts.sdId || null,
      spans: [],
    };
  }
}

// ============================================================
// Span APIs (exception-safe)
// ============================================================

/**
 * Start a new timing span.
 *
 * @param {string} name - Span name (e.g. 'workflow.execute', 'gate.execute')
 * @param {object} [attrs={}] - Span attributes (filtered by allowlist)
 * @param {object} [traceCtx] - Trace context from createTraceContext()
 * @param {object} [parentSpan] - Parent span (for nesting)
 * @returns {object} Span object
 */
export function startSpan(name, attrs = {}, traceCtx = null, parentSpan = null) {
  try {
    const now = Date.now();
    const span = {
      span_id: randomUUID(),
      name: name || 'unknown',
      span_type: attrs.span_type || 'unknown',
      start_time_ms: now,
      end_time_ms: null,
      duration_ms: null,
      queue_wait_ms: null,
      attributes: sanitizeAttributes(attrs),
      parent_span_id: parentSpan?.span_id || null,
      trace_id: traceCtx?.trace_id || null,
      workflow_execution_id: traceCtx?.workflow_execution_id || attrs.workflow_execution_id || null,
      sd_id: traceCtx?.sd_id || attrs.sd_id || null,
      phase: attrs.phase || null,
      gate_name: attrs.gate_name || null,
      subagent_name: attrs.subagent_name || null,
      _ended: false,
    };

    // Add to trace context buffer
    if (traceCtx && Array.isArray(traceCtx.spans)) {
      const maxQueue = getMaxQueueSize();
      if (traceCtx.spans.length < maxQueue) {
        traceCtx.spans.push(span);
      } else {
        metrics.spans_dropped++;
      }
    }

    metrics.spans_created++;
    return span;
  } catch {
    metrics.spans_created++;
    return {
      span_id: 'err-' + Date.now(),
      name: name || 'unknown',
      span_type: 'unknown',
      start_time_ms: Date.now(),
      end_time_ms: null,
      duration_ms: null,
      queue_wait_ms: null,
      attributes: {},
      parent_span_id: null,
      trace_id: null,
      workflow_execution_id: null,
      sd_id: null,
      phase: null,
      gate_name: null,
      subagent_name: null,
      _ended: false,
    };
  }
}

/**
 * End a span. Idempotent: calling twice keeps the first end time.
 *
 * @param {object} span - Span object from startSpan()
 * @param {object} [attrs={}] - Additional attributes to merge
 * @returns {object} The span (mutated)
 */
export function endSpan(span, attrs = {}) {
  try {
    if (!span || typeof span !== 'object') return span;
    if (span._ended) return span; // Idempotent

    const now = Date.now();
    span.end_time_ms = now;
    span.duration_ms = Math.max(0, now - (span.start_time_ms || now));
    span._ended = true;

    // Merge additional attributes (e.g., gate result, error info)
    if (attrs && typeof attrs === 'object') {
      const sanitized = sanitizeAttributes(attrs);
      span.attributes = { ...span.attributes, ...sanitized };

      // Special handling for queue_wait_ms
      if (attrs.pickup_time_ms && span.start_time_ms) {
        span.queue_wait_ms = Math.max(0, attrs.pickup_time_ms - span.start_time_ms);
      }

      // Update top-level fields if provided
      if (attrs.gate_name) span.gate_name = attrs.gate_name;
      if (attrs.subagent_name) span.subagent_name = attrs.subagent_name;
      if (attrs.phase) span.phase = attrs.phase;
    }

    return span;
  } catch {
    if (span && typeof span === 'object') {
      span._ended = true;
      span.end_time_ms = Date.now();
      span.duration_ms = 0;
    }
    return span;
  }
}

// ============================================================
// Persistence (async, non-blocking)
// ============================================================

/**
 * Persist spans to database. Non-blocking by default.
 *
 * @param {object|object[]} spansOrCtx - Trace context (with .spans) or array of span objects
 * @param {object} [opts={}] - Persistence options
 * @param {object} [opts.supabase] - Supabase client (required for DB writes)
 * @param {boolean} [opts.sync=false] - If true, await DB writes (for testing)
 * @returns {Promise<object>} Persistence result { persisted, dropped, errors }
 */
export async function persist(spansOrCtx, opts = {}) {
  const result = { persisted: 0, dropped: 0, errors: [] };

  try {
    if (!isEnabled()) {
      return result;
    }

    // Extract spans array
    let spans;
    if (Array.isArray(spansOrCtx)) {
      spans = spansOrCtx;
    } else if (spansOrCtx && Array.isArray(spansOrCtx.spans)) {
      spans = spansOrCtx.spans;
    } else {
      return result;
    }

    if (spans.length === 0) return result;

    const supabase = opts.supabase;
    if (!supabase) {
      // No client - log warning, don't persist
      console.warn('[Telemetry] No Supabase client provided for persist - spans will be lost');
      result.dropped = spans.length;
      metrics.spans_dropped += spans.length;
      return result;
    }

    // Prepare rows (strip internal fields)
    const rows = spans
      .filter(s => s && s.span_id && s.name)
      .map(s => ({
        trace_id: s.trace_id,
        span_id: s.span_id,
        parent_span_id: s.parent_span_id,
        workflow_execution_id: s.workflow_execution_id,
        sd_id: s.sd_id,
        phase: s.phase,
        gate_name: s.gate_name,
        subagent_name: s.subagent_name,
        span_name: s.name,
        span_type: s.span_type || 'unknown',
        start_time_ms: s.start_time_ms,
        end_time_ms: s.end_time_ms,
        duration_ms: s.duration_ms,
        queue_wait_ms: s.queue_wait_ms,
        attributes: s.attributes || {},
      }));

    if (rows.length === 0) return result;

    // Batch insert
    const batchSize = getBatchSize();
    const insertOp = async () => {
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error } = await supabase
          .from('workflow_trace_log')
          .insert(batch);

        if (error) {
          metrics.persist_errors++;
          result.errors.push(error.message);
          result.dropped += batch.length;
          metrics.spans_dropped += batch.length;
          console.warn(`[Telemetry] Persist batch error: ${error.message}`);
        } else {
          result.persisted += batch.length;
          metrics.spans_persisted += batch.length;
          metrics.persist_batches++;
        }
      }
    };

    if (opts.sync) {
      await insertOp();
    } else {
      // Fire-and-forget: don't await, catch errors
      insertOp().catch(err => {
        metrics.persist_errors++;
        console.warn(`[Telemetry] Async persist error: ${err.message}`);
      });
    }

    return result;
  } catch (err) {
    metrics.persist_errors++;
    result.errors.push(err.message);
    console.warn(`[Telemetry] Persist error: ${err.message}`);
    return result;
  }
}

export default {
  createTraceContext,
  startSpan,
  endSpan,
  persist,
  getMetrics,
  resetMetrics,
  isEnabled,
};
