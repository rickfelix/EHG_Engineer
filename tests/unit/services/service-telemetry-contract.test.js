/**
 * service_telemetry producer/consumer contract test
 * SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001 FR-1
 *
 * Consumer enumeration (grep-verified 2026-07-11, single consumer):
 *   lib/eva/services/ops-health-monitor.js :: computeProductHealth() selects
 *   `outcome, processing_time_ms` filtered on venture_id + reported_at.
 *
 * Producers (grep-verified, two writers):
 *   lib/services/telemetry.js :: reportTelemetry(supabase, event)  — generic/shared
 *   lib/services/branding-service.js :: BrandingService#reportTelemetry()  — task-scoped
 *
 * This test asserts both producers write a row shape the consumer can read: `outcome`
 * and `processing_time_ms` populated (not silently null), and — for the shared writer —
 * that the previously-fatal NOT-NULL columns (task_id, service_id) are always populated
 * so the insert does not silently fail (the pre-fix state: 0 rows in service_telemetry
 * despite both writers "succeeding" from the caller's perspective).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportTelemetry as reportGenericTelemetry } from '../../../lib/services/telemetry.js';
import { BrandingService } from '../../../lib/services/branding-service.js';

function createMockSupabase(overrides = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'svc-id-123' }, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  };
  const fromFn = vi.fn().mockReturnValue(chainable);
  return { from: fromFn, _chainable: chainable };
}

const MOCK_VENTURE_ID = '72efb937-981c-495c-b12c-1f006aee50d0';

describe('service_telemetry producer/consumer contract', () => {
  describe('lib/services/telemetry.js reportTelemetry (generic producer)', () => {
    let supabase;
    beforeEach(() => { supabase = createMockSupabase(); });

    it('writes outcome and processing_time_ms when the caller supplies them', async () => {
      await reportGenericTelemetry(supabase, {
        service_key: 'branding',
        venture_id: MOCK_VENTURE_ID,
        event_type: 'artifact_generated',
        outcome: 'success',
        processing_time_ms: 842,
      });

      const insertCall = supabase._chainable.insert.mock.calls[0][0];
      expect(insertCall.outcome).toBe('success');
      expect(insertCall.processing_time_ms).toBe(842);
    });

    it('always populates task_id and service_id (NOT NULL columns) even when the caller omits task_id', async () => {
      await reportGenericTelemetry(supabase, {
        service_key: 'branding',
        venture_id: MOCK_VENTURE_ID,
        event_type: 'routing_decision',
      });

      const insertCall = supabase._chainable.insert.mock.calls[0][0];
      expect(insertCall.task_id).toBeTruthy();
      expect(typeof insertCall.task_id).toBe('string');
      expect(insertCall.service_id).toBe('svc-id-123');
    });

    it('is non-blocking (never throws) when service_key does not resolve, and logs a distinct warning (adversarial-review fix)', async () => {
      const failingSupabase = createMockSupabase({
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
        insert: vi.fn().mockReturnValue({ error: { message: 'null value in column "service_id"' } }),
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(reportGenericTelemetry(failingSupabase, {
        service_key: 'unknown-service',
        venture_id: MOCK_VENTURE_ID,
        event_type: 'artifact_generated',
      })).resolves.toBeUndefined();

      // The unresolvable service_key gets its OWN warning, distinct from the generic
      // insert-failure warning, so the failure is diagnosable without correlating logs.
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('did not resolve to an active ehg_services row'));
      warnSpy.mockRestore();
    });
  });

  describe('lib/services/branding-service.js BrandingService#reportTelemetry (task-scoped producer)', () => {
    it('writes outcome (default success) alongside the existing outcomes jsonb blob', async () => {
      const supabase = createMockSupabase();
      const service = new BrandingService({ supabaseClient: supabase, serviceId: 'svc-id-123' });

      await service.reportTelemetry({
        taskId: 'task-001',
        ventureId: MOCK_VENTURE_ID,
        outcomes: { artifacts_generated: true },
      });

      const insertCall = supabase._chainable.insert.mock.calls[0][0];
      expect(insertCall.outcome).toBe('success');
      expect(insertCall.outcomes).toEqual({ artifacts_generated: true });
    });

    it('completeTask computes processing_time_ms from task creation to completion', async () => {
      const createdAt = new Date(Date.now() - 5000).toISOString();
      const fetchChainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { venture_id: MOCK_VENTURE_ID, service_id: 'svc-id-123', confidence_score: 0.9, created_at: createdAt },
          error: null,
        }),
      };
      const updateChainable = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValue({ error: null }) };
      const telemetryChainable = { insert: vi.fn().mockReturnValue({ error: null }) };

      let callCount = 0;
      const supabase = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'service_telemetry') return telemetryChainable;
          callCount++;
          return callCount === 1 ? fetchChainable : updateChainable;
        }),
      };
      const service = new BrandingService({ supabaseClient: supabase, serviceId: 'svc-id-123' });

      const result = await service.completeTask('task-001', {});

      expect(result.success).toBe(true);
      const insertCall = telemetryChainable.insert.mock.calls[0][0];
      expect(insertCall.outcome).toBe('success');
      expect(insertCall.processing_time_ms).toBeGreaterThanOrEqual(5000);
    });

    it('degrades processing_time_ms to null when task.created_at is missing (no misleading 0ms)', async () => {
      const fetchChainable = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { venture_id: MOCK_VENTURE_ID, service_id: 'svc-id-123', confidence_score: 0.9 },
          error: null,
        }),
      };
      const updateChainable = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValue({ error: null }) };
      const telemetryChainable = { insert: vi.fn().mockReturnValue({ error: null }) };
      let callCount = 0;
      const supabase = {
        from: vi.fn().mockImplementation((table) => {
          if (table === 'service_telemetry') return telemetryChainable;
          callCount++;
          return callCount === 1 ? fetchChainable : updateChainable;
        }),
      };
      const service = new BrandingService({ supabaseClient: supabase, serviceId: 'svc-id-123' });

      await service.completeTask('task-001', {});

      const insertCall = telemetryChainable.insert.mock.calls[0][0];
      expect(insertCall.processing_time_ms).toBeNull();
    });
  });
});
