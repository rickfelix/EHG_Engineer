/**
 * Path 2: Blueprint Browse
 *
 * Browse categorized venture blueprint templates,
 * select a template, and customize parameters.
 *
 * Flow:
 * 1. Load blueprints from venture_blueprints table
 * 2. Group by category for browsing
 * 3. Select blueprint (by ID or category filter)
 * 4. Apply customizations to template parameters
 * 5. Return PathOutput with blueprint-derived venture brief
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-D
 */

import { createPathOutput } from '../interfaces.js';

/**
 * Execute the blueprint browse path.
 *
 * @param {Object} params
 * @param {string} [params.blueprintId] - Pre-selected blueprint ID (skips browse)
 * @param {string} [params.category] - Filter by category
 * @param {Object} [params.customizations] - Template parameter overrides
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @returns {Promise<Object>} PathOutput or null if no blueprints
 */
export async function executeBlueprintBrowse({ blueprintId, category, customizations = {} }, deps = {}) {
  const { supabase, logger = console } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  // Step 1: Load available blueprints
  const blueprints = await loadBlueprints(supabase, { category });

  if (!blueprints || blueprints.length === 0) {
    logger.log('   No blueprints available. Use competitor teardown or discovery mode instead.');
    return null;
  }

  // Step 2: Group by category for display
  const grouped = groupByCategory(blueprints);
  logger.log(`   Found ${blueprints.length} blueprint(s) across ${Object.keys(grouped).length} category/categories`);

  for (const [cat, items] of Object.entries(grouped)) {
    logger.log(`   [${cat}] ${items.length} template(s)`);
  }

  // Step 3: Select blueprint
  let selected;
  if (blueprintId) {
    selected = blueprints.find(b => b.id === blueprintId);
    if (!selected) {
      throw new Error(`Blueprint not found: ${blueprintId}`);
    }
    logger.log(`   Selected: ${selected.name} (${selected.category})`);
  } else if (category) {
    const filtered = grouped[category];
    if (!filtered || filtered.length === 0) {
      throw new Error(`No blueprints in category: ${category}. Available: ${Object.keys(grouped).join(', ')}`);
    }
    selected = filtered[0];
    logger.log(`   Auto-selected from ${category}: ${selected.name}`);
  } else {
    // Non-interactive: pick first blueprint
    selected = blueprints[0];
    logger.log(`   Auto-selected: ${selected.name} (${selected.category})`);
  }

  // Step 4: Apply customizations
  const template = applyCustomizations(selected.template_data || {}, customizations);

  if (Object.keys(customizations).length > 0) {
    logger.log(`   Applied ${Object.keys(customizations).length} customization(s)`);
  }

  // Step 5: Build PathOutput
  return createPathOutput({
    origin_type: 'blueprint',
    raw_material: {
      blueprint: selected,
      customizations,
      applied_template: template,
      categories_available: Object.keys(grouped),
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
      total_blueprints: blueprints.length,
      categories_browsed: Object.keys(grouped),
      customizations_applied: Object.keys(customizations),
    },
  });
}

/**
 * Load blueprints from the database with optional category filter.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} options
 * @param {string} [options.category] - Filter by category
 * @returns {Promise<Object[]>} Blueprint records
 */
async function loadBlueprints(supabase, { category } = {}) {
  let query = supabase
    .from('venture_blueprints')
    .select('id, name, category, description, template_data, is_active')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load blueprints: ${error.message}`);
  }

  return data || [];
}

/**
 * Group blueprints by category.
 *
 * @param {Object[]} blueprints - Blueprint records
 * @returns {Object<string, Object[]>} Grouped blueprints
 */
export function groupByCategory(blueprints) {
  const grouped = {};
  for (const bp of blueprints) {
    const cat = bp.category || 'uncategorized';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(bp);
  }
  return grouped;
}

/**
 * Apply customizations over template defaults.
 * Customizations override template_data values at the top level.
 *
 * @param {Object} template - Original template_data from blueprint
 * @param {Object} customizations - User overrides
 * @returns {Object} Merged template
 */
export function applyCustomizations(template, customizations = {}) {
  return { ...template, ...customizations };
}

/**
 * List available blueprint categories.
 *
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object[]>} Category summary [{category, count}]
 */
export async function listBlueprintCategories(deps = {}) {
  const { supabase } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  const blueprints = await loadBlueprints(supabase);
  const grouped = groupByCategory(blueprints);

  return Object.entries(grouped).map(([category, items]) => ({
    category,
    count: items.length,
    blueprints: items.map(b => ({ id: b.id, name: b.name })),
  }));
}
