/**
 * Multi-Dimensional Experiment Extensions
 *
 * Extends experiments to vary across dimensions:
 * - profile: Different evaluation prompts (existing behavior)
 * - canary_split: Different LLM routing percentages
 * - gate_threshold: Different kill gate score thresholds
 *
 * SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-B
 */

/** Valid experiment dimensions */
const EXPERIMENT_DIMENSIONS = new Set(['profile', 'canary_split', 'gate_threshold']);

/** Valid state transitions: from → [allowed targets] */
const VALID_TRANSITIONS = {
  draft: ['running'],
  running: ['completed'],
  completed: ['archived'],
};

/**
 * Validate dimension-specific variant fields.
 * Each dimension requires different metadata on its variants.
 *
 * @param {string} dimension
 * @param {Array<Object>} variants
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDimensionVariants(dimension, variants) {
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    if (!v.key) {
      return { valid: false, error: `Variant at index ${i} missing required field 'key'` };
    }

    switch (dimension) {
      case 'profile':
        if (!v.prompt_name) {
          return { valid: false, error: `Variant '${v.key}' missing required field 'prompt_name' for profile dimension` };
        }
        break;
      case 'canary_split':
        if (v.split_percentage == null || v.split_percentage < 0 || v.split_percentage > 100) {
          return { valid: false, error: `Variant '${v.key}' requires split_percentage (0-100) for canary_split dimension` };
        }
        break;
      case 'gate_threshold':
        if (v.threshold_score == null || v.threshold_score < 0 || v.threshold_score > 100) {
          return { valid: false, error: `Variant '${v.key}' requires threshold_score (0-100) for gate_threshold dimension` };
        }
        break;
    }
  }

  return { valid: true };
}

/**
 * Create a dimension-aware experiment.
 * Validates dimension-specific fields and stores dimension metadata.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params - { name, hypothesis, dimension, variants, config }
 * @returns {Promise<Object>} Result with success flag and data or error
 */
export async function createDimensionExperiment(deps, params) {
  const { supabase, logger = console } = deps;
  const { name, hypothesis, dimension, variants, config = {} } = params;

  if (!name || !hypothesis) {
    return { success: false, error: 'name and hypothesis are required' };
  }

  if (!dimension || !EXPERIMENT_DIMENSIONS.has(dimension)) {
    return {
      success: false,
      error: `Invalid dimension '${dimension}'. Must be one of: ${[...EXPERIMENT_DIMENSIONS].join(', ')}`,
    };
  }

  if (!Array.isArray(variants) || variants.length < 2) {
    return { success: false, error: 'At least 2 variants are required' };
  }

  const validation = validateDimensionVariants(dimension, variants);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Normalize weights
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 1), 0);
  const normalizedVariants = variants.map(v => ({
    ...v,
    weight: (v.weight || 1) / totalWeight,
    label: v.label || v.key,
  }));

  const experimentConfig = {
    ...config,
    experiment_dimension: dimension,
  };

  const { data, error } = await supabase
    .from('experiments')
    .insert({
      name,
      hypothesis,
      variants: normalizedVariants,
      config: experimentConfig,
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to create experiment: ${error.message}` };
  }

  logger.log(`   Dimension experiment created: ${data.id} (${dimension}/${name})`);
  return { success: true, data };
}

/**
 * Get the active experiment for a specific dimension.
 * Only one experiment per dimension can be running at a time.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} dimension - The dimension to query
 * @returns {Promise<Object|null>} Active experiment or null
 */
export async function getActiveExperimentForDimension(deps, dimension) {
  const { supabase } = deps;

  if (!EXPERIMENT_DIMENSIONS.has(dimension)) {
    return null;
  }

  const { data, error } = await supabase
    .from('experiments')
    .select()
    .eq('status', 'running')
    .order('started_at', { ascending: false });

  if (error || !data) return null;

  // Filter by dimension stored in config
  const match = data.find(exp =>
    exp.config && exp.config.experiment_dimension === dimension
  );

  return match || null;
}

/**
 * Check enrollment exclusion — prevent same-dimension conflicts.
 * A venture can be in multiple experiments IF they vary different dimensions.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params - { ventureId, dimension }
 * @returns {Promise<Object>} { conflict: boolean, existingExperimentId?: string }
 */
export async function checkEnrollmentConflict(deps, { ventureId, dimension }) {
  const { supabase } = deps;

  // Get all assignments for this venture
  const { data: assignments, error: assignErr } = await supabase
    .from('experiment_assignments')
    .select('experiment_id')
    .eq('venture_id', ventureId);

  if (assignErr || !assignments || assignments.length === 0) {
    return { conflict: false };
  }

  // Check each assigned experiment's dimension
  const experimentIds = assignments.map(a => a.experiment_id);
  const { data: experiments, error: expErr } = await supabase
    .from('experiments')
    .select('id, config, status')
    .in('id', experimentIds)
    .eq('status', 'running');

  if (expErr || !experiments) {
    return { conflict: false };
  }

  for (const exp of experiments) {
    if (exp.config && exp.config.experiment_dimension === dimension) {
      return { conflict: true, existingExperimentId: exp.id };
    }
  }

  return { conflict: false };
}

/**
 * Enroll venture with dimension-aware exclusion.
 * Wraps experiment-assignment.js assignVariant with conflict check.
 *
 * @param {Object} deps - { supabase, logger }
 * @param {Object} params - { ventureId, experimentId }
 * @returns {Promise<Object>} Enrollment result
 */
export async function enrollWithExclusion(deps, { ventureId, experimentId }) {
  const { supabase, logger = console } = deps;

  // Get experiment to determine dimension
  const { data: experiment, error: expErr } = await supabase
    .from('experiments')
    .select()
    .eq('id', experimentId)
    .single();

  if (expErr || !experiment) {
    return { enrolled: false, reason: 'EXPERIMENT_NOT_FOUND' };
  }

  const dimension = experiment.config?.experiment_dimension;
  if (!dimension) {
    return { enrolled: false, reason: 'NO_DIMENSION_CONFIGURED' };
  }

  // Check for enrollment conflict
  const conflictResult = await checkEnrollmentConflict(deps, { ventureId, dimension });
  if (conflictResult.conflict) {
    logger.warn(`   Enrollment blocked: venture ${ventureId.slice(0, 8)} already in ${dimension} experiment ${conflictResult.existingExperimentId}`);
    return {
      enrolled: false,
      reason: 'DIMENSION_CONFLICT',
      existingExperimentId: conflictResult.existingExperimentId,
      dimension,
    };
  }

  // Delegate to assignVariant
  const { assignVariant } = await import('./experiment-assignment.js');
  const result = await assignVariant(deps, { ventureId, experiment });

  return { enrolled: true, ...result };
}

/**
 * Experiment state machine transitions with validation.
 * draft -> running -> completed -> archived
 *
 * @param {Object} deps - { supabase, logger }
 * @param {string} experimentId - Experiment UUID
 * @param {string} targetStatus - Desired new status
 * @returns {Promise<Object>} Result with success flag
 */
export async function transitionExperiment(deps, experimentId, targetStatus) {
  const { supabase, logger = console } = deps;

  // Get current experiment
  const { data: experiment, error: getErr } = await supabase
    .from('experiments')
    .select()
    .eq('id', experimentId)
    .single();

  if (getErr || !experiment) {
    return { success: false, error: 'Experiment not found' };
  }

  const currentStatus = experiment.status;
  const allowedTargets = VALID_TRANSITIONS[currentStatus];

  if (!allowedTargets || !allowedTargets.includes(targetStatus)) {
    return {
      success: false,
      error: `Invalid transition: '${currentStatus}' → '${targetStatus}'. Allowed: ${allowedTargets ? allowedTargets.join(', ') : 'none'}`,
    };
  }

  // Build update payload with timestamp fields
  const updatePayload = { status: targetStatus };
  if (targetStatus === 'running') updatePayload.started_at = new Date().toISOString();
  if (targetStatus === 'completed') updatePayload.ended_at = new Date().toISOString();
  if (targetStatus === 'archived') updatePayload.archived_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('experiments')
    .update(updatePayload)
    .eq('id', experimentId)
    .select()
    .single();

  if (error) {
    return { success: false, error: `Failed to transition: ${error.message}` };
  }

  logger.log(`   Experiment ${experimentId}: ${currentStatus} → ${targetStatus}`);
  return { success: true, data };
}

export { EXPERIMENT_DIMENSIONS };
