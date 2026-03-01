/**
 * StageRegistry Core Class
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D
 *
 * Registry-based stage discovery mirroring ValidatorRegistry pattern.
 * Maps stage numbers to configuration objects loaded from DB or file templates.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class StageRegistry {
  constructor() {
    /** @type {Map<number, object>} stageNumber → config */
    this.stages = new Map();

    /** @type {Map<number, object>} stageNumber → file-based fallback */
    this.fallbackStages = new Map();

    /** @type {number|null} */
    this._cacheLoadedAt = null;

    /** @type {string} */
    this._source = 'empty';
  }

  /**
   * Register a stage configuration
   * @param {number} stageNumber
   * @param {object} config - Stage configuration object
   */
  register(stageNumber, config) {
    if (typeof stageNumber !== 'number' || stageNumber < 0) {
      throw new Error(`Stage number must be a non-negative number, got: ${stageNumber}`);
    }
    this.stages.set(stageNumber, { ...config, _registeredAt: Date.now() });
  }

  /**
   * Get stage configuration by number
   * @param {number} stageNumber
   * @returns {object|null}
   */
  get(stageNumber) {
    const stage = this.stages.get(stageNumber);
    if (stage) return stage;

    // Check fallback
    const fallback = this.fallbackStages.get(stageNumber);
    if (fallback) return fallback;

    return null;
  }

  /**
   * Check if a stage exists in the registry
   * @param {number} stageNumber
   * @returns {boolean}
   */
  has(stageNumber) {
    return this.stages.has(stageNumber) || this.fallbackStages.has(stageNumber);
  }

  /**
   * Get all registered stage numbers
   * @returns {number[]}
   */
  getRegisteredStages() {
    return Array.from(this.stages.keys()).sort((a, b) => a - b);
  }

  /**
   * Get stages for a specific phase
   * @param {number} phaseNumber
   * @returns {object[]} Array of stage configs in that phase
   */
  getStagesForPhase(phaseNumber) {
    const result = [];
    for (const [num, config] of this.stages) {
      if (config.phase_number === phaseNumber) {
        result.push({ stageNumber: num, ...config });
      }
    }
    return result.sort((a, b) => a.stageNumber - b.stageNumber);
  }

  /**
   * Register a fallback stage from file-based templates
   * @param {number} stageNumber
   * @param {object} template
   */
  registerFallback(stageNumber, template) {
    this.fallbackStages.set(stageNumber, { ...template, _source: 'file-fallback' });
  }

  /**
   * Check if cache is still valid
   * @returns {boolean}
   */
  isCacheValid() {
    if (!this._cacheLoadedAt) return false;
    return (Date.now() - this._cacheLoadedAt) < CACHE_TTL_MS;
  }

  /**
   * Mark cache as loaded
   */
  markCacheLoaded() {
    this._cacheLoadedAt = Date.now();
    this._source = 'database';
  }

  /**
   * Invalidate cache
   */
  invalidateCache() {
    this._cacheLoadedAt = null;
  }

  /**
   * Get registration statistics
   * @returns {object}
   */
  getStats() {
    const stats = {
      totalRegistered: this.stages.size,
      totalFallbacks: this.fallbackStages.size,
      source: this._source,
      cacheValid: this.isCacheValid(),
      byPhase: {},
    };

    for (const [, config] of this.stages) {
      const phase = config.phase_number || 'unknown';
      stats.byPhase[phase] = (stats.byPhase[phase] || 0) + 1;
    }

    return stats;
  }

  /**
   * Clear all registered stages
   */
  clear() {
    this.stages.clear();
    this._cacheLoadedAt = null;
    this._source = 'empty';
  }
}
