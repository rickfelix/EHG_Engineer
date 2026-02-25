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
 *
 * @param {Object} params
 * @param {Object} params.stage19Data - Build execution progress
 * @param {Object} [params.stage18Data] - Sprint plan (for item context)
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} QA assessment with quality decision
 */
export async function analyzeStage20({ stage19Data, stage18Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage20] Starting analysis', { ventureName });
  if (!stage19Data) {
    throw new Error('Stage 20 QA requires Stage 19 (build execution) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const tasksContext = stage19Data.tasks
    ? `Tasks (${stage19Data.totalTasks}): ${stage19Data.completedTasks} done, ${stage19Data.blockedTasks} blocked`
    : '';

  const issuesContext = stage19Data.issues?.length > 0
    ? `Known issues: ${stage19Data.issues.map(i => `${i.severity}: ${i.description}`).join('; ')}`
    : '';

  const sprintContext = stage18Data?.sprintGoal
    ? `Sprint goal: ${stage18Data.sprintGoal}`
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

  logger.log('[Stage20] Analysis complete', { duration: Date.now() - startTime });
  return {
    testSuites,
    knownDefects,
    qualityDecision,
    overallPassRate,
    coveragePct: weightedCoverage,
    totalTests,
    totalFailures,
    totalDefects: knownDefects.length,
    openDefects: knownDefects.filter(d => d.status === 'open').length,
    fourBuckets, usage,
  };
}


export { QUALITY_DECISIONS, TEST_SUITE_TYPES, DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_PASS_RATE, MIN_COVERAGE_PCT };
