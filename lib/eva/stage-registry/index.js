/**
 * StageRegistry Factory & Singleton
 * SD-MAN-ORCH-VISION-ARCHITECTURE-HARDENING-001-D
 *
 * Creates and configures a StageRegistry instance.
 * Supports loading from database (lifecycle_stage_config) with
 * graceful fallback to file-based stage templates.
 */

import { StageRegistry } from './core.js';

/**
 * Load stage configurations from lifecycle_stage_config table
 * @param {StageRegistry} registry
 * @param {object} supabase - Supabase client
 * @returns {Promise<{loaded: number, error: string|null}>}
 */
export async function loadFromDatabase(registry, supabase) {
  if (!supabase) {
    return { loaded: 0, error: 'No supabase client provided' };
  }

  if (registry.isCacheValid()) {
    return { loaded: registry.stages.size, error: null, cached: true };
  }

  try {
    const { data, error } = await supabase
      .from('lifecycle_stage_config')
      .select('stage_number, stage_name, description, phase_number, phase_name, work_type, sd_required, advisory_enabled, depends_on, required_artifacts, metadata')
      .order('stage_number', { ascending: true });

    if (error) {
      console.warn(`[StageRegistry] DB load failed: ${error.message}`);
      return { loaded: 0, error: error.message };
    }

    if (!data || data.length === 0) {
      return { loaded: 0, error: 'No stage configs found in database' };
    }

    // Clear existing DB-loaded stages (keep fallbacks)
    registry.clear();

    for (const row of data) {
      registry.register(row.stage_number, {
        stage_name: row.stage_name,
        description: row.description,
        phase_number: row.phase_number,
        phase_name: row.phase_name,
        work_type: row.work_type,
        sd_required: row.sd_required,
        advisory_enabled: row.advisory_enabled,
        depends_on: row.depends_on || [],
        required_artifacts: row.required_artifacts || [],
        metadata: row.metadata || {},
      });
    }

    registry.markCacheLoaded();
    return { loaded: data.length, error: null };
  } catch (err) {
    console.warn(`[StageRegistry] DB load exception: ${err.message}`);
    return { loaded: 0, error: err.message };
  }
}

/**
 * Load fallback stages from file-based templates
 * @param {StageRegistry} registry
 * @returns {Promise<number>} Number of fallbacks loaded
 */
export async function loadFallbackTemplates(registry) {
  try {
    const { getAllTemplates } = await import('../stage-templates/index.js');
    const templates = getAllTemplates();

    let count = 0;
    for (const template of templates) {
      if (template && template.id) {
        const num = parseInt(template.id.replace('stage-', ''), 10);
        if (!isNaN(num)) {
          registry.registerFallback(num, {
            stage_name: template.title || template.slug || `Stage ${num}`,
            description: template.description || '',
            version: template.version || '1.0.0',
            _template: template,
          });
          count++;
        }
      }
    }
    return count;
  } catch (err) {
    console.warn(`[StageRegistry] Fallback load failed: ${err.message}`);
    return 0;
  }
}

/**
 * Create a fully configured StageRegistry
 * @param {object} [options]
 * @param {object} [options.supabase] - Supabase client for DB loading
 * @param {boolean} [options.loadFallbacks=true] - Whether to load file fallbacks
 * @returns {Promise<StageRegistry>}
 */
export async function createStageRegistry(options = {}) {
  const registry = new StageRegistry();

  // Load file-based fallbacks first (fast, always available)
  if (options.loadFallbacks !== false) {
    await loadFallbackTemplates(registry);
  }

  // Try loading from database (overrides fallbacks)
  if (options.supabase) {
    await loadFromDatabase(registry, options.supabase);
  }

  return registry;
}

// Singleton instance (lazy initialization)
let _instance = null;

/**
 * Get the singleton StageRegistry instance
 * @returns {StageRegistry}
 */
export function getStageRegistry() {
  if (!_instance) {
    _instance = new StageRegistry();
  }
  return _instance;
}

/**
 * Initialize the singleton with database and fallbacks
 * @param {object} supabase
 * @returns {Promise<StageRegistry>}
 */
export async function initStageRegistry(supabase) {
  _instance = await createStageRegistry({ supabase, loadFallbacks: true });
  return _instance;
}

export { StageRegistry } from './core.js';
