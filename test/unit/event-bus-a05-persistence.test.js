/**
 * Unit Tests: A05 Event Schema Registry Persistence, Replay & Vision-Hooks Bridge
 * SD: SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-C
 *
 * Tests:
 * 1. Schema registry DB persistence (write-behind via registerSchema)
 * 2. loadSchemasFromDB populates in-memory registry
 * 3. syncSchemasToDB bulk upserts all schemas
 * 4. Graceful fallback when DB is unavailable
 * 5. Vision hook observer bridge (registerHookObserver)
 * 6. replayEventsFromLedger with idempotency
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Schema Registry Tests ─────────────────────────────────────────────

describe('Event Schema Registry — DB Persistence (A05)', () => {
  let registry;

  beforeEach(async () => {
    // Fresh import to reset module state
    vi.resetModules();
    registry = await import('../../../lib/eva/event-bus/event-schema-registry.js');
    registry.clearSchemas();
  });

  it('registerSchema stores in-memory and returns registered:true', () => {
    const result = registry.registerSchema('test.event', '1.0.0', {
      required: { id: 'string' },
    });
    expect(result).toEqual({ eventType: 'test.event', version: '1.0.0', registered: true });
    expect(registry.hasSchema('test.event')).toBe(true);
    expect(registry.getSchemaCount()).toBe(1);
  });

  it('registerSchema fires write-behind persist when supabase is initialized', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    registry.initPersistence(mockSupabase);
    registry.registerSchema('test.persist', '1.0.0', {
      required: { name: 'string' },
    });

    // Wait for fire-and-forget async to complete
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(mockSupabase.from).toHaveBeenCalledWith('eva_event_schemas');
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'test.persist',
        version: '1.0.0',
        schema_definition: { required: { name: 'string' } },
      }),
      { onConflict: 'event_type,version' }
    );
  });

  it('registerSchema succeeds in-memory even when DB persist fails', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: { message: 'DB unavailable' } }),
      }),
    };

    registry.initPersistence(mockSupabase);
    const result = registry.registerSchema('test.fallback', '1.0.0', {
      required: { x: 'number' },
    });

    expect(result.registered).toBe(true);
    expect(registry.hasSchema('test.fallback')).toBe(true);

    // Wait for async persist to finish
    await new Promise(resolve => setTimeout(resolve, 50));
    // No throw — graceful degradation
  });

  it('registerSchema works without persistence initialized', () => {
    // No initPersistence() called
    const result = registry.registerSchema('test.nodb', '1.0.0', {
      required: { id: 'string' },
    });
    expect(result.registered).toBe(true);
    expect(registry.hasSchema('test.nodb')).toBe(true);
  });

  it('loadSchemasFromDB populates in-memory registry from DB rows', async () => {
    const mockData = [
      { event_type: 'stage.completed', version: '1.0.0', schema_definition: { required: { ventureId: 'string' } }, registered_at: '2026-01-01T00:00:00Z' },
      { event_type: 'sd.completed', version: '1.0.0', schema_definition: { required: { sdKey: 'string' } }, registered_at: '2026-01-01T00:00:00Z' },
    ];

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    };

    const result = await registry.loadSchemasFromDB(mockSupabase);
    expect(result.loaded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(registry.hasSchema('stage.completed')).toBe(true);
    expect(registry.hasSchema('sd.completed')).toBe(true);
  });

  it('loadSchemasFromDB returns gracefully when DB is unavailable', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Connection refused' } }),
        }),
      }),
    };

    const result = await registry.loadSchemasFromDB(mockSupabase);
    expect(result.loaded).toBe(0);
    expect(result.errors).toContain('Connection refused');
  });

  it('loadSchemasFromDB returns gracefully with no client', async () => {
    const result = await registry.loadSchemasFromDB(null);
    expect(result.loaded).toBe(0);
    expect(result.errors).toContain('No supabase client available');
  });

  it('syncSchemasToDB bulk upserts all in-memory schemas', async () => {
    registry.registerSchema('a.event', '1.0.0', { required: { x: 'string' } });
    registry.registerSchema('b.event', '1.0.0', { required: { y: 'number' } });

    const mockUpsert = vi.fn().mockResolvedValue({ error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    };

    // Wait for any pending fire-and-forget persists to settle
    await new Promise(resolve => setTimeout(resolve, 50));

    const result = await registry.syncSchemasToDB(mockSupabase);
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('registerDefaultSchemas registers all 16 built-in schemas', () => {
    registry.registerDefaultSchemas();
    expect(registry.getSchemaCount()).toBe(16);
    expect(registry.hasSchema('stage.completed')).toBe(true);
    expect(registry.hasSchema('vision.scored')).toBe(true);
    expect(registry.hasSchema('feedback.quality_updated')).toBe(true);
  });

  it('getLatestVersion returns highest semver version', () => {
    registry.registerSchema('test.versions', '1.0.0', { required: { a: 'string' } });
    registry.registerSchema('test.versions', '2.0.0', { required: { a: 'string', b: 'number' } });
    registry.registerSchema('test.versions', '1.1.0', { required: { a: 'string' } });

    expect(registry.getLatestVersion('test.versions')).toBe('2.0.0');
  });
});

// ─── Vision Hook Observer Tests ─────────────────────────────────────────

describe('Vision Events — Hook Observer Bridge (A05)', () => {
  let visionEvents;

  beforeEach(async () => {
    vi.resetModules();
    visionEvents = await import('../../../lib/eva/event-bus/vision-events.js');
    // Clear both handlers and hook observers
    visionEvents.clearVisionSubscribers();
    visionEvents.clearHookObservers();
  });

  it('registerHookObserver adds an observer that receives all vision events', () => {
    const received = [];
    visionEvents.registerHookObserver((eventType, payload) => {
      received.push({ eventType, payload });
    });

    expect(visionEvents.getHookObserverCount()).toBe(1);

    visionEvents.publishVisionEvent('vision.scored', { scoreId: 'abc', totalScore: 85 });
    expect(received).toHaveLength(1);
    expect(received[0].eventType).toBe('vision.scored');
    expect(received[0].payload.totalScore).toBe(85);
  });

  it('hook observer errors do not cascade to other observers or handlers', () => {
    const received = [];

    // First observer throws
    visionEvents.registerHookObserver(() => {
      throw new Error('Observer crash');
    });

    // Second observer should still fire
    visionEvents.registerHookObserver((eventType, payload) => {
      received.push({ eventType, payload });
    });

    // Should not throw
    visionEvents.publishVisionEvent('vision.gap_detected', { gapId: '123' });
    expect(received).toHaveLength(1);
    expect(received[0].eventType).toBe('vision.gap_detected');
  });

  it('async hook observer errors are caught and logged', async () => {
    visionEvents.registerHookObserver(async () => {
      throw new Error('Async observer crash');
    });

    // Should not throw
    visionEvents.publishVisionEvent('vision.scored', { scoreId: 'xyz' });

    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));
  });

  it('clearHookObservers removes all observers', () => {
    visionEvents.registerHookObserver(() => {});
    visionEvents.registerHookObserver(() => {});
    expect(visionEvents.getHookObserverCount()).toBe(2);

    visionEvents.clearHookObservers();
    expect(visionEvents.getHookObserverCount()).toBe(0);
  });

  it('registerHookObserver rejects non-function argument', () => {
    expect(() => visionEvents.registerHookObserver('not a function')).toThrow('Hook observer must be a function');
  });

  it('hook observers fire even when no handlers are registered', () => {
    const received = [];
    visionEvents.registerHookObserver((eventType) => {
      received.push(eventType);
    });

    visionEvents.publishVisionEvent('vision.rescore_completed', { scoreId: 's1' });
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('vision.rescore_completed');
  });
});

// ─── Event Replay Tests ─────────────────────────────────────────────────

describe('Event Router — replayEventsFromLedger (A05)', () => {
  it('replayEventsFromLedger is exported from event-router', async () => {
    const router = await import('../../../lib/eva/event-bus/event-router.js');
    expect(typeof router.replayEventsFromLedger).toBe('function');
  });

  it('returns empty stats when no events match filter', async () => {
    const router = await import('../../../lib/eva/event-bus/event-router.js');

    // Chainable mock that supports any order of .eq/.gte/.lt/.order/.limit
    const createChainable = (resolveValue) => {
      const chainable = {};
      const methods = ['select', 'eq', 'gte', 'lt', 'order', 'limit'];
      for (const m of methods) {
        chainable[m] = vi.fn().mockReturnValue(chainable);
      }
      // limit is terminal — resolves with data
      chainable.limit = vi.fn().mockResolvedValue(resolveValue);
      return chainable;
    };

    const chain = createChainable({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }),
    };

    const result = await router.replayEventsFromLedger(mockSupabase, { eventType: 'test.event' });
    expect(result).toEqual({ processed: 0, skipped: 0, failed: 0, total: 0, errors: [] });
  });

  it('returns error stats when query fails', async () => {
    const router = await import('../../../lib/eva/event-bus/event-router.js');

    const createChainable = (resolveValue) => {
      const chainable = {};
      const methods = ['select', 'eq', 'gte', 'lt', 'order', 'limit'];
      for (const m of methods) {
        chainable[m] = vi.fn().mockReturnValue(chainable);
      }
      chainable.limit = vi.fn().mockResolvedValue(resolveValue);
      return chainable;
    };

    const chain = createChainable({ data: null, error: { message: 'DB error' } });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }),
    };

    const result = await router.replayEventsFromLedger(mockSupabase, {});
    expect(result.processed).toBe(0);
    expect(result.errors).toContain('DB error');
  });

  it('applies eventType filter when provided', async () => {
    const router = await import('../../../lib/eva/event-bus/event-router.js');

    const eqMock = vi.fn();
    const createChainable = (resolveValue) => {
      const chainable = {};
      const methods = ['select', 'gte', 'lt', 'order', 'limit'];
      for (const m of methods) {
        chainable[m] = vi.fn().mockReturnValue(chainable);
      }
      chainable.eq = eqMock.mockReturnValue(chainable);
      chainable.limit = vi.fn().mockResolvedValue(resolveValue);
      return chainable;
    };

    const chain = createChainable({ data: [], error: null });
    const mockSupabase = {
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }),
    };

    await router.replayEventsFromLedger(mockSupabase, { eventType: 'stage.completed' });
    expect(mockSupabase.from).toHaveBeenCalledWith('eva_events');
    expect(eqMock).toHaveBeenCalledWith('event_type', 'stage.completed');
  });

  it('filters by sdKey in event_data client-side', async () => {
    const router = await import('../../../lib/eva/event-bus/event-router.js');

    const mockEvents = [
      { id: 'e1', event_type: 'sd.completed', event_data: { sdKey: 'SD-TEST-001' }, eva_venture_id: 'v1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'e2', event_type: 'sd.completed', event_data: { sdKey: 'SD-OTHER-002' }, eva_venture_id: 'v1', created_at: '2026-01-01T00:00:00Z' },
    ];

    // Mock eva_events query returning both events
    const mockFrom = vi.fn().mockImplementation((table) => {
      if (table === 'eva_events') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: mockEvents, error: null }),
            }),
          }),
        };
      }
      // For eva_event_ledger idempotency check — returns no match (not already processed)
      if (table === 'eva_event_ledger') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      // Default mock for any other table
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const mockSupabase = { from: mockFrom };

    const result = await router.replayEventsFromLedger(mockSupabase, { sdKey: 'SD-TEST-001' });
    // Only 1 of 2 events matches the sdKey filter
    expect(result.total).toBe(1);
  });
});
