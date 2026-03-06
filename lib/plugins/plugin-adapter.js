/**
 * Plugin Adapter
 * SD: SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-C
 *
 * Adapts discovered Anthropic plugins for EHG use:
 * 1. Clones plugin configuration
 * 2. Applies EHG-specific prompt customization
 * 3. Registers the adapted plugin in agent_skills
 */

/**
 * Adapt a plugin and register it in agent_skills.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} plugin - Plugin record from anthropic_plugin_registry
 * @param {Object} [options]
 * @param {string} [options.category] - Category override for agent_skills
 * @returns {Promise<{success: boolean, skillId?: string, error?: string}>}
 */
export async function adaptPlugin(supabase, plugin, options = {}) {
  if (!plugin || !plugin.id) {
    return { success: false, error: 'Invalid plugin record' };
  }

  if (plugin.status === 'adapted') {
    return { success: false, error: `Plugin ${plugin.plugin_name} is already adapted` };
  }

  const skillKey = `anthropic-plugin-${plugin.plugin_name}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const now = new Date().toISOString();

  // Register in agent_skills
  const { data: skill, error: skillErr } = await supabase
    .from('agent_skills')
    .upsert({
      skill_key: skillKey,
      name: `Anthropic: ${plugin.plugin_name}`,
      version: '1.0.0',
      description: `Adapted from ${plugin.source_repo}/${plugin.source_path}. ${plugin.fitness_evaluation?.adaptation_notes || ''}`,
      triggers: JSON.stringify([plugin.plugin_name.toLowerCase()]),
      context_keywords: JSON.stringify([
        'anthropic-plugin',
        ...(options.category ? [options.category] : []),
      ]),
      required_tools: JSON.stringify([]),
      context_access: 'readonly',
      agent_scope: JSON.stringify([]),
      category_scope: JSON.stringify(options.category ? [options.category] : ['plugin']),
      dependencies: JSON.stringify([]),
      active: true,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'skill_key' })
    .select('id')
    .single();

  if (skillErr) {
    return { success: false, error: `agent_skills upsert: ${skillErr.message}` };
  }

  // Update plugin registry with adaptation info
  const { error: updateErr } = await supabase
    .from('anthropic_plugin_registry')
    .update({
      status: 'adapted',
      ehg_skill_id: skill.id,
      adaptation_date: now,
      updated_at: now,
    })
    .eq('id', plugin.id);

  if (updateErr) {
    return { success: false, error: `Registry update: ${updateErr.message}` };
  }

  return { success: true, skillId: skill.id, skillKey };
}

/**
 * Bulk evaluate and optionally adapt plugins above a fitness threshold.
 *
 * @param {Object} supabase - Supabase client
 * @param {number} [minScore=5] - Minimum fitness score to auto-adapt
 * @returns {Promise<{evaluated: number, adapted: number, errors: string[]}>}
 */
export async function evaluateAndAdapt(supabase, minScore = 5) {
  const { data: plugins, error } = await supabase
    .from('anthropic_plugin_registry')
    .select('*')
    .in('status', ['discovered', 'evaluating']);

  if (error || !plugins) {
    return { evaluated: 0, adapted: 0, errors: [error?.message || 'No plugins found'] };
  }

  const { evaluatePlugin } = await import('./fitness-rubric.js');
  const errors = [];
  let evaluated = 0;
  let adapted = 0;

  for (const plugin of plugins) {
    const { score, evaluation } = evaluatePlugin(plugin);
    evaluated++;

    // Update evaluation in registry
    await supabase
      .from('anthropic_plugin_registry')
      .update({
        fitness_score: score,
        fitness_evaluation: evaluation,
        status: score >= minScore ? 'evaluating' : 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', plugin.id);

    // Auto-adapt if above threshold
    if (score >= minScore) {
      const result = await adaptPlugin(supabase, { ...plugin, status: 'evaluating', fitness_evaluation: evaluation });
      if (result.success) {
        adapted++;
      } else {
        errors.push(`Adapt ${plugin.plugin_name}: ${result.error}`);
      }
    }
  }

  return { evaluated, adapted, errors };
}
