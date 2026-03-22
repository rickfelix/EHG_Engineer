/**
 * Stage 21 Acquirability Delta - Build Review
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how build review outcomes and technical debt affect
 * a venture's acquirability, assessing architecture quality for
 * independent operation.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-21-acquirability
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

const SYSTEM_PROMPT = `You are EVA's Acquirability Delta Analyst for Stage 21 Build Review - evaluate if technical debt and architecture decisions affect acquirability.

Assess how code review findings, integration test results, technical debt levels, and architecture quality affect the venture's attractiveness to acquirers. Acquirers evaluate code maintainability, architectural cleanliness, and integration complexity during due diligence. High technical debt and tightly coupled integrations reduce acquisition value.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_delta": <number from -50 to +50>,
  "impact_assessment": "Description of how build review findings affect acquirability",
  "dependency_coupling": {
    "score": <number from 0 to 100>,
    "shared_resources": ["Shared integration points or infrastructure"],
    "risks": ["Technical debt or architecture risks that affect acquirability"]
  },
  "recommendations": ["Actionable recommendation to improve acquirability"]
}

Rules:
- acquirability_delta: negative means review findings WORSEN acquirability, positive means clean architecture IMPROVES it
- dependency_coupling.score: 0 = fully independent architecture, 100 = completely entangled with parent systems
- shared_resources: list shared integration points, APIs, microservices, or infrastructure
- risks: technical debt, architectural anti-patterns, or coupling that would concern acquirers
- recommendations: at least 1, max 5 actionable items
- Focus on: code maintainability, integration complexity, architectural boundaries, technical debt severity, separation of concerns`;

/**
 * Evaluate acquirability impact of build review and technical debt.
 *
 * @param {Object} params
 * @param {Object} params.reviewData - Build review data (from Stage 21)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage21Acquirability({ reviewData, ventureAssets, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage21-Acquirability] Starting analysis', { ventureName });

  const client = getLLMClient({ purpose: 'content-generation' });

  const reviewContext = reviewData?.reviewDecision
    ? `Review Decision: ${reviewData.reviewDecision.decision} — ${reviewData.reviewDecision.rationale || ''}`
    : '';

  const integrationsContext = reviewData?.integrations?.length > 0
    ? `Integrations (${reviewData.total_integrations || reviewData.integrations.length}): ${reviewData.passing_integrations || 0} passing, ${reviewData.failing_integrations?.length || 0} failing\n${JSON.stringify(reviewData.integrations.map(ig => ({ name: ig.name, source: ig.source, target: ig.target, status: ig.status, severity: ig.severity })))}`
    : '';

  const conditionsContext = reviewData?.reviewDecision?.conditions?.length > 0
    ? `Conditions: ${reviewData.reviewDecision.conditions.join('; ')}`
    : '';

  const assetsContext = ventureAssets
    ? `Venture Assets: ${JSON.stringify(ventureAssets)}`
    : '';

  const userPrompt = `Evaluate how build review findings and architecture decisions affect acquirability for this venture.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed', 200)}
${reviewContext}
${integrationsContext}
${conditionsContext}
${assetsContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize acquirability_delta
  const acquirability_delta = clamp(parsed.acquirability_delta, -50, 50);

  // Normalize impact_assessment
  const impact_assessment = String(parsed.impact_assessment || 'Build review acquirability impact not determined').substring(0, 1000);

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
    : ['Address technical debt and tighten architectural boundaries to improve acquirability'];

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage21-Acquirability] Analysis complete', { acquirability_delta, latencyMs });

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
