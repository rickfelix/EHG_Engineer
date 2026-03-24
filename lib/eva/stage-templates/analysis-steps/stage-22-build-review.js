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

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

// NOTE: These constants intentionally duplicated from stage-21.js
// to avoid circular dependency — stage-21.js imports analyzeStage21 from this file,
// and SYSTEM_PROMPT uses these constants at module-level evaluation.
const INTEGRATION_STATUSES = ['pass', 'fail', 'skip', 'pending'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const ENVIRONMENTS = ['development', 'staging', 'production'];
const REVIEW_DECISIONS = ['approve', 'conditional', 'reject'];

const SYSTEM_PROMPT = `You are EVA's Build Review and Integration Testing Analyst. Assess integration health and provide a technical review decision based on QA results and cross-system integration points.

You MUST output valid JSON with exactly this structure:
{
  "integrations": [
    {
      "name": "Integration point name",
      "source": "Source system or component",
      "target": "Target system or component",
      "status": "pass|fail|skip|pending",
      "severity": "critical|high|medium|low",
      "environment": "development|staging|production",
      "errorMessage": null
    }
  ],
  "reviewDecision": {
    "decision": "approve|conditional|reject",
    "rationale": "2-3 sentence review assessment",
    "conditions": ["Condition to meet (only if conditional)"]
  }
}

Rules:
- Generate at least 1 integration test result
- Each integration must specify source, target, status, severity, and environment
- errorMessage is only set for "fail" status integrations
- reviewDecision.decision: "approve" if all integrations pass, "conditional" if non-critical failures exist, "reject" if critical integrations fail
- conditions array is required if decision is "conditional", empty otherwise
- severity reflects business impact: critical integrations block release, others are advisory
- environment indicates where the test was run`;

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
        logger.log('[Stage21] Using real integration data from upstream stages');
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage21] Real data derivation failed, falling back to LLM', { error: err.message });
    }
  }

  logger.log('[Stage22] No real data found, using LLM synthesis');
  const client = getLLMClient({ purpose: 'content-generation' });

  const qaContext = stage21Data.qualityDecision
    ? `QA Decision: ${stage21Data.qualityDecision.decision} — Pass rate: ${stage21Data.overall_pass_rate}%, Coverage: ${stage21Data.coverage_pct}%`
    : '';

  const defectsContext = stage21Data.known_defects?.length > 0
    ? `Defects: ${stage21Data.known_defects.map(d => `${d.severity}: ${d.description}`).join('; ')}`
    : '';

  const tasksContext = stage20Data?.tasks
    ? `Build tasks: ${stage20Data.tasks.map(t => `${t.name} (${t.status})`).join(', ')}`
    : '';

  const userPrompt = `Generate a build review and integration assessment for this venture.

Venture: ${ventureName || 'Unnamed'}
${qaContext}
${defectsContext}
${tasksContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize integrations
  let integrations = Array.isArray(parsed.integrations)
    ? parsed.integrations.filter(ig => ig?.name)
    : [];

  if (integrations.length === 0) {
    integrations = [{
      name: 'Core System Integration',
      source: 'Application',
      target: 'External Services',
      status: 'pending',
      severity: 'high',
      environment: 'development',
      errorMessage: null,
    }];
  } else {
    integrations = integrations.map(ig => ({
      name: String(ig.name).substring(0, 200),
      source: String(ig.source || 'Unknown').substring(0, 200),
      target: String(ig.target || 'Unknown').substring(0, 200),
      status: INTEGRATION_STATUSES.includes(ig.status) ? ig.status : 'pending',
      severity: SEVERITY_LEVELS.includes(ig.severity) ? ig.severity : 'medium',
      environment: ENVIRONMENTS.includes(ig.environment) ? ig.environment : 'development',
      errorMessage: ig.status === 'fail' && ig.errorMessage
        ? String(ig.errorMessage).substring(0, 500)
        : null,
    }));
  }

  // Compute derived fields (these live in computeDerived but that path is dead code when analysisStep exists)
  const total_integrations = integrations.length;
  const passing_integrations = integrations.filter(ig => ig.status === 'pass').length;
  const failing_integrations = integrations
    .filter(ig => ig.status === 'fail')
    .map(ig => ({ name: ig.name, source: ig.source, target: ig.target, error_message: ig.errorMessage || null }));
  const pass_rate = total_integrations > 0
    ? Math.round((passing_integrations / total_integrations) * 10000) / 100
    : 0;
  const all_passing = failing_integrations.length === 0 && total_integrations > 0;

  // Normalize review decision
  const rd = parsed.reviewDecision || {};
  const hasCriticalFailure = integrations.some(ig => ig.status === 'fail' && ig.severity === 'critical');

  let decision;
  if (REVIEW_DECISIONS.includes(rd.decision)) {
    decision = rd.decision;
  } else if (all_passing) {
    decision = 'approve';
  } else if (hasCriticalFailure) {
    decision = 'reject';
  } else {
    decision = 'conditional';
  }

  const conditions = decision === 'conditional' && Array.isArray(rd.conditions)
    ? rd.conditions.map(c => String(c).substring(0, 300))
    : [];

  const reviewDecision = {
    decision,
    rationale: String(rd.rationale || `Review: ${decision} — ${passing_integrations}/${total_integrations} integrations passing`).substring(0, 500),
    conditions,
  };

  // Determine environment from majority of integration environments
  const envCounts = {};
  for (const ig of integrations) {
    envCounts[ig.environment] = (envCounts[ig.environment] || 0) + 1;
  }
  const environment = Object.entries(envCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'development';

  // Track LLM fallback fields
  let llmFallbackCount = 0;
  if (!Array.isArray(parsed.integrations) || parsed.integrations.length === 0) llmFallbackCount++;
  for (const ig of parsed.integrations || []) {
    if (!INTEGRATION_STATUSES.includes(ig?.status)) llmFallbackCount++;
  }
  if (!REVIEW_DECISIONS.includes(rd.decision)) llmFallbackCount++;
  if (llmFallbackCount > 0) {
    logger.warn('[Stage21] LLM fallback fields detected', { llmFallbackCount });
  }

  logger.log('[Stage21] Analysis complete', { duration: Date.now() - startTime });
  return {
    integrations,
    environment,
    reviewDecision,
    total_integrations,
    passing_integrations,
    failing_integrations,
    pass_rate,
    all_passing,
    llmFallbackCount,
    fourBuckets, usage,
  };
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

  logger.log('[Stage21] Built real integration data', {
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
