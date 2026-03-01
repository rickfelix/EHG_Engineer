import { describe, it, expect, vi } from 'vitest';
import {
  createLifecycleService,
  initializeAll,
  healthCheckAll,
} from '../../../lib/eva/shared-services-lifecycle.js';

function makeRegistry(services = []) {
  return {
    listAll: vi.fn(() => services),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('shared-services-lifecycle', () => {
  describe('createLifecycleService', () => {
    it('creates service with lifecycle hooks', () => {
      const service = createLifecycleService({
        name: 'test-svc',
        capabilities: ['compute'],
        executeFn: vi.fn(),
        lifecycle: {
          init: vi.fn(),
          health: vi.fn(() => ({ status: 'healthy', latencyMs: 5 })),
        },
      });

      expect(service.name).toBe('test-svc');
      expect(service.hasLifecycle).toBe(true);
    });

    it('creates service without lifecycle hooks (backward compat)', () => {
      const service = createLifecycleService({
        name: 'basic-svc',
        executeFn: vi.fn(),
      });

      expect(service.hasLifecycle).toBe(false);
    });

    it('init calls lifecycle.init with supabase', async () => {
      const initFn = vi.fn();
      const service = createLifecycleService({
        name: 'init-svc',
        executeFn: vi.fn(),
        lifecycle: { init: initFn },
      });

      await service.init('mock-supabase');
      expect(initFn).toHaveBeenCalledWith('mock-supabase');
      expect(service._initialized).toBe(true);
    });

    it('health returns healthy when no health hook', async () => {
      const service = createLifecycleService({
        name: 'no-health',
        executeFn: vi.fn(),
      });

      const result = await service.health();
      expect(result.status).toBe('healthy');
      expect(result.latencyMs).toBe(0);
    });

    it('health returns result from hook', async () => {
      const service = createLifecycleService({
        name: 'custom-health',
        executeFn: vi.fn(),
        lifecycle: {
          health: () => Promise.resolve({ status: 'degraded', latencyMs: 150 }),
        },
      });

      const result = await service.health();
      expect(result.status).toBe('degraded');
      expect(result.latencyMs).toBe(150);
    });

    it('health returns unhealthy when hook throws', async () => {
      const service = createLifecycleService({
        name: 'broken-health',
        executeFn: vi.fn(),
        lifecycle: {
          health: () => { throw new Error('Service down'); },
        },
      });

      const result = await service.health();
      expect(result.status).toBe('unhealthy');
      expect(result.error).toBe('Service down');
    });

    it('stop resets initialized flag', async () => {
      const service = createLifecycleService({
        name: 'stop-svc',
        executeFn: vi.fn(),
        lifecycle: { init: vi.fn(), stop: vi.fn() },
      });

      await service.init({});
      expect(service._initialized).toBe(true);

      await service.stop();
      expect(service._initialized).toBe(false);
    });
  });

  describe('initializeAll', () => {
    it('initializes services with lifecycle hooks', async () => {
      const svc1 = createLifecycleService({
        name: 'svc-1',
        executeFn: vi.fn(),
        lifecycle: { init: vi.fn() },
      });
      const svc2 = createLifecycleService({
        name: 'svc-2',
        executeFn: vi.fn(),
        lifecycle: { init: vi.fn() },
      });
      const registry = makeRegistry([svc1, svc2]);

      const result = await initializeAll(registry, {}, { logger: silentLogger });
      expect(result.initialized).toEqual(['svc-1', 'svc-2']);
      expect(result.failed).toHaveLength(0);
    });

    it('skips services without lifecycle hooks', async () => {
      const svc1 = createLifecycleService({
        name: 'no-lifecycle',
        executeFn: vi.fn(),
      });
      const registry = makeRegistry([svc1]);

      const result = await initializeAll(registry, {}, { logger: silentLogger });
      expect(result.initialized).toHaveLength(0);
    });

    it('captures init failures without stopping others', async () => {
      const svc1 = createLifecycleService({
        name: 'fails',
        executeFn: vi.fn(),
        lifecycle: { init: () => { throw new Error('Init failed'); } },
      });
      const svc2 = createLifecycleService({
        name: 'succeeds',
        executeFn: vi.fn(),
        lifecycle: { init: vi.fn() },
      });
      const registry = makeRegistry([svc1, svc2]);

      const result = await initializeAll(registry, {}, { logger: silentLogger });
      expect(result.initialized).toEqual(['succeeds']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].name).toBe('fails');
    });

    it('handles null registry', async () => {
      const result = await initializeAll(null, {});
      expect(result.initialized).toHaveLength(0);
    });
  });

  describe('healthCheckAll', () => {
    it('returns healthy for all services without health hooks', async () => {
      const svc = createLifecycleService({ name: 'basic', executeFn: vi.fn() });
      const registry = makeRegistry([svc]);

      const result = await healthCheckAll(registry);
      expect(result.overall).toBe('healthy');
      expect(result.services[0].status).toBe('healthy');
    });

    it('returns unhealthy when any service is unhealthy', async () => {
      const healthy = createLifecycleService({
        name: 'ok',
        executeFn: vi.fn(),
        lifecycle: { health: () => Promise.resolve({ status: 'healthy', latencyMs: 5 }) },
      });
      const unhealthy = createLifecycleService({
        name: 'bad',
        executeFn: vi.fn(),
        lifecycle: { health: () => { throw new Error('down'); } },
      });
      const registry = makeRegistry([healthy, unhealthy]);

      const result = await healthCheckAll(registry);
      expect(result.overall).toBe('unhealthy');
    });

    it('handles null registry', async () => {
      const result = await healthCheckAll(null);
      expect(result.overall).toBe('unknown');
    });
  });
});
