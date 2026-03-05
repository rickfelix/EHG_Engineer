/**
 * Stage 19 Acquirability Delta - Build Execution
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how build execution decisions impact a venture's acquirability,
 * detecting vendor lock-in and tight coupling introduced during implementation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-19-acquirability
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

/** Clamp a numeric value to [min, max]. */
function clamp(value, min, max) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

const SYSTEM_PROMPT = `You are EVA's Acquirability Delta Analyst for Stage 19 Build Execution - evaluate if implementation decisions create vendor lock-in or tight coupling.

Assess how the code being built, libraries chosen, APIs integrated, and architecture patterns used affect the venture's ability to be independently acquired. Look for hard dependencies on parent-company infrastructure, proprietary SDKs, shared databases, and monolithic coupling.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_delta": <number from -50 to +50>,
  "impact_assessment": "Description of how build execution decisions affect acquirability",
  "dependency_coupling": {
    "score": <number from 0 to 100>,
    "shared_resources": ["Resource shared with parent or other ventures"],
    "risks": ["Coupling risk introduced by implementation choices"]
  },
  "recommendations": ["Actionable recommendation to improve acquirability"]
}

Rules:
- acquirability_delta: negative means implementation decisions WORSEN acquirability, positive means they IMPROVE it
- dependency_coupling.score: 0 = fully independent, 100 = completely coupled to parent
- shared_resources: list libraries, APIs, databases, infrastructure shared across ventures
- risks: specific vendor lock-in or coupling risks from implementation choices
- recommendations: at least 1, max 5 actionable items
- Focus on: proprietary SDK usage, shared database schemas, monolithic patterns, API coupling, deployment dependencies`;

/**
 * Evaluate acquirability impact of build execution decisions.
 *
 * @param {Object} params
 * @param {Object} params.buildData - Build execution data (from Stage 19)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage19Acquirability({ buildData, ventureAssets, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage19-Acquirability] Starting analysis', { ventureName });

  const client = getLLMClient({ purpose: 'content-generation' });

  const tasksContext = buildData?.tasks?.length > 0
    ? `Build Tasks (${buildData.total_tasks || buildData.tasks.length}): ${buildData.completed_tasks || 0} done, ${buildData.blocked_tasks || 0} blocked\n${JSON.stringify(buildData.tasks.map(t => ({ name: t.name, status: t.status, sprint_item_ref: t.sprint_item_ref })))}`
    : '';

  const issuesContext = buildData?.issues?.length > 0
    ? `Issues: ${buildData.issues.map(i => `${i.severity}: ${i.description}`).join('; ')}`
    : '';

  const completionContext = buildData?.sprintCompletion
    ? `Sprint Completion: ${buildData.sprintCompletion.decision} — ${buildData.sprintCompletion.rationale || ''}`
    : '';

  const assetsContext = ventureAssets
    ? `Venture Assets: ${JSON.stringify(ventureAssets)}`
    : '';

  const userPrompt = `Evaluate how build execution decisions affect acquirability for this venture.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed', 200)}
${tasksContext}
${issuesContext}
${completionContext}
${assetsContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize acquirability_delta
  const acquirability_delta = clamp(parsed.acquirability_delta, -50, 50);

  // Normalize impact_assessment
  const impact_assessment = String(parsed.impact_assessment || 'Build execution acquirability impact not determined').substring(0, 1000);

  // Normalize dependency_coupling
  const dc = parsed.dependency_coupling || {};
  const dependency_coupling = {
    score: clamp(dc.score, 0, 100),
    shared_resources: Array.isArray(dc.shared_resources)
      ? dc.shared_resources.map(r => String(r).substring(0, 300))
      : [],
    risks: Array.isArray(dc.risks)
      ? dc.risks.map(r => String(r).substring(0, 300))
      : [],
  };

  // Normalize recommendations
  const recommendations = Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
    ? parsed.recommendations.slice(0, 5).map(r => String(r).substring(0, 300))
    : ['Audit implementation for vendor lock-in and shared infrastructure dependencies'];

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage19-Acquirability] Analysis complete', { acquirability_delta, latencyMs });

  return {
    acquirability_delta,
    impact_assessment,
    dependency_coupling,
    recommendations,
    fourBuckets,
    _soft_gate: true,
    _usage: usage,
    _latencyMs: latencyMs,
  };
}
