/**
 * Base Retrieval Adapter
 * Shared interface for all knowledge source adapters
 *
 * All adapters implement: fetch({domain, category, limit, timeoutMs, queryVersion}) -> AdapterResult
 * Fail-open: timeouts/errors return empty items with sourceStatus='failed'
 *
 * SD-LEO-ORCH-AGENT-EXPERIENCE-FACTORY-001-A (TR-1)
 */

/**
 * @typedef {Object} AdapterResult
 * @property {Array<Object>} items - Retrieved knowledge items
 * @property {'ok'|'failed'|'timeout'|'empty'} sourceStatus - Retrieval outcome
 * @property {number} elapsedMs - Time taken for retrieval
 * @property {string} [error] - Error message if sourceStatus is 'failed' or 'timeout'
 */

/**
 * @typedef {Object} FetchParams
 * @property {string} domain - Domain filter (e.g., 'database', 'testing')
 * @property {string} [category] - Category filter
 * @property {number} [limit=5] - Max items to return
 * @property {number} [timeoutMs=120] - Per-source timeout in ms
 * @property {string} [queryVersion='v1'] - Query version for cache key stability
 */

export class BaseAdapter {
  constructor(sourceName, supabase) {
    this.sourceName = sourceName;
    this.supabase = supabase;
  }

  /**
   * Fetch knowledge items with timeout and fail-open
   * @param {FetchParams} params
   * @returns {Promise<AdapterResult>}
   */
  async fetch(params) {
    const { timeoutMs = 120 } = params;
    const start = Date.now();

    try {
      const result = await Promise.race([
        this._doFetch(params),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        )
      ]);

      return {
        items: result.items || [],
        sourceStatus: result.items.length > 0 ? 'ok' : 'empty',
        elapsedMs: Date.now() - start
      };
    } catch (err) {
      const isTimeout = err.message === 'TIMEOUT';
      return {
        items: [],
        sourceStatus: isTimeout ? 'timeout' : 'failed',
        elapsedMs: Date.now() - start,
        error: err.message
      };
    }
  }

  /**
   * Subclasses implement this with actual DB query logic
   * @param {FetchParams} params
   * @returns {Promise<{items: Array}>}
   */
  async _doFetch(_params) {
    throw new Error(`${this.sourceName}: _doFetch() not implemented`);
  }
}
