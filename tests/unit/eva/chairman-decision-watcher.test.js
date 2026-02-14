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
});
