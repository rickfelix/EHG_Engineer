/**
 * Config Store — Database-Backed Protocol Configuration
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-02-B
 *
 * Replaces hardcoded JS maps (stage dependencies, quality thresholds)
 * with database-backed configuration from eva_config table.
 * Falls back to hardcoded defaults when database is unavailable.
 *
 * @module lib/eva/config-store
 */

const CONFIG_KEY_PREFIX = 'protocol_config.';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory config cache
let _configCache = new Map();
let _cacheTimestamps = new Map();

// ── Hardcoded Fallback Defaults ──────────────────

const DEFAULT_STAGE_DEPENDENCIES = Object.freeze({
  3: [1, 2],    // Stage 3 kill gate needs Stages 1-2
  5: [3, 4],    // Stage 5 needs 3-4
  8: [5, 6, 7], // Stage 8 needs 5-7
  10: [8, 9],   // Stage 10 needs 8-9
  18: [10],     // Stage 18 needs 10
});

const DEFAULT_QUALITY_THRESHOLDS = Object.freeze({
  feature: { gate_pass_rate: 85, min_test_coverage: 80 },
  infrastructure: { gate_pass_rate: 80, min_test_coverage: 70 },
  enhancement: { gate_pass_rate: 75, min_test_coverage: 60 },
  fix: { gate_pass_rate: 70, min_test_coverage: 50 },
  documentation: { gate_pass_rate: 60, min_test_coverage: 0 },
});

/**
 * Load a configuration value from database with cache and fallback.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} configKey - Configuration key (without prefix)
 * @param {*} fallbackValue - Default value if not found in DB
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.cacheTtlMs] - Cache TTL in ms (default 5min)
 * @returns {Promise<{ value: *, source: 'cache'|'database'|'fallback', error?: string }>}
 */
export async function loadConfig(supabase, configKey, fallbackValue = null, options = {}) {
  const { logger = console, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = options;

  if (!configKey) {
    return { value: fallbackValue, source: 'fallback', error: 'Missing configKey' };
  }

  // Check cache (with TTL)
  if (_configCache.has(configKey)) {
    const cachedAt = _cacheTimestamps.get(configKey) || 0;
    if (Date.now() - cachedAt < cacheTtlMs) {
      return { value: _configCache.get(configKey), source: 'cache' };
    }
    // Cache expired — remove it
    _configCache.delete(configKey);
    _cacheTimestamps.delete(configKey);
  }

  if (!supabase) {
    if (fallbackValue !== null) {
      return { value: fallbackValue, source: 'fallback', warning: 'No supabase client' };
    }
    return { value: null, source: 'fallback', error: 'No supabase client and no fallback' };
  }

  try {
    const key = `${CONFIG_KEY_PREFIX}${configKey}`;
    const { data, error } = await supabase
      .from('eva_config')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) {
      if (fallbackValue !== null) {
        logger.info(`[ConfigStore] Using fallback for ${configKey}`);
        return { value: fallbackValue, source: 'fallback' };
      }
      return { value: null, source: 'fallback', error: 'Config not found' };
    }

    const parsed = JSON.parse(data.value);

    // Update cache
    _configCache.set(configKey, parsed);
    _cacheTimestamps.set(configKey, Date.now());

    return { value: parsed, source: 'database' };
  } catch (err) {
    logger.warn(`[ConfigStore] Load error for ${configKey}: ${err.message}`);
    if (fallbackValue !== null) {
      return { value: fallbackValue, source: 'fallback', warning: err.message };
    }
    return { value: null, source: 'fallback', error: err.message };
  }
}

/**
 * Save a configuration value to the database.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} configKey - Configuration key (without prefix)
 * @param {*} value - Value to store
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ saved: boolean, error?: string }>}
 */
export async function saveConfig(supabase, configKey, value, options = {}) {
  const { logger = console } = options;

  if (!supabase || !configKey) {
    return { saved: false, error: 'Missing supabase or configKey' };
  }

  try {
    const key = `${CONFIG_KEY_PREFIX}${configKey}`;
    const { error } = await supabase
      .from('eva_config')
      .upsert({
        key,
        value: JSON.stringify(value),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });

    if (error) {
      logger.warn(`[ConfigStore] Save failed for ${configKey}: ${error.message}`);
      return { saved: false, error: error.message };
    }

    // Update cache
    _configCache.set(configKey, value);
    _cacheTimestamps.set(configKey, Date.now());

    return { saved: true };
  } catch (err) {
    logger.warn(`[ConfigStore] Save error: ${err.message}`);
    return { saved: false, error: err.message };
  }
}

/**
 * Get stage dependencies from database or fallback defaults.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @returns {Promise<{ dependencies: Object, source: string }>}
 */
export async function getStageDependencies(supabase, options = {}) {
  const result = await loadConfig(
    supabase,
    'stage_dependencies',
    DEFAULT_STAGE_DEPENDENCIES,
    options,
  );
  return { dependencies: result.value, source: result.source };
}

/**
 * Get quality thresholds for a specific SD type from database or fallback.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} [sdType] - SD type to filter (returns all if not specified)
 * @param {Object} [options]
 * @returns {Promise<{ thresholds: Object, source: string }>}
 */
export async function getQualityThresholds(supabase, sdType, options = {}) {
  const result = await loadConfig(
    supabase,
    'quality_thresholds',
    DEFAULT_QUALITY_THRESHOLDS,
    options,
  );

  const allThresholds = result.value;

  if (sdType && allThresholds[sdType]) {
    return { thresholds: allThresholds[sdType], source: result.source };
  }

  return { thresholds: allThresholds, source: result.source };
}

/**
 * Clear config cache (for testing or hot-reload).
 */
export function clearConfigCache() {
  _configCache.clear();
  _cacheTimestamps.clear();
}

/**
 * Get the hardcoded fallback defaults (for reference/migration).
 * @returns {{ stageDependencies: Object, qualityThresholds: Object }}
 */
export function getDefaults() {
  return {
    stageDependencies: DEFAULT_STAGE_DEPENDENCIES,
    qualityThresholds: DEFAULT_QUALITY_THRESHOLDS,
  };
}
