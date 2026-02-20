/**
 * Unit tests for Event Bus Handler Registry (Unified)
 * SD: SD-EHG-ORCH-FOUNDATION-CLEANUP-001-D (updated from SD-EVA-FIX-POST-LAUNCH-001)
 *
 * Tests: register (append + singleton), get, getHandlers, list, clear, count
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerHandler,
  getHandler,
  getHandlers,
  getRegistryCounts,
  listRegisteredTypes,
  clearHandlers,
  getHandlerCount,
} from '../../../../lib/eva/event-bus/handler-registry.js';

describe('handler-registry', () => {
  beforeEach(() => {
    clearHandlers();
  });

  describe('registerHandler', () => {
    it('registers a handler for an event type', () => {
      const fn = async () => ({ outcome: 'ok' });
      registerHandler('stage.completed', fn, { name: 'stageHandler' });

      const handler = getHandler('stage.completed');
      expect(handler).not.toBeNull();
      expect(handler.name).toBe('stageHandler');
      expect(handler.handlerFn).toBe(fn);
    });

    it('defaults retryable to true', () => {
      registerHandler('test.event', async () => {});
      const handler = getHandler('test.event');
      expect(handler.retryable).toBe(true);
    });

    it('respects retryable=false option', () => {
      registerHandler('test.event', async () => {}, { retryable: false });
      const handler = getHandler('test.event');
      expect(handler.retryable).toBe(false);
    });

    it('defaults maxRetries to 3', () => {
      registerHandler('test.event', async () => {});
      expect(getHandler('test.event').maxRetries).toBe(3);
    });

    it('uses function name when no name option provided', () => {
      async function myHandler() {}
      registerHandler('test.event', myHandler);
      expect(getHandler('test.event').name).toBe('myHandler');
    });

    it('falls back to eventType as name for anonymous functions', () => {
      registerHandler('test.event', async () => {});
      expect(getHandler('test.event').name).toBe('test.event');
    });

    it('sets registeredAt timestamp', () => {
      registerHandler('test.event', async () => {});
      const handler = getHandler('test.event');
      expect(handler.registeredAt).toBeDefined();
      expect(new Date(handler.registeredAt).getTime()).not.toBeNaN();
    });
  });

  describe('multi-handler (default append mode)', () => {
    it('appends handlers for the same event type', () => {
      const fn1 = async () => 'first';
      const fn2 = async () => 'second';

      registerHandler('stage.completed', fn1, { name: 'first' });
      registerHandler('stage.completed', fn2, { name: 'second' });

      const handlers = getHandlers('stage.completed');
      expect(handlers).toHaveLength(2);
      expect(handlers[0].name).toBe('first');
      expect(handlers[1].name).toBe('second');
      expect(getHandlerCount()).toBe(2);
    });

    it('getHandler returns the first registered handler', () => {
      const fn1 = async () => 'first';
      const fn2 = async () => 'second';

      registerHandler('stage.completed', fn1, { name: 'first' });
      registerHandler('stage.completed', fn2, { name: 'second' });

      const handler = getHandler('stage.completed');
      expect(handler.name).toBe('first');
      expect(handler.handlerFn).toBe(fn1);
    });
  });

  describe('singleton mode (EVA pattern)', () => {
    it('overwrites all handlers when singleton: true', () => {
      const fn1 = async () => 'first';
      const fn2 = async () => 'second';

      registerHandler('stage.completed', fn1, { name: 'first' });
      registerHandler('stage.completed', fn2, { name: 'second', singleton: true });

      const handler = getHandler('stage.completed');
      expect(handler.name).toBe('second');
      expect(handler.handlerFn).toBe(fn2);
      expect(getHandlerCount()).toBe(1);
    });

    it('singleton re-registration replaces previous', () => {
      const fn1 = async () => 'first';
      const fn2 = async () => 'second';

      registerHandler('stage.completed', fn1, { name: 'first', singleton: true });
      registerHandler('stage.completed', fn2, { name: 'second', singleton: true });

      const handlers = getHandlers('stage.completed');
      expect(handlers).toHaveLength(1);
      expect(handlers[0].name).toBe('second');
    });
  });

  describe('getHandler', () => {
    it('returns null for unregistered types', () => {
      expect(getHandler('nonexistent')).toBeNull();
    });

    it('returns the correct handler for registered types', () => {
      const fn1 = async () => 'a';
      const fn2 = async () => 'b';
      registerHandler('type.a', fn1);
      registerHandler('type.b', fn2);

      expect(getHandler('type.a').handlerFn).toBe(fn1);
      expect(getHandler('type.b').handlerFn).toBe(fn2);
    });
  });

  describe('getHandlers', () => {
    it('returns empty array for unregistered types', () => {
      expect(getHandlers('nonexistent')).toEqual([]);
    });

    it('returns all handlers for a type', () => {
      registerHandler('vision.scored', async () => {}, { name: 'sub1' });
      registerHandler('vision.scored', async () => {}, { name: 'sub2' });
      registerHandler('vision.scored', async () => {}, { name: 'sub3' });

      const handlers = getHandlers('vision.scored');
      expect(handlers).toHaveLength(3);
      expect(handlers.map(h => h.name)).toEqual(['sub1', 'sub2', 'sub3']);
    });
  });

  describe('getRegistryCounts', () => {
    it('returns empty map when no handlers registered', () => {
      const counts = getRegistryCounts();
      expect(counts.size).toBe(0);
    });

    it('returns correct count per event type', () => {
      registerHandler('type.a', async () => {});
      registerHandler('type.a', async () => {});
      registerHandler('type.b', async () => {});

      const counts = getRegistryCounts();
      expect(counts.get('type.a')).toBe(2);
      expect(counts.get('type.b')).toBe(1);
    });
  });

  describe('listRegisteredTypes', () => {
    it('returns empty array when no handlers registered', () => {
      expect(listRegisteredTypes()).toEqual([]);
    });

    it('returns all registered event types', () => {
      registerHandler('stage.completed', async () => {});
      registerHandler('decision.submitted', async () => {});
      registerHandler('gate.evaluated', async () => {});

      const types = listRegisteredTypes();
      expect(types).toContain('stage.completed');
      expect(types).toContain('decision.submitted');
      expect(types).toContain('gate.evaluated');
      expect(types).toHaveLength(3);
    });
  });

  describe('clearHandlers', () => {
    it('removes all registered handlers', () => {
      registerHandler('type.a', async () => {});
      registerHandler('type.b', async () => {});
      expect(getHandlerCount()).toBe(2);

      clearHandlers();
      expect(getHandlerCount()).toBe(0);
      expect(getHandler('type.a')).toBeNull();
    });
  });

  describe('getHandlerCount', () => {
    it('returns 0 when empty', () => {
      expect(getHandlerCount()).toBe(0);
    });

    it('returns total count across all types', () => {
      registerHandler('a', async () => {});
      registerHandler('a', async () => {});
      registerHandler('b', async () => {});
      expect(getHandlerCount()).toBe(3);
    });
  });
});
