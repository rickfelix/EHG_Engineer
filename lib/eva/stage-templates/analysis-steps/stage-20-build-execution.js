/**
 * Stage 20 Analysis Step - Build Execution Progress
 * Phase: THE BUILD LOOP (Stages 17-22)
 *
 * Returns real build data from SD completion or build feedback.
 * LLM synthesis is permanently disabled — fabricated progress poisons
 * every downstream stage.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-20-build-execution
 */

const TASK_STATUSES = ['pending', 'in_progress', 'done', 'blocked'];
const ISSUE_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const ISSUE_STATUSES = ['open', 'investigating', 'resolved', 'deferred'];

// QA Gate Thresholds (SD-LEO-INFRA-VENTURE-LEO-BUILD-001-I)
export const PASS_RATE_THRESHOLD = 0.95;
export const COVERAGE_THRESHOLD = 60;

/**
 * Synthesize build execution progress from sprint data.
 * When real data exists in venture_stage_work (written by sd-completed.js),
 * uses that instead of LLM synthesis. Falls back to LLM when no real data found.
 *
 * @param {Object} params
 * @param {Object} params.stage19Data - Sprint plan
 * @param {Object} [params.stage18Data] - Build readiness
 * @param {string} [params.ventureName]
 * @param {Object} [params.supabase] - Supabase client for real data queries
 * @param {string} [params.ventureId] - Venture UUID for real data queries
 * @returns {Promise<Object>} Build execution progress
 */
export async function analyzeStage20({ stage19Data, stage18Data, ventureName, supabase, ventureId, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage20] Starting build execution analysis', { ventureName });
  if (!stage19Data) {
    throw new Error('Stage 20 build execution requires Stage 19 (sprint planning) data');
  }

  // Step 1: Check for real CI/CD build feedback (from build-feedback-collector, SD-D/SD-H)
  if (supabase && ventureId) {
    try {
      const buildQuality = await fetchBuildFeedback(supabase, ventureId, logger);
      if (buildQuality) {
        logger.log('[Stage20] Real build feedback found', {
          passRate: buildQuality.passRate,
          coveragePct: buildQuality.coveragePct,
          gateResult: buildQuality.gateResult,
        });
        // Build feedback enriches real task data or LLM output (attached below)
        // but first check if we also have real task data
        const realData = await fetchRealBuildData(supabase, ventureId, logger);
        if (realData) {
          realData.buildQuality = buildQuality;
          logger.log('[Stage20] Using real task data + build feedback', {
            tasks: realData.tasks.length,
            completion_pct: realData.completion_pct,
          });
          return realData;
        }
        // No task data but have build feedback — still valuable, attach to LLM result later
        // Store for attachment after LLM synthesis below
        stage19Data._buildQuality = buildQuality;
      }
    } catch (err) {
      logger.warn('[Stage20] Build feedback query failed', { error: err.message });
    }
  }

  // Step 2: Try real task data from venture_stage_work (written by sd-completed.js handler)
  if (supabase && ventureId) {
    try {
      const realData = await fetchRealBuildData(supabase, ventureId, logger);
      if (realData) {
        logger.log('[Stage20] Using real data from venture_stage_work', {
          tasks: realData.tasks.length,
          completion_pct: realData.completion_pct,
        });
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage20] Real data query failed, falling back to LLM', { error: err.message });
    }
  }

  // Circuit breaker: verify upstream pipeline produced the expected records.
  // Without these checks, S20 falls through to LLM synthesis and fabricates
  // progress reports on a foundation that doesn't exist.
  if (supabase && ventureId) {
    const missing = [];

    // Check 1: Vision document must exist for this venture (produced by S17 doc-gen)
    try {
      const { data: vision } = await supabase.from('eva_vision_documents')
        .select('vision_key')
        .eq('venture_id', ventureId)
        .limit(1);
      if (!vision || vision.length === 0) {
        missing.push('eva_vision_documents (S17 doc-gen did not produce a vision document)');
      }
    } catch (err) {
      logger.warn('[Stage20] Circuit breaker vision check failed', { error: err.message });
    }

    // Check 2: Architecture plan must exist for this venture (produced by S17 doc-gen)
    try {
      const { data: arch } = await supabase.from('eva_architecture_plans')
        .select('plan_key')
        .eq('venture_id', ventureId)
        .limit(1);
      if (!arch || arch.length === 0) {
        missing.push('eva_architecture_plans (S17 doc-gen did not produce an architecture plan)');
      }
    } catch (err) {
      logger.warn('[Stage20] Circuit breaker arch plan check failed', { error: err.message });
    }

    // Check 3: If S19 produced sd_bridge_payloads, SDs must exist (produced by S19 bridge hook)
    if (stage19Data.sd_bridge_payloads?.length > 0) {
      try {
        const { data: sds } = await supabase.from('strategic_directives_v2')
          .select('sd_key')
          .eq('venture_id', ventureId)
          .limit(1);
        if (!sds || sds.length === 0) {
          missing.push(`strategic_directives_v2 (S19 produced ${stage19Data.sd_bridge_payloads.length} sd_bridge_payloads but lifecycle-sd-bridge created zero SDs)`);
        }
      } catch (err) {
        logger.warn('[Stage20] Circuit breaker SD check failed', { error: err.message });
      }
    }

    if (missing.length > 0) {
      const msg = `[Stage20] CIRCUIT BREAKER: ${missing.length} upstream record(s) missing for venture ${ventureId}. Stage 20 cannot produce meaningful build progress without these foundations. Missing: ${missing.join('; ')}`;
      logger.error(msg);
      throw new Error(msg);
    }
  }

  // No real data — refuse to fabricate. LLM synthesis produces fake tasks,
  // fake assignees, and fake progress that poisons every downstream stage.
  throw new Error(
    `[Stage20] REFUSED: No real build data found for venture ${ventureId || 'unknown'}. ` +
    'LLM synthesis is disabled — Stage 20 requires real SD completion data ' +
    '(from sd-completed.js) or real build feedback (from build-feedback-collector). ' +
    'Check that Stage 19 bridge created SDs and that BUILD_PENDING blocked until they completed.'
  );
}


/**
 * Evaluate real build feedback from advisory_data.build_feedback.
 * Applies QA gate thresholds and returns structured quality assessment.
 * SD-LEO-INFRA-VENTURE-LEO-BUILD-001-I
 *
 * @param {Object} buildFeedback - The build_feedback object from advisory_data
 * @returns {{ passRate: number, coveragePct: number|null, gateResult: string, gateReasons: string[], thresholds: Object, dataSource: string }}
 */
export function evaluateRealBuildData(buildFeedback) {
  const unitTests = buildFeedback.unit_tests;
  const e2eTests = buildFeedback.e2e_tests;
  const coverage = buildFeedback.coverage;

  // Compute combined pass rate from unit + e2e tests
  let totalPassed = 0, totalTests = 0;
  if (unitTests) {
    totalPassed += unitTests.numPassed || 0;
    totalTests += unitTests.numTotal || 0;
  }
  if (e2eTests) {
    totalPassed += e2eTests.numPassed || 0;
    totalTests += e2eTests.numTotal || 0;
  }

  const passRate = totalTests > 0 ? totalPassed / totalTests : null;
  const coveragePct = coverage?.lines ?? null;

  // Apply thresholds
  const gateReasons = [];
  let gateResult = 'PASS';

  if (passRate !== null && passRate < PASS_RATE_THRESHOLD) {
    gateResult = 'FAIL';
    gateReasons.push(`Pass rate ${(passRate * 100).toFixed(1)}% below ${PASS_RATE_THRESHOLD * 100}% threshold`);
  }
  if (coveragePct !== null && coveragePct < COVERAGE_THRESHOLD) {
    gateResult = 'FAIL';
    gateReasons.push(`Coverage ${coveragePct}% below ${COVERAGE_THRESHOLD}% threshold`);
  }
  if (passRate === null && coveragePct === null) {
    gateResult = 'SKIP';
    gateReasons.push('No test or coverage data available in build feedback');
  }

  return {
    passRate: passRate !== null ? Math.round(passRate * 10000) / 100 : null,
    coveragePct,
    totalTests,
    totalPassed,
    gateResult,
    gateReasons,
    thresholds: { passRate: PASS_RATE_THRESHOLD, coverage: COVERAGE_THRESHOLD },
    dataSource: 'build_feedback',
  };
}

/**
 * Fetch build feedback from venture_stage_work stage 20 advisory_data.
 * Written by build-feedback-collector.js (SD-D) or github-artifact-fetcher.js (SD-H).
 * Returns null if no build feedback exists.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} logger
 * @returns {Promise<Object|null>} Build quality evaluation or null
 */
async function fetchBuildFeedback(supabase, ventureId, logger) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 20)
    .maybeSingle();

  if (error) throw error;
  if (!data?.advisory_data?.build_feedback) return null;

  logger.log('[Stage20] Found build_feedback in advisory_data');
  return evaluateRealBuildData(data.advisory_data.build_feedback);
}

/**
 * Fetch real build data from venture_stage_work (written by sd-completed.js).
 * Returns null if no real data exists (pre-bridge ventures).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture UUID
 * @param {Object} logger
 * @returns {Promise<Object|null>} Real build data or null
 */
async function fetchRealBuildData(supabase, ventureId, logger) {
  const { data, error } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status, health_score')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 19)
    .maybeSingle();

  if (error) throw error;
  if (!data?.advisory_data?.tasks?.length) return null;

  const ad = data.advisory_data;
  // Map sd-completed.js task statuses (todo/in_progress/done/blocked)
  // to stage-19 schema statuses (pending/in_progress/done/blocked)
  const tasks = ad.tasks.map(t => ({
    name: String(t.name || '').substring(0, 200),
    description: String(t.description || '').substring(0, 500),
    assignee: String(t.assignee || 'leo-protocol').substring(0, 200),
    status: t.status === 'todo' ? 'pending' : (TASK_STATUSES.includes(t.status) ? t.status : 'pending'),
    sprint_item_ref: String(t.sprint_item_ref || t.name || '').substring(0, 200),
  }));

  const issues = Array.isArray(ad.issues) ? ad.issues.map(i => ({
    description: String(i.description || '').substring(0, 500),
    severity: ISSUE_SEVERITIES.includes(i.severity) ? i.severity : 'medium',
    status: ISSUE_STATUSES.includes(i.status) ? i.status : 'open',
  })) : [];

  const total_tasks = tasks.length;
  const completed_tasks = tasks.filter(t => t.status === 'done').length;
  const blocked_tasks = tasks.filter(t => t.status === 'blocked').length;
  const completion_pct = total_tasks > 0
    ? Math.round((completed_tasks / total_tasks) * 10000) / 100
    : 0;

  const tasks_by_status = {};
  for (const status of TASK_STATUSES) {
    tasks_by_status[status] = tasks.filter(t => t.status === status).length;
  }

  const hasBlockers = blocked_tasks > 0 || issues.some(i => i.severity === 'critical' && i.status === 'open');
  const decision = hasBlockers ? 'blocked' : completed_tasks === total_tasks ? 'complete' : 'continue';

  return {
    tasks,
    issues,
    sprintCompletion: {
      decision,
      readyForQa: completed_tasks > 0 && !hasBlockers,
      rationale: `Real data: ${completed_tasks}/${total_tasks} tasks done (${completion_pct}%)`,
    },
    total_tasks,
    completed_tasks,
    blocked_tasks,
    completion_pct,
    tasks_by_status,
    financialContract: null,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { TASK_STATUSES, ISSUE_SEVERITIES, ISSUE_STATUSES };
