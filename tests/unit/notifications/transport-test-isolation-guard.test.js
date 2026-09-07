// SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isFetchMocked, shouldRefuseRealSend } from '../../../lib/notifications/transport-test-isolation-guard.js';

describe('transport-test-isolation-guard', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe('isFetchMocked', () => {
    it('returns false when globalThis.fetch is the real (unreplaced) fetch', () => {
      global.fetch = originalFetch;
      expect(isFetchMocked()).toBe(false);
    });

    it('returns true when globalThis.fetch has been replaced with a vi.fn() mock', () => {
      global.fetch = vi.fn();
      expect(isFetchMocked()).toBe(true);
    });

    it('returns false when globalThis.fetch is undefined -- does not throw', () => {
      // @ts-ignore
      delete global.fetch;
      expect(() => isFetchMocked()).not.toThrow();
      expect(isFetchMocked()).toBe(false);
    });
  });

  describe('shouldRefuseRealSend', () => {
    it('returns false outside a test environment (VITEST/NODE_ENV both cleared)', () => {
      delete process.env.VITEST;
      process.env.NODE_ENV = 'production';
      global.fetch = originalFetch;
      expect(shouldRefuseRealSend()).toBe(false);
    });

    it('returns true when VITEST is set and fetch is real (the actual incident shape)', () => {
      process.env.VITEST = 'true';
      global.fetch = originalFetch;
      expect(shouldRefuseRealSend()).toBe(true);
    });

    it('returns false when VITEST is set but fetch has been mocked', () => {
      process.env.VITEST = 'true';
      global.fetch = vi.fn();
      expect(shouldRefuseRealSend()).toBe(false);
    });

    it('returns true when NODE_ENV=test and fetch is real', () => {
      delete process.env.VITEST;
      process.env.NODE_ENV = 'test';
      global.fetch = originalFetch;
      expect(shouldRefuseRealSend()).toBe(true);
    });
  });
});
