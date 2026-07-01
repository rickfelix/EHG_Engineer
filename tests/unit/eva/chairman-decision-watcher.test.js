/**
 * Unit tests for Chairman Decision Watcher
 * SD: SD-EVA-FIX-POST-LAUNCH-001 (FR-5)
 *
 * Tests: waitForDecision, createOrReusePendingDecision
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shared-services
vi.mock('../../../lib/eva/shared-services.js', () => ({
  ServiceError: class ServiceError extends Error {
    constructor(code, message, source) {
      super(message);
      this.code = code;
      this.source = source;
    }
  },
}));

import { waitForDecision, createOrReusePendingDecision } from '../../../lib/eva/chairman-decision-watcher.js';

function createMockLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('waitForDecision', () => {
  it('throws on missing decisionId', async () => {
    await expect(
      waitForDecision({ supabase: {} }),
    ).rejects.toThrow('decisionId and supabase are required');
  });

  it('throws on missing supabase', async () => {
    await expect(
      waitForDecision({ decisionId: 'd1' }),
    ).rejects.toThrow('decisionId and supabase are required');
  });

  it('returns immediately if decision already resolved', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { status: 'approved', rationale: 'good idea', decision: 'approve' },
        }),
      }),
    };
    const logger = createMockLogger();

    const result = await waitForDecision({ decisionId: 'd1', supabase, logger });
    expect(result.status).toBe('approved');
    expect(result.rationale).toBe('good idea');
    expect(result.decision).toBe('approve');
  });

  it('rejects with timeout when timeoutMs is exceeded', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'pending' } }),
      }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn((cb) => { cb('CHANNEL_ERROR'); return {}; }),
      }),
      removeChannel: vi.fn(),
    };
    const logger = createMockLogger();

    await expect(
      waitForDecision({ decisionId: 'd1', supabase, logger, timeoutMs: 50 }),
    ).rejects.toThrow('timed out');
  }, 5000);

  // QF-20260701-762: PR #5305's original fix (calling supabase.removeChannel() from
  // inside the status callback) was INEFFECTIVE -- removeChannel() also calls
  // unsubscribe() internally, which under a no-reachable-Realtime-server condition
  // synchronously re-fires this same status callback via phoenix's Channel.leave(),
  // reproducing the identical RangeError: Maximum call stack size exceeded (proven by
  // ae499d9957 / QF-20260701-709 on the sibling reality-gates.js/stage-governance.js
  // channels). The correct fix drops the local reference only and calls NEITHER
  // unsubscribe() NOR removeChannel() from inside the callback. These tests use a mock
  // whose removeChannel() WOULD recursively re-invoke the callback (reproducing the
  // real vendored-client behavior) and assert it is never called.
  function makeMockSupabaseWithRecursiveTeardown(singleResults) {
    let capturedStatusCallback = null;
    let removeChannelCallCount = 0;
    const channelMock = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((cb) => {
        capturedStatusCallback = cb;
        return channelMock;
      }),
    };
    const singleMock = vi.fn();
    singleResults.forEach((r) => singleMock.mockResolvedValueOnce(r));
    singleMock.mockResolvedValue(singleResults[singleResults.length - 1]);
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: singleMock,
      }),
      channel: vi.fn().mockReturnValue(channelMock),
      removeChannel: vi.fn(() => {
        removeChannelCallCount++;
        if (removeChannelCallCount > 100) {
          throw new Error('removeChannel recursion guard tripped -- test itself would overflow');
        }
        capturedStatusCallback?.('CLOSED'); // simulates phoenix's synchronous Channel.leave() re-fire
      }),
    };
    return {
      supabase,
      getStatusCallback: () => capturedStatusCallback,
      getRemoveChannelCallCount: () => removeChannelCallCount,
    };
  }

  it('CHANNEL_ERROR/TIMED_OUT/CLOSED drops the reference WITHOUT calling removeChannel() (which would recurse), then resolves via polling', async () => {
    vi.useFakeTimers();
    try {
      const { supabase, getStatusCallback, getRemoveChannelCallCount } = makeMockSupabaseWithRecursiveTeardown([
        { data: { status: 'pending' } },
        { data: { status: 'approved', rationale: null, decision: 'approve' } },
      ]);
      const logger = createMockLogger();

      const promise = waitForDecision({ decisionId: 'd1', supabase, logger });
      await vi.advanceTimersByTimeAsync(0); // let the initial lookup + subscribe() registration settle

      expect(() => getStatusCallback()('CHANNEL_ERROR')).not.toThrow();
      expect(getRemoveChannelCallCount()).toBe(0);

      await vi.advanceTimersByTimeAsync(10_000); // advance past the polling interval
      const result = await promise;

      expect(result.status).toBe('approved');
      expect(getRemoveChannelCallCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a genuinely re-entrant CLOSED/TIMED_OUT re-fire (simulating phoenix Channel.leave()) does not throw and calls removeChannel zero times', async () => {
    vi.useFakeTimers();
    try {
      const { supabase, getStatusCallback, getRemoveChannelCallCount } = makeMockSupabaseWithRecursiveTeardown([
        { data: { status: 'pending' } },
      ]);
      const logger = createMockLogger();

      waitForDecision({ decisionId: 'd1', supabase, logger }).catch(() => {});
      await vi.advanceTimersByTimeAsync(0);

      const statusCallback = getStatusCallback();
      expect(() => {
        statusCallback('CLOSED');
        statusCallback('TIMED_OUT');
        statusCallback('CHANNEL_ERROR');
      }).not.toThrow();

      expect(getRemoveChannelCallCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createOrReusePendingDecision', () => {
  const logger = createMockLogger();

  it('throws on missing required arguments', async () => {
    await expect(
      createOrReusePendingDecision({ supabase: {}, stageNumber: 10, logger }),
    ).rejects.toThrow('ventureId, stageNumber, and supabase are required');

    await expect(
      createOrReusePendingDecision({ ventureId: 'v1', supabase: {}, logger }),
    ).rejects.toThrow('ventureId, stageNumber, and supabase are required');
  });

  it('reuses existing pending decision', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'existing-id' } }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    };

    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10, supabase, logger,
    });
    expect(result.id).toBe('existing-id');
    expect(result.isNew).toBe(false);
  });

  it('creates new decision when none exists', async () => {
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First call (check existing) - none found
            return Promise.resolve({ data: null });
          }
          // Second call (after insert) - return created
          return Promise.resolve({ data: { id: 'new-id' }, error: null });
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
          }),
        }),
      }),
    };

    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 22, supabase, logger,
    });
    expect(result.id).toBe('new-id');
    expect(result.isNew).toBe(true);
  });

  it('handles race condition (23505 unique constraint)', async () => {
    let callCount = 0;
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ data: null }); // No existing
          // After race condition, find the winner
          return Promise.resolve({ data: { id: 'raced-id' } });
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique_violation' } }),
          }),
        }),
      }),
    };

    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10, supabase, logger,
    });
    expect(result.id).toBe('raced-id');
    expect(result.isNew).toBe(false);
  });

  it('throws on non-race-condition insert error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { code: '42P01', message: 'table not found' } }),
          }),
        }),
      }),
    };

    await expect(
      createOrReusePendingDecision({
        ventureId: 'v1', stageNumber: 10, supabase, logger,
      }),
    ).rejects.toThrow('Failed to create decision');
  });

  it('updates brief_data when reusing existing decision', async () => {
    const updateFn = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'existing-id' } }),
        update: updateFn,
      }),
    };

    await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10,
      briefData: { key: 'value' }, summary: 'updated',
      supabase, logger,
    });

    expect(updateFn).toHaveBeenCalledWith({
      brief_data: { key: 'value' },
      summary: 'updated',
    });
  });

  // SD-MAN-FIX-FIX-DUPLICATE-ARTIFACTS-001: decision_type defaults to 'stage_gate'
  it('sets decision_type to stage_gate by default', async () => {
    const insertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }), // No existing
        insert: insertFn,
      }),
    };

    await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10, supabase, logger,
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ decision_type: 'stage_gate' }),
    );
  });

  // SD-LEO-INFRA-HEALTH-ROLLUP-CORRECTNESS-001 FR-2: a healthOverride (gate-derived health for a
  // route-to-review HOLD) takes precedence over the advisory-derived resolveDecisionHealth, so a
  // numeric-PASS HOLD is stamped green, not a blanket red.
  it('stamps healthOverride on the minted decision when provided', async () => {
    const insertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }), // No existing
        maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        insert: insertFn,
      }),
    };

    await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 5, healthOverride: 'green', supabase, logger,
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ health_score: 'green' }),
    );
  });

  // SD-MAN-FIX-FIX-DUPLICATE-ARTIFACTS-001: custom decision_type is preserved
  it('uses custom decision_type when provided', async () => {
    const insertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }), // No existing
        insert: insertFn,
      }),
    };

    await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 10, decisionType: 'review',
      supabase, logger,
    });

    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ decision_type: 'review' }),
    );
  });

  // SD-VW-FIX-WORKER-GATE-REENTRY-001: Test re-entry after approval
  it('handles 23505 when existing decision is already approved', async () => {
    let fromCallCount = 0;
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        fromCallCount++;
        const chain = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            if (fromCallCount === 1) {
              // First: check for pending — none found
              return Promise.resolve({ data: null });
            }
            if (fromCallCount === 2) {
              // Second: check for pending after 23505 — none found
              return Promise.resolve({ data: null });
            }
            // Third: check for approved/rejected — found
            return Promise.resolve({ data: { id: 'approved-id' } });
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: '23505', message: 'unique_violation' },
              }),
            }),
          }),
        };
        return chain;
      }),
    };

    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 5, supabase, logger,
    });
    expect(result.id).toBe('approved-id');
    expect(result.isNew).toBe(false);
  });
});
