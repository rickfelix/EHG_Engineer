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

  // SD-FDBK-ENH-CANARY-VENTURE-PROBE-001: CHANNEL_ERROR/TIMED_OUT must tear down the
  // errored channel via removeChannel before polling starts, or the vendored phoenix
  // client's Channel.trigger/onClose can recurse into a stack-overflow crash.
  it('removes the errored channel before falling back to polling on CHANNEL_ERROR, with no duplicate removeChannel when later resolved via polling', async () => {
    vi.useFakeTimers();
    try {
      const channelMock = { on: vi.fn().mockReturnThis() };
      channelMock.subscribe = vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return channelMock;
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
            .mockResolvedValueOnce({ data: { status: 'pending' } })
            .mockResolvedValue({ data: { status: 'approved', rationale: null, decision: 'approve' } }),
        }),
        channel: vi.fn().mockReturnValue(channelMock),
        removeChannel: vi.fn(),
      };
      const logger = createMockLogger();

      const promise = waitForDecision({ decisionId: 'd1', supabase, logger });

      // Let the deferred CHANNEL_ERROR callback fire (subscription is already assigned by now).
      await vi.advanceTimersByTimeAsync(0);
      expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
      expect(supabase.removeChannel).toHaveBeenCalledWith(channelMock);

      // Advance past the polling interval so the decision resolves via the fallback.
      await vi.advanceTimersByTimeAsync(10_000);
      const result = await promise;

      expect(result.status).toBe('approved');
      // cleanup() must not double-remove — subscription was already nulled by the error branch.
      expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('removes the errored channel on TIMED_OUT as well as CHANNEL_ERROR', async () => {
    vi.useFakeTimers();
    try {
      const channelMock = { on: vi.fn().mockReturnThis() };
      channelMock.subscribe = vi.fn((cb) => {
        setTimeout(() => cb('TIMED_OUT'), 0);
        return channelMock;
      });
      const supabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { status: 'pending' } }),
        }),
        channel: vi.fn().mockReturnValue(channelMock),
        removeChannel: vi.fn(),
      };
      const logger = createMockLogger();

      // 3000ms deliberately avoids colliding with waitForDecision's own 5000ms polling
      // safety-net setTimeout, which would otherwise also fire in the same timer flush.
      const promise = waitForDecision({ decisionId: 'd1', supabase, logger, timeoutMs: 3000 });
      // Attach the rejection expectation immediately so it isn't flagged as briefly
      // unhandled once fake-timer advancement causes the promise to actually reject.
      const rejection = expect(promise).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(0);

      expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
      expect(supabase.removeChannel).toHaveBeenCalledWith(channelMock);

      await vi.advanceTimersByTimeAsync(3000);
      await rejection;
      // cleanup() from the timeout handler must not double-remove the already-nulled subscription.
      expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
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
