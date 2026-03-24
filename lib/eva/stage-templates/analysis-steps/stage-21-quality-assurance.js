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

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { getContract } from '../../contracts/financial-contract.js';

// NOTE: These constants intentionally duplicated from stage-20.js
// to avoid circular dependency — stage-20.js imports analyzeStage20 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const QUALITY_DECISIONS = ['pass', 'conditional_pass', 'fail'];
const TEST_SUITE_TYPES = ['unit', 'integration', 'e2e'];
const DEFECT_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEFECT_STATUSES = ['open', 'investigating', 'resolved', 'deferred', 'wont_fix'];
const MIN_PASS_RATE = 95;
const MIN_COVERAGE_PCT = 60;

const SYSTEM_PROMPT = `You are EVA's Quality Assurance Analyst. Generate a QA assessment based on build execution results, including test suite analysis and a quality gate decision.

You MUST output valid JSON with exactly this structure:
{
  "testSuites": [
    {
      "name": "Test suite name",
      "type": "unit|integration|e2e",
      "totalTests": 50,
      "passingTests": 48,
      "coveragePct": 85,
      "taskRefs": ["Task name this suite covers"]
    }
  ],
  "knownDefects": [
    {
      "description": "Defect description",
      "severity": "critical|high|medium|low",
      "status": "open|investigating|resolved|deferred|wont_fix",
      "testSuiteRef": "Which test suite found this"
    }
  ],
  "qualityDecision": {
    "decision": "pass|conditional_pass|fail",
    "rationale": "2-3 sentence quality assessment"
  }
}

Rules:
- Generate at least 1 test suite
- Test suite type must be one of: unit, integration, e2e
- passingTests <= totalTests, coveragePct 0-100
- qualityDecision.decision: "pass" if pass rate >= ${MIN_PASS_RATE}% AND coverage >= ${MIN_COVERAGE_PCT}%, "conditional_pass" if close to thresholds, "fail" if well below
- taskRefs should reference tasks from Stage 19 build execution
- Defects should be actionable with clear severity
- testSuiteRef links defects to the discovering test suite`;

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
        logger.log('[Stage20] Using real QA data from SD completion rates', {
          overall_pass_rate: realData.overall_pass_rate,
          quality_gate_passed: realData.quality_gate_passed,
        });
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage20] Real QA data query failed, falling back to LLM', { error: err.message });
    }
  }

  logger.log('[Stage21] No real data found, using LLM synthesis');
  const client = getLLMClient({ purpose: 'content-generation' });

  const tasksContext = stage20Data.tasks
    ? `Tasks (${stage20Data.total_tasks}): ${stage20Data.completed_tasks} done, ${stage20Data.blocked_tasks} blocked`
    : '';

  const issuesContext = stage20Data.issues?.length > 0
    ? `Known issues: ${stage20Data.issues.map(i => `${i.severity}: ${i.description}`).join('; ')}`
    : '';

  const sprintContext = stage19Data?.sprint_goal
    ? `Sprint goal: ${stage19Data.sprint_goal}`
    : '';

  const userPrompt = `Generate a QA assessment for this venture's build sprint.

Venture: ${ventureName || 'Unnamed'}
${tasksContext}
${issuesContext}
${sprintContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize test suites
  let testSuites = Array.isArray(parsed.testSuites)
    ? parsed.testSuites.filter(ts => ts?.name)
    : [];

  if (testSuites.length === 0) {
    testSuites = [{
      name: 'Core Test Suite',
      type: 'unit',
      totalTests: 0,
      passingTests: 0,
      coveragePct: 0,
      taskRefs: [],
    }];
  } else {
    testSuites = testSuites.map(ts => {
      const totalTests = typeof ts.totalTests === 'number' && ts.totalTests >= 0 ? Math.round(ts.totalTests) : 0;
      const passingTests = typeof ts.passingTests === 'number' && ts.passingTests >= 0
        ? Math.min(Math.round(ts.passingTests), totalTests)
        : 0;
      const coveragePct = typeof ts.coveragePct === 'number'
        ? Math.min(100, Math.max(0, Math.round(ts.coveragePct * 100) / 100))
        : 0;
      return {
        name: String(ts.name).substring(0, 200),
        type: TEST_SUITE_TYPES.includes(ts.type) ? ts.type : 'unit',
        totalTests,
        passingTests,
        coveragePct,
        taskRefs: Array.isArray(ts.taskRefs) ? ts.taskRefs.map(r => String(r).substring(0, 200)) : [],
      };
    });
  }

  // Normalize known defects
  const knownDefects = Array.isArray(parsed.knownDefects)
    ? parsed.knownDefects.filter(d => d?.description).map(d => ({
        description: String(d.description).substring(0, 500),
        severity: DEFECT_SEVERITIES.includes(d.severity) ? d.severity : 'medium',
        status: DEFECT_STATUSES.includes(d.status) ? d.status : 'open',
        testSuiteRef: d.testSuiteRef ? String(d.testSuiteRef).substring(0, 200) : null,
      }))
    : [];

  // Compute derived metrics
  const totalTests = testSuites.reduce((sum, ts) => sum + ts.totalTests, 0);
  const totalPassing = testSuites.reduce((sum, ts) => sum + ts.passingTests, 0);
  const overallPassRate = totalTests > 0 ? Math.round((totalPassing / totalTests) * 10000) / 100 : 0;
  const totalFailures = totalTests - totalPassing;

  const weightedCoverage = testSuites.length > 0
    ? Math.round(testSuites.reduce((sum, ts) => sum + ts.coveragePct, 0) / testSuites.length * 100) / 100
    : 0;

  // Normalize quality decision
  const qd = parsed.qualityDecision || {};
  let decision;
  if (QUALITY_DECISIONS.includes(qd.decision)) {
    decision = qd.decision;
  } else if (overallPassRate >= MIN_PASS_RATE && weightedCoverage >= MIN_COVERAGE_PCT) {
    decision = 'pass';
  } else if (overallPassRate >= MIN_PASS_RATE * 0.9 || weightedCoverage >= MIN_COVERAGE_PCT * 0.9) {
    decision = 'conditional_pass';
  } else {
    decision = 'fail';
  }

  const qualityDecision = {
    decision,
    rationale: String(qd.rationale || `Quality: ${overallPassRate}% pass rate, ${weightedCoverage}% coverage`).substring(0, 500),
  };

  // Transform to template schema field names (snake_case)
  const test_suites = testSuites.map(ts => ({
    name: ts.name,
    type: ts.type,
    total_tests: ts.totalTests,
    passing_tests: ts.passingTests,
    coverage_pct: ts.coveragePct,
  }));

  const known_defects = knownDefects.map(d => ({
    description: d.description,
    severity: d.severity,
    status: d.status,
  }));

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  const total_tests = totalTests;
  const total_passing = totalPassing;
  const overall_pass_rate = overallPassRate;
  const coverage_pct = weightedCoverage;
  const critical_failures = totalFailures;
  const quality_gate_passed = overall_pass_rate === 100 && coverage_pct >= MIN_COVERAGE_PCT;

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.testSuites) || parsed.testSuites.length === 0) llmFallbackCount++;
  for (const ts of parsed.testSuites || []) {
    if (!TEST_SUITE_TYPES.includes(ts?.type)) llmFallbackCount++;
    if (typeof ts?.totalTests !== 'number') llmFallbackCount++;
  }
  for (const d of parsed.knownDefects || []) {
    if (!DEFECT_SEVERITIES.includes(d?.severity)) llmFallbackCount++;
    if (!DEFECT_STATUSES.includes(d?.status)) llmFallbackCount++;
  }
  if (!QUALITY_DECISIONS.includes(qd.decision)) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage20] LLM fallback fields detected', { llmFallbackCount });
  }

  // Attach financial contract context for QA cost reference
  let financialContract = null;
  if (ventureName) {
    try {
      financialContract = await getContract(ventureName);
    } catch (_) { /* non-blocking */ }
  }

  logger.log('[Stage20] Analysis complete', { duration: Date.now() - startTime });
  return {
    test_suites,
    known_defects,
    qualityDecision,
    overall_pass_rate,
    coverage_pct,
    critical_failures,
    totalFailures,
    total_tests,
    total_passing,
    quality_gate_passed,
    financialContract: financialContract ? { capitalRequired: financialContract.capital_required } : null,
    llmFallbackCount,
    fourBuckets, usage,
  };
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

  // Determine quality decision
  let decision;
  if (passRate >= MIN_PASS_RATE && coveragePct >= MIN_COVERAGE_PCT) {
    decision = 'pass';
  } else if (passRate >= MIN_PASS_RATE * 0.9) {
    decision = 'conditional_pass';
  } else {
    decision = 'fail';
  }

  return {
    test_suites,
    known_defects,
    qualityDecision: {
      decision,
      rationale: `Real data: ${completedTasks}/${totalTasks} SDs completed (${passRate}% pass rate)`,
    },
    overall_pass_rate: passRate,
    coverage_pct: coveragePct,
    critical_failures: failedTasks,
    totalFailures: failedTasks,
    total_tests: totalTasks,
    total_passing: completedTasks,
    quality_gate_passed: passRate === 100 && coveragePct >= MIN_COVERAGE_PCT,
    financialContract: null,
    llmFallbackCount: 0,
    fourBuckets: null,
    usage: null,
    dataSource: 'venture_stage_work',
  };
}


export { QUALITY_DECISIONS, TEST_SUITE_TYPES, DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_PASS_RATE, MIN_COVERAGE_PCT };
