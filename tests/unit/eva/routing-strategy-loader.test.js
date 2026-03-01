/**
 * Routing Strategy Loader Tests
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-A
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadRoutingStrategy,
  createStrategyClassifier,
  invalidateCache,
  getCachedStrategy,
} from '../../../lib/eva/event-bus/routing-strategy-loader.js';
import { ROUTING_MODES } from '../../../lib/eva/event-bus/event-router.js';

// Mock Supabase client
function createMockSupabase(configValue = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: configValue ? { value: configValue } : null,
            error: configValue ? null : { message: 'not found' },
          }),
        }),
      }),
    }),
  };
}

describe('Routing Strategy Loader', () => {
  beforeEach(() => {
    invalidateCache();
  });

  describe('loadRoutingStrategy', () => {
    it('should return default strategy when no config exists', async () => {
      const supabase = createMockSupabase(null);
      const strategy = await loadRoutingStrategy(supabase);
      expect(strategy.source).toBe('default');
      expect(strategy.overrides).toEqual({});
      expect(strategy.prefixRules).toEqual({});
    });

    it('should load overrides from eva_config', async () => {
      const config = JSON.stringify({
        overrides: { 'stage.completed': 'PRIORITY_QUEUE' },
        prefixRules: { 'audit.': 'PRIORITY_QUEUE' },
      });
      const supabase = createMockSupabase(config);
      const strategy = await loadRoutingStrategy(supabase);
      expect(strategy.source).toBe('database');
      expect(strategy.overrides['stage.completed']).toBe('PRIORITY_QUEUE');
      expect(strategy.prefixRules['audit.']).toBe('PRIORITY_QUEUE');
    });

    it('should reject invalid routing modes in config', async () => {
      const config = JSON.stringify({
        overrides: { 'test.event': 'INVALID_MODE' },
      });
      const supabase = createMockSupabase(config);
      const strategy = await loadRoutingStrategy(supabase);
      expect(strategy.overrides['test.event']).toBeUndefined();
    });

    it('should cache strategy and return cached on subsequent calls', async () => {
      const supabase = createMockSupabase(null);
      await loadRoutingStrategy(supabase);
      const cached = getCachedStrategy();
      expect(cached).not.toBeNull();

      // Second call should use cache (supabase not called again)
      const strategy2 = await loadRoutingStrategy(supabase);
      expect(strategy2).toBe(cached);
    });

    it('should reload after cache invalidation', async () => {
      const supabase = createMockSupabase(null);
      await loadRoutingStrategy(supabase);
      invalidateCache();
      expect(getCachedStrategy()).toBeNull();
    });
  });

  describe('createStrategyClassifier', () => {
    it('should use exact match override', () => {
      const strategy = {
        overrides: { 'stage.completed': 'PRIORITY_QUEUE' },
        prefixRules: {},
        loadedAt: new Date().toISOString(),
        source: 'database',
      };
      const classify = createStrategyClassifier(strategy);
      expect(classify('stage.completed', {})).toBe('PRIORITY_QUEUE');
    });

    it('should use prefix rule when no exact match', () => {
      const strategy = {
        overrides: {},
        prefixRules: { 'audit.': 'PRIORITY_QUEUE' },
        loadedAt: new Date().toISOString(),
        source: 'database',
      };
      const classify = createStrategyClassifier(strategy);
      expect(classify('audit.security_scan', {})).toBe('PRIORITY_QUEUE');
    });

    it('should prefer longest prefix match', () => {
      const strategy = {
        overrides: {},
        prefixRules: {
          'audit.': 'ROUND',
          'audit.security.': 'PRIORITY_QUEUE',
        },
        loadedAt: new Date().toISOString(),
        source: 'database',
      };
      const classify = createStrategyClassifier(strategy);
      expect(classify('audit.security.scan', {})).toBe('PRIORITY_QUEUE');
      expect(classify('audit.general', {})).toBe('ROUND');
    });

    it('should fall back to default classifyRoutingMode when no override matches', () => {
      const strategy = {
        overrides: {},
        prefixRules: {},
        loadedAt: new Date().toISOString(),
        source: 'default',
      };
      const classify = createStrategyClassifier(strategy);
      // round.* events default to ROUND in the hardcoded classifier
      expect(classify('round.health_check', {})).toBe(ROUTING_MODES.ROUND);
      // regular events default to EVENT
      expect(classify('test.event', {})).toBe(ROUTING_MODES.EVENT);
    });
  });
});
