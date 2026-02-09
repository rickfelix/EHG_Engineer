/**
 * Unit tests for WorkflowTimer (lib/telemetry/workflow-timer.js)
 * SD: SD-LEO-ENH-WORKFLOW-TELEMETRY-AUTO-001A
 *
 * Covers: TS-6 (endSpan idempotency, out-of-order closures), FR-1, FR-6, TR-1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTraceContext,
  startSpan,
  endSpan,
  persist,
  getMetrics,
  resetMetrics,
} from '../../../lib/telemetry/workflow-timer.js';

describe('WorkflowTimer', () => {
  beforeEach(() => {
    resetMetrics();
    delete process.env.TELEMETRY_WORKFLOW_TRACE_ENABLED;
    delete process.env.TELEMETRY_PERSIST_MAX_QUEUE_SIZE;
  });

  describe('createTraceContext', () => {
    it('creates a trace context with unique trace_id', () => {
      const ctx = createTraceContext('exec-123');
      expect(ctx.trace_id).toBeTruthy();
      expect(ctx.workflow_execution_id).toBe('exec-123');
      expect(ctx.spans).toEqual([]);
    });

    it('accepts optional sdId', () => {
      const ctx = createTraceContext('exec-123', { sdId: 'SD-TEST-001' });
      expect(ctx.sd_id).toBe('SD-TEST-001');
    });

    it('generates workflow_execution_id if not provided', () => {
      const ctx = createTraceContext(null);
      expect(ctx.workflow_execution_id).toBeTruthy();
    });

    it('two contexts have different trace_ids', () => {
      const ctx1 = createTraceContext('a');
      const ctx2 = createTraceContext('b');
      expect(ctx1.trace_id).not.toBe(ctx2.trace_id);
    });
  });

  describe('startSpan', () => {
    it('returns a span with required fields (FR-1)', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('workflow.execute', { span_type: 'workflow' }, ctx);

      expect(span.span_id).toBeTruthy();
      expect(span.name).toBe('workflow.execute');
      expect(span.span_type).toBe('workflow');
      expect(span.start_time_ms).toBeGreaterThan(0);
      expect(span.end_time_ms).toBeNull();
      expect(span.duration_ms).toBeNull();
      expect(span.parent_span_id).toBeNull();
      expect(span.trace_id).toBe(ctx.trace_id);
      expect(span.attributes).toBeDefined();
    });

    it('adds span to trace context buffer', () => {
      const ctx = createTraceContext('exec-1');
      startSpan('s1', { span_type: 'phase' }, ctx);
      startSpan('s2', { span_type: 'phase' }, ctx);
      expect(ctx.spans).toHaveLength(2);
    });

    it('sets parent_span_id when parent provided', () => {
      const ctx = createTraceContext('exec-1');
      const root = startSpan('root', { span_type: 'workflow' }, ctx);
      const child = startSpan('child', { span_type: 'phase' }, ctx, root);
      expect(child.parent_span_id).toBe(root.span_id);
    });

    it('sanitizes attributes via allowlist (TR-4)', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('test', {
        span_type: 'phase',
        step_name: 'loadSD',
        secret_key: 'SHOULD_BE_REMOVED',
        password: 'SHOULD_BE_REMOVED',
      }, ctx);

      expect(span.attributes.step_name).toBe('loadSD');
      expect(span.attributes.secret_key).toBeUndefined();
      expect(span.attributes.password).toBeUndefined();
    });

    it('increments metrics.spans_created', () => {
      const ctx = createTraceContext('exec-1');
      startSpan('s1', {}, ctx);
      startSpan('s2', {}, ctx);
      expect(getMetrics().spans_created).toBe(2);
    });

    it('drops spans when queue is full', () => {
      process.env.TELEMETRY_PERSIST_MAX_QUEUE_SIZE = '2';
      const ctx = createTraceContext('exec-1');
      startSpan('s1', {}, ctx);
      startSpan('s2', {}, ctx);
      startSpan('s3', {}, ctx); // Should be dropped

      expect(ctx.spans).toHaveLength(2);
      expect(getMetrics().spans_dropped).toBe(1);
    });

    it('never throws even with invalid input (TR-1)', () => {
      expect(() => startSpan(null, null, null, null)).not.toThrow();
      expect(() => startSpan(undefined)).not.toThrow();
      const span = startSpan(null);
      expect(span.name).toBe('unknown');
    });

    it('works without trace context', () => {
      const span = startSpan('standalone', { span_type: 'test' });
      expect(span.span_id).toBeTruthy();
      expect(span.trace_id).toBeNull();
    });
  });

  describe('endSpan', () => {
    it('sets end_time_ms and duration_ms', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('test', { span_type: 'phase' }, ctx);
      endSpan(span);

      expect(span.end_time_ms).toBeGreaterThan(0);
      expect(span.duration_ms).toBeGreaterThanOrEqual(0);
      expect(span._ended).toBe(true);
    });

    it('is idempotent - second call preserves first end time (TS-6)', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('test', { span_type: 'phase' }, ctx);

      endSpan(span);
      const firstEndTime = span.end_time_ms;
      const firstDuration = span.duration_ms;

      // Second call should be no-op
      endSpan(span, { result: 'different' });
      expect(span.end_time_ms).toBe(firstEndTime);
      expect(span.duration_ms).toBe(firstDuration);
    });

    it('merges additional attributes', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('gate', { span_type: 'gate' }, ctx);
      endSpan(span, { result: 'pass', gate_name: 'MY_GATE' });

      expect(span.attributes.result).toBe('pass');
      expect(span.gate_name).toBe('MY_GATE');
    });

    it('computes queue_wait_ms from pickup_time_ms', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('subagent', { span_type: 'subagent' }, ctx);
      const pickupTime = span.start_time_ms + 150;
      endSpan(span, { pickup_time_ms: pickupTime });

      expect(span.queue_wait_ms).toBe(150);
    });

    it('never throws even with null/undefined input (TR-1)', () => {
      expect(() => endSpan(null)).not.toThrow();
      expect(() => endSpan(undefined)).not.toThrow();
      expect(() => endSpan({})).not.toThrow();
      expect(() => endSpan('not a span')).not.toThrow();
    });

    it('handles out-of-order closures gracefully (TS-6)', () => {
      const ctx = createTraceContext('exec-1');
      const parent = startSpan('parent', { span_type: 'workflow' }, ctx);
      const child = startSpan('child', { span_type: 'phase' }, ctx, parent);

      // End parent first (out of order)
      endSpan(parent);
      // Then end child
      endSpan(child);

      expect(parent._ended).toBe(true);
      expect(child._ended).toBe(true);
      expect(parent.duration_ms).toBeGreaterThanOrEqual(0);
      expect(child.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('duration_ms is always non-negative', () => {
      const ctx = createTraceContext('exec-1');
      const span = startSpan('test', { span_type: 'phase' }, ctx);
      // Force start_time_ms into the future to test edge case
      span.start_time_ms = Date.now() + 100000;
      endSpan(span);
      expect(span.duration_ms).toBe(0); // Math.max(0, ...) ensures non-negative
    });
  });

  describe('persist', () => {
    it('returns empty result when disabled', async () => {
      process.env.TELEMETRY_WORKFLOW_TRACE_ENABLED = 'false';
      const ctx = createTraceContext('exec-1');
      startSpan('test', { span_type: 'phase' }, ctx);

      const result = await persist(ctx);
      expect(result.persisted).toBe(0);
      expect(result.dropped).toBe(0);
    });

    it('returns empty result when no supabase client', async () => {
      const ctx = createTraceContext('exec-1');
      startSpan('test', { span_type: 'phase' }, ctx);

      const result = await persist(ctx, { sync: true });
      expect(result.dropped).toBe(1);
    });

    it('persists spans to database with mock client (sync mode)', async () => {
      const inserted = [];
      const mockSupabase = {
        from: () => ({
          insert: (rows) => {
            inserted.push(...rows);
            return { error: null };
          }
        })
      };

      const ctx = createTraceContext('exec-1', { sdId: 'SD-TEST' });
      const root = startSpan('workflow.execute', { span_type: 'workflow' }, ctx);
      const phase = startSpan('step.loadSD', { span_type: 'phase', step_name: 'loadSD' }, ctx, root);
      endSpan(phase);
      endSpan(root);

      const result = await persist(ctx, { supabase: mockSupabase, sync: true });
      expect(result.persisted).toBe(2);
      expect(inserted).toHaveLength(2);

      // Verify row structure
      const row = inserted[0];
      expect(row.trace_id).toBe(ctx.trace_id);
      expect(row.span_name).toBeTruthy();
      expect(row.span_type).toBeTruthy();
      expect(row.start_time_ms).toBeGreaterThan(0);
    });

    it('handles database errors gracefully', async () => {
      const mockSupabase = {
        from: () => ({
          insert: () => ({ error: { message: 'connection refused' } })
        })
      };

      const ctx = createTraceContext('exec-1');
      startSpan('test', { span_type: 'phase' }, ctx);

      const result = await persist(ctx, { supabase: mockSupabase, sync: true });
      expect(result.errors).toHaveLength(1);
      expect(result.dropped).toBe(1);
      expect(getMetrics().persist_errors).toBe(1);
    });

    it('batches inserts', async () => {
      process.env.TELEMETRY_PERSIST_BATCH_SIZE = '3';
      let insertCalls = 0;
      const mockSupabase = {
        from: () => ({
          insert: (rows) => {
            insertCalls++;
            return { error: null };
          }
        })
      };

      const ctx = createTraceContext('exec-1');
      for (let i = 0; i < 7; i++) {
        startSpan(`span-${i}`, { span_type: 'phase' }, ctx);
      }

      await persist(ctx, { supabase: mockSupabase, sync: true });
      // 7 spans / batch size 3 = 3 batches (3+3+1)
      expect(insertCalls).toBe(3);
    });

    it('accepts array of spans directly', async () => {
      const inserted = [];
      const mockSupabase = {
        from: () => ({
          insert: (rows) => {
            inserted.push(...rows);
            return { error: null };
          }
        })
      };

      const span1 = startSpan('s1', { span_type: 'phase' });
      const span2 = startSpan('s2', { span_type: 'phase' });
      endSpan(span1);
      endSpan(span2);

      await persist([span1, span2], { supabase: mockSupabase, sync: true });
      expect(inserted).toHaveLength(2);
    });

    it('never throws (TR-1)', async () => {
      await expect(persist(null)).resolves.toBeDefined();
      await expect(persist(undefined)).resolves.toBeDefined();
      await expect(persist([])).resolves.toBeDefined();
      await expect(persist('invalid')).resolves.toBeDefined();
    });
  });

  describe('getMetrics / resetMetrics', () => {
    it('tracks spans_created', () => {
      startSpan('a', {});
      startSpan('b', {});
      expect(getMetrics().spans_created).toBe(2);
    });

    it('resetMetrics clears all counters', () => {
      startSpan('a', {});
      resetMetrics();
      expect(getMetrics().spans_created).toBe(0);
      expect(getMetrics().spans_dropped).toBe(0);
      expect(getMetrics().persist_errors).toBe(0);
    });
  });

  describe('integration: full workflow trace', () => {
    it('produces correct span hierarchy for a 7-step workflow (FR-3)', () => {
      const ctx = createTraceContext('LEAD-TO-PLAN-SD-TEST-001-1234');
      const root = startSpan('workflow.execute', {
        span_type: 'workflow',
        executor_class: 'LeadToPlanExecutor',
        handoff_type: 'LEAD-TO-PLAN',
      }, ctx);

      const steps = [
        'loadSD', 'migrationCheck', 'claimConflictCheck',
        'setup', 'claimAndPrepare', 'gateValidation', 'executeSpecific'
      ];

      const stepSpans = steps.map(step =>
        startSpan(`step.${step}`, {
          span_type: 'phase',
          step_name: step,
          sd_id: 'SD-TEST-001',
        }, ctx, root)
      );

      // End all step spans
      stepSpans.forEach(s => endSpan(s));
      endSpan(root);

      // Verify: 1 root + 7 phase spans = 8 total
      expect(ctx.spans).toHaveLength(8);

      // All share same trace_id
      const traceIds = new Set(ctx.spans.map(s => s.trace_id));
      expect(traceIds.size).toBe(1);

      // Root has no parent, children have root as parent
      expect(root.parent_span_id).toBeNull();
      stepSpans.forEach(s => {
        expect(s.parent_span_id).toBe(root.span_id);
      });

      // All have non-null duration_ms
      ctx.spans.forEach(s => {
        expect(s.duration_ms).toBeGreaterThanOrEqual(0);
      });
    });

    it('gate spans are children of the gateValidation phase (FR-4)', () => {
      const ctx = createTraceContext('exec-1');
      const root = startSpan('workflow.execute', { span_type: 'workflow' }, ctx);
      const gatePhase = startSpan('step.gateValidation', { span_type: 'phase' }, ctx, root);

      // Two gates execute within the gate phase
      const gate1 = startSpan('gate.execute', {
        span_type: 'gate',
        gate_name: 'GATE_SD_COMPLETENESS',
        gate_runner_class: 'ValidationOrchestrator',
      }, ctx, gatePhase);
      endSpan(gate1, { result: 'pass' });

      const gate2 = startSpan('gate.execute', {
        span_type: 'gate',
        gate_name: 'GATE_PRD_QUALITY',
        gate_runner_class: 'ValidationOrchestrator',
      }, ctx, gatePhase);
      endSpan(gate2, { result: 'fail' });

      endSpan(gatePhase);
      endSpan(root);

      expect(gate1.parent_span_id).toBe(gatePhase.span_id);
      expect(gate2.parent_span_id).toBe(gatePhase.span_id);
      expect(gate1.gate_name).toBe('GATE_SD_COMPLETENESS');
      expect(gate2.attributes.result).toBe('fail');
    });

    it('sub-agent spans capture RTT and queue_wait_ms (FR-5)', () => {
      const ctx = createTraceContext('exec-1');
      const root = startSpan('workflow.execute', { span_type: 'workflow' }, ctx);

      const saSpan = startSpan('subagent.call', {
        span_type: 'subagent',
        subagent_name: 'DATABASE',
        transport: 'internal',
      }, ctx, root);

      // Simulate pickup after 200ms
      const pickupTime = saSpan.start_time_ms + 200;
      endSpan(saSpan, {
        pickup_time_ms: pickupTime,
        subagent_name: 'DATABASE',
      });
      endSpan(root);

      expect(saSpan.queue_wait_ms).toBe(200);
      expect(saSpan.duration_ms).toBeGreaterThanOrEqual(0);
      expect(saSpan.subagent_name).toBe('DATABASE');
      expect(saSpan.attributes.transport).toBe('internal');
    });
  });
});
