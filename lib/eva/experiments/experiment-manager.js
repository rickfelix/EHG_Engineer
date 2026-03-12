/**
 * Experiment Manager - CRUD lifecycle for A/B experiments
 *
 * SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-C
 */

/**
 * Create a new experiment.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params - { name, hypothesis, variants, config }
 * @param {string} params.name - Experiment name
 * @param {string} params.hypothesis - What we expect to observe
 * @param {Array<{key: string, label: string, weight?: number, prompt_name?: string}>} params.variants - At least 2 variants (prompt_name loads prompt via PromptLoader for prompt-aware evaluation)
 * @param {Object} [params.config] - Additional config (e.g., stopping rules)
 * @returns {Promise<Object>} Created experiment record
 */
export async function createExperiment(deps, params) {
  const { supabase, logger = console } = deps;
  const { name, hypothesis, variants, config = {} } = params;

  if (!name || !hypothesis) {
    throw new Error('name and hypothesis are required');
  }
  if (!Array.isArray(variants) || variants.length < 2) {
    throw new Error('At least 2 variants are required');
  }

  // Normalize weights — default to equal distribution
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
  const normalizedVariants = variants.map(v => ({
    key: v.key,
    label: v.label || v.key,
    weight: (v.weight || 1) / totalWeight,
    ...(v.prompt_name ? { prompt_name: v.prompt_name } : {}),
  }));

  const { data, error } = await supabase
    .from('experiments')
    .insert({
      name,
      hypothesis,
      variants: normalizedVariants,
      config,
      status: 'draft',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create experiment: ${error.message}`);

  logger.log(`   Experiment created: ${data.id} (${name})`);
  return data;
}

/**
 * Get an experiment by ID.
 */
export async function getExperiment(deps, experimentId) {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from('experiments')
    .select()
    .eq('id', experimentId)
    .single();

  if (error) throw new Error(`Experiment not found: ${error.message}`);
  return data;
}

/**
 * List experiments, optionally filtered by status.
 */
export async function listExperiments(deps, { status } = {}) {
  const { supabase } = deps;
  let query = supabase.from('experiments').select().order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list experiments: ${error.message}`);
  return data || [];
}

/**
 * Start an experiment (draft → running).
 */
export async function startExperiment(deps, experimentId) {
  const { supabase, logger = console } = deps;

  const experiment = await getExperiment(deps, experimentId);
  if (experiment.status !== 'draft') {
    throw new Error(`Cannot start experiment in '${experiment.status}' status (must be draft)`);
  }

  const { data, error } = await supabase
    .from('experiments')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', experimentId)
    .select()
    .single();

  if (error) throw new Error(`Failed to start experiment: ${error.message}`);
  logger.log(`   Experiment started: ${experimentId}`);
  return data;
}

/**
 * Stop an experiment (running → stopped).
 */
export async function stopExperiment(deps, experimentId) {
  const { supabase, logger = console } = deps;

  const experiment = await getExperiment(deps, experimentId);
  if (experiment.status !== 'running') {
    throw new Error(`Cannot stop experiment in '${experiment.status}' status (must be running)`);
  }

  const { data, error } = await supabase
    .from('experiments')
    .update({ status: 'stopped', ended_at: new Date().toISOString() })
    .eq('id', experimentId)
    .select()
    .single();

  if (error) throw new Error(`Failed to stop experiment: ${error.message}`);
  logger.log(`   Experiment stopped: ${experimentId}`);
  return data;
}

/**
 * Archive an experiment (stopped → archived).
 */
export async function archiveExperiment(deps, experimentId) {
  const { supabase } = deps;

  const experiment = await getExperiment(deps, experimentId);
  if (experiment.status !== 'stopped') {
    throw new Error(`Cannot archive experiment in '${experiment.status}' status (must be stopped)`);
  }

  const { data, error } = await supabase
    .from('experiments')
    .update({ status: 'archived' })
    .eq('id', experimentId)
    .select()
    .single();

  if (error) throw new Error(`Failed to archive experiment: ${error.message}`);
  return data;
}

/**
 * Get the first active (running) experiment, if any.
 */
export async function getActiveExperiment(deps) {
  const { supabase } = deps;
  const { data, error } = await supabase
    .from('experiments')
    .select()
    .eq('status', 'running')
    .order('started_at', { ascending: true })
    .limit(1)
    .single();

  if (error) return null; // No active experiment
  return data;
}

// Re-export multi-dimensional extensions for convenience
export { createDimensionExperiment, getActiveExperimentForDimension, checkEnrollmentConflict } from './multi-dimensional.js';
