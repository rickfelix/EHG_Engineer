/**
 * Eva Orchestrator Helpers
 *
 * Extracted from eva-orchestrator.js to reduce main module size.
 * Contains: result building, artifact persistence, idempotency checks,
 * stage template loading, upstream artifact loading, artifact merging.
 *
 * Part of SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-020
 *
 * @module lib/eva/eva-orchestrator-helpers
 */

// ── Status Constants ────────────────────────────────────────────

const STATUS = Object.freeze({
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  FAILED: 'FAILED',
});

const FILTER_ACTION = Object.freeze({
  AUTO_PROCEED: 'AUTO_PROCEED',
  REQUIRE_REVIEW: 'REQUIRE_REVIEW',
  STOP: 'STOP',
});

// ── Analysis Depth Scaling (SD-MAN-FEAT-CORRECTIVE-VISION-GAP-070) ──
// Budget-aware depth enum: the orchestrator selects depth based on the
// remaining token budget percentage. This prevents BudgetExhaustedError
// by gracefully degrading analysis quality instead of hard-failing.
const ANALYSIS_DEPTH = Object.freeze({
  DEEP: 'deep',       // Budget >= 60% remaining — full analysis
  STANDARD: 'standard', // Budget 30-59% remaining — standard analysis
  SHALLOW: 'shallow',  // Budget < 30% remaining — minimum viable analysis
});

/**
 * Select analysis depth based on remaining budget percentage.
 * @param {Object|null} budgetStatus - Result from checkBudget()
 * @returns {string} One of ANALYSIS_DEPTH values
 */
function selectAnalysisDepth(budgetStatus) {
  if (!budgetStatus || budgetStatus.usage_percentage == null) {
    return ANALYSIS_DEPTH.STANDARD; // Default when budget info unavailable
  }
  const remainingPct = Math.max(0, 100 - budgetStatus.usage_percentage);
  if (remainingPct >= 60) return ANALYSIS_DEPTH.DEEP;
  if (remainingPct >= 30) return ANALYSIS_DEPTH.STANDARD;
  return ANALYSIS_DEPTH.SHALLOW;
}

// ── Helper Functions ────────────────────────────────────────────

function buildResult({ ventureId, stageId, startedAt, correlationId, status, artifacts = [], filterDecision = null, gateResults = [], nextStageId = null, errors = [], devilsAdvocateReview = null, knowledgeContext = [], traceId = null, tokenUsageSummary = null, postLifecycleResult = null }) {
  const result = {
    ventureId,
    stageId,
    startedAt,
    completedAt: new Date().toISOString(),
    correlationId,
    status,
    artifacts,
    filterDecision,
    gateResults,
    nextStageId,
    errors,
    devilsAdvocateReview,
    knowledgeContext,
    traceId,
    tokenUsageSummary,
  };
  if (postLifecycleResult) {
    result.postLifecycleResult = postLifecycleResult;
  }
  return result;
}

function mergeArtifactOutputs(artifacts, ventureContext) {
  const output = { description: ventureContext.name || '' };
  for (const art of artifacts) {
    if (art.payload) {
      if (art.payload.cost !== undefined) output.cost = art.payload.cost;
      if (art.payload.score !== undefined) output.score = art.payload.score;
      if (art.payload.technologies) output.technologies = art.payload.technologies;
      if (art.payload.vendors) output.vendors = art.payload.vendors;
      if (art.payload.patterns) output.patterns = art.payload.patterns;
    }
  }
  return output;
}

async function loadStageTemplate(supabase, stageId) {
  const { data } = await supabase
    .from('venture_stage_templates')
    .select('template_data')
    .eq('lifecycle_stage', stageId)
    .eq('is_active', true)
    .single();

  if (data?.template_data) return data.template_data;

  // Default minimal template
  return { stageId, version: '1.0.0', analysisSteps: [] };
}

async function persistArtifacts(supabase, ventureId, stageId, artifacts, idempotencyKey) {
  const ids = [];
  for (const art of artifacts) {
    const row = {
      venture_id: ventureId,
      lifecycle_stage: stageId,
      artifact_type: art.artifactType,
      artifact_data: art.payload,
      is_current: true,
      source: art.source || 'eva-orchestrator',
    };
    if (idempotencyKey) {
      row.idempotency_key = idempotencyKey;
    }

    // Four Buckets: populate epistemic columns when classification data is present
    const fb = art.payload?.fourBuckets;
    if (fb?.classifications?.length > 0) {
      // Dominant bucket = highest count in summary
      const s = fb.summary || {};
      const bucketCounts = [
        ['fact', s.facts || 0],
        ['assumption', s.assumptions || 0],
        ['simulation', s.simulations || 0],
        ['unknown', s.unknowns || 0],
      ];
      bucketCounts.sort((a, b) => b[1] - a[1]);
      row.epistemic_classification = bucketCounts[0][0];
      row.epistemic_evidence = fb.classifications;
    }

    let insertError;
    let data;
    const insertResult = await supabase
      .from('venture_artifacts')
      .insert(row)
      .select('id')
      .single();
    data = insertResult.data;
    insertError = insertResult.error;

    // Graceful degradation: if epistemic columns cause constraint violation, retry without them
    if (insertError && row.epistemic_classification) {
      delete row.epistemic_classification;
      delete row.epistemic_evidence;
      const retryResult = await supabase
        .from('venture_artifacts')
        .insert(row)
        .select('id')
        .single();
      data = retryResult.data;
      insertError = retryResult.error;
    }

    if (insertError) throw new Error(`Failed to persist artifact: ${insertError.message}`);
    ids.push(data.id);
  }
  return ids;
}

async function checkIdempotency(supabase, ventureId, stageId, idempotencyKey) {
  const { data } = await supabase
    .from('venture_artifacts')
    .select('id, artifact_type, artifact_data, lifecycle_stage, created_at')
    .eq('venture_id', ventureId)
    .eq('idempotency_key', idempotencyKey);

  if (data && data.length > 0) {
    return {
      ventureId,
      stageId: stageId || data[0].lifecycle_stage,
      startedAt: data[0].created_at,
      completedAt: data[0].created_at,
      status: STATUS.COMPLETED,
      artifacts: data.map(d => ({
        id: d.id,
        artifactType: d.artifact_type,
        stageId: d.lifecycle_stage,
        createdAt: d.created_at,
        payload: d.artifact_data,
        source: 'cached',
      })),
      filterDecision: null,
      gateResults: [],
      nextStageId: null,
      errors: [],
    };
  }
  return null;
}

/**
 * Load upstream stage artifacts for contract validation.
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {number[]} stageNumbers - Stage numbers to load
 * @returns {Promise<Map<number, Object>>} Map of stage number → artifact payload
 */
async function loadUpstreamArtifacts(supabase, ventureId, stageNumbers) {
  const map = new Map();
  if (stageNumbers.length === 0) return map;

  const { data } = await supabase
    .from('venture_artifacts')
    .select('lifecycle_stage, artifact_data')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', stageNumbers)
    .order('created_at', { ascending: false });

  for (const row of (data || [])) {
    // Keep only the most recent artifact per stage
    if (!map.has(row.lifecycle_stage)) {
      map.set(row.lifecycle_stage, row.artifact_data || {});
    }
  }
  return map;
}

export {
  STATUS,
  FILTER_ACTION,
  ANALYSIS_DEPTH,
  selectAnalysisDepth,
  buildResult,
  mergeArtifactOutputs,
  loadStageTemplate,
  persistArtifacts,
  checkIdempotency,
  loadUpstreamArtifacts,
};
