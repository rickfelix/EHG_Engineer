/**
 * Pattern Cache Manager
 *
 * Manages the lifecycle of the .workflow-patterns.json cache file
 * including loading, validation, refresh, and cleanup.
 *
 * Features:
 * - TTL-based cache expiration (default 24 hours)
 * - Cache validation and corruption detection
 * - Manual refresh capability
 * - Cache statistics and metrics
 *
 * Added: 2025-01-15 (SD-DESIGN-WORKFLOW-REVIEW-001)
 */

import * as fs from 'fs/promises';
import path from 'path';

const DEFAULT_CACHE_FILE = '.workflow-patterns.json';
const DEFAULT_TTL_HOURS = 24;

/**
 * Load patterns from cache
 *
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<Object|null>} Cached patterns or null if cache invalid/expired
 */
export async function loadCache(cacheFile = DEFAULT_CACHE_FILE) {
  try {
    const cacheData = await fs.readFile(cacheFile, 'utf8');
    const cache = JSON.parse(cacheData);

    // Validate cache structure (version is optional for backward compatibility)
    if (!cache.last_scan) {
      console.warn('Invalid cache structure - missing last_scan field');
      return null;
    }

    return cache;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Cache doesn't exist yet
      return null;
    }

    console.warn(`Failed to load cache: ${error.message}`);
    return null;
  }
}

/**
 * Check if cache is valid (not expired)
 *
 * @param {Object} cache - Cached patterns object
 * @param {number} maxAgeHours - Maximum cache age in hours (default: 24)
 * @returns {boolean} True if cache is valid and not expired
 */
export function isCacheValid(cache, maxAgeHours = DEFAULT_TTL_HOURS) {
  if (!cache || !cache.last_scan) {
    return false;
  }

  const cacheAge = Date.now() - new Date(cache.last_scan).getTime();
  const cacheAgeHours = cacheAge / (1000 * 60 * 60);

  return cacheAgeHours < maxAgeHours;
}

/**
 * Save patterns to cache
 *
 * @param {Object} patterns - Patterns object to cache
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<boolean>} True if save successful
 */
export async function saveCache(patterns, cacheFile = DEFAULT_CACHE_FILE) {
  try {
    // Add metadata
    const cacheData = {
      ...patterns,
      version: '1.0.0',
      last_scan: patterns.last_scan || new Date().toISOString(),
      cached_at: new Date().toISOString()
    };

    await fs.writeFile(cacheFile, JSON.stringify(cacheData, null, 2));
    return true;
  } catch (error) {
    console.error(`Failed to save cache: ${error.message}`);
    return false;
  }
}

/**
 * Delete cache file
 *
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<boolean>} True if delete successful
 */
export async function clearCache(cacheFile = DEFAULT_CACHE_FILE) {
  try {
    await fs.unlink(cacheFile);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Cache doesn't exist - not an error
      return true;
    }

    console.error(`Failed to clear cache: ${error.message}`);
    return false;
  }
}

/**
 * Get cache statistics and metadata
 *
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<Object|null>} Cache stats or null if cache doesn't exist
 */
export async function getCacheStats(cacheFile = DEFAULT_CACHE_FILE) {
  try {
    const cache = await loadCache(cacheFile);

    if (!cache) {
      return null;
    }

    const lastScan = new Date(cache.last_scan);
    const cacheAge = Date.now() - lastScan.getTime();
    const cacheAgeHours = cacheAge / (1000 * 60 * 60);

    const stats = {
      exists: true,
      file: path.resolve(cacheFile),
      version: cache.version || '1.0.0',
      last_scan: cache.last_scan,
      cached_at: cache.cached_at || cache.last_scan,
      age_hours: Math.round(cacheAgeHours * 10) / 10,
      is_valid: isCacheValid(cache, DEFAULT_TTL_HOURS),
      patterns_count: {
        error_recovery: cache.error_recovery?.length || 0,
        confirmation_modals: cache.confirmation_modals?.length || 0,
        form_validation: cache.form_validation?.length || 0,
        loading_patterns: cache.loading_patterns?.length || 0,
        navigation: cache.navigation?.length || 0
      },
      total_patterns: [
        ...(cache.error_recovery || []),
        ...(cache.confirmation_modals || []),
        ...(cache.form_validation || []),
        ...(cache.loading_patterns || []),
        ...(cache.navigation || [])
      ].length
    };

    // Calculate file size
    try {
      const fileStat = await fs.stat(cacheFile);
      stats.size_bytes = fileStat.size;
      stats.size_kb = Math.round(fileStat.size / 1024 * 10) / 10;
    } catch (_) {
      // Ignore stat errors
    }

    return stats;
  } catch (error) {
    console.error(`Failed to get cache stats: ${error.message}`);
    return null;
  }
}

/**
 * Validate cache integrity
 *
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<Object>} Validation result with status and issues
 */
export async function validateCache(cacheFile = DEFAULT_CACHE_FILE) {
  const validation = {
    valid: true,
    issues: []
  };

  try {
    const cache = await loadCache(cacheFile);

    if (!cache) {
      validation.valid = false;
      validation.issues.push('Cache file does not exist or is corrupted');
      return validation;
    }

    // Check required fields
    const requiredFields = ['last_scan'];
    for (const field of requiredFields) {
      if (!cache[field]) {
        validation.valid = false;
        validation.issues.push(`Missing required field: ${field}`);
      }
    }

    // Warn if version is missing (not critical)
    if (!cache.version) {
      validation.issues.push('Missing version field (non-critical)');
    }

    // Check pattern arrays
    const patternFields = [
      'error_recovery',
      'confirmation_modals',
      'form_validation',
      'loading_patterns',
      'navigation'
    ];

    for (const field of patternFields) {
      if (cache[field] !== undefined && !Array.isArray(cache[field])) {
        validation.valid = false;
        validation.issues.push(`Field ${field} should be an array`);
      }
    }

    // Check if expired
    if (!isCacheValid(cache, DEFAULT_TTL_HOURS)) {
      validation.valid = false;
      validation.issues.push(`Cache expired (age: ${Math.round((Date.now() - new Date(cache.last_scan).getTime()) / (1000 * 60 * 60))}h, max: ${DEFAULT_TTL_HOURS}h)`);
    }

    // Check for pattern quality
    for (const field of patternFields) {
      const patterns = cache[field] || [];
      for (const pattern of patterns) {
        if (!pattern.pattern || pattern.count === undefined) {
          validation.issues.push(`Invalid pattern in ${field}: missing pattern or count`);
        }
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.issues.push(`Validation error: ${error.message}`);
  }

  return validation;
}

/**
 * Refresh cache by clearing and returning scan requirement
 *
 * @param {string} cacheFile - Path to cache file (default: .workflow-patterns.json)
 * @returns {Promise<Object>} Result indicating cache cleared and scan needed
 */
export async function refreshCache(cacheFile = DEFAULT_CACHE_FILE) {
  const cleared = await clearCache(cacheFile);

  return {
    success: cleared,
    message: cleared
      ? 'Cache cleared. Re-scan codebase to rebuild cache.'
      : 'Failed to clear cache',
    action_required: 'scan_codebase'
  };
}
