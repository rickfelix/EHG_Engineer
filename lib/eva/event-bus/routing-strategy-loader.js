/**
 * Routing Strategy Loader — Configurable Event Routing
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-A
 *
 * Loads custom event-to-mode routing overrides from eva_config.
 * Supports hot-reload: strategy is refreshed on next event if
 * the cached config is stale.
 *
 * Architecture dimension: A04 (event_rounds_priority_queue_work_routing)
 */

import { ROUTING_MODES, classifyRoutingMode as defaultClassify } from './event-router.js';

/**
 * @typedef {Object} RoutingStrategy
 * @property {Object<string, string>} overrides - Map of eventType → ROUTING_MODE
 * @property {Object<string, string>} prefixRules - Map of prefix → ROUTING_MODE
 * @property {string} loadedAt - ISO timestamp
 * @property {string} source - 'database' | 'default'
 */

/** @type {RoutingStrategy|null} */
let _cachedStrategy = null;

/** @type {number} */
let _lastLoadTime = 0;

/** Cache TTL in milliseconds (30 seconds for hot-reload) */
const CACHE_TTL_MS = 30_000;

/**
 * Load routing strategy from eva_config table.
 *
 * Config key: 'event_bus.routing_overrides'
 * Expected value format (JSON string):
 * {
 *   "overrides": {
 *     "stage.completed": "PRIORITY_QUEUE",
 *     "some.custom.event": "ROUND"
 *   },
 *   "prefixRules": {
 *     "audit.": "PRIORITY_QUEUE",
 *     "analytics.": "ROUND"
 *   }
 * }
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<RoutingStrategy>}
 */
export async function loadRoutingStrategy(supabase) {
  const now = Date.now();

  // Return cached if still fresh
  if (_cachedStrategy && (now - _lastLoadTime) < CACHE_TTL_MS) {
    return _cachedStrategy;
  }

  try {
    const { data, error } = await supabase
      .from('eva_config')
      .select('value')
      .eq('key', 'event_bus.routing_overrides')
      .single();

    if (error || !data?.value) {
      _cachedStrategy = _buildDefaultStrategy();
      _lastLoadTime = now;
      return _cachedStrategy;
    }

    const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    const overrides = {};
    const prefixRules = {};

    // Validate and normalize overrides
    if (parsed.overrides && typeof parsed.overrides === 'object') {
      for (const [eventType, mode] of Object.entries(parsed.overrides)) {
        if (ROUTING_MODES[mode]) {
          overrides[eventType] = mode;
        }
      }
    }

    // Validate and normalize prefix rules
    if (parsed.prefixRules && typeof parsed.prefixRules === 'object') {
      for (const [prefix, mode] of Object.entries(parsed.prefixRules)) {
        if (ROUTING_MODES[mode]) {
          prefixRules[prefix] = mode;
        }
      }
    }

    _cachedStrategy = {
      overrides,
      prefixRules,
      loadedAt: new Date().toISOString(),
      source: 'database',
    };
    _lastLoadTime = now;
    return _cachedStrategy;
  } catch (err) {
    console.warn(`[RoutingStrategyLoader] Failed to load config: ${err.message}, using defaults`);
    _cachedStrategy = _buildDefaultStrategy();
    _lastLoadTime = now;
    return _cachedStrategy;
  }
}

/**
 * Build the default (empty) routing strategy.
 * @returns {RoutingStrategy}
 */
function _buildDefaultStrategy() {
  return {
    overrides: {},
    prefixRules: {},
    loadedAt: new Date().toISOString(),
    source: 'default',
  };
}

/**
 * Create a routing classifier that applies strategy overrides before
 * falling back to the default classifyRoutingMode().
 *
 * @param {RoutingStrategy} strategy
 * @returns {(eventType: string, payload: object) => string}
 */
export function createStrategyClassifier(strategy) {
  return function classifyWithStrategy(eventType, payload) {
    // 1. Exact match override
    if (strategy.overrides[eventType]) {
      return strategy.overrides[eventType];
    }

    // 2. Prefix rule match (longest prefix wins)
    const matchingPrefixes = Object.keys(strategy.prefixRules)
      .filter(prefix => eventType.startsWith(prefix))
      .sort((a, b) => b.length - a.length); // Longest first

    if (matchingPrefixes.length > 0) {
      return strategy.prefixRules[matchingPrefixes[0]];
    }

    // 3. Fall back to default hardcoded rules
    return defaultClassify(eventType, payload);
  };
}

/**
 * Get a strategy-aware routing classifier.
 * Loads strategy from DB (with cache), returns classifier function.
 *
 * @param {object} supabase - Supabase client
 * @returns {Promise<(eventType: string, payload: object) => string>}
 */
export async function getRoutingClassifier(supabase) {
  const strategy = await loadRoutingStrategy(supabase);
  return createStrategyClassifier(strategy);
}

/**
 * Invalidate the cached strategy, forcing a reload on next use.
 */
export function invalidateCache() {
  _cachedStrategy = null;
  _lastLoadTime = 0;
}

/**
 * Get the current cached strategy (for diagnostics).
 * @returns {RoutingStrategy|null}
 */
export function getCachedStrategy() {
  return _cachedStrategy;
}
