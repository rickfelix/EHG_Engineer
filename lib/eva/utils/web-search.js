/**
 * Web Search Client - Tavily API Integration for EVA
 * Part of SD-MAN-ORCH-EVA-INTELLIGENCE-LAYER-001-A
 *
 * Provides web-grounded search results for EVA analysis steps.
 * Feature-flagged via SEARCH_ENABLED env var with graceful degradation.
 *
 * @module lib/eva/utils/web-search
 */

const DEFAULT_CACHE_TTL_MS = 3_600_000; // 1 hour
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_CACHE_SIZE = 1000;

/**
 * In-memory TTL cache for search results.
 * Keys are query hashes, values are { results, expiresAt }.
 */
const cache = new Map();

/**
 * Check if web search is enabled via environment variables.
 * @returns {boolean}
 */
export function isSearchEnabled() {
  return process.env.SEARCH_ENABLED === 'true' && !!process.env.TAVILY_API_KEY;
}

/**
 * Generate a cache key from query string.
 * @param {string} query
 * @returns {string}
 */
function cacheKey(query) {
  return query.trim().toLowerCase();
}

/**
 * Evict expired entries and enforce max cache size.
 */
function evictStale() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // If still over limit, remove oldest entries
  if (cache.size > MAX_CACHE_SIZE) {
    const excess = cache.size - MAX_CACHE_SIZE;
    const keys = [...cache.keys()];
    for (let i = 0; i < excess; i++) cache.delete(keys[i]);
  }
}

/**
 * Execute a single web search query via Tavily API.
 *
 * @param {string} query - Search query
 * @param {Object} [options]
 * @param {number} [options.maxResults=5] - Max results to return
 * @param {string} [options.searchDepth='basic'] - 'basic' or 'advanced'
 * @param {number} [options.timeoutMs] - Per-query timeout
 * @param {number} [options.cacheTtlMs] - Cache TTL override
 * @param {Object} [options.logger=console] - Logger instance
 * @returns {Promise<Array<{title: string, url: string, content: string, score: number}>>}
 */
export async function search(query, options = {}) {
  const {
    maxResults = DEFAULT_MAX_RESULTS,
    searchDepth = 'basic',
    timeoutMs = Number(process.env.SEARCH_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    cacheTtlMs = Number(process.env.SEARCH_CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS,
    logger = console,
  } = options;

  if (!isSearchEnabled()) {
    return [];
  }

  const key = cacheKey(query);

  // Check cache
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    logger.log('[WebSearch] Cache hit:', query.substring(0, 60));
    return cached.results;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.log(`[WebSearch] API error ${response.status} for: ${query.substring(0, 60)}`);
      return [];
    }

    const data = await response.json();
    const results = (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      score: r.score || 0,
    }));

    // Cache results
    evictStale();
    cache.set(key, { results, expiresAt: Date.now() + cacheTtlMs });

    logger.log(`[WebSearch] ${results.length} results for: ${query.substring(0, 60)}`);
    return results;
  } catch (err) {
    if (err.name === 'AbortError') {
      logger.log(`[WebSearch] Timeout (${timeoutMs}ms) for: ${query.substring(0, 60)}`);
    } else {
      logger.log(`[WebSearch] Error for "${query.substring(0, 60)}": ${err.message}`);
    }
    return [];
  }
}

/**
 * Execute multiple search queries in parallel.
 *
 * @param {string[]} queries - Array of search queries
 * @param {Object} [options] - Same options as search()
 * @returns {Promise<Array<{title: string, url: string, content: string, score: number}>>}
 */
export async function searchBatch(queries, options = {}) {
  if (!isSearchEnabled() || !queries || queries.length === 0) {
    return [];
  }

  const results = await Promise.all(
    queries.map(q => search(q, options))
  );

  // Flatten and deduplicate by URL
  const seen = new Set();
  const combined = [];
  for (const batch of results) {
    for (const item of batch) {
      if (item.url && !seen.has(item.url)) {
        seen.add(item.url);
        combined.push(item);
      }
    }
  }

  return combined;
}

/**
 * Format search results as context string for LLM prompt injection.
 *
 * @param {Array<{title: string, url: string, content: string}>} results
 * @param {string} [label='Web Research']
 * @returns {string}
 */
export function formatResultsForPrompt(results, label = 'Web Research') {
  if (!results || results.length === 0) return '';

  const lines = results.map((r, i) =>
    `[${i + 1}] ${r.title}\n    Source: ${r.url}\n    ${r.content.substring(0, 300)}`
  );

  return `\n${label}:\n${lines.join('\n\n')}\n`;
}

/**
 * Clear the search cache. Useful for testing.
 */
export function clearCache() {
  cache.clear();
}

/**
 * Get cache stats. Useful for monitoring.
 * @returns {{size: number, maxSize: number}}
 */
export function getCacheStats() {
  evictStale();
  return { size: cache.size, maxSize: MAX_CACHE_SIZE };
}
