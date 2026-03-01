/**
 * Orchestration State Store — Persistent State for Long-Running Orchestrations
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-01-B
 *
 * Provides Supabase-backed persistence for orchestrator execution state.
 * Uses eva_config key-value pattern with in-memory cache and async write-through.
 *
 * @module lib/eva/orchestration-state-store
 */

const STATE_KEY_PREFIX = 'orchestration.state.';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache for fast reads
let _cache = new Map();
let _version = 0;

/**
 * Save orchestration state for a venture.
 * Persists to Supabase eva_config table with in-memory cache.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} state - State to persist
 * @param {string} state.orchestratorState - Current state machine state
 * @param {string} [state.currentStep] - Current step in orchestration
 * @param {Object} [state.context] - Venture context snapshot
 * @param {Object} [state.intermediateResults] - Partial results
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ saved: boolean, version: number, error?: string }>}
 */
export async function saveState(supabase, ventureId, state, options = {}) {
  const { logger = console } = options;

  if (!supabase || !ventureId) {
    return { saved: false, version: _version, error: 'Missing supabase client or ventureId' };
  }

  const key = `${STATE_KEY_PREFIX}${ventureId}`;
  _version++;

  const entry = {
    ...state,
    ventureId,
    version: _version,
    savedAt: new Date().toISOString(),
  };

  // Update cache immediately
  _cache.set(ventureId, entry);

  // Async write-through to Supabase (non-blocking)
  try {
    const { error } = await supabase
      .from('eva_config')
      .upsert({
        key,
        value: JSON.stringify(entry),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      logger.warn(`[StateStore] Write-through failed for ${ventureId}: ${error.message}`);
      return { saved: true, version: _version, warning: 'Cache updated, persistence failed' };
    }

    return { saved: true, version: _version };
  } catch (err) {
    logger.warn(`[StateStore] Persistence error for ${ventureId}: ${err.message}`);
    return { saved: true, version: _version, warning: 'Cache updated, persistence error' };
  }
}

/**
 * Load orchestration state for a venture.
 * Checks in-memory cache first, falls back to Supabase.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ state: Object|null, source: 'cache'|'database'|'none', error?: string }>}
 */
export async function loadState(supabase, ventureId, options = {}) {
  const { logger = console } = options;

  if (!ventureId) {
    return { state: null, source: 'none', error: 'Missing ventureId' };
  }

  // Check cache first
  if (_cache.has(ventureId)) {
    return { state: _cache.get(ventureId), source: 'cache' };
  }

  // Fall back to Supabase
  if (!supabase) {
    return { state: null, source: 'none', error: 'No supabase client and no cached state' };
  }

  try {
    const key = `${STATE_KEY_PREFIX}${ventureId}`;
    const { data, error } = await supabase
      .from('eva_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) {
      return { state: null, source: 'none' };
    }

    const parsed = JSON.parse(data.value);

    // Check TTL
    const savedAt = new Date(parsed.savedAt).getTime();
    if (Date.now() - savedAt > DEFAULT_TTL_MS) {
      logger.info(`[StateStore] Stale state for ${ventureId} (expired TTL)`);
      return { state: null, source: 'none', warning: 'State expired' };
    }

    // Populate cache
    _cache.set(ventureId, parsed);

    return { state: parsed, source: 'database' };
  } catch (err) {
    logger.warn(`[StateStore] Load error for ${ventureId}: ${err.message}`);
    return { state: null, source: 'none', error: err.message };
  }
}

/**
 * Clear orchestration state for a venture.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<{ cleared: boolean, error?: string }>}
 */
export async function clearState(supabase, ventureId) {
  _cache.delete(ventureId);

  if (!supabase || !ventureId) {
    return { cleared: true };
  }

  try {
    const key = `${STATE_KEY_PREFIX}${ventureId}`;
    await supabase.from('eva_config').delete().eq('key', key);
    return { cleared: true };
  } catch (err) {
    return { cleared: true, warning: 'Cache cleared, database cleanup failed' };
  }
}

/**
 * Clear all cached states (for testing or hot-reload).
 */
export function clearCache() {
  _cache.clear();
  _version = 0;
}

/**
 * Get all cached venture IDs.
 * @returns {string[]}
 */
export function getCachedVentureIds() {
  return Array.from(_cache.keys());
}

/**
 * Get current cache version.
 * @returns {number}
 */
export function getVersion() {
  return _version;
}
