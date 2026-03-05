/**
 * Stage 22 Acquirability Delta - Release Readiness
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how release infrastructure and deployment decisions
 * affect a venture's acquirability, assessing whether the venture
 * can operate independently post-acquisition.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-22-acquirability
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

const SYSTEM_PROMPT = `You are EVA's Acquirability Delta Analyst for Stage 22 Release Readiness - evaluate if release infrastructure supports independent venture operation.

Assess how the release pipeline, deployment configuration, infrastructure ownership, and operational readiness affect the venture's ability to operate independently after acquisition. Acquirers need confidence that the venture can ship, deploy, and operate without the parent company's infrastructure.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_delta": <number from -50 to +50>,
  "impact_assessment": "Description of how release readiness affects acquirability",
  "dependency_coupling": {
    "score": <number from 0 to 100>,
    "shared_resources": ["Shared release or deployment infrastructure"],
    "risks": ["Release infrastructure risks that affect acquirability"]
  },
  "recommendations": ["Actionable recommendation to improve acquirability"]
}

Rules:
- acquirability_delta: negative means release dependencies WORSEN acquirability, positive means independent ops IMPROVE it
- dependency_coupling.score: 0 = fully independent release pipeline, 100 = completely dependent on parent deployment infrastructure
- shared_resources: list shared CI/CD, hosting, DNS, monitoring, secrets management, or operational tooling
- risks: deployment dependencies that would break if the venture were carved out
- recommendations: at least 1, max 5 actionable items
- Focus on: CI/CD independence, hosting portability, DNS ownership, monitoring isolation, secrets management, operational runbooks, SLA ownership`;

/**
 * Evaluate acquirability impact of release readiness and deployment infrastructure.
 *
 * @param {Object} params
 * @param {Object} params.releaseData - Release readiness data (from Stage 22)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage22Acquirability({ releaseData, ventureAssets, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage22-Acquirability] Starting analysis', { ventureName });

  const client = getLLMClient({ purpose: 'content-generation' });

  const releaseContext = releaseData?.releaseDecision
    ? `Release Decision: ${releaseData.releaseDecision.decision} — ${releaseData.releaseDecision.rationale || ''}`
    : '';

  const itemsContext = releaseData?.release_items?.length > 0
    ? `Release Items (${releaseData.total_items || releaseData.release_items.length}): ${releaseData.approved_items || 0} approved, all_approved: ${releaseData.all_approved || false}\n${JSON.stringify(releaseData.release_items.map(ri => ({ name: ri.name, category: ri.category, status: ri.status })))}`
    : '';

  const summaryContext = releaseData?.sprintSummary
    ? `Sprint Summary: ${releaseData.sprintSummary.itemsCompleted || 0}/${releaseData.sprintSummary.itemsPlanned || 0} items completed, Quality: ${releaseData.sprintSummary.qualityAssessment || 'N/A'}, Integration: ${releaseData.sprintSummary.integrationStatus || 'N/A'}`
    : '';

  const promotionContext = releaseData?.promotion_gate
    ? `Promotion Gate: ${releaseData.promotion_gate.promoted ? 'PROMOTED' : 'NOT PROMOTED'} (score: ${releaseData.promotion_gate.score || 'N/A'})`
    : '';

  const assetsContext = ventureAssets
    ? `Venture Assets: ${JSON.stringify(ventureAssets)}`
    : '';

  const userPrompt = `Evaluate how release readiness and deployment infrastructure affect acquirability for this venture.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed', 200)}
${releaseContext}
${itemsContext}
${summaryContext}
${promotionContext}
${assetsContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize acquirability_delta
  const acquirability_delta = clamp(parsed.acquirability_delta, -50, 50);

  // Normalize impact_assessment
  const impact_assessment = String(parsed.impact_assessment || 'Release readiness acquirability impact not determined').substring(0, 1000);

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
    : ['Ensure release pipeline can operate independently of parent infrastructure'];

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage22-Acquirability] Analysis complete', { acquirability_delta, latencyMs });

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
