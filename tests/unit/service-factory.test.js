import { describe, it, expect, beforeEach } from 'vitest';
import {
  ServiceFactory,
  getServiceFactory,
  resetServiceFactory
} from '../../lib/service-factory.js';

describe('ServiceFactory', () => {
  beforeEach(() => {
    resetServiceFactory();
  });

  describe('withOverrides', () => {
    it('injects mock Supabase client', async () => {
      const mockClient = { from: () => 'mock' };
      const factory = ServiceFactory.withOverrides({ supabase: mockClient });
      const result = await factory.getSupabase();
      expect(result).toBe(mockClient);
    });

    it('injects mock LLM client (object)', () => {
      const mockLLM = { complete: async () => ({ content: 'test' }) };
      const factory = ServiceFactory.withOverrides({ llm: mockLLM });
      const result = factory.getLLMClient({ purpose: 'fast' });
      expect(result).toBe(mockLLM);
    });

    it('injects mock LLM client (factory function)', () => {
      const mockLLM = (opts) => ({ model: opts.purpose });
      const factory = ServiceFactory.withOverrides({ llm: mockLLM });
      const result = factory.getLLMClient({ purpose: 'classification' });
      expect(result).toEqual({ model: 'classification' });
    });
  });

  describe('isTestMode', () => {
    it('returns false for default factory', () => {
      const factory = new ServiceFactory();
      expect(factory.isTestMode()).toBe(false);
    });

    it('returns true when supabase override is active', () => {
      const factory = ServiceFactory.withOverrides({ supabase: {} });
      expect(factory.isTestMode()).toBe(true);
    });

    it('returns true when llm override is active', () => {
      const factory = ServiceFactory.withOverrides({ llm: {} });
      expect(factory.isTestMode()).toBe(true);
    });
  });

  describe('singleton', () => {
    it('getServiceFactory returns same instance across calls', () => {
      const a = getServiceFactory();
      const b = getServiceFactory();
      expect(a).toBe(b);
    });

    it('resetServiceFactory clears singleton', () => {
      const a = getServiceFactory();
      resetServiceFactory();
      const b = getServiceFactory();
      expect(a).not.toBe(b);
    });
  });
});
