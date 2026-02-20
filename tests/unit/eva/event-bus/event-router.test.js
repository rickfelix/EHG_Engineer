/**
 * Unit tests for Event Router (Unified)
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D (updated from SD-EVA-FIX-POST-LAUNCH-001)
 *
 * Tests: processEvent pipeline (persist + fire-and-forget), retry logic,
 *        DLQ routing, idempotency, multi-handler execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock handler-registry before importing event-router
vi.mock('../../../../lib/eva/event-bus/handler-registry.js', () => ({
  getHandlers: vi.fn(),
}));

import { processEvent, replayDLQEntry } from '../../../../lib/eva/event-bus/event-router.js';
import { getHandlers } from '../../../../lib/eva/event-bus/handler-registry.js';

function createMockSupabase(overrides = {}) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [] }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: vi.fn((table) => {
      if (overrides[table]) return overrides[table];
      return { ...selectChain, insert, update };
    }),
  };
}

describe('processEvent (persisted mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns duplicate_event when already processed', async () => {
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [{ id: '1' }] }),
      },
    });

    getHandlers.mockReturnValue([{ name: 'testHandler', handlerFn: vi.fn() }]);

    const event = { id: 'evt-1', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.status).toBe('duplicate_event');
    expect(result.attempts).toBe(0);
  });

  it('returns no_handler when no handler registered', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([]);

    const event = { id: 'evt-2', event_type: 'unknown.type', event_data: {} };
    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.status).toBe('no_handler');
  });

  it('routes to DLQ on validation failure', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events_dlq: { insert: insertFn },
    });
    getHandlers.mockReturnValue([{ name: 'testHandler', handlerFn: vi.fn() }]);

    // stage.completed requires ventureId and stageId
    const event = { id: 'evt-3', event_type: 'stage.completed', event_data: {} };
    const result = await processEvent(supabase, event);

    expect(result.success).toBe(false);
    expect(result.status).toBe('validation_error');
    expect(result.error).toContain('Missing required ventureId');
  });

  it('executes handler successfully on first attempt', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events: { update: updateFn },
    });

    const handlerFn = vi.fn().mockResolvedValue({ outcome: 'ok' });
    getHandlers.mockReturnValue([{ name: 'testHandler', handlerFn, maxRetries: 3 }]);

    const event = { id: 'evt-4', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    expect(result.attempts).toBe(1);
    expect(handlerFn).toHaveBeenCalledOnce();
  });

  it('retries on transient errors with exponential backoff', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events: { update: updateFn },
    });

    let callCount = 0;
    const handlerFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) throw new Error('503 service unavailable');
      return { outcome: 'ok' };
    });
    getHandlers.mockReturnValue([{ name: 'retryHandler', handlerFn, maxRetries: 3 }]);

    const event = { id: 'evt-5', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event, { maxRetries: 3, baseDelayMs: 1 });

    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(handlerFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable errors', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events_dlq: { insert: insertFn },
      eva_events: { update: updateFn },
    });

    const handlerFn = vi.fn().mockRejectedValue(new Error('not found'));
    getHandlers.mockReturnValue([{ name: 'failHandler', handlerFn, maxRetries: 3 }]);

    const event = { id: 'evt-6', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event, { maxRetries: 3, baseDelayMs: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe('partial_failure');
    expect(result.attempts).toBe(1);
    expect(handlerFn).toHaveBeenCalledOnce();
  });

  it('routes to DLQ after max retries exhausted', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events_dlq: { insert: insertFn },
      eva_events: { update: updateFn },
    });

    const handlerFn = vi.fn().mockRejectedValue(new Error('timeout'));
    getHandlers.mockReturnValue([{ name: 'timeoutHandler', handlerFn, maxRetries: 2 }]);

    const event = { id: 'evt-7', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event, { maxRetries: 2, baseDelayMs: 1 });

    expect(result.success).toBe(false);
    expect(result.status).toBe('partial_failure');
    expect(result.attempts).toBe(2);
  });

  it('skips retry when handler.retryable is false', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events_dlq: { insert: insertFn },
      eva_events: { update: updateFn },
    });

    const handlerFn = vi.fn().mockRejectedValue(new Error('timeout'));
    getHandlers.mockReturnValue([{ name: 'noRetry', handlerFn, retryable: false, maxRetries: 3 }]);

    const event = { id: 'evt-8', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event, { maxRetries: 3, baseDelayMs: 1 });

    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('executes multiple handlers and reports per-handler results', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events: { update: updateFn },
    });

    const fn1 = vi.fn().mockResolvedValue('ok');
    const fn2 = vi.fn().mockResolvedValue('ok');
    getHandlers.mockReturnValue([
      { name: 'handler1', handlerFn: fn1, maxRetries: 3 },
      { name: 'handler2', handlerFn: fn2, maxRetries: 3 },
    ]);

    const event = { id: 'evt-multi', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' } };
    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.handlerResults).toHaveLength(2);
    expect(result.handlerResults[0]).toMatchObject({ handler: 'handler1', success: true });
    expect(result.handlerResults[1]).toMatchObject({ handler: 'handler2', success: true });
  });
});

describe('processEvent (fire-and-forget mode)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('executes handlers without DB writes when persist=false', async () => {
    const supabase = createMockSupabase();
    const fn1 = vi.fn().mockResolvedValue('ok');
    const fn2 = vi.fn().mockResolvedValue('ok');
    getHandlers.mockReturnValue([
      { name: 'sub1', handlerFn: fn1 },
      { name: 'sub2', handlerFn: fn2 },
    ]);

    const event = { event_type: 'vision.scored', event_data: { sdKey: 'SD-TEST-001' } };
    const result = await processEvent(supabase, event, { persist: false });

    expect(result.success).toBe(true);
    expect(result.status).toBe('success');
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
    // No DB writes in fire-and-forget
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('catches errors per handler and reports partial_failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = createMockSupabase();
    const fn1 = vi.fn().mockRejectedValue(new Error('sub1 broke'));
    const fn2 = vi.fn().mockResolvedValue('ok');
    getHandlers.mockReturnValue([
      { name: 'sub1', handlerFn: fn1 },
      { name: 'sub2', handlerFn: fn2 },
    ]);

    const event = { event_type: 'vision.scored', event_data: {} };
    const result = await processEvent(supabase, event, { persist: false });

    expect(result.success).toBe(false);
    expect(result.status).toBe('partial_failure');
    expect(result.handlerResults[0]).toMatchObject({ handler: 'sub1', success: false });
    expect(result.handlerResults[1]).toMatchObject({ handler: 'sub2', success: true });
    consoleSpy.mockRestore();
  });

  it('returns no_handler when no handlers registered', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([]);

    const event = { event_type: 'vision.scored', event_data: {} };
    const result = await processEvent(supabase, event, { persist: false });

    expect(result.success).toBe(true);
    expect(result.status).toBe('no_handler');
  });
});

describe('payload validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates stage.completed requires ventureId and stageId', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'h', handlerFn: vi.fn(), maxRetries: 3 }]);

    const r1 = await processEvent(supabase, { id: '1', event_type: 'stage.completed', event_data: { stageId: 's1' } });
    expect(r1.error).toContain('ventureId');

    const r2 = await processEvent(supabase, { id: '2', event_type: 'stage.completed', event_data: { ventureId: 'v1' } });
    expect(r2.error).toContain('stageId');
  });

  it('validates gate.evaluated requires valid outcome', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'h', handlerFn: vi.fn(), maxRetries: 3 }]);

    const r = await processEvent(supabase, {
      id: '3', event_type: 'gate.evaluated',
      event_data: { ventureId: 'v1', gateId: 'g1', outcome: 'invalid' },
    });
    expect(r.error).toContain('Invalid outcome');
  });

  it('validates decision.submitted requires decisionId', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'h', handlerFn: vi.fn(), maxRetries: 3 }]);

    const r = await processEvent(supabase, {
      id: '4', event_type: 'decision.submitted',
      event_data: { ventureId: 'v1' },
    });
    expect(r.error).toContain('decisionId');
  });

  it('validates sd.completed requires sdKey and ventureId', async () => {
    const supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'h', handlerFn: vi.fn(), maxRetries: 3 }]);

    const r = await processEvent(supabase, {
      id: '5', event_type: 'sd.completed',
      event_data: {},
    });
    expect(r.error).toContain('sdKey');
  });

  it('passes validation for unknown event types', async () => {
    const insertFn = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const supabase = createMockSupabase({
      eva_event_ledger: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [] }),
        insert: insertFn,
      },
      eva_events: { update: updateFn },
    });
    const handlerFn = vi.fn().mockResolvedValue({ outcome: 'ok' });
    getHandlers.mockReturnValue([{ name: 'h', handlerFn, maxRetries: 3 }]);

    const r = await processEvent(supabase, { id: '6', event_type: 'custom.event', event_data: {} });
    expect(r.success).toBe(true);
  });
});

describe('replayDLQEntry', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns dlq_entry_not_found for missing entry', async () => {
    const supabase = createMockSupabase({
      eva_events_dlq: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
      },
    });

    const result = await replayDLQEntry(supabase, 'nonexistent');
    expect(result.success).toBe(false);
    expect(result.status).toBe('dlq_entry_not_found');
  });

  it('returns already_replayed for non-dead entries', async () => {
    const supabase = createMockSupabase({
      eva_events_dlq: {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { status: 'replayed' }, error: null }),
      },
    });

    const result = await replayDLQEntry(supabase, 'already-done');
    expect(result.success).toBe(false);
    expect(result.status).toBe('already_replayed');
  });
});
