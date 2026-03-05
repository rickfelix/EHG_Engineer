/**
 * Launch Workflow Module — API for EVA Launch Stages (23-25)
 *
 * SD: SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-J
 *
 * Provides launch readiness status, go/no-go checklist, and stage
 * progression timeline for ventures in the launch phase.
 *
 * @module lib/eva/launch-workflow
 */

/**
 * Get launch readiness status for a venture.
 * Aggregates stage 23-25 data including current stage, readiness flags,
 * and launch phase progress.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Launch status
 */
export async function getLaunchStatus(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, status: 'no-client' };

  const { data: venture, error } = await supabase
    .from('eva_ventures')
    .select('id, name, status, current_stage, created_at, updated_at')
    .eq('id', ventureId)
    .maybeSingle();

  if (error || !venture) {
    return { ventureId, status: 'not-found', error: error?.message };
  }

  const currentStage = venture.current_stage || 0;
  const inLaunchPhase = currentStage >= 23;

  // Get latest gate results for launch stages
  const { data: gateResults } = await supabase
    .from('eva_stage_gate_results')
    .select('stage_number, passed, gate_type, reasoning, created_at')
    .eq('venture_id', ventureId)
    .gte('stage_number', 22)
    .order('stage_number', { ascending: true });

  const launchGates = (gateResults || []).reduce((acc, g) => {
    acc[`stage_${g.stage_number}`] = {
      passed: g.passed,
      gateType: g.gate_type,
      reasoning: g.reasoning,
      evaluatedAt: g.created_at,
    };
    return acc;
  }, {});

  return {
    ventureId,
    ventureName: venture.name,
    status: venture.status,
    currentStage,
    inLaunchPhase,
    launchReadiness: {
      stage22Gate: launchGates.stage_22 || null,
      stage24Gate: launchGates.stage_24 || null,
      allGatesPassed: !!(launchGates.stage_22?.passed && launchGates.stage_24?.passed),
    },
    updatedAt: venture.updated_at,
  };
}

/**
 * Get go/no-go checklist for a venture's launch decision.
 * Derives checklist items from chairman gate results at blocking stages.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Checklist with items and overall readiness
 */
export async function getChecklist(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, items: [], ready: false };

  // Chairman blocking gates for launch: 22 and 24
  // Advisory gates: 23
  const { data: gates } = await supabase
    .from('eva_stage_gate_results')
    .select('stage_number, passed, gate_type, reasoning, score, created_at')
    .eq('venture_id', ventureId)
    .gte('stage_number', 20)
    .order('stage_number', { ascending: true });

  const items = (gates || []).map((g) => ({
    stage: g.stage_number,
    label: STAGE_LABELS[g.stage_number] || `Stage ${g.stage_number}`,
    type: BLOCKING_GATES.includes(g.stage_number) ? 'blocking' : 'advisory',
    passed: g.passed,
    score: g.score,
    reasoning: g.reasoning,
    evaluatedAt: g.created_at,
  }));

  const blockingItems = items.filter((i) => i.type === 'blocking');
  const ready = blockingItems.length > 0 && blockingItems.every((i) => i.passed);

  return { ventureId, items, ready, evaluatedCount: items.length };
}

/**
 * Get stage progression timeline for a venture.
 * Returns chronologically ordered stage completion events.
 *
 * @param {string} ventureId - UUID of the venture
 * @param {Object} deps
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object>} Timeline with stage events
 */
export async function getTimeline(ventureId, deps = {}) {
  const { supabase } = deps;
  if (!supabase) return { ventureId, events: [] };

  const { data: gates } = await supabase
    .from('eva_stage_gate_results')
    .select('stage_number, passed, gate_type, score, created_at')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: true });

  const events = (gates || []).map((g) => ({
    stage: g.stage_number,
    label: STAGE_LABELS[g.stage_number] || `Stage ${g.stage_number}`,
    passed: g.passed,
    score: g.score,
    timestamp: g.created_at,
    phase: getPhaseForStage(g.stage_number),
  }));

  const { data: venture } = await supabase
    .from('eva_ventures')
    .select('current_stage, created_at')
    .eq('id', ventureId)
    .maybeSingle();

  return {
    ventureId,
    currentStage: venture?.current_stage || 0,
    startedAt: venture?.created_at || null,
    events,
    stageCount: events.length,
  };
}

// Stage label reference
const STAGE_LABELS = {
  1: 'Idea Capture', 2: 'Idea Analysis', 3: 'Kill Gate',
  4: 'Competitive Landscape', 5: 'Kill Gate (Financial)', 6: 'Risk Assessment',
  7: 'Revenue Architecture', 8: 'Business Model Canvas', 9: 'Exit Strategy',
  10: 'Customer & Brand Foundation', 11: 'Naming & Visual Identity', 12: 'GTM & Sales Strategy',
  13: 'Product Roadmap', 14: 'Technical Architecture', 15: 'Risk Register',
  16: 'Financial Projections', 17: 'Pre-Build Checklist', 18: 'Sprint Planning',
  19: 'Build Execution', 20: 'Quality Assurance',
  21: 'Build Review', 22: 'Release Readiness',
  23: 'Marketing Preparation', 24: 'Launch Readiness', 25: 'Launch Execution',
};

// Chairman blocking gates
const BLOCKING_GATES = [3, 10, 22, 24];

/**
 * Get the operating phase for a given stage number.
 */
function getPhaseForStage(stageNumber) {
  if (stageNumber <= 2) return 'EVALUATION';
  if (stageNumber <= 5) return 'STRATEGY';
  if (stageNumber <= 10) return 'PLANNING';
  if (stageNumber <= 22) return 'BUILD';
  return 'LAUNCH';
}
