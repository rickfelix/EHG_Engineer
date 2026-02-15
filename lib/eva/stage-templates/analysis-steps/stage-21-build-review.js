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
import { parseJSON } from '../../utils/parse-json.js';

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
 *
 * @param {Object} params
 * @param {Object} params.stage20Data - QA assessment
 * @param {Object} [params.stage19Data] - Build execution
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Build review with integration results and decision
 */
export async function analyzeStage21({ stage20Data, stage19Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage21] Starting analysis', { ventureName });
  if (!stage20Data) {
    throw new Error('Stage 21 build review requires Stage 20 (QA) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const qaContext = stage20Data.qualityDecision
    ? `QA Decision: ${stage20Data.qualityDecision.decision} — Pass rate: ${stage20Data.overallPassRate}%, Coverage: ${stage20Data.coveragePct}%`
    : '';

  const defectsContext = stage20Data.knownDefects?.length > 0
    ? `Defects: ${stage20Data.knownDefects.map(d => `${d.severity}: ${d.description}`).join('; ')}`
    : '';

  const tasksContext = stage19Data?.tasks
    ? `Build tasks: ${stage19Data.tasks.map(t => `${t.name} (${t.status})`).join(', ')}`
    : '';

  const userPrompt = `Generate a build review and integration assessment for this venture.

Venture: ${ventureName || 'Unnamed'}
${qaContext}
${defectsContext}
${tasksContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

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

  // Compute derived fields
  const totalIntegrations = integrations.length;
  const passingIntegrations = integrations.filter(ig => ig.status === 'pass').length;
  const failingIntegrations = integrations
    .filter(ig => ig.status === 'fail')
    .map(ig => ({ name: ig.name, source: ig.source, target: ig.target, errorMessage: ig.errorMessage }));
  const passRate = totalIntegrations > 0
    ? Math.round((passingIntegrations / totalIntegrations) * 10000) / 100
    : 0;
  const allPassing = failingIntegrations.length === 0 && totalIntegrations > 0;

  // Normalize review decision
  const rd = parsed.reviewDecision || {};
  const hasCriticalFailure = integrations.some(ig => ig.status === 'fail' && ig.severity === 'critical');

  let decision;
  if (REVIEW_DECISIONS.includes(rd.decision)) {
    decision = rd.decision;
  } else if (allPassing) {
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
    rationale: String(rd.rationale || `Review: ${decision} — ${passingIntegrations}/${totalIntegrations} integrations passing`).substring(0, 500),
    conditions,
  };

  logger.log('[Stage21] Analysis complete', { duration: Date.now() - startTime });
  return {
    integrations,
    reviewDecision,
    totalIntegrations,
    passingIntegrations,
    failingIntegrations,
    passRate,
    allPassing,
  };
}


export { INTEGRATION_STATUSES, SEVERITY_LEVELS, ENVIRONMENTS, REVIEW_DECISIONS };
