/**
 * Unit tests for Chairman Decision Watcher
 * SD: SD-EVA-FIX-POST-LAUNCH-001 (FR-5)
 *
 * Tests: waitForDecision, createOrReusePendingDecision
 */

import { describe, it, expect, vi } from 'vitest';
import { createFaithfulRealtimeChannelMock } from '../../helpers/faithful-supabase-realtime-mock.js';

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

import { waitForDecision, createOrReusePendingDecision, createAdvisoryNotification, isFixtureVenture } from '../../../lib/eva/chairman-decision-watcher.js';

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
  // unsubscribe() NOR removeChannel() from inside the callback. These tests use the
  // shared faithful mock (tests/helpers/faithful-supabase-realtime-mock.js), whose
  // removeChannel() WOULD recursively re-invoke the callback (reproducing the real
  // vendored-client behavior), and assert it is never called.
  function makeMockSupabaseWithRecursiveTeardown(singleResults) {
    const { channelMock, removeChannel, getStatusCallback, getRemoveChannelCallCount } =
      createFaithfulRealtimeChannelMock();
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
      removeChannel: vi.fn(removeChannel),
    };
    return {
      supabase,
      getStatusCallback,
      getRemoveChannelCallCount,
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

  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: the reuse lookup must be scoped by decision_type,
  // not just (venture_id, lifecycle_stage, status) -- otherwise minting a NEW decision_type at a
  // stage that already has a pending decision of a DIFFERENT type silently merges the two verdicts
  // into one row instead of creating an independently-tracked decision.
  it('does NOT reuse a pending decision of a DIFFERENT decision_type at the same stage', async () => {
    const eqCalls = [];
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col, val) => { eqCalls.push([col, val]); return chain; }),
        single: vi.fn().mockImplementation(() => {
          const typeFilter = eqCalls.find(([col]) => col === 'decision_type');
          // Only the pre-existing 'stage_gate' decision exists; a 'product_review' lookup finds nothing.
          if (typeFilter && typeFilter[1] === 'product_review') return Promise.resolve({ data: null });
          return Promise.resolve({ data: { id: 'existing-stage-gate-id' } });
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: 'new-product-review-id' }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    };
    const chain = supabase.from();

    const result = await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 23, decisionType: 'product_review', supabase, logger,
    });

    expect(eqCalls).toContainEqual(['decision_type', 'product_review']);
    expect(result.id).toBe('new-product-review-id');
    expect(result.isNew).toBe(true);
    expect(result.id).not.toBe('existing-stage-gate-id'); // never merged with the other type's row
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

  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001: the 23505 exception handler's race-check fallback
  // must ALSO be scoped by decision_type — the same bug class as the pre-check lookup above, but
  // living in the exception path. Simulates a pending 'stage_gate' row already occupying the stage;
  // a 'product_review' insert that 23505s must not have its race-check reuse that unrelated row.
  it('does NOT reuse a raced PENDING decision of a DIFFERENT decision_type (23505 exception path)', async () => {
    let currentEqCalls = [];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col, val) => { currentEqCalls.push([col, val]); return chain; }),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        const typeFilter = currentEqCalls.find(([col]) => col === 'decision_type');
        currentEqCalls = [];
        // Only a pending 'stage_gate' row exists; any query scoped to 'product_review' finds nothing.
        if (typeFilter && typeFilter[1] === 'product_review') return Promise.resolve({ data: null });
        return Promise.resolve({ data: { id: 'existing-stage-gate-id' } });
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique_violation' } }),
        }),
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await expect(createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 23, decisionType: 'product_review', supabase, logger,
    })).rejects.toThrow('Failed to create decision');
  });

  // Same bug class, resolved-decision (re-entry) fallback branch.
  it('does NOT reuse a resolved decision of a DIFFERENT decision_type (23505 exception path)', async () => {
    let currentEqCalls = [];
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col, val) => { currentEqCalls.push([col, val]); return chain; }),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(() => {
        const typeFilter = currentEqCalls.find(([col]) => col === 'decision_type');
        currentEqCalls = [];
        // Only an APPROVED 'stage_gate' row exists; any query scoped to 'product_review' finds nothing.
        if (typeFilter && typeFilter[1] === 'product_review') return Promise.resolve({ data: null });
        return Promise.resolve({ data: { id: 'approved-stage-gate-id' } });
      }),
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique_violation' } }),
        }),
      }),
    };
    const supabase = { from: vi.fn().mockReturnValue(chain) };

    await expect(createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 23, decisionType: 'product_review', supabase, logger,
    })).rejects.toThrow('Failed to create decision');
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

  // SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001 (FR-3): explicit attemptNumber support for
  // multi-attempt/re-review callers, without disturbing the DB default for everyone else.
  it('includes attempt_number in the insert when attemptNumber is explicitly provided', async () => {
    const insertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        insert: insertFn,
      }),
    };

    await createOrReusePendingDecision({
      ventureId: 'v1', stageNumber: 23, decisionType: 'product_review', attemptNumber: 2,
      supabase, logger,
    });

    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ attempt_number: 2 }));
  });

  it('omits attempt_number from the insert when not provided (preserves the DB default for every other caller)', async () => {
    const insertFn = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
      }),
    });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null }),
        insert: insertFn,
      }),
    };

    await createOrReusePendingDecision({ ventureId: 'v1', stageNumber: 10, supabase, logger });

    const insertedRow = insertFn.mock.calls[0][0];
    expect(insertedRow).not.toHaveProperty('attempt_number');
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

// QF-20260703-236: fixture ventures must never mint a chairman decision.
describe('isFixtureVenture', () => {
  it('is true for is_demo:true regardless of name', () => {
    expect(isFixtureVenture({ is_demo: true, name: 'Acme Real Venture' })).toBe(true);
  });

  it('is true for a parity-test- or test-stub name prefix even without is_demo', () => {
    expect(isFixtureVenture({ name: 'parity-test-frontend-123' })).toBe(true);
    expect(isFixtureVenture({ name: 'test-stub-abc' })).toBe(true);
  });

  it('is case-insensitive on the name prefix', () => {
    expect(isFixtureVenture({ name: 'Parity-Test-Cli-1' })).toBe(true);
  });

  it('is false for a real venture name and no is_demo flag', () => {
    expect(isFixtureVenture({ name: 'Acme Real Venture', is_demo: false })).toBe(false);
    expect(isFixtureVenture({ name: 'Acme Real Venture' })).toBe(false);
  });

  it('deliberately does NOT match __citest-prefixed names -- chairman-decision-api.test.js relies on its __citest_chairman__ venture creating REAL decisions', () => {
    expect(isFixtureVenture({ name: '__citest_chairman__:12345' })).toBe(false);
  });

  it('handles null/undefined venture defensively', () => {
    expect(isFixtureVenture(null)).toBe(false);
    expect(isFixtureVenture(undefined)).toBe(false);
  });

  // QF-20260710-243: confirmed live incident specimens (is_demo=false, name doesn't
  // match the old regex) -- __e2e_product_review_gate_adv_...__ (Stage-23) and
  // 'Test Venture for Owned-Audience Loop' (outbound_publish_approval).
  it('is true for an __e2e_-prefixed name even without is_demo', () => {
    expect(isFixtureVenture({ name: '__e2e_product_review_gate_adv_1783723784384__', is_demo: false })).toBe(true);
  });

  it('is true for launch_mode:simulated regardless of name or is_demo', () => {
    expect(isFixtureVenture({ name: 'Test Venture for Owned-Audience Loop', is_demo: false, launch_mode: 'simulated' })).toBe(true);
  });

  it('is false for a real venture with a non-simulated launch_mode', () => {
    expect(isFixtureVenture({ name: 'Acme Real Venture', is_demo: false, launch_mode: 'live' })).toBe(false);
  });
});

describe('createOrReusePendingDecision: fixture-venture guard (QF-20260703-236)', () => {
  const logger = createMockLogger();

  function makeFixtureCheckSb(ventureRow, { onInsert } = {}) {
    return {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: ventureRow, error: null }),
          };
        }
        // chairman_decisions -- should never be reached for a fixture venture
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null }),
          insert: vi.fn().mockImplementation((row) => {
            onInsert?.(row);
            return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'should-not-happen' }, error: null }) }) };
          }),
        };
      }),
    };
  }

  it('skips decision creation for an is_demo:true venture, never touching chairman_decisions', async () => {
    const onInsert = vi.fn();
    const supabase = makeFixtureCheckSb({ is_demo: true, name: 'parity-test-frontend-1' }, { onInsert });

    const result = await createOrReusePendingDecision({ ventureId: 'v1', stageNumber: 17, supabase, logger });

    expect(result).toEqual({ id: null, isNew: false, skipped: true, reason: 'fixture_venture' });
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('skips decision creation for a fixture-named venture even without is_demo', async () => {
    const onInsert = vi.fn();
    const supabase = makeFixtureCheckSb({ is_demo: false, name: 'test-stub-xyz' }, { onInsert });

    const result = await createOrReusePendingDecision({ ventureId: 'v1', stageNumber: 3, supabase, logger });

    expect(result.skipped).toBe(true);
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('does NOT skip a real venture -- proceeds to the normal existing-check/insert flow', async () => {
    const onInsert = vi.fn();
    const supabase = makeFixtureCheckSb({ is_demo: false, name: 'Acme Real Venture' }, { onInsert });

    const result = await createOrReusePendingDecision({ ventureId: 'v1', stageNumber: 10, supabase, logger });

    expect(result.skipped).toBeUndefined();
    expect(onInsert).toHaveBeenCalled();
  });

  it('fails open (proceeds normally) if the venture lookup itself throws', async () => {
    const onInsert = vi.fn();
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockRejectedValue(new Error('connection reset')),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null }),
          insert: vi.fn().mockImplementation((row) => {
            onInsert(row);
            return { select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) }) };
          }),
        };
      }),
    };

    const result = await createOrReusePendingDecision({ ventureId: 'v1', stageNumber: 10, supabase, logger });

    expect(result.id).toBe('new-id');
    expect(onInsert).toHaveBeenCalled();
  });
});

describe('createAdvisoryNotification', () => {
  const logger = createMockLogger();

  it('skips notification creation for a fixture venture (is_demo:true)', async () => {
    const onInsert = vi.fn();
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { is_demo: true, name: 'parity-test-cli-1' }, error: null }),
          };
        }
        return { insert: vi.fn().mockImplementation((row) => { onInsert(row); return { select: () => ({ single: () => Promise.resolve({ data: null }) }) }; }) };
      }),
    };

    const result = await createAdvisoryNotification({ ventureId: 'v1', stageNumber: 23, supabase, logger });

    expect(result).toBeNull();
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('creates a notification for a real venture', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'ventures') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: { is_demo: false, name: 'Acme Real Venture' }, error: null }),
          };
        }
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'advisory-id' }, error: null }) }),
          }),
        };
      }),
    };

    const result = await createAdvisoryNotification({ ventureId: 'v1', stageNumber: 23, supabase, logger });

    expect(result).toEqual({ id: 'advisory-id' });
  });

  it('returns null (does not throw) on missing required args', async () => {
    const result = await createAdvisoryNotification({ stageNumber: 23, supabase: {}, logger });
    expect(result).toBeNull();
  });
});
