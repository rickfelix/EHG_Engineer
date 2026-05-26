/**
 * StageRegistry - Registry-based stage template discovery
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D: A03 Stage Framework Extensibility
 *
 * Follows the ValidatorRegistry pattern (register/get/has/getStats).
 * Provides unified lookup for stage templates with:
 * - File-based registration for built-in stages (1-26)
 * - Database-driven configuration via lifecycle_stage_config
 * - 5-minute TTL cache for DB-loaded configs
 * - Graceful fallback to file-based templates when DB unavailable
 *
 * @module lib/eva/stage-registry
 * @version 1.0.0
 */

import { createSupabaseServiceClient } from '../supabase-client.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGE_TEMPLATES_DIR = join(__dirname, 'stage-templates');
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class StageRegistry {
  constructor() {
    /** @type {Map<number, {template: Object, source: 'file'|'db', version: string, registeredAt: number}>} */
    this.stages = new Map();

    /** @type {Map<number, {template: Object, cachedAt: number}>} */
    this.dbCache = new Map();

    this.stats = {
      cacheHits: 0,
      cacheMisses: 0,
      dbErrors: 0,
    };

    this._initialized = false;
  }

  /**
   * Register a stage template.
   * @param {number} stageNumber - Stage number (1-26)
   * @param {Object} template - Stage template object
   * @param {{ source?: 'file'|'db', version?: string }} [options]
   */
  register(stageNumber, template, options = {}) {
    const { source = 'file', version = '1.0.0' } = options;
    this.stages.set(stageNumber, {
      template,
      source,
      version,
      registeredAt: Date.now(),
    });
  }

  /**
   * Get a stage template by number.
   * Checks: DB cache (with TTL) → file-based registry → null.
   * @param {number} stageNumber
   * @returns {Object|null} Stage template or null
   */
  get(stageNumber) {
    // Check DB cache first (overrides file-based)
    const cached = this.dbCache.get(stageNumber);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      this.stats.cacheHits++;
      return cached.template;
    }

    // Fall back to file-based registry
    const entry = this.stages.get(stageNumber);
    if (entry) {
      return entry.template;
    }

    return null;
  }

  /**
   * Check if a stage is registered.
   * @param {number} stageNumber
   * @returns {boolean}
   */
  has(stageNumber) {
    // Check DB cache (within TTL)
    const cached = this.dbCache.get(stageNumber);
    if (cached && (Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
      return true;
    }
    return this.stages.has(stageNumber);
  }

  /**
   * Get registry statistics.
   * @returns {{ total: number, fromFile: number, fromDB: number, cacheHits: number, cacheMisses: number }}
   */
  getStats() {
    let fromFile = 0;
    let fromDB = 0;
    for (const entry of this.stages.values()) {
      if (entry.source === 'file') fromFile++;
      else if (entry.source === 'db') fromDB++;
    }
    // Count valid DB cache entries
    for (const [, cached] of this.dbCache) {
      if ((Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        fromDB++;
      }
    }
    return {
      total: this.stages.size + this.dbCache.size,
      fromFile,
      fromDB,
      cacheHits: this.stats.cacheHits,
      cacheMisses: this.stats.cacheMisses,
    };
  }

  /**
   * Register all built-in stage templates (1-26) from file system.
   * @returns {Promise<number>} Number of stages registered
   */
  async registerBuiltinStages() {
    let count = 0;
    for (let i = 1; i <= 26; i++) {
      const paddedNum = String(i).padStart(2, '0');
      const templatePath = join(STAGE_TEMPLATES_DIR, `stage-${paddedNum}.js`);
      try {
        const module = await import(`file://${templatePath.replaceAll('\\', '/')}`);
        const template = module.TEMPLATE || module.default;
        if (template) {
          const version = template.version || '1.0.0';
          this.register(i, template, { source: 'file', version });
          count++;
        }
      } catch (err) {
        // Stage file doesn't exist — skip silently
        if (err.code !== 'ERR_MODULE_NOT_FOUND') {
          console.warn(`StageRegistry: Failed to load stage ${i}: ${err.message}`);
        }
      }
    }
    this._initialized = true;
    return count;
  }

  /**
   * Load stage configurations from lifecycle_stage_config DB table.
   * DB entries are cached with 5-minute TTL.
   * @param {Object} [supabaseClient] - Optional Supabase client override
   * @returns {Promise<number>} Number of stages loaded from DB
   */
  async loadFromDB(supabaseClient) {
    try {
      const supabase = supabaseClient || createSupabaseServiceClient();

      // SD-LEO-INFRA-RECONCILE-VENTURE-LIFECYCLE-001 / FR-2: stage_name is sourced
      // from `stage_config` (name-authoritative per lib/eva/stage-governance.js).
      // lifecycle_stage_config remains the source for phase_name / metadata.
      // See sibling reader: lib/eva/stage-registry/index.js for the same pattern.
      const [lifecycleRes, nameRes] = await Promise.all([
        supabase
          .from('lifecycle_stage_config')
          .select('stage_number, stage_name, phase_name, metadata, description')
          .order('stage_number'),
        supabase
          .from('stage_config')
          .select('stage_number, stage_name')
          .order('stage_number'),
      ]);
      const { data, error } = lifecycleRes;
      const { data: nameRows, error: nameError } = nameRes;

      if (error) {
        this.stats.dbErrors++;
        console.warn(`StageRegistry: DB load failed (lifecycle_stage_config): ${error.message}`);
        return 0;
      }
      if (nameError) {
        // Non-fatal: fall back to lifecycle name if stage_config is unreachable.
        console.warn(`StageRegistry: stage_config name lookup failed, falling back to lifecycle name: ${nameError.message}`);
      }

      const authoritativeName = new Map();
      for (const r of nameRows || []) {
        authoritativeName.set(r.stage_number, r.stage_name);
      }

      let loaded = 0;
      const now = Date.now();
      for (const row of data || []) {
        // Build a template-compatible config from DB row.
        // title is the user-facing stage name — sourced from stage_config (FR-2).
        const canonicalName = authoritativeName.get(row.stage_number) || row.stage_name;
        const dbConfig = {
          id: `stage-${String(row.stage_number).padStart(2, '0')}`,
          title: canonicalName,
          phase: row.phase_name,
          description: row.description || '',
          version: row.metadata?.version || '1.0.0',
          _source: 'db',
          _dbMetadata: row.metadata,
        };

        // Merge DB config with file-based template if available.
        // FR-2: dbConfig.title is already the name-authoritative value from
        // stage_config; preserve it over the file template's title.
        const fileEntry = this.stages.get(row.stage_number);
        if (fileEntry) {
          const merged = {
            ...fileEntry.template,
            title: dbConfig.title || fileEntry.template.title,
            phase: dbConfig.phase || fileEntry.template.phase,
            description: dbConfig.description || fileEntry.template.description,
            version: dbConfig.version,
            _dbMetadata: dbConfig._dbMetadata,
          };
          this.dbCache.set(row.stage_number, { template: merged, cachedAt: now });
        } else {
          // Pure DB-only stage (no file template)
          this.dbCache.set(row.stage_number, { template: dbConfig, cachedAt: now });
        }
        loaded++;
      }
      this.stats.cacheMisses++;
      return loaded;
    } catch (err) {
      this.stats.dbErrors++;
      console.warn(`StageRegistry: DB load error: ${err.message}`);
      return 0;
    }
  }

  /**
   * Invalidate DB cache, forcing next get() to use file-based templates
   * until loadFromDB() is called again.
   */
  refreshCache() {
    this.dbCache.clear();
    this.stats.cacheHits = 0;
    this.stats.cacheMisses = 0;
  }

  /**
   * Get all registered stage numbers.
   * @returns {number[]}
   */
  getRegisteredStages() {
    const stages = new Set([...this.stages.keys()]);
    for (const [num, cached] of this.dbCache) {
      if ((Date.now() - cached.cachedAt) < CACHE_TTL_MS) {
        stages.add(num);
      }
    }
    return Array.from(stages).sort((a, b) => a - b);
  }
}

// Singleton instance
export const stageRegistry = new StageRegistry();
export default stageRegistry;
