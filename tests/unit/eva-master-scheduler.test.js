/**
 * Unit Tests: EVA Master Scheduler
 * SD: SD-EVA-FEAT-SCHEDULER-001
 *
 * Test Scenarios (from PRD):
 *   TS-1: Single poll - select, dispatch, record metrics
 *   TS-2: Priority ordering - higher blocking_decision_age first
 *   TS-3: Cadence limit - max_stages_per_cycle stops dispatch
 *   TS-4: Circuit breaker OPEN - poll skips dispatch
 *   TS-5: Non-blocking metrics (TR-4) - metric write failure doesn't halt dispatch
 *   TS-6: Concurrent instances - RPC fallback prevents double-dispatch
 *   TS-7: Observe-only mode - stages logged but not dispatched
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock processStage before import
vi.mock('../../lib/eva/eva-orchestrator.js', () => ({
  processStage: vi.fn(),
}));

import { EvaMasterScheduler } from '../../lib/eva/eva-master-scheduler.js';
import { processStage } from '../../lib/eva/eva-orchestrator.js';

// ── Mock Factories ──────────────────────────────────────────────

/**
 * Build a chainable mock Supabase client.
 *
 * Mirrors the real Supabase PostgREST builder pattern where every method
 * returns the builder itself (enabling chaining) and the result is
 * resolved as a thennable at the end of the chain.
 *
 * Chain methods: from, select, eq, order, limit, update, insert, upsert
 * Terminal methods: single, rpc
 *
 * Key insight: `.update({...}).eq(...)` requires `update` to return the
 * builder (not a promise), because `.eq()` is called on the return value.
 * The Supabase JS client makes the builder itself thennable, so `await`
 * on the chain works without an explicit terminal method.
 */
function createMockSupabase() {
  // Default resolved value for chains that end without an explicit terminal
  const defaultResult = { data: null, error: null };

  const builder = {
    // These are all chainable (return builder)
    from: null,     // set below
    select: null,   // set below
    eq: null,       // set below
    order: null,    // set below
    limit: null,    // set below
    update: null,   // set below — chainable because .eq() follows
    insert: null,   // set below — chainable so await works
    upsert: null,   // set below — chainable so await works

    // Terminal methods (return promises)
    single: vi.fn().mockResolvedValue(defaultResult),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),

    // Make the builder itself thennable so `await supabase.from(...).update(...).eq(...)` works
    then: vi.fn((resolve) => resolve(defaultResult)),
  };

  // All chainable methods return builder
  builder.from = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.upsert = vi.fn().mockReturnValue(builder);

  return builder;
}

function createMockLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockCircuitBreaker(state = 'CLOSED') {
  return {
    getState: vi.fn().mockResolvedValue(state),
    recordSuccess: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Helper: build a venture queue entry returned by the RPC or fallback query.
 */
function makeVentureEntry(overrides = {}) {
  return {
    queue_id: 'q-1',
    venture_id: 'venture-aaa',
    blocking_decision_age_seconds: 3600,
    priority_score: 50,
    fifo_key: '2026-01-01T00:00:00Z',
    max_stages_per_cycle: 5,
    dispatch_count: 0,
    error_count: 0,
    ...overrides,
  };
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Configure mock Supabase so that:
 *  - _selectVentures (RPC) returns `ventures`
 *  - _getQueueDepth returns `queueDepth`
 *  - _isVentureBlocked returns false (not blocked)
 *  - _emitMetric, _updateHeartbeat succeed silently
 *  - queue .update calls succeed
 */
function configureMockForPoll(mockSupabase, {
  ventures = [],
  queueDepth = ventures.length,
  blockVentures = false,
} = {}) {
  // Track which table is being queried so we can return context-appropriate data
  let lastTable = null;

  mockSupabase.from.mockImplementation((table) => {
    lastTable = table;
    return mockSupabase;
  });

  // RPC: select_schedulable_ventures
  mockSupabase.rpc.mockResolvedValue({ data: ventures, error: null });

  // select() with count option for _getQueueDepth (head: true)
  mockSupabase.select.mockImplementation((cols, opts) => {
    if (opts && opts.count === 'exact' && opts.head === true) {
      // _getQueueDepth: .select('*', { count: 'exact', head: true }).eq('status', 'pending')
      return {
        eq: vi.fn().mockResolvedValue({ count: queueDepth, error: null }),
      };
    }
    return mockSupabase;
  });

  // eq + single for _isVentureBlocked (eva_ventures table)
  mockSupabase.single.mockImplementation(() => {
    if (lastTable === 'eva_ventures') {
      return Promise.resolve({
        data: blockVentures
          ? { orchestrator_state: 'blocked' }
          : { orchestrator_state: 'active' },
        error: null,
      });
    }
    if (lastTable === 'eva_scheduler_heartbeat') {
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  // eq returns builder for chaining
  mockSupabase.eq.mockImplementation(() => mockSupabase);

  // limit for _isVentureBlocked decisions query
  mockSupabase.limit.mockImplementation(() => {
    if (lastTable === 'eva_decisions') {
      return Promise.resolve({ data: [], error: null }); // no pending decisions
    }
    return mockSupabase;
  });

  // update / insert / upsert return builder (chainable)
  mockSupabase.update.mockReturnValue(mockSupabase);
  mockSupabase.insert.mockReturnValue(mockSupabase);
  mockSupabase.upsert.mockReturnValue(mockSupabase);

  // Make builder thennable (await resolves to success)
  mockSupabase.then.mockImplementation((resolve) =>
    resolve({ data: null, error: null }),
  );
}

// ── Test Suite ──────────────────────────────────────────────────

describe('EvaMasterScheduler', () => {
  let scheduler;
  let mockSupabase;
  let mockLogger;
  let mockCB;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = createMockSupabase();
    mockLogger = createMockLogger();
    mockCB = createMockCircuitBreaker('CLOSED');

    // Default: processStage completes successfully
    processStage.mockResolvedValue({
      status: 'COMPLETED',
      stageId: 1,
      filterDecision: { action: 'AUTO_PROCEED' },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Constructor ───────────────────────────────────────────────

  describe('constructor', () => {
    test('should use default config when no overrides given', () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      expect(scheduler.pollIntervalMs).toBe(60_000);
      expect(scheduler.dispatchBatchSize).toBe(20);
      expect(scheduler.observeOnly).toBe(false);
      expect(scheduler.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/);
    });

    test('should accept config overrides', () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        config: {
          pollIntervalMs: 5000,
          dispatchBatchSize: 3,
          observeOnly: true,
          statusTopN: 5,
        },
      });

      expect(scheduler.pollIntervalMs).toBe(5000);
      expect(scheduler.dispatchBatchSize).toBe(3);
      expect(scheduler.observeOnly).toBe(true);
      expect(scheduler.statusTopN).toBe(5);
    });

    test('should default to console when no logger provided', () => {
      scheduler = new EvaMasterScheduler({ supabase: mockSupabase });
      expect(scheduler.logger).toBe(console);
    });

    test('should accept a circuit breaker adapter', () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        circuitBreaker: mockCB,
      });
      expect(scheduler.circuitBreaker).toBe(mockCB);
    });

    test('should initialize internal counters to zero', () => {
      scheduler = new EvaMasterScheduler({ supabase: mockSupabase });
      expect(scheduler._pollCount).toBe(0);
      expect(scheduler._totalDispatches).toBe(0);
      expect(scheduler._totalErrors).toBe(0);
      expect(scheduler._metricsWriteFailures).toBe(0);
    });
  });

  // ── TS-1: Single Poll -> Select, Dispatch, Metrics ────────────

  describe('TS-1: Single poll selects pending ventures, dispatches, records metrics', () => {
    beforeEach(() => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { dispatchBatchSize: 20 },
      });
    });

    test('should call RPC to select schedulable ventures', async () => {
      const ventures = [makeVentureEntry()];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'select_schedulable_ventures',
        { p_batch_size: 20 },
      );
    });

    test('should dispatch each selected venture via processStage', async () => {
      const ventures = [
        makeVentureEntry({ venture_id: 'v-1', max_stages_per_cycle: 1 }),
        makeVentureEntry({ venture_id: 'v-2', max_stages_per_cycle: 1 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      expect(processStage).toHaveBeenCalledTimes(2);
      expect(processStage).toHaveBeenCalledWith(
        { ventureId: 'v-1', options: { autoProceed: true } },
        { supabase: mockSupabase, logger: mockLogger },
      );
      expect(processStage).toHaveBeenCalledWith(
        { ventureId: 'v-2', options: { autoProceed: true } },
        { supabase: mockSupabase, logger: mockLogger },
      );
    });

    test('should emit scheduler_poll metric after dispatching', async () => {
      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures, queueDepth: 5 });

      await scheduler.poll();

      // _emitMetric calls .from('eva_scheduler_metrics').insert({...})
      const insertCalls = mockSupabase.insert.mock.calls;
      const pollMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_poll',
      );
      expect(pollMetric).toBeDefined();
      expect(pollMetric[0].dispatched_count).toBeGreaterThanOrEqual(1);
      expect(pollMetric[0].queue_depth).toBe(5);
      expect(pollMetric[0].paused).toBe(false);
      expect(pollMetric[0].duration_ms).toBeGreaterThanOrEqual(0);
    });

    test('should emit scheduler_dispatch metric per venture', async () => {
      const ventures = [makeVentureEntry({ venture_id: 'v-metric', max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      const insertCalls = mockSupabase.insert.mock.calls;
      const dispatchMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_dispatch',
      );
      expect(dispatchMetric).toBeDefined();
      expect(dispatchMetric[0].venture_id).toBe('v-metric');
      expect(dispatchMetric[0].outcome).toBe('success');
    });

    test('should increment _pollCount and _totalDispatches', async () => {
      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      expect(scheduler._pollCount).toBe(1);
      expect(scheduler._totalDispatches).toBe(1);
    });

    test('should do nothing when no ventures are pending', async () => {
      configureMockForPoll(mockSupabase, { ventures: [], queueDepth: 0 });

      await scheduler.poll();

      expect(processStage).not.toHaveBeenCalled();
      expect(scheduler._totalDispatches).toBe(0);
    });

    test('should update eva_scheduler_queue after successful dispatch', async () => {
      const ventures = [makeVentureEntry({ venture_id: 'v-update', max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      // Should call .from('eva_scheduler_queue').update(...).eq('venture_id', ...)
      const fromCalls = mockSupabase.from.mock.calls;
      const queueUpdateCall = fromCalls.find(
        (call) => call[0] === 'eva_scheduler_queue',
      );
      expect(queueUpdateCall).toBeDefined();
    });
  });

  // ── TS-2: Priority Ordering ──────────────────────────────────

  describe('TS-2: Priority ordering - higher blocking_decision_age dispatched first', () => {
    test('should pass batch size to RPC for server-side priority ordering', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { dispatchBatchSize: 10 },
      });

      // RPC handles ordering server-side
      const orderedVentures = [
        makeVentureEntry({ venture_id: 'v-old', blocking_decision_age_seconds: 7200, max_stages_per_cycle: 1 }),
        makeVentureEntry({ venture_id: 'v-new', blocking_decision_age_seconds: 600, max_stages_per_cycle: 1 }),
      ];
      configureMockForPoll(mockSupabase, { ventures: orderedVentures });

      await scheduler.poll();

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'select_schedulable_ventures',
        { p_batch_size: 10 },
      );

      // Dispatch order matches RPC order (server pre-sorted)
      const callOrder = processStage.mock.calls.map((c) => c[0].ventureId);
      expect(callOrder[0]).toBe('v-old');
      expect(callOrder[1]).toBe('v-new');
    });

    test('should fall back to direct query with ORDER BY when RPC fails', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { dispatchBatchSize: 5 },
      });

      // RPC fails
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RPC not found' },
      });

      // Fallback query: from().select().eq().order().order().limit()
      const fallbackData = [
        {
          id: 'q-1',
          venture_id: 'v-fallback-1',
          blocking_decision_age_seconds: 5000,
          fifo_key: '2026-01-01T00:00:00Z',
          max_stages_per_cycle: 1,
          status: 'pending',
        },
      ];

      // Configure the fallback chain
      let lastTable = null;
      mockSupabase.from.mockImplementation((table) => {
        lastTable = table;
        return mockSupabase;
      });
      mockSupabase.select.mockImplementation((cols, opts) => {
        if (opts && opts.count === 'exact' && opts.head === true) {
          return { eq: vi.fn().mockResolvedValue({ count: 1, error: null }) };
        }
        return mockSupabase;
      });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockReturnValue(mockSupabase);
      mockSupabase.limit.mockImplementation(() => {
        if (lastTable === 'eva_scheduler_queue') {
          return Promise.resolve({ data: fallbackData, error: null });
        }
        if (lastTable === 'eva_decisions') {
          return Promise.resolve({ data: [], error: null });
        }
        return mockSupabase;
      });
      mockSupabase.single.mockImplementation(() => {
        if (lastTable === 'eva_ventures') {
          return Promise.resolve({
            data: { orchestrator_state: 'active' },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });
      mockSupabase.update.mockReturnValue(mockSupabase);
      mockSupabase.insert.mockReturnValue(mockSupabase);
      mockSupabase.upsert.mockReturnValue(mockSupabase);
      mockSupabase.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null }),
      );

      await scheduler.poll();

      // Should have warned about RPC failure
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('RPC unavailable'),
      );

      // Should have ordered by blocking_decision_age_seconds DESC
      expect(mockSupabase.order).toHaveBeenCalledWith(
        'blocking_decision_age_seconds',
        { ascending: false, nullsFirst: false },
      );
    });
  });

  // ── TS-3: Cadence Limit ──────────────────────────────────────

  describe('TS-3: Cadence limit - max_stages_per_cycle stops after N dispatches', () => {
    test('should stop dispatching a venture after max_stages_per_cycle', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-cadence',
        max_stages_per_cycle: 3,
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      // processStage always completes (would run indefinitely without cadence limit)
      processStage.mockResolvedValue({
        status: 'COMPLETED',
        stageId: 1,
        filterDecision: { action: 'AUTO_PROCEED' },
      });

      await scheduler.poll();

      // Should have called processStage exactly 3 times for this venture
      expect(processStage).toHaveBeenCalledTimes(3);
    });

    test('should use default max (5) when venture entry lacks max_stages_per_cycle', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-default-cadence',
        max_stages_per_cycle: null, // no value
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      await scheduler.poll();

      // Default is 5 (DEFAULT_MAX_STAGES_PER_CYCLE)
      expect(processStage).toHaveBeenCalledTimes(5);
    });

    test('should emit scheduler_cadence_limited metric when limit is reached', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-cadence-metric',
        max_stages_per_cycle: 2,
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      await scheduler.poll();

      const insertCalls = mockSupabase.insert.mock.calls;
      const cadenceMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_cadence_limited',
      );
      expect(cadenceMetric).toBeDefined();
      expect(cadenceMetric[0].venture_id).toBe('v-cadence-metric');
      expect(cadenceMetric[0].stages_dispatched).toBe(2);
      expect(cadenceMetric[0].max_stages_per_cycle).toBe(2);
    });

    test('should stop early if processStage returns BLOCKED', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-blocked',
        max_stages_per_cycle: 5,
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      // First call succeeds, second returns BLOCKED
      processStage
        .mockResolvedValueOnce({ status: 'COMPLETED', stageId: 1, filterDecision: { action: 'AUTO_PROCEED' } })
        .mockResolvedValueOnce({ status: 'BLOCKED', stageId: 2, filterDecision: { action: 'STOP' } });

      await scheduler.poll();

      // Should stop after 2nd dispatch even though limit is 5
      expect(processStage).toHaveBeenCalledTimes(2);
    });

    test('should stop early if processStage returns FAILED', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-failed',
        max_stages_per_cycle: 5,
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      processStage.mockResolvedValueOnce({
        status: 'FAILED',
        stageId: 1,
        errors: [{ message: 'stage failed' }],
        filterDecision: { action: 'STOP' },
      });

      await scheduler.poll();

      expect(processStage).toHaveBeenCalledTimes(1);
    });

    test('should stop early if filterDecision is REQUIRE_REVIEW', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const venture = makeVentureEntry({
        venture_id: 'v-review',
        max_stages_per_cycle: 5,
      });
      configureMockForPoll(mockSupabase, { ventures: [venture] });

      processStage.mockResolvedValueOnce({
        status: 'COMPLETED',
        stageId: 1,
        filterDecision: { action: 'REQUIRE_REVIEW' },
      });

      await scheduler.poll();

      expect(processStage).toHaveBeenCalledTimes(1);
    });
  });

  // ── TS-4: Circuit Breaker OPEN ────────────────────────────────

  describe('TS-4: Circuit breaker OPEN - poll skips dispatch entirely', () => {
    test('should not dispatch any ventures when circuit breaker is OPEN', async () => {
      const openCB = createMockCircuitBreaker('OPEN');

      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: openCB,
      });

      configureMockForPoll(mockSupabase, {
        ventures: [makeVentureEntry()],
        queueDepth: 5,
      });

      await scheduler.poll();

      expect(processStage).not.toHaveBeenCalled();
      expect(scheduler._totalDispatches).toBe(0);
    });

    test('should log that circuit breaker is OPEN', async () => {
      const openCB = createMockCircuitBreaker('OPEN');

      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: openCB,
      });

      configureMockForPoll(mockSupabase, { ventures: [], queueDepth: 3 });

      await scheduler.poll();

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker OPEN'),
      );
    });

    test('should emit scheduler_poll metric with paused=true', async () => {
      const openCB = createMockCircuitBreaker('OPEN');

      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: openCB,
      });

      configureMockForPoll(mockSupabase, { ventures: [], queueDepth: 2 });

      await scheduler.poll();

      const insertCalls = mockSupabase.insert.mock.calls;
      const pollMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_poll',
      );
      expect(pollMetric).toBeDefined();
      expect(pollMetric[0].paused).toBe(true);
      expect(pollMetric[0].pause_reason).toBe('circuit_breaker_open');
      expect(pollMetric[0].dispatched_count).toBe(0);
    });

    test('should emit scheduler_circuit_breaker_pause metric', async () => {
      const openCB = createMockCircuitBreaker('OPEN');

      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: openCB,
      });

      configureMockForPoll(mockSupabase, { ventures: [], queueDepth: 1 });

      await scheduler.poll();

      const insertCalls = mockSupabase.insert.mock.calls;
      const cbPauseMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_circuit_breaker_pause',
      );
      expect(cbPauseMetric).toBeDefined();
      expect(cbPauseMetric[0].pause_reason).toBe('circuit_breaker_open');
    });

    test('should treat circuit breaker as CLOSED when no adapter is provided', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        // no circuitBreaker
      });

      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      // Should proceed to dispatch
      expect(processStage).toHaveBeenCalled();
    });

    test('should fail OPEN when circuit breaker adapter throws', async () => {
      const brokenCB = {
        getState: vi.fn().mockRejectedValue(new Error('CB unavailable')),
        recordSuccess: vi.fn(),
        recordFailure: vi.fn(),
      };

      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: brokenCB,
      });

      configureMockForPoll(mockSupabase, {
        ventures: [makeVentureEntry()],
        queueDepth: 1,
      });

      await scheduler.poll();

      expect(processStage).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker error'),
      );
    });

    test('should record success on circuit breaker after successful dispatch', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      expect(mockCB.recordSuccess).toHaveBeenCalled();
    });

    test('should record failure on circuit breaker after failed dispatch', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      processStage.mockResolvedValue({
        status: 'FAILED',
        stageId: 1,
        errors: [{ message: 'something broke' }],
      });

      await scheduler.poll();

      expect(mockCB.recordFailure).toHaveBeenCalled();
    });
  });

  // ── TS-5: Non-Blocking Metrics (TR-4) ────────────────────────

  describe('TS-5: Non-blocking metrics - metric write failure does not prevent dispatch', () => {
    test('should continue dispatching even when _emitMetric throws', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [
        makeVentureEntry({ venture_id: 'v-1', max_stages_per_cycle: 1 }),
        makeVentureEntry({ venture_id: 'v-2', max_stages_per_cycle: 1 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      // Make insert (metric writes) throw
      mockSupabase.insert.mockImplementation(() => {
        throw new Error('metric write failed');
      });

      await scheduler.poll();

      // Both ventures should still have been dispatched
      expect(processStage).toHaveBeenCalledTimes(2);
    });

    test('should increment _metricsWriteFailures counter on metric write error', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      // Make all inserts throw
      mockSupabase.insert.mockImplementation(() => {
        throw new Error('DB down');
      });

      await scheduler.poll();

      expect(scheduler._metricsWriteFailures).toBeGreaterThan(0);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Metric write failed'),
      );
    });

    test('should log metric write failures but not throw', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      // Call _emitMetric directly with a failing insert
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.insert.mockImplementation(() => {
        throw new Error('connection lost');
      });

      // Should not throw
      await expect(
        scheduler._emitMetric({ event_type: 'test_metric' }),
      ).resolves.toBeUndefined();

      expect(scheduler._metricsWriteFailures).toBe(1);
    });
  });

  // ── TS-6: Concurrent Scheduler Instances ─────────────────────

  describe('TS-6: Concurrent instances - RPC fallback behavior', () => {
    test('should use RPC with locking (FOR UPDATE SKIP LOCKED) as primary path', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { dispatchBatchSize: 10 },
      });

      configureMockForPoll(mockSupabase, { ventures: [] });

      await scheduler.poll();

      // Primary path uses RPC
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'select_schedulable_ventures',
        { p_batch_size: 10 },
      );
    });

    test('should fall back to direct query when RPC is unavailable', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { dispatchBatchSize: 5 },
      });

      // RPC fails
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'function does not exist' },
      });

      // Set up fallback chain
      let lastTable = null;
      mockSupabase.from.mockImplementation((table) => {
        lastTable = table;
        return mockSupabase;
      });
      mockSupabase.select.mockImplementation((cols, opts) => {
        if (opts && opts.count === 'exact' && opts.head === true) {
          return { eq: vi.fn().mockResolvedValue({ count: 0, error: null }) };
        }
        return mockSupabase;
      });
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.order.mockReturnValue(mockSupabase);
      mockSupabase.limit.mockImplementation(() => {
        if (lastTable === 'eva_scheduler_queue') {
          return Promise.resolve({ data: [], error: null });
        }
        return mockSupabase;
      });
      mockSupabase.insert.mockReturnValue(mockSupabase);
      mockSupabase.upsert.mockReturnValue(mockSupabase);
      mockSupabase.then.mockImplementation((resolve) =>
        resolve({ data: null, error: null }),
      );

      await scheduler.poll();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('RPC unavailable'),
      );

      // Should have queried eva_scheduler_queue directly
      expect(mockSupabase.from).toHaveBeenCalledWith('eva_scheduler_queue');
    });

    test('each scheduler instance gets a unique instanceId', () => {
      const s1 = new EvaMasterScheduler({ supabase: mockSupabase });
      const s2 = new EvaMasterScheduler({ supabase: mockSupabase });

      expect(s1.instanceId).not.toBe(s2.instanceId);
      expect(s1.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/);
      expect(s2.instanceId).toMatch(/^scheduler-[a-f0-9]{8}$/);
    });

    test('should include instance_id in metric records', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.insert.mockReturnValue(mockSupabase);

      await scheduler._emitMetric({ event_type: 'test_metric' });

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'test_metric',
          scheduler_instance_id: scheduler.instanceId,
          occurred_at: expect.any(String),
        }),
      );
    });
  });

  // ── TS-7: Observe-Only Mode ──────────────────────────────────

  describe('TS-7: Observe-only mode - stages logged but not dispatched', () => {
    test('should not call processStage when observeOnly is true', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { observeOnly: true },
      });

      const ventures = [
        makeVentureEntry({ venture_id: 'v-observe', max_stages_per_cycle: 3 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      expect(processStage).not.toHaveBeenCalled();
    });

    test('should log OBSERVE messages for each would-be dispatch', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { observeOnly: true },
      });

      const ventures = [
        makeVentureEntry({ venture_id: 'v-observe-log', max_stages_per_cycle: 2 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      const observeLogs = mockLogger.log.mock.calls.filter(
        (call) => call[0] && call[0].includes('OBSERVE'),
      );
      expect(observeLogs.length).toBe(2);
      expect(observeLogs[0][0]).toContain('v-observe-log');
      expect(observeLogs[0][0]).toContain('1/2');
      expect(observeLogs[1][0]).toContain('2/2');
    });

    test('should still count dispatches in observe-only mode', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { observeOnly: true },
      });

      const ventures = [
        makeVentureEntry({ venture_id: 'v-count', max_stages_per_cycle: 3 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      // _dispatchVenture increments dispatched even in observe mode
      expect(scheduler._totalDispatches).toBe(3);
    });

    test('should respect cadence limit even in observe-only mode', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
        config: { observeOnly: true },
      });

      const ventures = [
        makeVentureEntry({ venture_id: 'v-obs-cadence', max_stages_per_cycle: 2 }),
      ];
      configureMockForPoll(mockSupabase, { ventures });

      await scheduler.poll();

      const observeLogs = mockLogger.log.mock.calls.filter(
        (call) => call[0] && call[0].includes('OBSERVE'),
      );
      // Should stop at 2, not continue to default 5
      expect(observeLogs.length).toBe(2);
    });
  });

  // ── Error Handling ────────────────────────────────────────────

  describe('Error handling', () => {
    test('should handle processStage throwing an exception', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ venture_id: 'v-throw', max_stages_per_cycle: 3 })];
      configureMockForPoll(mockSupabase, { ventures });

      processStage.mockRejectedValue(new Error('orchestrator crash'));

      await scheduler.poll();

      // Should log the error
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Dispatch error for v-throw'),
      );

      // Should increment error counter
      expect(scheduler._totalErrors).toBe(1);

      // Should stop dispatching this venture on error
      expect(processStage).toHaveBeenCalledTimes(1);
    });

    test('should emit dispatch failure metric when processStage throws', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ venture_id: 'v-err-metric', max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      processStage.mockRejectedValue(new Error('kaboom'));

      await scheduler.poll();

      const insertCalls = mockSupabase.insert.mock.calls;
      const failureMetric = insertCalls.find(
        (call) => call[0]?.event_type === 'scheduler_dispatch' && call[0]?.outcome === 'failure',
      );
      expect(failureMetric).toBeDefined();
      expect(failureMetric[0].failure_reason).toBe('kaboom');
    });

    test('should update error_count on queue entry when processStage throws', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        circuitBreaker: mockCB,
      });

      const ventures = [makeVentureEntry({ venture_id: 'v-err-update', error_count: 2, max_stages_per_cycle: 1 })];
      configureMockForPoll(mockSupabase, { ventures });

      processStage.mockRejectedValue(new Error('failed'));

      await scheduler.poll();

      // Check that update was called with incremented error_count
      const updateCalls = mockSupabase.update.mock.calls;
      const errorUpdate = updateCalls.find(
        (call) => call[0]?.error_count === 3,
      );
      expect(errorUpdate).toBeDefined();
      expect(errorUpdate[0].last_error).toBe('failed');
    });
  });

  // ── _safePoll ─────────────────────────────────────────────────

  describe('_safePoll', () => {
    test('should catch poll errors and log them', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      // Override poll to throw
      scheduler.poll = vi.fn().mockRejectedValue(new Error('poll exploded'));

      // _safePoll should also write a metric, configure insert
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.insert.mockReturnValue(mockSupabase);

      await scheduler._safePoll();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Poll error: poll exploded'),
      );
      expect(scheduler._totalErrors).toBe(1);
    });
  });

  // ── _isVentureBlocked ────────────────────────────────────────

  describe('_isVentureBlocked', () => {
    beforeEach(() => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });
    });

    test('should return true for venture with blocked orchestrator_state', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue(mockSupabase);
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.single.mockResolvedValue({
        data: { orchestrator_state: 'blocked' },
        error: null,
      });

      const blocked = await scheduler._isVentureBlocked('v-test');
      expect(blocked).toBe(true);
    });

    test('should return true for venture with failed orchestrator_state', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue(mockSupabase);
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.single.mockResolvedValue({
        data: { orchestrator_state: 'failed' },
        error: null,
      });

      const blocked = await scheduler._isVentureBlocked('v-test');
      expect(blocked).toBe(true);
    });

    test('should return true for venture with pending chairman decisions', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue(mockSupabase);
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.single.mockResolvedValue({
        data: { orchestrator_state: 'active' },
        error: null,
      });
      mockSupabase.limit.mockResolvedValue({
        data: [{ id: 'dec-1' }], // pending decision exists
        error: null,
      });

      const blocked = await scheduler._isVentureBlocked('v-test');
      expect(blocked).toBe(true);
    });

    test('should return false for active venture with no pending decisions', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue(mockSupabase);
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.single.mockResolvedValue({
        data: { orchestrator_state: 'active' },
        error: null,
      });
      mockSupabase.limit.mockResolvedValue({
        data: [],
        error: null,
      });

      const blocked = await scheduler._isVentureBlocked('v-test');
      expect(blocked).toBe(false);
    });

    test('should return true (conservative) when query errors', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue(mockSupabase);
      mockSupabase.eq.mockReturnValue(mockSupabase);
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'query failed' },
      });

      const blocked = await scheduler._isVentureBlocked('v-test');
      expect(blocked).toBe(true);
    });
  });

  // ── _getQueueDepth ───────────────────────────────────────────

  describe('_getQueueDepth', () => {
    beforeEach(() => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });
    });

    test('should return count of pending queue entries', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 42, error: null }),
      });

      const depth = await scheduler._getQueueDepth();
      expect(depth).toBe(42);
    });

    test('should return -1 on query error', async () => {
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.select.mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: null, error: { message: 'fail' } }),
      });

      const depth = await scheduler._getQueueDepth();
      expect(depth).toBe(-1);
    });
  });

  // ── Lifecycle (start/stop) ───────────────────────────────────

  describe('Lifecycle', () => {
    beforeEach(() => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
        config: { pollIntervalMs: 100_000 }, // long interval so timer doesn't fire
      });

      // Configure mock for heartbeat writes
      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.upsert.mockReturnValue(mockSupabase);
      mockSupabase.insert.mockReturnValue(mockSupabase);
    });

    test('should set _running to true on start', async () => {
      // Mock poll to avoid actual DB calls
      scheduler.poll = vi.fn().mockResolvedValue(undefined);

      await scheduler.start();
      expect(scheduler._running).toBe(true);

      // Cleanup timer
      await scheduler.stop();
    });

    test('should not start twice', async () => {
      scheduler.poll = vi.fn().mockResolvedValue(undefined);

      await scheduler.start();
      await scheduler.start(); // second call should warn

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Already running'),
      );

      await scheduler.stop();
    });

    test('should clear timer and set _running to false on stop', async () => {
      scheduler.poll = vi.fn().mockResolvedValue(undefined);

      await scheduler.start();
      expect(scheduler._running).toBe(true);

      await scheduler.stop();
      expect(scheduler._running).toBe(false);
      expect(scheduler._timer).toBeNull();
    });

    test('should not stop if not running', async () => {
      await scheduler.stop(); // should be a no-op
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Stopping gracefully'),
      );
    });

    test('should skip poll when _stopping is true', async () => {
      scheduler._stopping = true;

      await scheduler.poll();

      // poll returns early, no RPC call
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  // ── Heartbeat ────────────────────────────────────────────────

  describe('Heartbeat', () => {
    test('should write heartbeat via upsert', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.upsert.mockReturnValue(mockSupabase);

      await scheduler._updateHeartbeat('running', { circuit_breaker_state: 'CLOSED' });

      expect(mockSupabase.from).toHaveBeenCalledWith('eva_scheduler_heartbeat');
      expect(mockSupabase.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          instance_id: scheduler.instanceId,
          status: 'running',
          circuit_breaker_state: 'CLOSED',
        }),
        { onConflict: 'id' },
      );
    });

    test('should not throw when heartbeat write fails', async () => {
      scheduler = new EvaMasterScheduler({
        supabase: mockSupabase,
        logger: mockLogger,
      });

      mockSupabase.from.mockReturnValue(mockSupabase);
      mockSupabase.upsert.mockImplementation(() => {
        throw new Error('heartbeat fail');
      });

      await expect(
        scheduler._updateHeartbeat('running'),
      ).resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Heartbeat update failed'),
      );
    });
  });

  // ── Static getStatus ─────────────────────────────────────────

  describe('getStatus (static)', () => {
    test('should return structured status from database', async () => {
      const mockSb = createMockSupabase();

      // Heartbeat query
      mockSb.from.mockReturnValue(mockSb);
      mockSb.select.mockImplementation((cols, opts) => {
        if (opts && opts.count === 'exact' && opts.head === true) {
          return { eq: vi.fn().mockResolvedValue({ count: 3, error: null }) };
        }
        return mockSb;
      });
      mockSb.eq.mockReturnValue(mockSb);
      mockSb.order.mockReturnValue(mockSb);
      mockSb.limit.mockReturnValue(mockSb);
      mockSb.single.mockResolvedValue({
        data: {
          instance_id: 'scheduler-abc12345',
          status: 'running',
          last_poll_at: '2026-01-01T00:00:00Z',
          next_poll_at: new Date(Date.now() + 30_000).toISOString(),
          poll_count: 10,
          dispatch_count: 25,
          error_count: 1,
          circuit_breaker_state: 'CLOSED',
          paused_reason: null,
          metadata: { observe_only: false },
        },
        error: null,
      });

      const status = await EvaMasterScheduler.getStatus(mockSb, 5);

      expect(status.running).toBe(true);
      expect(status.instance_id).toBe('scheduler-abc12345');
      expect(status.poll_count).toBe(10);
      expect(status.dispatch_count).toBe(25);
      expect(status.circuit_breaker_state).toBe('CLOSED');
      expect(status.observe_only).toBe(false);
      expect(status.next_poll_in_seconds).toBeGreaterThan(0);
    });

    test('should return default values when heartbeat is not found', async () => {
      const mockSb = createMockSupabase();

      mockSb.from.mockReturnValue(mockSb);
      mockSb.select.mockImplementation((cols, opts) => {
        if (opts && opts.count === 'exact' && opts.head === true) {
          return { eq: vi.fn().mockResolvedValue({ count: 0, error: null }) };
        }
        return mockSb;
      });
      mockSb.eq.mockReturnValue(mockSb);
      mockSb.order.mockReturnValue(mockSb);
      mockSb.limit.mockReturnValue(mockSb);
      mockSb.single.mockResolvedValue({ data: null, error: null });

      const status = await EvaMasterScheduler.getStatus(mockSb);

      expect(status.running).toBe(false);
      expect(status.instance_id).toBeNull();
      expect(status.poll_count).toBe(0);
      expect(status.dispatch_count).toBe(0);
      expect(status.circuit_breaker_state).toBe('UNKNOWN');
      expect(status.queue_depth).toBe(0);
    });
  });
});
