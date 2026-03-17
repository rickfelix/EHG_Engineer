/**
 * LLM Response Cache
 * SD-LEO-INFRA-LLM-RESPONSE-CACHING-001
 *
 * TTL-based in-memory cache with LRU eviction for LLM responses.
 * Uses content-hash of (systemPrompt + userPrompt + model) as cache key.
 *
 * @module lib/llm/response-cache
 */

import { createHash } from 'crypto';

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_MAX_ENTRIES = 200;

class LLMResponseCache {
  constructor({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
    this.stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };
  }

  /**
   * Generate deterministic cache key from prompt content and model.
   */
  _makeKey(systemPrompt, userPrompt, model) {
    const raw = `${systemPrompt || ''}|${userPrompt || ''}|${model || ''}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * Get a cached response if it exists and hasn't expired.
   * @returns {Object|null} Cached response or null on miss
   */
  get(systemPrompt, userPrompt, model) {
    const key = this._makeKey(systemPrompt, userPrompt, model);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // Move to end for LRU (delete + re-set maintains insertion order)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.stats.hits++;

    return entry.response;
  }

  /**
   * Store a response in the cache.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @param {string} model
   * @param {Object} response - The LLM response object
   * @param {number} [ttlMs] - TTL in milliseconds (default 30 min)
   */
  set(systemPrompt, userPrompt, model, response, ttlMs = DEFAULT_TTL_MS) {
    const key = this._makeKey(systemPrompt, userPrompt, model);

    // LRU eviction: remove oldest entries if at capacity
    while (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    this.cache.set(key, {
      response,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now()
    });
    this.stats.sets++;
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      hit_count: this.stats.hits,
      miss_count: this.stats.misses,
      hit_rate: total > 0 ? Math.round((this.stats.hits / total) * 100) / 100 : 0,
      entry_count: this.cache.size,
      max_entries: this.maxEntries,
      eviction_count: this.stats.evictions,
      set_count: this.stats.sets
    };
  }

  /**
   * Clear all cached entries.
   */
  clear() {
    this.cache.clear();
  }
}

// Singleton instance shared across all callsites
const responseCache = new LLMResponseCache();

export { LLMResponseCache };
export default responseCache;
