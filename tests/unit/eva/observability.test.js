/**
 * Tests for OrchestratorTracer (Observability)
 * SD-LEO-ORCH-CLI-VENTURE-LIFECYCLE-002-E
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OrchestratorTracer,
  createOrchestratorTracer,
  MODULE_VERSION,
  _internal,
} from '../../../lib/eva/observability.js';

const silentLogger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('OrchestratorTracer', () => {
  let tracer;

  beforeEach(() => {
    tracer = new OrchestratorTracer({
      ventureId: 'venture-1',
      logger: silentLogger,
    });
  });

  describe('constructor', () => {
    it('should generate a unique traceId', () => {
      expect(tracer.traceId).toBeDefined();
      expect(tracer.traceId).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should store ventureId', () => {
      expect(tracer.ventureId).toBe('venture-1');
    });

    it('should accept parentTraceId for correlation', () => {
      const child = new OrchestratorTracer({
        parentTraceId: 'parent-trace-id',
        logger: silentLogger,
      });
      expect(child.parentTraceId).toBe('parent-trace-id');
    });

    it('should default parentTraceId to null', () => {
      expect(tracer.parentTraceId).toBeNull();
    });

    it('should default to console logger', () => {
      const t = new OrchestratorTracer();
      expect(t.logger).toBe(console);
    });

    it('should initialize empty spans and events', () => {
      expect(tracer.spans).toEqual([]);
      expect(tracer.events).toEqual([]);
    });
  });

  describe('startSpan', () => {
    it('should return span reference with traceId and spanId', () => {
      const ref = tracer.startSpan('test_span');
      expect(ref.traceId).toBe(tracer.traceId);
      expect(ref.spanId).toBeDefined();
      expect(ref.name).toBe('test_span');
      expect(ref.startTime).toBeDefined();
    });

    it('should generate unique spanIds', () => {
      const ref1 = tracer.startSpan('span1');
      const ref2 = tracer.startSpan('span2');
      expect(ref1.spanId).not.toBe(ref2.spanId);
    });

    it('should track active spans', () => {
      tracer.startSpan('active1');
      tracer.startSpan('active2');
      expect(tracer._activeSpans.size).toBe(2);
    });

    it('should accept metadata', () => {
      const ref = tracer.startSpan('meta_span', { key: 'value' });
      const span = tracer._activeSpans.get(ref.spanId);
      expect(span.metadata).toEqual({ key: 'value' });
    });
  });

  describe('endSpan', () => {
    it('should complete a span with duration', () => {
      const ref = tracer.startSpan('timed_span');
      const result = tracer.endSpan(ref.spanId);
      expect(result.spanId).toBe(ref.spanId);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.status).toBe('completed');
    });

    it('should move span from active to completed', () => {
      const ref = tracer.startSpan('move_span');
      expect(tracer._activeSpans.size).toBe(1);
      expect(tracer.spans.length).toBe(0);

      tracer.endSpan(ref.spanId);
      expect(tracer._activeSpans.size).toBe(0);
      expect(tracer.spans.length).toBe(1);
    });

    it('should accept custom status', () => {
      const ref = tracer.startSpan('fail_span');
      const result = tracer.endSpan(ref.spanId, { status: 'failed' });
      expect(result.status).toBe('failed');
      expect(tracer.spans[0].status).toBe('failed');
    });

    it('should merge result metadata into span', () => {
      const ref = tracer.startSpan('meta_span', { original: true });
      tracer.endSpan(ref.spanId, { metadata: { extra: 'data' } });
      expect(tracer.spans[0].metadata).toEqual({ original: true, extra: 'data' });
    });

    it('should return null for unknown spanId', () => {
      const result = tracer.endSpan('nonexistent-id');
      expect(result).toBeNull();
      expect(silentLogger.warn).toHaveBeenCalled();
    });

    it('should record endTime and durationMs', () => {
      const ref = tracer.startSpan('timing_span');
      tracer.endSpan(ref.spanId);
      const span = tracer.spans[0];
      expect(span.endTime).toBeDefined();
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('emitEvent', () => {
    it('should add event to events array', () => {
      tracer.emitEvent('test_event', { detail: 'value' });
      expect(tracer.events.length).toBe(1);
      expect(tracer.events[0].eventType).toBe('test_event');
      expect(tracer.events[0].payload).toEqual({ detail: 'value' });
    });

    it('should include traceId and ventureId', () => {
      tracer.emitEvent('check_ids');
      expect(tracer.events[0].traceId).toBe(tracer.traceId);
      expect(tracer.events[0].ventureId).toBe('venture-1');
    });

    it('should generate unique eventId', () => {
      tracer.emitEvent('event1');
      tracer.emitEvent('event2');
      expect(tracer.events[0].eventId).not.toBe(tracer.events[1].eventId);
    });

    it('should record timestamp', () => {
      tracer.emitEvent('timestamped');
      expect(tracer.events[0].timestamp).toBeDefined();
    });

    it('should default payload to empty object', () => {
      tracer.emitEvent('no_payload');
      expect(tracer.events[0].payload).toEqual({});
    });
  });

  describe('getTrace', () => {
    it('should return complete trace summary', () => {
      const ref = tracer.startSpan('s1');
      tracer.endSpan(ref.spanId);
      tracer.emitEvent('e1');

      const trace = tracer.getTrace();
      expect(trace.traceId).toBe(tracer.traceId);
      expect(trace.parentTraceId).toBeNull();
      expect(trace.ventureId).toBe('venture-1');
      expect(trace.spans).toHaveLength(1);
      expect(trace.events).toHaveLength(1);
      expect(trace.spanCount).toBe(1);
      expect(trace.eventCount).toBe(1);
      expect(trace.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should report active span count', () => {
      tracer.startSpan('active');
      const trace = tracer.getTrace();
      expect(trace.activeSpanCount).toBe(1);
    });

    it('should return copies of arrays (immutable)', () => {
      tracer.emitEvent('original');
      const trace = tracer.getTrace();
      trace.events.push({ fake: true });
      expect(tracer.events.length).toBe(1);
    });
  });

  describe('persistTrace', () => {
    it('should insert trace into eva_trace_log', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'trace-row-1' },
                error: null,
              }),
            }),
          }),
        }),
      };

      const result = await tracer.persistTrace(mockDb);
      expect(result.persisted).toBe(true);
      expect(result.id).toBe('trace-row-1');
      expect(mockDb.from).toHaveBeenCalledWith('eva_trace_log');
    });

    it('should return error when no db client', async () => {
      const result = await tracer.persistTrace(null);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('No database client provided');
    });

    it('should handle db insert error gracefully', async () => {
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Table not found' },
              }),
            }),
          }),
        }),
      };

      const result = await tracer.persistTrace(mockDb);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Table not found');
    });

    it('should handle thrown exceptions', async () => {
      const mockDb = {
        from: vi.fn().mockImplementation(() => { throw new Error('Connection failed'); }),
      };

      const result = await tracer.persistTrace(mockDb);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should include module version in metadata', async () => {
      let capturedRow;
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockImplementation((row) => {
            capturedRow = row;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'x' }, error: null }),
              }),
            };
          }),
        }),
      };

      await tracer.persistTrace(mockDb);
      expect(capturedRow.metadata.module_version).toBe(MODULE_VERSION);
    });
  });

  describe('persistEvents', () => {
    it('should insert events into eva_events', async () => {
      tracer.emitEvent('event1', { key: 'val' });
      tracer.emitEvent('event2');

      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: null }),
        }),
      };

      const result = await tracer.persistEvents(mockDb);
      expect(result.persisted).toBe(true);
      expect(result.count).toBe(2);
      expect(mockDb.from).toHaveBeenCalledWith('eva_events');
    });

    it('should return error when no db client', async () => {
      tracer.emitEvent('orphan');
      const result = await tracer.persistEvents(null);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('No database client');
    });

    it('should return error when no events', async () => {
      const mockDb = { from: vi.fn() };
      const result = await tracer.persistEvents(mockDb);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('No events');
    });

    it('should handle db error', async () => {
      tracer.emitEvent('fail_event');
      const mockDb = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ error: { message: 'Insert failed' } }),
        }),
      };

      const result = await tracer.persistEvents(mockDb);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Insert failed');
    });

    it('should handle thrown exceptions', async () => {
      tracer.emitEvent('throw_event');
      const mockDb = {
        from: vi.fn().mockImplementation(() => { throw new Error('Boom'); }),
      };

      const result = await tracer.persistEvents(mockDb);
      expect(result.persisted).toBe(false);
      expect(result.error).toBe('Boom');
    });
  });

  describe('full trace lifecycle', () => {
    it('should capture complete processing trace', () => {
      // Simulate processStage flow
      tracer.emitEvent('stage_processing_started', { stageId: 5 });

      const ctxSpan = tracer.startSpan('context_load');
      tracer.endSpan(ctxSpan.spanId);

      const prefSpan = tracer.startSpan('preference_load');
      tracer.endSpan(prefSpan.spanId);

      const templateSpan = tracer.startSpan('template_execution');
      tracer.endSpan(templateSpan.spanId, { metadata: { stepCount: 3 } });

      const gateSpan = tracer.startSpan('gate_evaluation');
      tracer.endSpan(gateSpan.spanId, { metadata: { blocked: false } });

      const filterSpan = tracer.startSpan('filter_evaluation');
      tracer.endSpan(filterSpan.spanId);

      const persistSpan = tracer.startSpan('artifact_persistence');
      tracer.endSpan(persistSpan.spanId);

      tracer.emitEvent('stage_processing_completed', { stageId: 5 });

      const trace = tracer.getTrace();
      expect(trace.spanCount).toBe(6);
      expect(trace.eventCount).toBe(2);
      expect(trace.activeSpanCount).toBe(0);

      const spanNames = trace.spans.map(s => s.name);
      expect(spanNames).toEqual([
        'context_load',
        'preference_load',
        'template_execution',
        'gate_evaluation',
        'filter_evaluation',
        'artifact_persistence',
      ]);
    });
  });
});

describe('createOrchestratorTracer', () => {
  it('should return an OrchestratorTracer instance', () => {
    const t = createOrchestratorTracer({ ventureId: 'v1' });
    expect(t).toBeInstanceOf(OrchestratorTracer);
    expect(t.ventureId).toBe('v1');
  });

  it('should work with no arguments', () => {
    const t = createOrchestratorTracer();
    expect(t.traceId).toBeDefined();
    expect(t.ventureId).toBeNull();
  });
});

describe('exports', () => {
  it('should export MODULE_VERSION', () => {
    expect(MODULE_VERSION).toBe('1.0.0');
  });

  it('should export _internal with DEFAULT_RETENTION_DAYS', () => {
    expect(_internal.DEFAULT_RETENTION_DAYS).toBe(30);
  });
});
