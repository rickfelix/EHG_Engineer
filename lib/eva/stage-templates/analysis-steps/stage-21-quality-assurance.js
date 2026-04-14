/**
 * Stage 20 Analysis Step - Quality Assurance
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stage 19 build execution data and generates QA plan
 * with test suite analysis, defect tracking, and quality decision.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-20-quality-assurance
 */


// NOTE: These constants intentionally duplicated from stage-21.js
// to avoid circular dependency — stage-21.js imports analyzeStage21 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const QUALITY_DECISIONS = ['pass', 'conditional_pass', 'fail'];
const TEST_SUITE_TYPES = ['unit', 'integration', 'e2e'];
const DEFECT_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEFECT_STATUSES = ['open', 'investigating', 'resolved', 'deferred', 'wont_fix'];
const MIN_PASS_RATE = 95;
const MIN_COVERAGE_PCT = 60;

/**
 * Generate QA assessment from build execution data.
 * When real SD completion data exists, derives quality metrics from actual
 * SD outcomes. Falls back to LLM synthesis when no real data found.
 *
 * @param {Object} params
 * @param {Object} params.stage20Data - Build execution progress
 * @param {Object} [params.stage19Data] - Sprint plan (for item context)
 * @param {string} [params.ventureName]
 * @param {Object} [params.supabase] - Supabase client for real data queries
 * @param {string} [params.ventureId] - Venture UUID for real data queries
 * @returns {Promise<Object>} QA assessment with quality decision
 */
export async function analyzeStage21({ stage20Data, stage19Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage21] Starting QA analysis', { ventureName });
  if (!stage20Data) {
    throw new Error('Stage 21 QA requires Stage 20 (build execution) data');
  }

  // Try real QA data from SD completion rates
  if (supabase && ventureId) {
    try {
      const realData = await fetchRealQAData(supabase, ventureId, stage19Data, logger);
      if (realData) {
        logger.log('[Stage21] Using real QA data from SD completion rates', {
          overall_pass_rate: realData.overall_pass_rate,
          quality_gate_passed: realData.quality_gate_passed,
        });
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage21] Real QA data query failed, falling back to LLM', { error: err.message });
    }
  }

  throw new Error(
    `[Stage21] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}


/**
 * Fetch real QA data from SD completion rates in venture_stage_work.
 * Uses the Stage 19 advisory_data (written by sd-completed.js) to derive
 * quality metrics from actual SD outcomes.
 * Returns null if no real data exists (pre-bridge ventures).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} stage19Data - Build execution data (may contain real task data)
 * @param {Object} logger
 * @returns {Promise<Object|null>} Real QA data or null
 */
async function fetchRealQAData(supabase, ventureId, stage19Data, logger) {
  // Only use real data if Stage 19 itself used real data
  if (stage19Data.dataSource !== 'venture_stage_work') return null;

  const { data: stageWork, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (error) throw error;
  if (!stageWork?.advisory_data?.tasks?.length) return null;

  const ad = stageWork.advisory_data;
  const totalTasks = ad.total_tasks || ad.tasks.length;
  const completedTasks = ad.completed_tasks || ad.tasks.filter(t => t.status === 'done').length;
  const blockedTasks = ad.blocked_tasks || ad.tasks.filter(t => t.status === 'blocked').length;
  const failedTasks = blockedTasks;

  // Derive quality metrics from SD completion rates
  const passRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 10000) / 100
    : 0;
  const coveragePct = totalTasks > 0 ? 100 : 0; // All SDs tracked = 100% coverage

  // Build a single test suite from SD results
  const test_suites = [{
    name: 'SD Completion Suite',
    type: 'integration',
    total_tests: totalTasks,
    passing_tests: completedTasks,
    coverage_pct: coveragePct,
  }];

  // Build defects from failed/blocked SDs
  const known_defects = (ad.issues || []).map(i => ({
    description: String(i.description || '').substring(0, 500),
    severity: DEFECT_SEVERITIES.includes(i.severity) ? i.severity : 'medium',
    status: DEFECT_STATUSES.includes(i.status) ? i.status : 'open',
  }));

  // Repo structure analysis (SD-REPLIT-PIPELINE-S20S26-REDESIGN-ORCH-001-B-B)
  // Enhances QC with repo completeness signals from github-repo-analyzer (built by B-A)
  let repoAnalysis = null;
  const repoUrl = ad.repo_url || ad.repoUrl || ad.github_url;
  if (repoUrl) {
    try {
      const { analyzeRepo } = await import('../../../eva/bridge/github-repo-analyzer.js');
      repoAnalysis = await analyzeRepo(repoUrl, { logger });
      logger.log('[Stage21] Repo analysis complete', {
        fileCount: repoAnalysis?.fileCount,
        hasLandingPage: repoAnalysis?.hasLandingPage,
        componentScore: repoAnalysis?.componentScore,
      });
    } catch (err) {
      logger.warn('[Stage21] Repo analysis unavailable, using test metrics only', { error: err.message });
    }
  }

  // Compute repo completeness score (0-100) when analysis available
  const repoCompletenessScore = repoAnalysis
    ? Math.round((
        (repoAnalysis.hasLandingPage ? 25 : 0) +
        (repoAnalysis.hasRoutes ? 25 : 0) +
        Math.min(25, (repoAnalysis.componentCount || 0) * 5) +
        Math.min(25, (repoAnalysis.fileCount || 0) > 10 ? 25 : (repoAnalysis.fileCount || 0) * 2.5)
      ))
    : null;

  // Determine quality decision — factors in repo completeness when available
  const effectivePassRate = repoCompletenessScore !== null
    ? passRate * 0.7 + repoCompletenessScore * 0.3  // 70% test weight, 30% repo weight
    : passRate;

  let decision;
  if (effectivePassRate >= MIN_PASS_RATE && coveragePct >= MIN_COVERAGE_PCT) {
    decision = 'pass';
  } else if (effectivePassRate >= MIN_PASS_RATE * 0.9) {
    decision = 'conditional_pass';
  } else {
    decision = 'fail';
  }

  const rationale = repoCompletenessScore !== null
    ? `Real data: ${completedTasks}/${totalTasks} SDs (${passRate}% pass) + repo completeness ${repoCompletenessScore}% → effective ${Math.round(effectivePassRate)}%`
    : `Real data: ${completedTasks}/${totalTasks} SDs completed (${passRate}% pass rate)`;

  return {
    test_suites,
    known_defects,
    qualityDecision: {
      decision,
      rationale,
    },
    overall_pass_rate: passRate,
    coverage_pct: coveragePct,
    critical_failures: failedTasks,
    totalFailures: failedTasks,
    total_tests: totalTasks,
    total_passing: completedTasks,
    quality_gate_passed: effectivePassRate >= MIN_PASS_RATE && coveragePct >= MIN_COVERAGE_PCT,
    repo_analysis: repoAnalysis ? {
      fileCount: repoAnalysis.fileCount,
      componentCount: repoAnalysis.componentCount,
      hasLandingPage: repoAnalysis.hasLandingPage,
      hasRoutes: repoAnalysis.hasRoutes,
      completenessScore: repoCompletenessScore,
    } : null,
    financialContract: null,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { QUALITY_DECISIONS, TEST_SUITE_TYPES, DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_PASS_RATE, MIN_COVERAGE_PCT };
