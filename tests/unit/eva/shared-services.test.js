/**
 * Tests for Shared Services Abstraction
 * SD-EVA-FEAT-SHARED-SERVICES-001
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadContext,
  emit,
  createService,
  registerService,
  getByCapability,
  getByStage,
  listAll,
  clearRegistry,
  ServiceError,
  MODULE_VERSION,
} from '../../../lib/eva/shared-services.js';

// ── Mock Supabase builder ──────────────────────────────────

function createMockDb(config = {}) {
  return {
    from: vi.fn((table) => {
      const chainable = {};

      chainable.select = vi.fn().mockReturnValue(chainable);
      chainable.eq = vi.fn().mockReturnValue(chainable);

      // single() — used by loadContext for venture + stage
      chainable.single = vi.fn(() => {
        const key = `${table}:single`;
        return Promise.resolve(config[key] || { data: null, error: null });
      });

      // insert() — used by emit
      chainable.insert = vi.fn(() => {
        const insertChain = {
          select: vi.fn().mockReturnValue({
            single: vi.fn(() => Promise.resolve(
              config[`${table}:insert`] || { data: { id: 'evt-1', event_type: 'test', created_at: '2026-02-14T00:00:00Z' }, error: null },
            )),
          }),
        };
        return insertChain;
      });

      return chainable;
    }),
  };
}

// ── MODULE_VERSION ──────────────────────────────────

describe('MODULE_VERSION', () => {
  it('is a valid semver string', () => {
    expect(MODULE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ── ServiceError ──────────────────────────────────

describe('ServiceError', () => {
  it('has code, message, and serviceName', () => {
    const err = new ServiceError('TEST_CODE', 'test message', 'testService');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.serviceName).toBe('testService');
    expect(err.originalError).toBeNull();
    expect(err).toBeInstanceOf(Error);
  });

  it('wraps an original error', () => {
    const original = new Error('db timeout');
    const err = new ServiceError('WRAP', 'wrapped', 'svc', original);
    expect(err.originalError).toBe(original);
  });
});

// ── loadContext ──────────────────────────────────

describe('loadContext', () => {
  it('returns venture and stage data', async () => {
    const venture = { id: 'v1', name: 'Test Venture', status: 'active', current_stage: 3, archetype: 'saas', metadata: {} };
    const stage = { id: 's1', venture_id: 'v1', stage_number: 3, status: 'in_progress', started_at: '2026-01-01', completed_at: null, metadata: {} };

    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: stage, error: null },
    });

    const result = await loadContext(db, 'v1', 3);
    expect(result.venture).toEqual(venture);
    expect(result.stage).toEqual(stage);
    expect(result.metadata.loadedAt).toBeTruthy();
  });

  it('returns null stage when stageId is null', async () => {
    const venture = { id: 'v1', name: 'Test', status: 'active', current_stage: 1, archetype: 'saas', metadata: {} };
    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
    });

    const result = await loadContext(db, 'v1', null);
    expect(result.venture).toEqual(venture);
    expect(result.stage).toBeNull();
  });

  it('throws VENTURE_NOT_FOUND when venture does not exist', async () => {
    const db = createMockDb({
      'ventures:single': { data: null, error: null },
    });

    await expect(loadContext(db, 'v-missing', 1)).rejects.toThrow('not found');
    try {
      await loadContext(db, 'v-missing', 1);
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('VENTURE_NOT_FOUND');
    }
  });

  it('throws CONTEXT_LOAD_FAILED on venture query error', async () => {
    const db = createMockDb({
      'ventures:single': { data: null, error: { message: 'timeout' } },
    });

    await expect(loadContext(db, 'v1', 1)).rejects.toThrow('Failed to load venture');
    try {
      await loadContext(db, 'v1', 1);
    } catch (err) {
      expect(err.code).toBe('CONTEXT_LOAD_FAILED');
    }
  });

  it('returns null stage when stage row does not exist (PGRST116)', async () => {
    const venture = { id: 'v1', name: 'Test', status: 'active', current_stage: 1, archetype: 'saas', metadata: {} };
    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: null, error: { code: 'PGRST116', message: 'no rows' } },
    });

    const result = await loadContext(db, 'v1', 99);
    expect(result.stage).toBeNull();
  });

  it('throws on non-PGRST116 stage error', async () => {
    const venture = { id: 'v1', name: 'Test', status: 'active', current_stage: 1, archetype: 'saas', metadata: {} };
    const db = createMockDb({
      'ventures:single': { data: venture, error: null },
      'eva_venture_stages:single': { data: null, error: { code: 'OTHER', message: 'connection refused' } },
    });

    await expect(loadContext(db, 'v1', 5, 'testSvc')).rejects.toThrow('Failed to load stage');
  });
});

// ── emit ──────────────────────────────────

describe('emit', () => {
  it('inserts event to eva_event_log', async () => {
    const db = createMockDb({
      'eva_event_log:insert': {
        data: { id: 'evt-1', event_type: 'stage_completed', created_at: '2026-02-14T00:00:00Z' },
        error: null,
      },
    });

    const result = await emit(db, 'stage_completed', { ventureId: 'v1' }, 'testSvc');
    expect(result.id).toBe('evt-1');
    expect(result.event_type).toBe('stage_completed');
  });

  it('throws EVENT_EMIT_FAILED on insert error', async () => {
    const db = createMockDb({
      'eva_event_log:insert': { data: null, error: { message: 'RLS violation' } },
    });

    await expect(emit(db, 'test', {}, 'svc')).rejects.toThrow('Failed to emit event');
    try {
      await emit(db, 'test', {}, 'svc');
    } catch (err) {
      expect(err.code).toBe('EVENT_EMIT_FAILED');
    }
  });
});

// ── createService ──────────────────────────────────

describe('createService', () => {
  it('returns object with all interface methods', () => {
    const svc = createService({
      name: 'test-svc',
      capabilities: ['research'],
      stages: [1, 2, 3],
      executeFn: async () => ({ result: 'ok' }),
    });

    expect(svc.name).toBe('test-svc');
    expect(svc.capabilities).toEqual(['research']);
    expect(svc.stages).toEqual([1, 2, 3]);
    expect(typeof svc.loadContext).toBe('function');
    expect(typeof svc.execute).toBe('function');
    expect(typeof svc.emit).toBe('function');
  });

  it('execute returns success result with duration', async () => {
    const svc = createService({
      name: 'fast-svc',
      executeFn: async (ctx) => ({ doubled: ctx.value * 2 }),
    });

    const result = await svc.execute({ value: 21 });
    expect(result.success).toBe(true);
    expect(result.data.doubled).toBe(42);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('execute wraps non-ServiceError in ServiceError', async () => {
    const svc = createService({
      name: 'fail-svc',
      executeFn: async () => { throw new Error('raw error'); },
    });

    try {
      await svc.execute({});
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceError);
      expect(err.code).toBe('EXECUTE_FAILED');
      expect(err.serviceName).toBe('fail-svc');
      expect(err.originalError.message).toBe('raw error');
    }
  });

  it('execute re-throws ServiceError as-is', async () => {
    const original = new ServiceError('CUSTOM', 'custom error', 'inner');
    const svc = createService({
      name: 'rethrow-svc',
      executeFn: async () => { throw original; },
    });

    try {
      await svc.execute({});
    } catch (err) {
      expect(err).toBe(original);
    }
  });

  it('throws on missing name', () => {
    expect(() => createService({ executeFn: async () => {} })).toThrow('Service name is required');
  });

  it('throws on missing executeFn', () => {
    expect(() => createService({ name: 'no-exec' })).toThrow('executeFn must be a function');
  });
});

// ── Service Registry ──────────────────────────────────

describe('ServiceRegistry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registerService adds to registry and returns service', () => {
    const svc = registerService({
      name: 'svc-a',
      capabilities: ['analysis'],
      stages: [1, 2],
      executeFn: async () => ({}),
    });

    expect(svc.name).toBe('svc-a');
    expect(listAll()).toHaveLength(1);
  });

  it('throws DUPLICATE_SERVICE on duplicate name', () => {
    registerService({ name: 'dup', executeFn: async () => ({}) });
    expect(() => registerService({ name: 'dup', executeFn: async () => ({}) })).toThrow('already registered');
  });

  it('getByCapability returns matching services', () => {
    registerService({ name: 'research-svc', capabilities: ['research', 'data'], executeFn: async () => ({}) });
    registerService({ name: 'scoring-svc', capabilities: ['scoring'], executeFn: async () => ({}) });

    expect(getByCapability('research')).toHaveLength(1);
    expect(getByCapability('research')[0].name).toBe('research-svc');
    expect(getByCapability('scoring')).toHaveLength(1);
    expect(getByCapability('nonexistent')).toHaveLength(0);
  });

  it('getByStage returns services supporting that stage', () => {
    registerService({ name: 'early', stages: [1, 2, 3], executeFn: async () => ({}) });
    registerService({ name: 'mid', stages: [3, 4, 5], executeFn: async () => ({}) });
    registerService({ name: 'late', stages: [10, 11], executeFn: async () => ({}) });

    const stage3 = getByStage(3);
    expect(stage3).toHaveLength(2);
    expect(stage3.map(s => s.name).sort()).toEqual(['early', 'mid']);

    expect(getByStage(10)).toHaveLength(1);
    expect(getByStage(99)).toHaveLength(0);
  });

  it('listAll returns all registered services', () => {
    registerService({ name: 'a', executeFn: async () => ({}) });
    registerService({ name: 'b', executeFn: async () => ({}) });
    registerService({ name: 'c', executeFn: async () => ({}) });

    expect(listAll()).toHaveLength(3);
  });

  it('clearRegistry empties the registry', () => {
    registerService({ name: 'temp', executeFn: async () => ({}) });
    expect(listAll()).toHaveLength(1);
    clearRegistry();
    expect(listAll()).toHaveLength(0);
  });
});
