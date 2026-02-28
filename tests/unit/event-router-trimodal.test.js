/**
 * Tri-Modal Event Router Tests
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-021
 *
 * Verifies that processEvent dispatches events through the correct routing path:
 * - EVENT: Direct handler execution with retry, ledger, DLQ
 * - ROUND: Deferred to master scheduler via runRound()
 * - PRIORITY_QUEUE: Enqueued into sub_agent_queue with urgent priority
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock handler-registry
vi.mock('../../lib/eva/event-bus/handler-registry.js', () => ({
  getHandlers: vi.fn(() => []),
}));

// Mock rounds-scheduler
vi.mock('../../lib/eva/rounds-scheduler.js', () => ({
  runRound: vi.fn(),
}));

import { getHandlers } from '../../lib/eva/event-bus/handler-registry.js';
import { runRound } from '../../lib/eva/rounds-scheduler.js';
import {
  classifyRoutingMode,
  ROUTING_MODES,
  processEvent,
  dispatchByMode,
} from '../../lib/eva/event-bus/event-router.js';

// Mock supabase client
function createMockSupabase() {
  const insertResult = { data: { id: 'queue-123' }, error: null };
  const selectResult = { data: [], error: null };
  const updateResult = { data: null, error: null };

  const makeChain = () => ({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(insertResult),
      }),
    }),
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(selectResult),
        }),
        limit: vi.fn().mockResolvedValue(selectResult),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue(updateResult),
    }),
  });

  const chains = {};
  return {
    from: vi.fn((table) => {
      if (!chains[table]) chains[table] = makeChain();
      return chains[table];
    }),
    _chains: chains,
    _insertResult: insertResult,
  };
}

describe('classifyRoutingMode', () => {
  it('classifies governance events as PRIORITY_QUEUE', () => {
    expect(classifyRoutingMode('guardrail.violated', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('cascade.violated', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('okr.hard_stop', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('chairman.decision_required', {})).toBe(ROUTING_MODES.PRIORITY_QUEUE);
  });

  it('classifies critical/urgent payloads as PRIORITY_QUEUE', () => {
    expect(classifyRoutingMode('custom.event', { priority: 'critical' })).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(classifyRoutingMode('custom.event', { urgent: true })).toBe(ROUTING_MODES.PRIORITY_QUEUE);
  });

  it('classifies round.* events as ROUND', () => {
    expect(classifyRoutingMode('round.vision_rescore', {})).toBe(ROUTING_MODES.ROUND);
    expect(classifyRoutingMode('round.gap_analysis', {})).toBe(ROUTING_MODES.ROUND);
  });

  it('classifies cadence.* events as ROUND', () => {
    expect(classifyRoutingMode('cadence.daily', {})).toBe(ROUTING_MODES.ROUND);
    expect(classifyRoutingMode('cadence.weekly', {})).toBe(ROUTING_MODES.ROUND);
  });

  it('classifies payload routingMode=ROUND as ROUND', () => {
    expect(classifyRoutingMode('custom.event', { routingMode: 'ROUND' })).toBe(ROUTING_MODES.ROUND);
  });

  it('classifies standard events as EVENT', () => {
    expect(classifyRoutingMode('stage.completed', {})).toBe(ROUTING_MODES.EVENT);
    expect(classifyRoutingMode('decision.submitted', {})).toBe(ROUTING_MODES.EVENT);
    expect(classifyRoutingMode('sd.completed', {})).toBe(ROUTING_MODES.EVENT);
  });
});

describe('processEvent — ROUND dispatch', () => {
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'test-handler', handlerFn: vi.fn() }]);
    runRound.mockResolvedValue({ success: true });
  });

  it('defers round.* events to scheduler via runRound()', async () => {
    const event = {
      id: 'evt-1',
      event_type: 'round.vision_rescore',
      event_data: { ventureId: 'v1' },
    };

    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.routingMode).toBe(ROUTING_MODES.ROUND);
    expect(result.status).toBe('deferred_to_scheduler');
    expect(runRound).toHaveBeenCalledWith('vision_rescore', expect.objectContaining({
      supabase,
      payload: event.event_data,
    }));
  });

  it('does NOT call direct handlers for ROUND events', async () => {
    const handlerFn = vi.fn();
    getHandlers.mockReturnValue([{ name: 'test-handler', handlerFn }]);

    const event = {
      id: 'evt-2',
      event_type: 'round.gap_analysis',
      event_data: {},
    };

    await processEvent(supabase, event);

    expect(handlerFn).not.toHaveBeenCalled();
  });

  it('falls back to EVENT mode if scheduler unavailable', async () => {
    runRound.mockRejectedValue(new Error('Scheduler not started'));
    const handlerFn = vi.fn();
    getHandlers.mockReturnValue([{ name: 'fallback-handler', handlerFn }]);

    const event = {
      id: 'evt-3',
      event_type: 'round.stage_health',
      event_data: { ventureId: 'v1' },
    };

    const result = await processEvent(supabase, event);

    // Should still succeed via fallback to EVENT mode
    expect(result.routingMode).toBe(ROUTING_MODES.EVENT);
    expect(handlerFn).toHaveBeenCalled();
  });
});

describe('processEvent — PRIORITY_QUEUE dispatch', () => {
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'test-handler', handlerFn: vi.fn() }]);
  });

  it('enqueues governance events into sub_agent_queue', async () => {
    const event = {
      id: 'evt-4',
      event_type: 'guardrail.violated',
      event_data: { ventureId: 'v1', rule: 'max-spend' },
    };

    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.routingMode).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(result.status).toBe('enqueued');
    expect(supabase.from).toHaveBeenCalledWith('sub_agent_queue');
  });

  it('does NOT call direct handlers for PRIORITY_QUEUE events', async () => {
    const handlerFn = vi.fn();
    getHandlers.mockReturnValue([{ name: 'test-handler', handlerFn }]);

    const event = {
      id: 'evt-5',
      event_type: 'cascade.violated',
      event_data: {},
    };

    await processEvent(supabase, event);

    expect(handlerFn).not.toHaveBeenCalled();
  });

  it('sets priority=urgent and preemption=true on enqueued events', async () => {
    const event = {
      id: 'evt-6',
      event_type: 'chairman.override',
      event_data: { decision: 'block' },
    };

    await processEvent(supabase, event);

    const queueChain = supabase._chains['sub_agent_queue'];
    expect(queueChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: 'urgent',
        metadata: expect.objectContaining({ preemption: true }),
      })
    );
  });

  it('persists governance events even in fire-and-forget mode', async () => {
    const event = {
      id: 'evt-7',
      event_type: 'guardrail.violated',
      event_data: { priority: 'critical' },
    };

    const result = await processEvent(supabase, event, { persist: false });

    expect(result.routingMode).toBe(ROUTING_MODES.PRIORITY_QUEUE);
    expect(result.status).toBe('enqueued');
  });
});

describe('processEvent — EVENT dispatch (backward compatibility)', () => {
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
  });

  it('executes handlers directly for EVENT-classified events', async () => {
    const handlerFn = vi.fn();
    getHandlers.mockReturnValue([{ name: 'stage-handler', handlerFn }]);

    const event = {
      id: 'evt-8',
      event_type: 'stage.completed',
      event_data: { ventureId: 'v1', stageId: 's1' },
    };

    const result = await processEvent(supabase, event);

    expect(result.routingMode).toBe(ROUTING_MODES.EVENT);
    expect(handlerFn).toHaveBeenCalledWith(event.event_data, expect.objectContaining({ supabase }));
  });

  it('creates ledger entries for EVENT-mode processing', async () => {
    const handlerFn = vi.fn();
    getHandlers.mockReturnValue([{ name: 'ledger-handler', handlerFn }]);

    const event = {
      id: 'evt-9',
      event_type: 'decision.submitted',
      event_data: { ventureId: 'v1', decisionId: 'd1' },
    };

    await processEvent(supabase, event);

    expect(supabase.from).toHaveBeenCalledWith('eva_event_ledger');
  });

  it('routes to DLQ on handler failure after max retries', async () => {
    const handlerFn = vi.fn().mockRejectedValue(new Error('timeout'));
    getHandlers.mockReturnValue([{ name: 'failing-handler', handlerFn, maxRetries: 2 }]);

    const event = {
      id: 'evt-10',
      event_type: 'stage.completed',
      event_data: { ventureId: 'v1', stageId: 's1' },
    };

    const result = await processEvent(supabase, event, { maxRetries: 2, baseDelayMs: 1 });

    expect(result.success).toBe(false);
    expect(supabase.from).toHaveBeenCalledWith('eva_events_dlq');
  });

  it('returns no_handler for events with no registered handlers', async () => {
    getHandlers.mockReturnValue([]);

    const event = {
      id: 'evt-11',
      event_type: 'unknown.event',
      event_data: {},
    };

    const result = await processEvent(supabase, event);

    expect(result.success).toBe(true);
    expect(result.status).toBe('no_handler');
  });
});

describe('dispatchByMode', () => {
  let supabase;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
    getHandlers.mockReturnValue([{ name: 'test-handler', handlerFn: vi.fn() }]);
    runRound.mockResolvedValue({ success: true });
  });

  it('returns routingMode in all responses', async () => {
    // EVENT
    const eventResult = await dispatchByMode(supabase, {
      id: 'e1', event_type: 'stage.completed', event_data: { ventureId: 'v1', stageId: 's1' },
    });
    expect(eventResult.routingMode).toBe(ROUTING_MODES.EVENT);

    // ROUND
    const roundResult = await dispatchByMode(supabase, {
      id: 'e2', event_type: 'round.test', event_data: {},
    });
    expect(roundResult.routingMode).toBe(ROUTING_MODES.ROUND);

    // PRIORITY_QUEUE
    const pqResult = await dispatchByMode(supabase, {
      id: 'e3', event_type: 'guardrail.violated', event_data: {},
    });
    expect(pqResult.routingMode).toBe(ROUTING_MODES.PRIORITY_QUEUE);
  });
});
