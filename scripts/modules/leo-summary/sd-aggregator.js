/**
 * SD Data Aggregator for LEO Protocol Summary
 *
 * Handles fetching and aggregating all data needed for compliance scoring:
 * - SD metadata (parent + children for orchestrators)
 * - Handoffs with all 7 mandatory elements
 * - Validation profiles
 * - PRD status
 * - Retrospectives
 * - Execution timeline
 */

/**
 * Resolve target SD (auto-detect most recent completed or specified)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string|undefined} specifiedSdId - Optional specific SD ID
 * @returns {Promise<Object|null>} Target SD or null if not found
 */
export async function resolveTargetSD(supabase, specifiedSdId) {
  if (specifiedSdId) {
    // Fetch specified SD
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, sd_type, status, category, priority, created_at, completion_date, parent_sd_id')
      .eq('id', specifiedSdId)
      .single();

    if (error || !data) {
      return null;
    }
    return data;
  }

  // Auto-detect: find most recent completed SD
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, category, priority, created_at, completion_date, parent_sd_id')
    .eq('status', 'completed')
    .order('completion_date', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }
  return data;
}

/**
 * Aggregate all data for a single SD
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object>} Aggregated data for the SD
 */
async function aggregateStandaloneData(supabase, sd) {
  // Fetch handoffs
  const { data: handoffs } = await supabase
    .from('sd_phase_handoffs')
    .select(`
      id, sd_id, handoff_type, from_phase, to_phase, status,
      validation_passed, validation_score, created_at, accepted_at,
      executive_summary, deliverables_manifest, key_decisions,
      known_issues, resource_utilization, action_items, completeness_report
    `)
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: true });

  // Fetch validation profile for SD type
  const sdType = sd.sd_type || 'feature';
  const { data: validationProfile } = await supabase
    .from('sd_type_validation_profiles')
    .select('*')
    .eq('sd_type', sdType)
    .single();

  // Fetch PRD
  const { data: prd } = await supabase
    .from('product_requirements_v2')
    .select('id, status, progress, phase')
    .eq('sd_id', sd.id)
    .single();

  // Fetch retrospective
  const { data: retrospective } = await supabase
    .from('retrospectives')
    .select('id, quality_score, created_at')
    .eq('sd_id', sd.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Fetch execution timeline
  const { data: timeline } = await supabase
    .from('sd_execution_timeline')
    .select('phase, phase_started_at, phase_completed_at, duration_hours')
    .eq('sd_id', sd.id)
    .order('phase_started_at', { ascending: true });

  return {
    sd,
    handoffs: handoffs || [],
    validationProfile: validationProfile || getDefaultValidationProfile(sdType),
    prd,
    retrospective,
    timeline: timeline || [],
    isOrchestrator: false,
    children: []
  };
}

/**
 * Aggregate data for orchestrator SD (parent + all children)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} parentSD - Parent orchestrator SD
 * @returns {Promise<Object>} Aggregated data for parent + children
 */
async function aggregateOrchestratorData(supabase, parentSD) {
  // Fetch children SDs
  const { data: childrenSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, sd_type, status, category, priority, created_at, completion_date, parent_sd_id')
    .eq('parent_sd_id', parentSD.id)
    .order('created_at', { ascending: true });

  // Aggregate parent data
  const parentData = await aggregateStandaloneData(supabase, parentSD);

  // Aggregate children data
  const childrenData = [];
  for (const child of (childrenSDs || [])) {
    const childData = await aggregateStandaloneData(supabase, child);
    childrenData.push(childData);
  }

  // Combine all handoffs
  const allHandoffs = [
    ...parentData.handoffs,
    ...childrenData.flatMap(c => c.handoffs)
  ];

  // Combine all timelines
  const allTimeline = [
    ...parentData.timeline,
    ...childrenData.flatMap(c => c.timeline)
  ];

  return {
    sd: parentSD,
    handoffs: allHandoffs,
    validationProfile: parentData.validationProfile,
    prd: parentData.prd,
    retrospective: parentData.retrospective,
    timeline: allTimeline,
    isOrchestrator: true,
    children: childrenData,
    // Parent-only data
    parentHandoffs: parentData.handoffs,
    parentTimeline: parentData.timeline
  };
}

/**
 * Aggregate SD data based on whether it's an orchestrator or standalone
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} sd - Strategic Directive
 * @returns {Promise<Object>} Aggregated data
 */
export async function aggregateSDData(supabase, sd) {
  // Check if this SD has children (is an orchestrator)
  const { count } = await supabase
    .from('strategic_directives_v2')
    .select('id', { count: 'exact', head: true })
    .eq('parent_sd_id', sd.id);

  if (count && count > 0) {
    return aggregateOrchestratorData(supabase, sd);
  }

  return aggregateStandaloneData(supabase, sd);
}

/**
 * Get default validation profile for unknown SD types
 * @param {string} sdType
 * @returns {Object} Default validation profile
 */
function getDefaultValidationProfile(sdType) {
  return {
    sd_type: sdType,
    required_handoff_types: ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD'],
    minimum_handoffs: 4,
    phase_weights: {
      LEAD: 0.15,
      PLAN: 0.25,
      EXEC: 0.40,
      VERIFY: 0.20
    },
    expected_duration_hours: {
      feature: 8,
      bugfix: 4,
      infrastructure: 12,
      docs: 2,
      refactor: 6
    }
  };
}

/**
 * Calculate timing metrics from SD data
 * @param {Object} sd - Strategic Directive
 * @param {Array} timeline - Execution timeline records
 * @returns {Object} Timing metrics
 */
export function calculateTiming(sd, timeline) {
  const startDate = sd.created_at ? new Date(sd.created_at) : null;
  const endDate = sd.completion_date ? new Date(sd.completion_date) : null;

  let totalMinutes = 0;
  if (startDate && endDate) {
    totalMinutes = Math.round((endDate - startDate) / (1000 * 60));
  }

  // Format duration
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let totalFormatted = '';
  if (hours > 0 && minutes > 0) {
    totalFormatted = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (hours > 0) {
    totalFormatted = `${hours} hour${hours !== 1 ? 's' : ''}`;
  } else {
    totalFormatted = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  // Process phase timeline
  const phases = timeline.map(t => ({
    phase: t.phase,
    durationMinutes: t.duration_hours ? Math.round(t.duration_hours * 60) : 0,
    started: t.phase_started_at,
    completed: t.phase_completed_at
  }));

  return {
    startDate: startDate ? startDate.toISOString() : null,
    endDate: endDate ? endDate.toISOString() : null,
    totalMinutes,
    totalFormatted,
    phases
  };
}
