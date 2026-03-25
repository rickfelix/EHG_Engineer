/**
 * PRD Auto-Iterate Quality Loop
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-C
 *
 * Detects thin PRDs via scoring, enriches them deterministically
 * by injecting vision dimensions and architecture decisions,
 * re-scores, and repeats up to MAX_ITERATIONS times.
 *
 * No LLM calls — all enrichment is template-based.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const MAX_ITERATIONS = 3;
const QUALITY_THRESHOLD = 70;
const MIN_SCORE_IMPROVEMENT = 15;
const ENRICHMENT_MARKER = '__auto_enriched__';

/**
 * Get or create a Supabase client
 */
function getSupabase(injected) {
  if (injected) return injected;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Score a PRD's quality based on field completeness and depth.
 * Deterministic — no LLM calls.
 *
 * @param {Object} prd - PRD record from product_requirements_v2
 * @returns {number} Score 0-100
 */
export function scorePRDQuality(prd) {
  let score = 0;
  const maxScore = 100;

  // Executive summary (10 pts)
  const summary = prd.executive_summary || '';
  if (summary.length > 50) score += 10;
  else if (summary.length > 20) score += 5;

  // Functional requirements (20 pts)
  const fr = parseJsonField(prd.functional_requirements);
  if (Array.isArray(fr) && fr.length >= 5) score += 20;
  else if (Array.isArray(fr) && fr.length >= 3) score += 12;
  else if (Array.isArray(fr) && fr.length >= 1) score += 5;

  // System architecture (15 pts)
  const arch = parseJsonField(prd.system_architecture);
  if (arch && typeof arch === 'object') {
    if (arch.components?.length >= 2) score += 10;
    else if (arch.overview) score += 5;
    if (arch.data_flow || arch.overview?.length > 100) score += 5;
  }

  // Acceptance criteria (15 pts)
  const ac = parseJsonField(prd.acceptance_criteria);
  if (Array.isArray(ac) && ac.length >= 5) score += 15;
  else if (Array.isArray(ac) && ac.length >= 3) score += 10;
  else if (Array.isArray(ac) && ac.length >= 1) score += 5;

  // Test scenarios (15 pts)
  const ts = parseJsonField(prd.test_scenarios);
  if (Array.isArray(ts) && ts.length >= 3) score += 15;
  else if (Array.isArray(ts) && ts.length >= 1) score += 8;

  // Implementation approach (10 pts)
  const impl = prd.implementation_approach || '';
  if (impl.length > 100) score += 10;
  else if (impl.length > 30) score += 5;

  // Risks (10 pts)
  const risks = parseJsonField(prd.risks);
  if (Array.isArray(risks) && risks.length >= 2) score += 10;
  else if (Array.isArray(risks) && risks.length >= 1) score += 5;

  // Vision/arch traceability bonus (5 pts)
  const fr_text = JSON.stringify(fr || []);
  if (fr_text.includes('Vision:') || fr_text.includes('vision_dimension')) score += 5;

  return Math.min(score, maxScore);
}

/**
 * Enrich a PRD with vision dimensions and architecture decisions.
 * Deterministic — uses template injection, no LLM.
 *
 * @param {Object} prd - Current PRD record
 * @param {Array} visionDims - Vision dimensions [{key, name, weight, description}]
 * @param {Array} archDims - Architecture dimensions [{key, name, weight, description}]
 * @param {number} iteration - Current iteration number (1-3)
 * @returns {Object} Enriched PRD fields to update
 */
export function enrichPRDFromDimensions(prd, visionDims, archDims, iteration) {
  const updates = {};

  // Check for enrichment marker to prevent duplicate injection
  const metadata = prd.metadata || {};
  const enrichedIterations = metadata[ENRICHMENT_MARKER] || [];
  if (enrichedIterations.includes(iteration)) {
    return {}; // Already enriched for this iteration — idempotent
  }

  // Iteration 1: Inject vision dimensions into functional_requirements
  if (iteration === 1 && visionDims.length > 0) {
    const existingFR = parseJsonField(prd.functional_requirements) || [];
    const visionFRs = visionDims
      .filter(dim => !JSON.stringify(existingFR).includes(dim.name))
      .map((dim, i) => ({
        id: `FR-V${String(i + 1).padStart(2, '0')}`,
        title: `Vision: ${dim.name}`,
        description: `Align implementation with vision dimension "${dim.name}": ${dim.description || 'No description'}. Weight: ${dim.weight || 'unspecified'}.`,
        priority: dim.weight >= 0.15 ? 'critical' : 'medium',
        source: 'auto_enrichment_v1',
        traceability: 'vision_dimension'
      }));
    if (visionFRs.length > 0) {
      updates.functional_requirements = JSON.stringify([...existingFR, ...visionFRs]);
    }
  }

  // Iteration 1-2: Inject architecture decisions into system_architecture
  if (iteration <= 2 && archDims.length > 0) {
    const existingArch = parseJsonField(prd.system_architecture) || {};
    const archText = JSON.stringify(existingArch);
    const newDecisions = archDims
      .filter(dim => !archText.includes(dim.name))
      .map(dim => ({
        dimension: dim.name,
        description: dim.description || '',
        weight: dim.weight || 0,
        source: 'auto_enrichment_v1'
      }));
    if (newDecisions.length > 0) {
      updates.system_architecture = JSON.stringify({
        ...existingArch,
        architecture_dimensions: [
          ...(existingArch.architecture_dimensions || []),
          ...newDecisions
        ]
      });
    }
  }

  // Iteration 2-3: Inject acceptance criteria from dimensions
  if (iteration >= 2) {
    const existingAC = parseJsonField(prd.acceptance_criteria) || [];
    const acText = JSON.stringify(existingAC);
    const allDims = [...visionDims, ...archDims];
    const newAC = allDims
      .filter(dim => !acText.includes(dim.name))
      .map(dim => `${dim.name} dimension coverage verified (weight: ${dim.weight || 'unspecified'})`);
    if (newAC.length > 0) {
      updates.acceptance_criteria = JSON.stringify([...existingAC, ...newAC]);
    }
  }

  // Track enrichment in metadata
  updates.metadata = {
    ...metadata,
    [ENRICHMENT_MARKER]: [...enrichedIterations, iteration],
    auto_iterate_last_iteration: iteration,
    auto_iterate_timestamp: new Date().toISOString()
  };

  return updates;
}

/**
 * Run the auto-iterate quality loop for a PRD.
 *
 * @param {string} sdKey - Strategic Directive key
 * @param {Object} [options] - Options
 * @param {Object} [options.supabase] - Supabase client override
 * @param {Object} [options.logger] - Logger (defaults to console)
 * @returns {Promise<Object>} { improved, finalScore, iterations, exhausted }
 */
export async function autoIteratePRDQuality(sdKey, options = {}) {
  const supabase = getSupabase(options.supabase);
  const logger = options.logger || console;

  // Load PRD
  const { data: prd, error: prdErr } = await supabase
    .from('product_requirements_v2')
    .select('*')
    .eq('directive_id', sdKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prdErr || !prd) {
    logger.warn(`[PRDAutoIterate] No PRD found for ${sdKey}`);
    return { improved: false, finalScore: 0, iterations: 0, exhausted: false, error: 'NO_PRD' };
  }

  // Initial score
  let currentScore = scorePRDQuality(prd);
  logger.log(`[PRDAutoIterate] Initial score for ${sdKey}: ${currentScore}/100`);

  if (currentScore >= QUALITY_THRESHOLD) {
    logger.log(`[PRDAutoIterate] Score ${currentScore} >= ${QUALITY_THRESHOLD} — no enrichment needed`);
    return { improved: false, finalScore: currentScore, iterations: 0, exhausted: false };
  }

  // Load vision and architecture dimensions from SD metadata
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('metadata')
    .eq('sd_key', sdKey)
    .single();

  const visionKey = sd?.metadata?.vision_key;
  const archKey = sd?.metadata?.plan_key;

  let visionDims = [];
  let archDims = [];

  if (visionKey) {
    const { data: visionDoc } = await supabase
      .from('eva_vision_documents')
      .select('extracted_dimensions')
      .eq('vision_key', visionKey)
      .single();
    visionDims = visionDoc?.extracted_dimensions || [];
  }

  if (archKey) {
    const { data: archPlan } = await supabase
      .from('eva_architecture_plans')
      .select('extracted_dimensions')
      .eq('plan_key', archKey)
      .single();
    archDims = archPlan?.extracted_dimensions || [];
  }

  if (visionDims.length === 0 && archDims.length === 0) {
    logger.warn(`[PRDAutoIterate] No vision/arch dimensions found for ${sdKey} — skipping enrichment`);
    return { improved: false, finalScore: currentScore, iterations: 0, exhausted: false, error: 'NO_DIMENSIONS' };
  }

  // Iterate
  let currentPrd = { ...prd };
  let iterations = 0;
  const scoreHistory = [currentScore];

  for (let i = 1; i <= MAX_ITERATIONS; i++) {
    iterations = i;
    const updates = enrichPRDFromDimensions(currentPrd, visionDims, archDims, i);

    if (Object.keys(updates).length <= 1) {
      // Only metadata updated, no actual enrichment
      logger.log(`[PRDAutoIterate] Iteration ${i}: no new content to inject`);
      break;
    }

    // Apply updates to in-memory PRD
    currentPrd = { ...currentPrd, ...updates };
    const newScore = scorePRDQuality(currentPrd);
    const improvement = newScore - currentScore;
    scoreHistory.push(newScore);

    logger.log(`[PRDAutoIterate] Iteration ${i}: score ${currentScore} → ${newScore} (${improvement >= 0 ? '+' : ''}${improvement})`);
    currentScore = newScore;

    if (currentScore >= QUALITY_THRESHOLD) {
      logger.log(`[PRDAutoIterate] Threshold reached at iteration ${i}`);
      break;
    }
  }

  // Persist enriched PRD
  const finalUpdates = {
    functional_requirements: currentPrd.functional_requirements,
    system_architecture: currentPrd.system_architecture,
    acceptance_criteria: currentPrd.acceptance_criteria,
    metadata: currentPrd.metadata
  };

  // If still below threshold after max iterations, flag for chairman
  const exhausted = currentScore < QUALITY_THRESHOLD && iterations >= MAX_ITERATIONS;
  if (exhausted) {
    finalUpdates.metadata = {
      ...finalUpdates.metadata,
      auto_iterate_exhausted: true,
      auto_iterate_final_score: currentScore,
      auto_iterate_score_history: scoreHistory
    };
    logger.warn(`[PRDAutoIterate] Exhausted ${MAX_ITERATIONS} iterations for ${sdKey}. Final score: ${currentScore}. Flagged for chairman review.`);
  }

  const { error: updateErr } = await supabase
    .from('product_requirements_v2')
    .update(finalUpdates)
    .eq('id', prd.id);

  if (updateErr) {
    logger.error(`[PRDAutoIterate] Failed to persist enriched PRD: ${updateErr.message}`);
    return { improved: false, finalScore: currentScore, iterations, exhausted, error: updateErr.message };
  }

  const improved = currentScore > scoreHistory[0];
  logger.log(`[PRDAutoIterate] Complete. Score: ${scoreHistory[0]} → ${currentScore} over ${iterations} iteration(s). Improved: ${improved}. Exhausted: ${exhausted}.`);

  return { improved, finalScore: currentScore, iterations, exhausted, scoreHistory };
}

/**
 * Parse a field that may be JSON string or already an object/array.
 */
function parseJsonField(field) {
  if (!field) return null;
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return null; }
  }
  return field;
}

// CLI entry point
const isMain = process.argv[1] && (
  process.argv[1].endsWith('prd-auto-iterate.js') ||
  process.argv[1].endsWith('prd-auto-iterate.mjs')
);
if (isMain) {
  const sdKey = process.argv[2];
  if (!sdKey) {
    console.error('Usage: node scripts/modules/prd-auto-iterate.js <SD-KEY>');
    process.exit(1);
  }
  autoIteratePRDQuality(sdKey).then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.exhausted ? 2 : 0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
