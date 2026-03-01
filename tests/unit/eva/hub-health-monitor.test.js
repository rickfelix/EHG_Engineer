import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkServiceHealth,
  checkAllServices,
  getServiceHealth,
  getSystemHealth,
  clearHealthState,
  HEALTH_STATUS,
} from '../../../lib/eva/hub-health-monitor.js';

function makeService(name, loadContextFn) {
  return {
    name,
    capabilities: ['test'],
    stages: [1],
    loadContext: loadContextFn || vi.fn(() => Promise.resolve({ venture: null })),
    execute: vi.fn(),
    emit: vi.fn(),
  };
}

function makeRegistry(services = []) {
  return {
    listAll: vi.fn(() => services),
    getByCapability: vi.fn(() => []),
    getByStage: vi.fn(() => []),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const mockSupabase = {};

describe('hub-health-monitor', () => {
  beforeEach(() => {
    clearHealthState();
  });

  describe('HEALTH_STATUS', () => {
    it('exports frozen status constants', () => {
      expect(HEALTH_STATUS.HEALTHY).toBe('healthy');
      expect(HEALTH_STATUS.DEGRADED).toBe('degraded');
      expect(HEALTH_STATUS.UNHEALTHY).toBe('unhealthy');
      expect(HEALTH_STATUS.UNKNOWN).toBe('unknown');
      expect(Object.isFrozen(HEALTH_STATUS)).toBe(true);
    });
  });

  describe('checkServiceHealth', () => {
    it('returns healthy for fast-responding service', async () => {
      const service = makeService('fast-service');
      const result = await checkServiceHealth(service, mockSupabase, { logger: silentLogger });

      expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
      expect(result.latencyMs).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('returns unhealthy when service throws', async () => {
      const service = makeService('broken-service', () => {
        throw new Error('Service crashed');
      });
      const result = await checkServiceHealth(service, mockSupabase, { logger: silentLogger });

      expect(result.status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(result.error).toBe('Service crashed');
    });

    it('handles service without loadContext', async () => {
      const service = { name: 'minimal', loadContext: null };
      const result = await checkServiceHealth(service, mockSupabase, { logger: silentLogger });

      expect(result.status).toBe(HEALTH_STATUS.HEALTHY);
    });
  });

  describe('checkAllServices', () => {
    it('checks all services in registry', async () => {
      const services = [
        makeService('svc-a'),
        makeService('svc-b'),
      ];
      const registry = makeRegistry(services);

      const healthMap = await checkAllServices(registry, mockSupabase, { logger: silentLogger });

      expect(healthMap.size).toBe(2);
      expect(healthMap.get('svc-a').status).toBe(HEALTH_STATUS.HEALTHY);
      expect(healthMap.get('svc-b').status).toBe(HEALTH_STATUS.HEALTHY);
    });

    it('tracks consecutive failures', async () => {
      const failService = makeService('failing', () => { throw new Error('down'); });
      const registry = makeRegistry([failService]);

      // Run 3 checks to hit threshold
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });

      const health = getServiceHealth('failing');
      expect(health.status).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(health.consecutiveFailures).toBe(3);
    });

    it('resets consecutive failures on success', async () => {
      let callCount = 0;
      const intermittentService = makeService('intermittent', () => {
        callCount++;
        if (callCount <= 2) throw new Error('temporary');
        return Promise.resolve({});
      });
      const registry = makeRegistry([intermittentService]);

      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      expect(getServiceHealth('intermittent').consecutiveFailures).toBe(2);

      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      expect(getServiceHealth('intermittent').consecutiveFailures).toBe(0);
      expect(getServiceHealth('intermittent').status).toBe(HEALTH_STATUS.HEALTHY);
    });

    it('handles invalid registry gracefully', async () => {
      const result = await checkAllServices(null, mockSupabase, { logger: silentLogger });
      expect(result.size).toBe(0);
    });
  });

  describe('getServiceHealth', () => {
    it('returns null for unknown service', () => {
      expect(getServiceHealth('nonexistent')).toBeNull();
    });

    it('returns health entry after check', async () => {
      const registry = makeRegistry([makeService('tracked')]);
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });

      const health = getServiceHealth('tracked');
      expect(health).not.toBeNull();
      expect(health.name).toBe('tracked');
      expect(health.lastChecked).toBeDefined();
    });
  });

  describe('getSystemHealth', () => {
    it('returns unknown when no services monitored', () => {
      const system = getSystemHealth();
      expect(system.overall).toBe(HEALTH_STATUS.UNKNOWN);
      expect(system.services).toHaveLength(0);
    });

    it('returns healthy when all services healthy', async () => {
      const registry = makeRegistry([makeService('a'), makeService('b')]);
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });

      const system = getSystemHealth();
      expect(system.overall).toBe(HEALTH_STATUS.HEALTHY);
      expect(system.healthy).toBe(2);
      expect(system.unhealthy).toBe(0);
    });

    it('returns unhealthy when any service is unhealthy', async () => {
      const services = [
        makeService('ok'),
        makeService('broken', () => { throw new Error('down'); }),
      ];
      const registry = makeRegistry(services);
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });

      const system = getSystemHealth();
      expect(system.overall).toBe(HEALTH_STATUS.UNHEALTHY);
      expect(system.healthy).toBe(1);
      expect(system.unhealthy).toBe(1);
    });
  });

  describe('clearHealthState', () => {
    it('resets all health data', async () => {
      const registry = makeRegistry([makeService('temp')]);
      await checkAllServices(registry, mockSupabase, { logger: silentLogger });
      expect(getServiceHealth('temp')).not.toBeNull();

      clearHealthState();
      expect(getServiceHealth('temp')).toBeNull();
      expect(getSystemHealth().overall).toBe(HEALTH_STATUS.UNKNOWN);
    });
  });
});
