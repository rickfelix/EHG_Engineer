/**
 * Session Knowledge Cache
 * LRU cache with TTL for session-scoped knowledge retrieval
 *
 * Key: (sessionId, domain, category, source, queryVersion)
 * Memory-safe with maxEntries and LRU eviction
 * Concurrency-safe via synchronous Map operations
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (FR-3, TR-4)
 */

export class SessionKnowledgeCache {
  /**
   * @param {Object} options
   * @param {number} [options.ttlMs=300000] - TTL in ms (default 5 minutes)
   * @param {number} [options.maxEntries=50] - Max cache entries before LRU eviction
   */
  constructor({ ttlMs = 300_000, maxEntries = 50 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    /** @type {Map<string, {data: any, accessOrder: number, createdAt: number}>} */
    this._store = new Map();
    this._stats = { hits: 0, misses: 0, evictions: 0, expired: 0 };
    this._accessCounter = 0; // Monotonic counter for deterministic LRU ordering
  }

  /**
   * Build deterministic cache key
   * @param {string} sessionId
   * @param {string} source - Adapter source name
   * @param {string} domain
   * @param {string} [category]
   * @param {string} [queryVersion='v1']
   * @returns {string}
   */
  static buildKey(sessionId, source, domain, category = '', queryVersion = 'v1') {
    return `${sessionId}|${source}|${domain}|${category}|${queryVersion}`;
  }

  /**
   * Get cached value, enforcing TTL on read
   * @param {string} key
   * @returns {any|null} Cached data or null if miss/expired
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      this._stats.misses++;
      return null;
    }

    // TTL check on read
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this._store.delete(key);
      this._stats.expired++;
      this._stats.misses++;
      return null;
    }

    // Update access order for LRU (monotonic counter avoids ms-precision ties)
    entry.accessOrder = ++this._accessCounter;
    this._stats.hits++;
    return entry.data;
  }

  /**
   * Store value with LRU eviction if at capacity
   * @param {string} key
   * @param {any} data
   */
  set(key, data) {
    // Evict if at capacity and key is new
    if (!this._store.has(key) && this._store.size >= this.maxEntries) {
      this._evictLRU();
    }

    this._store.set(key, {
      data,
      accessOrder: ++this._accessCounter,
      createdAt: Date.now()
    });
  }

  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    let oldestKey = null;
    let lowestOrder = Infinity;

    for (const [key, entry] of this._store) {
      if (entry.accessOrder < lowestOrder) {
        lowestOrder = entry.accessOrder;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._store.delete(oldestKey);
      this._stats.evictions++;
    }
  }

  /**
   * Get cache statistics
   * @returns {{ hits: number, misses: number, evictions: number, expired: number, size: number }}
   */
  getStats() {
    return {
      ...this._stats,
      size: this._store.size,
      hitRate: this._stats.hits + this._stats.misses > 0
        ? Math.round((this._stats.hits / (this._stats.hits + this._stats.misses)) * 100)
        : 0
    };
  }

  /**
   * Clear all entries (e.g., on session end)
   */
  clear() {
    this._store.clear();
    this._stats = { hits: 0, misses: 0, evictions: 0, expired: 0 };
  }
}
