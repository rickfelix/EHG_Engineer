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

import { writeArtifactBatch } from './artifact-persistence-service.js';

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
    if (art.payload && typeof art.payload === 'object') {
      // Spread all payload fields into output for contract validation.
      // Later fields override earlier ones; explicit description from payload
      // overrides the ventureContext.name fallback above.
      Object.assign(output, art.payload);
    }
  }
  return output;
}

async function loadStageTemplate(supabase, stageId) {
  // Try DB-based templates first (future: venture_stage_templates table)
  try {
    const { data } = await supabase
      .from('venture_stage_templates')
      .select('template_data')
      .eq('lifecycle_stage', stageId)
      .eq('is_active', true)
      .single();
    if (data?.template_data) return data.template_data;
  } catch {
    // Table may not exist yet — fall through to JS templates
  }

  // Fallback: wrap the JS template's analysisStep into the analysisSteps array
  const { getTemplate } = await import('./stage-templates/index.js');
  const jsTemplate = getTemplate(stageId);

  if (jsTemplate?.analysisStep) {
    return {
      stageId,
      version: jsTemplate.version || '1.0.0',
      analysisSteps: [{
        id: jsTemplate.id || `stage-${String(stageId).padStart(2, '0')}`,
        artifactType: null, // orchestrator uses requiredArtifacts from lifecycle_stage_config
        execute: async (ctx) => {
          // Fetch upstream artifacts for the analysis step
          const { fetchUpstreamArtifacts } = await import('./stage-execution-engine.js');
          const { CROSS_STAGE_DEPS } = await import('./contracts/stage-contracts.js');

          let requiredStages = CROSS_STAGE_DEPS[stageId] || [];
          if (requiredStages.length === 0 && stageId > 1) requiredStages = [stageId - 1];

          const ventureId = ctx.ventureContext?.id;
          const upstreamData = await fetchUpstreamArtifacts(supabase, ventureId, requiredStages);

          // Stage 1: load synthesis from venture metadata if no Stage 0 artifact
          if (stageId === 1 && !upstreamData.synthesis) {
            const { data: venture } = await supabase
              .from('ventures')
              .select('metadata')
              .eq('id', ventureId)
              .single();
            if (venture?.metadata?.stage_zero) {
              upstreamData.synthesis = venture.metadata.stage_zero;
            }
          }

          // Execute the JS template's analysisStep with merged context
          const result = await jsTemplate.analysisStep({
            ...upstreamData,
            ...ctx, // hookContext (templateContext, recommendations, etc.)
            logger: console,
            ventureName: ctx.ventureContext?.name || ventureId,
            supabase,
            ventureId,
          });

          return {
            artifactType: null,
            payload: result,
            source: jsTemplate.id || `stage-${stageId}`,
            usage: result?.usage,
          };
        },
      }],
    };
  }

  // No template available at all
  return { stageId, version: '1.0.0', analysisSteps: [] };
}

async function persistArtifacts(supabase, ventureId, stageId, artifacts, idempotencyKey) {
  // Delegated to unified artifact-persistence-service (SD-EVA-INFRA-UNIFIED-PERSIST-SVC-001)
  return writeArtifactBatch(supabase, ventureId, stageId, artifacts, idempotencyKey);
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
    .select('lifecycle_stage, artifact_type, artifact_data')
    .eq('venture_id', ventureId)
    .eq('is_current', true)
    .in('lifecycle_stage', stageNumbers)
    .neq('artifact_type', 'devils_advocate_review')
    .order('created_at', { ascending: true });

  for (const row of (data || [])) {
    const payload = row.artifact_data;
    if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0)) continue;

    if (!map.has(row.lifecycle_stage)) {
      map.set(row.lifecycle_stage, { ...payload });
    } else {
      const existing = map.get(row.lifecycle_stage);
      const merged = { ...existing, ...payload };
      if (typeof payload === 'object' && typeof existing === 'object') {
        const collisions = Object.keys(payload).filter(k => k in existing && existing[k] !== payload[k]);
        if (collisions.length > 0) {
          console.warn(`[loadUpstreamArtifacts] Stage ${row.lifecycle_stage}: field collision on [${collisions.join(', ')}] — newer artifact wins`);
        }
      }
      map.set(row.lifecycle_stage, merged);
    }
  }
  return map;
}

/**
 * Extract multi-artifact sections from merged stage output.
 *
 * For stages with multiple required_artifacts in lifecycle_stage_config,
 * splits LLM output by ## headings and maps sections to artifact types.
 * Falls back gracefully: returns empty array if extraction cannot match
 * all required types — caller should keep the original single artifact.
 *
 * @param {Object|string} stageOutput - Merged stage output
 * @param {string[]} requiredArtifacts - Artifact types from lifecycle_stage_config
 * @param {number} stageId - Current stage number
 * @returns {Array} Extracted artifacts array (one per matched type)
 */
function extractMultiArtifacts(stageOutput, requiredArtifacts, stageId) {
  const content = typeof stageOutput === 'string'
    ? stageOutput
    : stageOutput.description || stageOutput.content || JSON.stringify(stageOutput);

  // Split by ## headings
  const parts = content.split(/^## /m);
  const sections = {};
  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split('\n');
    const heading = lines[0].trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const body = lines.slice(1).join('\n').trim();
    if (heading && body) {
      sections[heading] = body;
    }
  }

  // Map required artifacts to extracted sections
  const result = [];
  for (const artifactType of requiredArtifacts) {
    const normalized = artifactType.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let matched = null;

    for (const [heading, body] of Object.entries(sections)) {
      if (heading.includes(normalized) || normalized.includes(heading)) {
        matched = body;
        break;
      }
    }

    if (matched) {
      result.push({
        artifactType,
        stageId,
        createdAt: new Date().toISOString(),
        payload: { content: matched, extractedFrom: 'section' },
        source: 'eva-orchestrator-extraction',
      });
    }
  }

  return result;
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
  extractMultiArtifacts,
};
