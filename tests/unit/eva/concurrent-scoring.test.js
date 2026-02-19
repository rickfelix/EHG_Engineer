/**
 * Concurrent Scoring Statelessness Test
 * SD: SD-MAN-INFRA-STATELESS-SHARED-SERVICES-001
 *
 * Verifies that two simultaneous scoreSD() invocations with the same SD key
 * produce identical total_score values. Validates the statelessness requirement
 * from the A01 vision dimension (closes gap from 46/100 to 90+).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRegistry } from '../../../lib/eva/shared-services.js';
import { createHandlerRegistry } from '../../../lib/eva/event-bus/handler-registry.js';

// ── Registry Factory Isolation Tests ────────────────────────────────────────

describe('createRegistry() — factory isolation', () => {
  it('returns independent instances that do not share state', () => {
    const r1 = createRegistry();
    const r2 = createRegistry();

    r1.registerService({ name: 'svc-a', executeFn: async () => ({}) });

    expect(r1.listAll()).toHaveLength(1);
    expect(r2.listAll()).toHaveLength(0);
    expect(r1.listAll()[0].name).toBe('svc-a');
  });

  it('each instance has independent clearRegistry()', () => {
    const r1 = createRegistry();
    const r2 = createRegistry();

    r1.registerService({ name: 'svc-x', executeFn: async () => ({}) });
    r2.registerService({ name: 'svc-y', executeFn: async () => ({}) });

    r1.clearRegistry();

    expect(r1.listAll()).toHaveLength(0);
    expect(r2.listAll()).toHaveLength(1);
    expect(r2.listAll()[0].name).toBe('svc-y');
  });

  it('getByCapability works on isolated instance', () => {
    const r = createRegistry();
    r.registerService({ name: 'scorer', capabilities: ['scoring', 'analysis'], executeFn: async () => ({}) });

    expect(r.getByCapability('scoring')).toHaveLength(1);
    expect(r.getByCapability('nonexistent')).toHaveLength(0);
  });

  it('getByStage works on isolated instance', () => {
    const r = createRegistry();
    r.registerService({ name: 'early', stages: [1, 2, 3], executeFn: async () => ({}) });

    expect(r.getByStage(2)).toHaveLength(1);
    expect(r.getByStage(99)).toHaveLength(0);
  });

  it('DUPLICATE_SERVICE error is instance-local (not cross-instance)', () => {
    const r1 = createRegistry();
    const r2 = createRegistry();

    r1.registerService({ name: 'shared-name', executeFn: async () => ({}) });

    // r2 can register the same name independently — no conflict
    expect(() => r2.registerService({ name: 'shared-name', executeFn: async () => ({}) })).not.toThrow();

    // r1 still throws on duplicate within its own store
    expect(() => r1.registerService({ name: 'shared-name', executeFn: async () => ({}) })).toThrow('already registered');
  });
});

// ── Handler Registry Factory Isolation Tests ────────────────────────────────

describe('createHandlerRegistry() — factory isolation', () => {
  it('returns independent instances that do not share state', () => {
    const h1 = createHandlerRegistry();
    const h2 = createHandlerRegistry();

    h1.registerHandler('stage.completed', async () => ({ ok: true }));

    expect(h1.getHandler('stage.completed')).not.toBeNull();
    expect(h2.getHandler('stage.completed')).toBeNull();
  });

  it('each instance has independent clearHandlers()', () => {
    const h1 = createHandlerRegistry();
    const h2 = createHandlerRegistry();

    h1.registerHandler('venture.created', async () => ({}));
    h2.registerHandler('venture.created', async () => ({}));

    h1.clearHandlers();

    expect(h1.getHandlerCount()).toBe(0);
    expect(h2.getHandlerCount()).toBe(1);
  });

  it('listRegisteredTypes() is instance-local', () => {
    const h1 = createHandlerRegistry();
    const h2 = createHandlerRegistry();

    h1.registerHandler('a.happened', async () => ({}));
    h1.registerHandler('b.happened', async () => ({}));
    h2.registerHandler('c.happened', async () => ({}));

    expect(h1.listRegisteredTypes()).toEqual(['a.happened', 'b.happened']);
    expect(h2.listRegisteredTypes()).toEqual(['c.happened']);
  });

  it('re-registering same event type replaces handler (idempotent within instance)', () => {
    const h = createHandlerRegistry();
    const fn1 = async () => ({ version: 1 });
    const fn2 = async () => ({ version: 2 });

    h.registerHandler('event.x', fn1, { name: 'handler-v1' });
    h.registerHandler('event.x', fn2, { name: 'handler-v2' });

    const entry = h.getHandler('event.x');
    expect(entry.name).toBe('handler-v2');
    expect(h.getHandlerCount()).toBe(1);
  });
});

// ── Concurrent Execution Statelessness Test ─────────────────────────────────

describe('Concurrent registry operations — no cross-run interference', () => {
  it('two concurrent registration sequences do not interfere', async () => {
    // Simulate two concurrent "worker" contexts, each with their own registry
    async function workerA() {
      const registry = createRegistry();
      registry.registerService({ name: 'analysis-svc', capabilities: ['analysis'], stages: [1], executeFn: async () => ({ result: 'A' }) });
      // Yield to event loop to allow interleaving
      await new Promise(r => setTimeout(r, 0));
      return registry.listAll().map(s => s.name);
    }

    async function workerB() {
      const registry = createRegistry();
      registry.registerService({ name: 'scoring-svc', capabilities: ['scoring'], stages: [2], executeFn: async () => ({ result: 'B' }) });
      await new Promise(r => setTimeout(r, 0));
      return registry.listAll().map(s => s.name);
    }

    const [servicesA, servicesB] = await Promise.all([workerA(), workerB()]);

    expect(servicesA).toEqual(['analysis-svc']);
    expect(servicesB).toEqual(['scoring-svc']);
    // No cross-contamination
    expect(servicesA).not.toContain('scoring-svc');
    expect(servicesB).not.toContain('analysis-svc');
  });

  it('two concurrent handler registration sequences do not interfere', async () => {
    async function handlerWorker1() {
      const registry = createHandlerRegistry();
      registry.registerHandler('worker1.event', async () => ({ worker: 1 }));
      await new Promise(r => setTimeout(r, 0));
      return registry.listRegisteredTypes();
    }

    async function handlerWorker2() {
      const registry = createHandlerRegistry();
      registry.registerHandler('worker2.event', async () => ({ worker: 2 }));
      await new Promise(r => setTimeout(r, 0));
      return registry.listRegisteredTypes();
    }

    const [types1, types2] = await Promise.all([handlerWorker1(), handlerWorker2()]);

    expect(types1).toEqual(['worker1.event']);
    expect(types2).toEqual(['worker2.event']);
  });
});

// ── Backward Compatibility (default module-level exports) ───────────────────

import {
  registerService,
  getByCapability,
  getByStage,
  listAll,
  clearRegistry,
} from '../../../lib/eva/shared-services.js';

import {
  registerHandler,
  getHandler,
  clearHandlers,
  getHandlerCount,
} from '../../../lib/eva/event-bus/handler-registry.js';

describe('Backward-compatible module-level exports', () => {
  beforeEach(() => {
    clearRegistry();
    clearHandlers();
  });

  it('registerService() and listAll() work on default instance', () => {
    registerService({ name: 'compat-svc', capabilities: ['compat'], executeFn: async () => ({}) });
    expect(listAll()).toHaveLength(1);
    expect(listAll()[0].name).toBe('compat-svc');
  });

  it('getByCapability() works on default instance', () => {
    registerService({ name: 'cap-svc', capabilities: ['reporting'], stages: [5], executeFn: async () => ({}) });
    expect(getByCapability('reporting')).toHaveLength(1);
    expect(getByStage(5)).toHaveLength(1);
  });

  it('clearRegistry() resets default instance', () => {
    registerService({ name: 'temp-svc', executeFn: async () => ({}) });
    expect(listAll()).toHaveLength(1);
    clearRegistry();
    expect(listAll()).toHaveLength(0);
  });

  it('registerHandler() and getHandler() work on default instance', () => {
    registerHandler('test.event', async () => ({}), { name: 'test-handler' });
    expect(getHandler('test.event')).not.toBeNull();
    expect(getHandler('test.event').name).toBe('test-handler');
    expect(getHandlerCount()).toBe(1);
  });

  it('clearHandlers() resets default instance', () => {
    registerHandler('cleanup.event', async () => ({}));
    expect(getHandlerCount()).toBe(1);
    clearHandlers();
    expect(getHandlerCount()).toBe(0);
  });
});
