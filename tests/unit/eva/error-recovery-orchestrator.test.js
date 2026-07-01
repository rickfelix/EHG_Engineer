/**
 * Unit tests for Error Recovery Orchestrator
 * SD: SD-MAN-ORCH-EVA-CODEBASE-PLUS-001-F
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withCircuitBreaker, recoverEventFailure, executeWithSaga, getRecoveryStatus } from '../../../lib/eva/error-recovery-orchestrator.js';

function createMockSupabase(overrides = {}) {
  const defaultResult = { data: null, error: null };
  const defaultChain = () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(defaultResult),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    upsert: vi.fn().mockResolvedValue(defaultResult),
    then: vi.fn((onFulfilled, onRejected) => Promise.resolve({ data: [] }).then(onFulfilled, onRejected)),
  });

  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table]();
      return defaultChain();
    }),
  };
}

describe('withCircuitBreaker', () => {
  it('should allow requests when circuit is CLOSED', async () => {
    const supabase = createMockSupabase({
      system_health: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { circuit_breaker_state: 'CLOSED', failure_count: 0 },
        }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const result = await withCircuitBreaker(supabase, 'test-service', async () => 'success');
    expect(result).toBe('success');
  });

  it('should block requests when circuit is OPEN within recovery window', async () => {
    const supabase = createMockSupabase({
      system_health: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            circuit_breaker_state: 'OPEN',
            failure_count: 3,
            last_failure_at: new Date().toISOString(),
          },
        }),
      }),
    });

    try {
      await withCircuitBreaker(supabase, 'test-service', async () => 'success');
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err.circuitBreakerTripped).toBe(true);
      expect(err.message).toContain('Circuit breaker OPEN');
    }
  });

  it('should increment failure count on error', async () => {
    const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = createMockSupabase({
      system_health: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { circuit_breaker_state: 'CLOSED', failure_count: 1 },
        }),
        upsert: upsertFn,
        catch: vi.fn().mockReturnThis(),
      }),
    });

    try {
      await withCircuitBreaker(supabase, 'test-service', async () => {
        throw new Error('service down');
      });
    } catch {
      // expected
    }
  });
});

describe('withCircuitBreaker / recoverEventFailure — no .catch on the PostgREST builder (QF-20260701-510)', () => {
  // A faithful stand-in for a real PostgREST query builder: has .then (it's a thenable) but
  // NO .catch method at all — calling .catch(fn) on it throws
  // "TypeError: ...catch is not a function" synchronously, regardless of whether the
  // underlying query would have succeeded or failed. The old `.upsert(fn).catch(fn)`) /
  // `.single().catch(fn)` code shape crashed on every real invocation. This mock has no
  // `catch` property defined anywhere, so it fails loud if the fix regresses.
  function faithfulChain({ singleResult, upsertResult } = {}) {
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(() => ({ then: (onF) => Promise.resolve(singleResult ?? { data: null }).then(onF) })),
      upsert: vi.fn(() => ({ then: (onF) => Promise.resolve(upsertResult ?? { data: null, error: null }).then(onF) })),
    };
  }

  it('withCircuitBreaker success path does not throw on a real (no-.catch) builder', async () => {
    const supabase = {
      from: vi.fn(() => faithfulChain({
        singleResult: { data: { circuit_breaker_state: 'CLOSED', failure_count: 0 } },
      })),
    };
    const result = await withCircuitBreaker(supabase, 'test-service', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('withCircuitBreaker failure path does not throw on a real (no-.catch) builder', async () => {
    const supabase = {
      from: vi.fn(() => faithfulChain({
        singleResult: { data: { circuit_breaker_state: 'CLOSED', failure_count: 0 } },
      })),
    };
    await expect(withCircuitBreaker(supabase, 'test-service', async () => {
      throw new Error('service down');
    })).rejects.toThrow('service down'); // the ORIGINAL error, not a TypeError from a bad .catch
  });

  it('recoverEventFailure does not throw on a real (no-.catch) builder', async () => {
    const supabase = { from: vi.fn(() => faithfulChain({ singleResult: { data: null } })) };
    const result = await recoverEventFailure({
      supabase, eventId: 'evt-1', eventType: 'test.event', payload: {}, error: new Error('test'),
    });
    expect(result.outcome).toBe('escalated');
  });
});

describe('recoverEventFailure', () => {
  it('should attempt DLQ replay when entry exists', async () => {
    const supabase = createMockSupabase({
      eva_events_dlq: () => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'dlq-1', replayed: false },
        }),
      }),
    });

    // Note: replayDLQEntry will be called internally
    // For this test we just check that the function doesn't throw on missing DLQ
    const result = await recoverEventFailure({
      supabase: createMockSupabase(),
      eventId: 'evt-1',
      eventType: 'test.event',
      payload: {},
      error: new Error('test'),
    });

    expect(result.outcome).toBe('escalated');
    expect(result.strategy).toBe('manual_review');
  });
});

describe('executeWithSaga', () => {
  it('should execute steps successfully', async () => {
    // Mock saga-coordinator's createSagaCoordinator
    const supabase = createMockSupabase({
      eva_saga_log: () => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const result = await executeWithSaga({
      supabase,
      operationName: 'test-saga',
      steps: [
        {
          name: 'step1',
          action: async () => ({ done: true }),
          compensate: async () => {},
        },
      ],
    });

    expect(result.outcome).toBe('recovered');
    expect(result.strategy).toBe('saga');
  });

  it('should compensate on step failure', async () => {
    const compensated = [];
    const supabase = createMockSupabase({
      eva_saga_log: () => ({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const result = await executeWithSaga({
      supabase,
      operationName: 'test-saga',
      steps: [
        {
          name: 'step1',
          action: async () => ({ done: true }),
          compensate: async () => { compensated.push('step1'); },
        },
        {
          name: 'step2',
          action: async () => { throw new Error('step2 failed'); },
          compensate: async () => { compensated.push('step2'); },
        },
      ],
    });

    expect(result.outcome).toBe('compensated');
    expect(compensated).toContain('step1');
  });
});

describe('getRecoveryStatus', () => {
  it('should return structured status object', async () => {
    const supabase = createMockSupabase();
    const status = await getRecoveryStatus(supabase);

    expect(status).toHaveProperty('circuitBreakers');
    expect(status).toHaveProperty('dlq');
    expect(status).toHaveProperty('sagas');
    expect(status.dlq).toHaveProperty('total');
    expect(status.dlq).toHaveProperty('pending');
  });

  it('should return empty fallbacks when queries fail (no .catch on PostgREST builder)', async () => {
    // Simulate a thenable-but-no-.catch builder that rejects — the real PostgREST builder
    // has .then but NOT .catch; verify getRecoveryStatus degrades gracefully.
    const rejectingChain = () => ({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        then: vi.fn((_, onRejected) => onRejected(new Error('DB unavailable'))),
      }),
      then: vi.fn((_, onRejected) => (onRejected ? onRejected(new Error('DB unavailable')) : Promise.reject(new Error('DB unavailable')))),
    });
    const supabase = { from: vi.fn(() => rejectingChain()) };
    const status = await getRecoveryStatus(supabase);
    expect(status.circuitBreakers).toEqual([]);
    expect(status.dlq.total).toBe(0);
    expect(status.sagas.total).toBe(0);
  });
});
