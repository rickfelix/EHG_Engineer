/**
 * Path 2: Blueprint Browse
 *
 * Browse categorized venture blueprint templates,
 * select a template, and customize parameters.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-D (stub for Child B framework)
 */

import { createPathOutput } from '../interfaces.js';

/**
 * Execute the blueprint browse path.
 *
 * @param {Object} params
 * @param {string} [params.blueprintId] - Pre-selected blueprint ID (skips browse)
 * @param {Object} [params.customizations] - Template parameter overrides
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} PathOutput
 */
export async function executeBlueprintBrowse({ blueprintId, customizations = {} }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  // Load available blueprints
  const { data: blueprints, error } = await supabase
    .from('venture_blueprints')
    .select('id, name, category, description, template_data, is_active')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (error) {
    throw new Error(`Failed to load blueprints: ${error.message}`);
  }

  if (!blueprints || blueprints.length === 0) {
    logger.log('   No blueprints available. Use competitor teardown or discovery mode instead.');
    return null;
  }

  // Stub: Full implementation in Child D (SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-D)
  // This will present an interactive browse experience with categories,
  // template preview, and parameter customization.

  const selected = blueprintId
    ? blueprints.find(b => b.id === blueprintId)
    : blueprints[0]; // Placeholder: interactive selection in Child D

  if (!selected) {
    throw new Error(`Blueprint not found: ${blueprintId}`);
  }

  const template = selected.template_data || {};

  return createPathOutput({
    origin_type: 'blueprint',
    raw_material: {
      blueprint: selected,
      customizations,
    },
    blueprint_id: selected.id,
    suggested_name: template.name || selected.name,
    suggested_problem: template.problem_statement || '',
    suggested_solution: template.solution || '',
    target_market: template.target_market || '',
    metadata: {
      path: 'blueprint_browse',
      blueprint_name: selected.name,
      blueprint_category: selected.category,
    },
  });
}
