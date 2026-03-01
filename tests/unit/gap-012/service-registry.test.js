/**
 * Tests for ServiceRegistry
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (A03: eva_hub_and_orchestration_model)
 */

import { describe, it, expect } from 'vitest';
import { ServiceRegistry } from '../../../lib/eva/service-registry.js';
import defaultRegistry from '../../../lib/eva/service-registry.js';

describe('ServiceRegistry', () => {
  it('registers and dispatches a handler', async () => {
    const registry = new ServiceRegistry();
    registry.register('test_job', async (params) => params.value * 2);

    const result = await registry.dispatch('test_job', { value: 21 });
    expect(result).toBe(42);
  });

  it('throws on dispatching unregistered service', async () => {
    const registry = new ServiceRegistry();
    await expect(registry.dispatch('unknown_job', {}))
      .rejects.toThrow(/unknown service type 'unknown_job'/);
  });

  it('throws on registering non-function handler', () => {
    const registry = new ServiceRegistry();
    expect(() => registry.register('bad', 'not a function'))
      .toThrow(/must be a function/);
  });

  it('has() returns correct boolean', () => {
    const registry = new ServiceRegistry();
    registry.register('exists', async () => {});
    expect(registry.has('exists')).toBe(true);
    expect(registry.has('nope')).toBe(false);
  });

  it('listServices() returns registered keys', () => {
    const registry = new ServiceRegistry();
    registry.register('a', async () => {});
    registry.register('b', async () => {});
    expect(registry.listServices()).toEqual(['a', 'b']);
  });

  it('exports a default singleton', () => {
    expect(defaultRegistry).toBeInstanceOf(ServiceRegistry);
  });

  it('allows overwriting a handler', async () => {
    const registry = new ServiceRegistry();
    registry.register('svc', async () => 'v1');
    registry.register('svc', async () => 'v2');
    expect(await registry.dispatch('svc', {})).toBe('v2');
  });
});
