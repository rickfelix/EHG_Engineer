/**
 * Stage 18 Acquirability Delta - Sprint Planning
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how sprint planning decisions impact a venture's acquirability,
 * detecting dependency coupling risks introduced by sprint item selection.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-18-acquirability
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

const SYSTEM_PROMPT = `You are EVA's Acquirability Delta Analyst for Stage 18 Sprint Planning - evaluate if sprint items create dependencies that reduce acquirability.

Assess how the selected sprint items, backlog priorities, and planned work affect the venture's ability to be independently acquired. Look for coupling to shared infrastructure, vendor lock-in through sprint commitments, and opportunities to improve separability.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_delta": <number from -50 to +50>,
  "impact_assessment": "Description of how sprint planning decisions affect acquirability",
  "dependency_coupling": {
    "score": <number from 0 to 100>,
    "shared_resources": ["Resource shared with parent or other ventures"],
    "risks": ["Coupling risk introduced by sprint items"]
  },
  "recommendations": ["Actionable recommendation to improve acquirability"]
}

Rules:
- acquirability_delta: negative means sprint decisions WORSEN acquirability, positive means they IMPROVE it
- dependency_coupling.score: 0 = fully independent, 100 = completely coupled to parent
- shared_resources: list infrastructure, APIs, databases, or teams shared across ventures
- risks: specific coupling risks introduced by sprint item choices
- recommendations: at least 1, max 5 actionable items
- Focus on: shared infrastructure dependencies, vendor-specific integrations, team coupling, data isolation`;

/**
 * Evaluate acquirability impact of sprint planning decisions.
 *
 * @param {Object} params
 * @param {Object} params.sprintData - Sprint plan data (from Stage 18)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage18Acquirability({ sprintData, ventureAssets, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage18-Acquirability] Starting analysis', { ventureName });

  const client = getLLMClient({ purpose: 'content-generation' });

  const sprintContext = sprintData?.sprint_goal
    ? `Sprint Goal: ${sanitizeForPrompt(sprintData.sprint_goal, 300)}`
    : '';

  const itemsContext = sprintData?.items?.length > 0
    ? `Sprint Items (${sprintData.items.length}): ${JSON.stringify(sprintData.items.map(i => ({ title: i.title, type: i.type, scope: i.scope, architectureLayer: i.architectureLayer })))}`
    : '';

  const assetsContext = ventureAssets
    ? `Venture Assets: ${JSON.stringify(ventureAssets)}`
    : '';

  const userPrompt = `Evaluate how sprint planning decisions affect acquirability for this venture.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed', 200)}
${sprintContext}
${itemsContext}
${assetsContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize acquirability_delta
  const acquirability_delta = clamp(parsed.acquirability_delta, -50, 50);

  // Normalize impact_assessment
  const impact_assessment = String(parsed.impact_assessment || 'Sprint planning acquirability impact not determined').substring(0, 1000);

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
    : ['Review sprint items for shared infrastructure dependencies'];

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage18-Acquirability] Analysis complete', { acquirability_delta, latencyMs });

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
