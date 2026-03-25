/**
 * PRD Auto-Iterate Quality Loop
 *
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-C
 *
 * Detects thin PRDs (traceability score < threshold) and enriches them
 * deterministically using vision dimensions and architecture decisions.
 * No LLM calls — pulls content directly from eva_vision_documents,
 * eva_architecture_plans, and venture_artifacts.
 *
 * Max 3 iterations. Each must improve score by >= 15 points.
 * Persistent failure flags for chairman review.
 */

const HEAL_TRACEABILITY_THRESHOLD = 0.7;
const MAX_ENRICHMENT_ITERATIONS = 3;
const MIN_IMPROVEMENT_PER_ITERATION = 15;

/**
 * Score a PRD's traceability by counting how many sections reference
 * vision/architecture context. Returns 0-100.
 *
 * @param {Object} prd - PRD row from product_requirements_v2
 * @returns {number} Score 0-100
 */
function scorePRDTraceability(prd) {
  let score = 0;
  const maxScore = 100;

  // Executive summary substance (0-15)
  const summary = prd.executive_summary || '';
  if (summary.length > 200) score += 10;
  if (summary.length > 500) score += 5;

  // Functional requirements count and depth (0-25)
  const frs = Array.isArray(prd.functional_requirements) ? prd.functional_requirements : [];
  score += Math.min(15, frs.length * 3);
  const frsWithAcceptance = frs.filter(f => f.acceptance_criteria || f.acceptance);
  score += Math.min(10, frsWithAcceptance.length * 2);

  // Acceptance criteria (0-15)
  const acs = Array.isArray(prd.acceptance_criteria) ? prd.acceptance_criteria : [];
  score += Math.min(15, acs.length * 3);

  // System architecture substance (0-15)
  const arch = typeof prd.system_architecture === 'string'
    ? prd.system_architecture
    : JSON.stringify(prd.system_architecture || '');
  if (arch.length > 100) score += 8;
  if (arch.length > 300) score += 7;

  // Integration operationalization (0-15)
  const intOp = prd.integration_operationalization;
  if (intOp && typeof intOp === 'object') {
    const filledSections = ['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout']
      .filter(k => intOp[k] && (typeof intOp[k] === 'string' ? intOp[k].length > 10 : true));
    score += filledSections.length * 3;
  }

  // Test scenarios (0-10)
  const tests = Array.isArray(prd.test_scenarios) ? prd.test_scenarios : [];
  score += Math.min(10, tests.length * 3);

  // Risks documented (0-5)
  const risks = Array.isArray(prd.risks) ? prd.risks : [];
  score += Math.min(5, risks.length * 2);

  return Math.min(maxScore, score);
}

/**
 * Fetch vision dimensions and architecture decisions for a venture/SD.
 *
 * @param {Object} supabase
 * @param {string} sdKey
 * @returns {Promise<{visionDimensions: Array, archDimensions: Array, artifactSummaries: Array}>}
 */
async function fetchEnrichmentContext(supabase, sdKey) {
  // Get SD metadata for vision/arch keys
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata, parent_sd_id')
    .eq('sd_key', sdKey)
    .single();

  const visionKey = sd?.metadata?.vision_key || null;
  const archKey = sd?.metadata?.arch_key || null;

  let visionDimensions = [];
  let archDimensions = [];
  let artifactSummaries = [];

  // Pull vision dimensions
  if (visionKey) {
    const { data: visionDoc } = await supabase
      .from('eva_vision_documents')
      .select('extracted_dimensions, content')
      .eq('vision_key', visionKey)
      .single();

    if (visionDoc?.extracted_dimensions) {
      visionDimensions = visionDoc.extracted_dimensions;
    }
  }

  // Pull architecture dimensions
  if (archKey) {
    const { data: archPlan } = await supabase
      .from('eva_architecture_plans')
      .select('extracted_dimensions, content')
      .eq('plan_key', archKey)
      .single();

    if (archPlan?.extracted_dimensions) {
      archDimensions = archPlan.extracted_dimensions;
    }
  }

  // Pull artifact summaries linked to vision/plan keys
  if (visionKey || archKey) {
    let query = supabase
      .from('venture_artifacts')
      .select('artifact_type, title, lifecycle_stage, content')
      .eq('is_current', true)
      .order('lifecycle_stage', { ascending: true })
      .limit(20);

    if (visionKey && archKey) {
      query = query.or(`supports_vision_key.eq.${visionKey},supports_plan_key.eq.${archKey}`);
    } else if (visionKey) {
      query = query.eq('supports_vision_key', visionKey);
    } else {
      query = query.eq('supports_plan_key', archKey);
    }

    const { data: artifacts } = await query;
    if (artifacts) {
      artifactSummaries = artifacts.map(a => ({
        type: a.artifact_type,
        title: a.title,
        stage: a.lifecycle_stage,
        snippet: typeof a.content === 'string'
          ? a.content.substring(0, 200)
          : JSON.stringify(a.content || {}).substring(0, 200),
      }));
    }
  }

  return { visionDimensions, archDimensions, artifactSummaries };
}

/**
 * Deterministic template injection: enrich a PRD using vision/arch context.
 * Returns the updated PRD fields (does not write to DB).
 *
 * @param {Object} prd - Current PRD row
 * @param {Object} context - { visionDimensions, archDimensions, artifactSummaries }
 * @returns {Object} Updated PRD fields to merge
 */
function enrichPRDDeterministic(prd, context) {
  const updates = {};
  const { visionDimensions, archDimensions, artifactSummaries } = context;

  // Enrich acceptance criteria with vision dimension references
  if (visionDimensions.length > 0) {
    const existingACs = Array.isArray(prd.acceptance_criteria) ? [...prd.acceptance_criteria] : [];
    const existingText = existingACs.join(' ').toLowerCase();

    for (const dim of visionDimensions) {
      const dimName = (dim.name || dim.key || '').toLowerCase();
      if (dimName && !existingText.includes(dimName)) {
        existingACs.push(
          `Vision traceability: ${dim.name} dimension addressed (source: ${dim.key || 'vision'})`
        );
      }
    }
    if (existingACs.length > (prd.acceptance_criteria || []).length) {
      updates.acceptance_criteria = existingACs;
    }
  }

  // Enrich functional requirements with architecture decision references
  if (archDimensions.length > 0) {
    const existingFRs = Array.isArray(prd.functional_requirements) ? [...prd.functional_requirements] : [];
    const existingText = existingFRs.map(f => (f.requirement || '')).join(' ').toLowerCase();

    for (const dim of archDimensions) {
      const dimName = (dim.name || dim.key || '').toLowerCase();
      if (dimName && !existingText.includes(dimName)) {
        existingFRs.push({
          id: `FR-ARCH-${existingFRs.length + 1}`,
          priority: 'MEDIUM',
          requirement: `Architecture alignment: implement ${dim.name} as specified in architecture plan (source: ${dim.key || 'arch'})`,
          acceptance_criteria: `${dim.name} implementation matches architecture plan specification`,
        });
      }
    }
    if (existingFRs.length > (prd.functional_requirements || []).length) {
      updates.functional_requirements = existingFRs;
    }
  }

  // Enrich integration_operationalization with artifact evidence
  if (artifactSummaries.length > 0) {
    const intOp = prd.integration_operationalization && typeof prd.integration_operationalization === 'object'
      ? { ...prd.integration_operationalization }
      : {};

    if (!intOp.data_contracts || (typeof intOp.data_contracts === 'string' && intOp.data_contracts.length < 30)) {
      const artifactTypes = [...new Set(artifactSummaries.map(a => a.type))];
      intOp.data_contracts = `Artifact types involved: ${artifactTypes.join(', ')}. ` +
        `${artifactSummaries.length} artifacts linked across stages ${artifactSummaries.map(a => a.stage).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.`;
      updates.integration_operationalization = intOp;
    }
  }

  return updates;
}

/**
 * Auto-iterate PRD quality loop.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sdKey - SD key (e.g., 'SD-XXX-001')
 * @returns {Promise<{improved: boolean, finalScore: number, iterations: number, flaggedForReview: boolean}>}
 */
export async function autoIteratePRDQuality(supabase, sdKey) {
  // Load PRD
  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('sd_id', sdKey)
    .single();

  if (prdErr || !prd) {
    throw new Error(`PRD not found for SD ${sdKey}: ${prdErr?.message || 'no data'}`);
  }

  // Initial score
  let currentScore = scorePRDTraceability(prd);
  const initialScore = currentScore;
  const threshold = HEAL_TRACEABILITY_THRESHOLD * 100;

  console.log(`[prd-auto-iterate] Initial score: ${currentScore}/100 (threshold: ${threshold})`);

  // Already above threshold
  if (currentScore >= threshold) {
    console.log(`[prd-auto-iterate] Score already above threshold, skipping enrichment`);
    return { improved: false, finalScore: currentScore, iterations: 0, flaggedForReview: false };
  }

  // Fetch enrichment context
  const context = await fetchEnrichmentContext(supabase, sdKey);
  const hasContext = context.visionDimensions.length > 0 ||
    context.archDimensions.length > 0 ||
    context.artifactSummaries.length > 0;

  if (!hasContext) {
    console.log(`[prd-auto-iterate] No vision/arch context available for enrichment`);
  }

  const iterations = [];
  let currentPRD = { ...prd };
  let flaggedForReview = false;

  for (let i = 0; i < MAX_ENRICHMENT_ITERATIONS; i++) {
    const iterationStart = Date.now();
    const previousScore = currentScore;

    // Enrich
    const updates = enrichPRDDeterministic(currentPRD, context);
    const fieldCount = Object.keys(updates).length;

    if (fieldCount === 0 && i > 0) {
      console.log(`[prd-auto-iterate] Iteration ${i + 1}: no new enrichments possible, stopping`);
      flaggedForReview = true;
      iterations.push({
        iteration: i + 1,
        beforeScore: previousScore,
        afterScore: currentScore,
        fieldsUpdated: 0,
        reason: 'no_new_enrichments',
        timestamp: new Date().toISOString(),
      });
      break;
    }

    // Apply updates to working copy
    Object.assign(currentPRD, updates);
    currentScore = scorePRDTraceability(currentPRD);

    const improvement = currentScore - previousScore;
    console.log(`[prd-auto-iterate] Iteration ${i + 1}: score ${previousScore} → ${currentScore} (+${improvement}), ${fieldCount} fields updated`);

    iterations.push({
      iteration: i + 1,
      beforeScore: previousScore,
      afterScore: currentScore,
      improvement,
      fieldsUpdated: fieldCount,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - iterationStart,
    });

    // Check if we've reached threshold
    if (currentScore >= threshold) {
      console.log(`[prd-auto-iterate] Threshold reached after ${i + 1} iteration(s)`);
      break;
    }

    // Check improvement threshold
    if (improvement < MIN_IMPROVEMENT_PER_ITERATION) {
      console.log(`[prd-auto-iterate] Improvement ${improvement} < ${MIN_IMPROVEMENT_PER_ITERATION}, stopping early`);
      flaggedForReview = true;
      break;
    }
  }

  // If max iterations exhausted and still below threshold
  if (iterations.length >= MAX_ENRICHMENT_ITERATIONS && currentScore < threshold) {
    flaggedForReview = true;
  }

  // Write updates to database
  const dbUpdates = {};
  if (currentScore > initialScore) {
    // Only persist fields that changed
    for (const key of ['acceptance_criteria', 'functional_requirements', 'integration_operationalization']) {
      if (currentPRD[key] !== prd[key]) {
        dbUpdates[key] = currentPRD[key];
      }
    }
  }

  // Always persist iteration metadata
  const existingMetadata = prd.metadata && typeof prd.metadata === 'object' ? { ...prd.metadata } : {};
  existingMetadata.enrichment_iterations = iterations;
  if (flaggedForReview) {
    existingMetadata.needs_chairman_review = true;
    existingMetadata.chairman_review_reason = currentScore < threshold
      ? 'traceability_below_threshold_after_max_iterations'
      : 'insufficient_improvement_per_iteration';
  }
  dbUpdates.metadata = existingMetadata;

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update(dbUpdates)
    .eq('id', prd.id);

  if (updateErr) {
    console.error(`[prd-auto-iterate] DB update failed: ${updateErr.message}`);
  }

  const improved = currentScore > initialScore;
  console.log(`[prd-auto-iterate] Result: improved=${improved}, score=${initialScore}→${currentScore}, iterations=${iterations.length}, flagged=${flaggedForReview}`);

  return { improved, finalScore: currentScore, iterations: iterations.length, flaggedForReview };
}

export { scorePRDTraceability, fetchEnrichmentContext, enrichPRDDeterministic };
export { HEAL_TRACEABILITY_THRESHOLD, MAX_ENRICHMENT_ITERATIONS, MIN_IMPROVEMENT_PER_ITERATION };
