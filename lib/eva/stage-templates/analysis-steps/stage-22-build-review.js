/**
 * Stage 21 Analysis Step - Build Review (Integration Testing)
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stage 20 QA results and generates integration testing
 * assessment with review decision and environment-specific analysis.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-21-build-review
 */


// NOTE: These constants intentionally duplicated from stage-22.js
// to avoid circular dependency — stage-22.js imports analyzeStage22 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const INTEGRATION_STATUSES = ['pass', 'fail', 'skip', 'pending'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const ENVIRONMENTS = ['development', 'staging', 'production'];
const REVIEW_DECISIONS = ['approve', 'conditional', 'reject'];

/**
 * Generate build review from QA and integration data.
 * When real data exists upstream (Stage 19/20 used venture_stage_work),
 * derives integration results from actual SD handoff data.
 * Falls back to LLM synthesis when no real data found.
 *
 * @param {Object} params
 * @param {Object} params.stage21Data - QA assessment
 * @param {Object} [params.stage20Data] - Build execution
 * @param {string} [params.ventureName]
 * @param {Object} [params.supabase] - Supabase client for real data queries
 * @param {string} [params.ventureId] - Venture UUID for real data queries
 * @returns {Promise<Object>} Build review with integration results and decision
 */
export async function analyzeStage22({ stage21Data, stage20Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage22] Starting build review analysis', { ventureName });
  if (!stage21Data) {
    throw new Error('Stage 22 build review requires Stage 21 (Quality Assurance) data');
  }

  // Use real data path if upstream stages used real data
  if (stage21Data.dataSource === 'venture_stage_work' && stage20Data?.dataSource === 'venture_stage_work') {
    try {
      const realData = buildRealIntegrationData(stage20Data, stage21Data, logger);
      if (realData) {
        logger.log('[Stage22] Using real integration data from upstream stages');
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage22] Real data derivation failed, falling back to LLM', { error: err.message });
    }
  }

  throw new Error(
    `[Stage22] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


/**
 * Build integration data from real upstream stage data (no LLM).
 * Maps Stage 19 tasks to integration points and derives review decision
 * algorithmically from Stage 20 QA results.
 *
 * @param {Object} stage19Data - Build execution data with dataSource: 'venture_stage_work'
 * @param {Object} stage20Data - QA data with dataSource: 'venture_stage_work'
 * @param {Object} logger
 * @returns {Object|null} Stage 21 output or null if data insufficient
 */
function buildRealIntegrationData(stage19Data, stage20Data, logger) {
  const tasks = stage19Data.tasks || [];
  if (tasks.length === 0) return null;

  // Map each task to an integration point
  const integrations = tasks.map(t => {
    const isFailing = t.status === 'blocked';
    const isPassing = t.status === 'done';
    return {
      name: `${t.name} Integration`,
      source: t.sprint_item_ref || t.name,
      target: 'Build Pipeline',
      status: isPassing ? 'pass' : isFailing ? 'fail' : 'pending',
      severity: isFailing ? 'high' : 'medium',
      environment: 'development',
      errorMessage: isFailing ? `Task blocked: ${t.name}` : null,
    };
  });

  const total_integrations = integrations.length;
  const passing_integrations = integrations.filter(ig => ig.status === 'pass').length;
  const failing_integrations = integrations
    .filter(ig => ig.status === 'fail')
    .map(ig => ({ name: ig.name, source: ig.source, target: ig.target, error_message: ig.errorMessage || null }));
  const pass_rate = total_integrations > 0
    ? Math.round((passing_integrations / total_integrations) * 10000) / 100
    : 0;
  const all_passing = failing_integrations.length === 0 && total_integrations > 0;

  // Derive review decision from QA quality gate + integration results
  const hasCriticalFailure = integrations.some(ig => ig.status === 'fail' && ig.severity === 'critical');
  const qaDecision = stage20Data.qualityDecision?.decision;

  let decision;
  if (hasCriticalFailure || qaDecision === 'fail') {
    decision = 'reject';
  } else if (all_passing && qaDecision === 'pass') {
    decision = 'approve';
  } else {
    decision = 'conditional';
  }

  const conditions = decision === 'conditional'
    ? failing_integrations.map(f => `Resolve: ${f.name}`)
    : [];

  logger.log('[Stage22] Built real integration data', {
    total_integrations,
    passing_integrations,
    decision,
  });

  return {
    integrations,
    environment: 'development',
    reviewDecision: {
      decision,
      rationale: `Real data: ${passing_integrations}/${total_integrations} integrations passing, QA: ${qaDecision}`,
      conditions,
    },
    total_integrations,
    passing_integrations,
    failing_integrations,
    pass_rate,
    all_passing,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { INTEGRATION_STATUSES, SEVERITY_LEVELS, ENVIRONMENTS, REVIEW_DECISIONS };
