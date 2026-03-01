/**
 * TTLMap — Map wrapper with automatic entry expiration and bounded size.
 *
 * SD: SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-A
 *
 * Extends the native Map interface with:
 * - Per-entry TTL (time-to-live) with lazy expiration on access
 * - Optional periodic sweep to remove expired entries in bulk
 * - Bounded size with FIFO eviction when maxEntries is exceeded
 *
 * @module lib/utils/ttl-map
 */

export class TTLMap {
  /**
   * @param {Object} [options]
   * @param {number} [options.defaultTTLMs=1800000] - Default TTL in ms (30 min)
   * @param {number} [options.maxEntries=Infinity] - Max entries before FIFO eviction
   * @param {number} [options.sweepIntervalMs=0] - Periodic sweep interval (0 = disabled)
   */
  constructor(options = {}) {
    this.defaultTTLMs = options.defaultTTLMs ?? 30 * 60 * 1000; // 30 min
    this.maxEntries = options.maxEntries ?? Infinity;
    this._store = new Map(); // key → { value, expiresAt }
    this._sweepTimer = null;

    if (options.sweepIntervalMs && options.sweepIntervalMs > 0) {
      this._sweepTimer = setInterval(() => this.sweep(), options.sweepIntervalMs);
      if (this._sweepTimer.unref) this._sweepTimer.unref();
    }
  }

  /**
   * Get a value. Returns undefined if expired or missing.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a value with optional per-entry TTL.
   * @param {*} key
   * @param {*} value
   * @param {number} [ttlMs] - Override default TTL for this entry
   */
  set(key, value, ttlMs) {
    const ttl = ttlMs ?? this.defaultTTLMs;
    this._store.set(key, { value, expiresAt: Date.now() + ttl });
    this._evictIfNeeded();
    return this;
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key) {
    const entry = this._store.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Delete a key.
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Number of entries (including potentially expired ones not yet swept).
   */
  get size() {
    return this._store.size;
  }

  /**
   * Remove all expired entries in bulk.
   * @returns {number} Number of entries removed
   */
  sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this._store) {
      if (now > entry.expiresAt) {
        this._store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Iterate over non-expired entries.
   */
  *entries() {
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now <= entry.expiresAt) {
        yield [key, entry.value];
      }
    }
  }

  /**
   * Iterate over non-expired keys.
   */
  *keys() {
    for (const [key] of this.entries()) {
      yield key;
    }
  }

  /**
   * Iterate over non-expired values.
   */
  *values() {
    for (const [, value] of this.entries()) {
      yield value;
    }
  }

  /**
   * forEach over non-expired entries.
   */
  forEach(callback, thisArg) {
    for (const [key, value] of this.entries()) {
      callback.call(thisArg, value, key, this);
    }
  }

  /**
   * Stop the periodic sweep timer.
   */
  destroy() {
    if (this._sweepTimer) {
      clearInterval(this._sweepTimer);
      this._sweepTimer = null;
    }
    this._store.clear();
  }

  /** @private Evict oldest entries if over maxEntries */
  _evictIfNeeded() {
    while (this._store.size > this.maxEntries) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
    }
  }
}

export default TTLMap;
