/**
 * Unit tests for LLM Response Cache
 * SD-LEO-INFRA-LLM-RESPONSE-CACHING-001
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LLMResponseCache } from './response-cache.js';

describe('LLMResponseCache', () => {
  let cache;

  beforeEach(() => {
    cache = new LLMResponseCache({ maxEntries: 5 });
  });

  describe('cache key generation', () => {
    it('generates same key for same inputs', () => {
      const response = { content: 'hello' };
      cache.set('sys', 'user', 'model-1', response);
      const result = cache.get('sys', 'user', 'model-1');
      expect(result).toEqual(response);
    });

    it('generates different keys for different prompts', () => {
      cache.set('sys', 'user-A', 'model-1', { content: 'A' });
      cache.set('sys', 'user-B', 'model-1', { content: 'B' });
      expect(cache.get('sys', 'user-A', 'model-1').content).toBe('A');
      expect(cache.get('sys', 'user-B', 'model-1').content).toBe('B');
    });

    it('generates different keys for different models', () => {
      cache.set('sys', 'user', 'model-1', { content: '1' });
      cache.set('sys', 'user', 'model-2', { content: '2' });
      expect(cache.get('sys', 'user', 'model-1').content).toBe('1');
      expect(cache.get('sys', 'user', 'model-2').content).toBe('2');
    });
  });

  describe('cache hit/miss', () => {
    it('returns null on cache miss', () => {
      expect(cache.get('sys', 'user', 'model')).toBeNull();
    });

    it('returns cached response on hit', () => {
      const response = { content: 'test', provider: 'google' };
      cache.set('sys', 'user', 'model', response);
      expect(cache.get('sys', 'user', 'model')).toEqual(response);
    });

    it('returns null after TTL expiry', () => {
      cache.set('sys', 'user', 'model', { content: 'old' }, 1); // 1ms TTL
      // Wait for TTL to expire
      const start = Date.now();
      while (Date.now() - start < 5) { /* busy wait */ }
      expect(cache.get('sys', 'user', 'model')).toBeNull();
    });

    it('handles null/undefined prompts', () => {
      cache.set(null, undefined, 'model', { content: 'ok' });
      expect(cache.get(null, undefined, 'model')).toEqual({ content: 'ok' });
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest entries when max capacity reached', () => {
      for (let i = 0; i < 6; i++) {
        cache.set('sys', `user-${i}`, 'model', { content: `r-${i}` });
      }
      // Entry 0 should be evicted (max 5)
      expect(cache.get('sys', 'user-0', 'model')).toBeNull();
      // Entry 5 should still exist
      expect(cache.get('sys', 'user-5', 'model')).toEqual({ content: 'r-5' });
    });

    it('refreshes LRU position on access', () => {
      for (let i = 0; i < 5; i++) {
        cache.set('sys', `user-${i}`, 'model', { content: `r-${i}` });
      }
      // Access entry 0 to refresh its position
      cache.get('sys', 'user-0', 'model');
      // Add new entry - entry 1 should be evicted (oldest not-recently-accessed)
      cache.set('sys', 'user-5', 'model', { content: 'r-5' });
      expect(cache.get('sys', 'user-0', 'model')).not.toBeNull(); // refreshed
      expect(cache.get('sys', 'user-1', 'model')).toBeNull(); // evicted
    });
  });

  describe('statistics', () => {
    it('tracks hits and misses', () => {
      cache.set('sys', 'user', 'model', { content: 'test' });
      cache.get('sys', 'user', 'model');  // hit
      cache.get('sys', 'other', 'model'); // miss

      const stats = cache.getStats();
      expect(stats.hit_count).toBe(1);
      expect(stats.miss_count).toBe(1);
      expect(stats.hit_rate).toBe(0.5);
    });

    it('tracks entry count', () => {
      cache.set('sys', 'u1', 'm', { content: '1' });
      cache.set('sys', 'u2', 'm', { content: '2' });
      expect(cache.getStats().entry_count).toBe(2);
    });

    it('tracks evictions', () => {
      for (let i = 0; i < 7; i++) {
        cache.set('sys', `u-${i}`, 'm', { content: `${i}` });
      }
      expect(cache.getStats().eviction_count).toBe(2);
    });

    it('returns 0 hit_rate when no requests', () => {
      expect(cache.getStats().hit_rate).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      cache.set('sys', 'u1', 'm', { content: '1' });
      cache.set('sys', 'u2', 'm', { content: '2' });
      cache.clear();
      expect(cache.getStats().entry_count).toBe(0);
      expect(cache.get('sys', 'u1', 'm')).toBeNull();
    });
  });
});
