/**
 * Real Data Adapter for Build Loop Stages 19-22
 * SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-C: FR-001
 *
 * Centralized adapter querying venture_stage_work and strategic_directives_v2
 * to provide real data to build loop analysis steps.
 *
 * Returns structured waiting sentinels when no data is available yet.
 *
 * @module lib/eva/adapters/real-data-adapter
 */

/**
 * @typedef {Object} RealDataResult
 * @property {boolean} dataAvailable - Whether real data exists
 * @property {Object} [data] - The real data (when available)
 * @property {string[]} [waitingFor] - What's missing (when unavailable)
 */

/**
 * Fetch build progress from venture_stage_work stage 19 advisory_data.
 * This contains task statuses derived from child SD completions.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<RealDataResult>}
 */
export async function fetchBuildProgress(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status, health_score')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (error) {
    throw new Error(`[RealDataAdapter] Failed to query stage 19: ${error.message}`);
  }

  if (!data || !data.advisory_data || !data.advisory_data.tasks || data.advisory_data.tasks.length === 0) {
    return {
      dataAvailable: false,
      waitingFor: ['venture_stage_work.advisory_data for stage 19 (no child SD completions yet)'],
    };
  }

  return {
    dataAvailable: true,
    data: {
      ...data.advisory_data,
      stage_status: data.stage_status,
      health_score: data.health_score,
    },
  };
}

/**
 * Fetch sibling SD details from strategic_directives_v2.
 * Returns child SDs of the same parent orchestrator.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<RealDataResult>}
 */
export async function fetchSiblingSDStatuses(supabase, ventureId) {
  // Find the venture's orchestrator SD via venture_stage_work
  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('sd_id')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (!stageWork?.sd_id) {
    return {
      dataAvailable: false,
      waitingFor: ['venture_stage_work.sd_id for stage 19 (no orchestrator linked)'],
    };
  }

  // Resolve the parent SD UUID from sd_key
  const { data: parentSD } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', stageWork.sd_id)
    .maybeSingle();

  const parentId = parentSD?.id || stageWork.sd_id;

  // Fetch all children
  const { data: siblings, error } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, title, status, sd_type, progress, completion_date')
    .eq('parent_sd_id', parentId)
    .order('sd_key', { ascending: true });

  if (error) {
    throw new Error(`[RealDataAdapter] Failed to query sibling SDs: ${error.message}`);
  }

  if (!siblings || siblings.length === 0) {
    return {
      dataAvailable: false,
      waitingFor: ['strategic_directives_v2 child SDs (none exist yet)'],
    };
  }

  return {
    dataAvailable: true,
    data: { siblings, parentSdId: parentId },
  };
}

/**
 * Fetch QA data from venture_stage_work stage 20 advisory_data.
 * Written by sd-completed.js when all siblings reach terminal state.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<RealDataResult>}
 */
export async function fetchQAData(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 20)
    .maybeSingle();

  if (error) {
    throw new Error(`[RealDataAdapter] Failed to query stage 20: ${error.message}`);
  }

  if (!data || !data.advisory_data) {
    return {
      dataAvailable: false,
      waitingFor: ['venture_stage_work.advisory_data for stage 20 (QA data not written yet)'],
    };
  }

  return {
    dataAvailable: true,
    data: data.advisory_data,
  };
}

/**
 * Fetch integration data from venture_stage_work stage 21 advisory_data.
 * Written by sd-completed.js when all siblings reach terminal state.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @returns {Promise<RealDataResult>}
 */
export async function fetchIntegrationData(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 21)
    .maybeSingle();

  if (error) {
    throw new Error(`[RealDataAdapter] Failed to query stage 21: ${error.message}`);
  }

  if (!data || !data.advisory_data) {
    return {
      dataAvailable: false,
      waitingFor: ['venture_stage_work.advisory_data for stage 21 (integration data not written yet)'],
    };
  }

  return {
    dataAvailable: true,
    data: data.advisory_data,
  };
}

/**
 * Check if real data is available for a given build loop stage.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number} stageNumber - 19, 20, 21, or 22
 * @returns {Promise<boolean>}
 */
export async function isRealDataAvailable(supabase, ventureId, stageNumber) {
  const fetchers = {
    19: fetchBuildProgress,
    20: fetchQAData,
    21: fetchIntegrationData,
    22: fetchBuildProgress, // Stage 22 depends on all upstream
  };

  const fetcher = fetchers[stageNumber];
  if (!fetcher) return false;

  const result = await fetcher(supabase, ventureId);
  return result.dataAvailable;
}

/**
 * Map SD status to task status (shared utility).
 * @param {string} sdStatus
 * @returns {'pending'|'in_progress'|'done'|'blocked'}
 */
export function mapSdStatusToTaskStatus(sdStatus) {
  switch (sdStatus) {
    case 'completed': return 'done';
    case 'draft':
    case 'lead_review': return 'pending';
    case 'plan_active':
    case 'exec_active':
    case 'in_progress': return 'in_progress';
    case 'on_hold':
    case 'cancelled': return 'blocked';
    default: return 'pending';
  }
}
