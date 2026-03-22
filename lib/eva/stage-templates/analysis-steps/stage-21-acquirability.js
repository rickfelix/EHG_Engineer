/**
 * Stage 20 Acquirability Delta - Quality Assurance
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * SOFT-GATE: Advisory only, never blocks stage progression.
 * Evaluates how quality assurance outcomes impact a venture's acquirability,
 * detecting quality gaps that reduce the venture's standalone value.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-20-acquirability
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

const SYSTEM_PROMPT = `You are EVA's Acquirability Delta Analyst for Stage 20 Quality Assurance - evaluate if test coverage and quality gaps affect acquirability value.

Assess how test coverage, defect rates, quality gate outcomes, and QA practices affect the venture's attractiveness to acquirers. Acquirers perform due diligence on code quality — low coverage, unresolved defects, and missing test infrastructure reduce valuation and increase integration risk.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_delta": <number from -50 to +50>,
  "impact_assessment": "Description of how quality assurance outcomes affect acquirability",
  "dependency_coupling": {
    "score": <number from 0 to 100>,
    "shared_resources": ["Shared QA infrastructure or test environments"],
    "risks": ["Quality risks that affect acquirability"]
  },
  "recommendations": ["Actionable recommendation to improve acquirability"]
}

Rules:
- acquirability_delta: negative means quality gaps WORSEN acquirability, positive means strong quality IMPROVES it
- dependency_coupling.score: 0 = fully independent QA, 100 = completely dependent on parent QA infrastructure
- shared_resources: list shared test environments, CI/CD pipelines, QA teams, or test data
- risks: quality gaps that would concern an acquirer during due diligence
- recommendations: at least 1, max 5 actionable items
- Focus on: test coverage adequacy, defect severity, QA infrastructure independence, documentation quality, regression risk`;

/**
 * Evaluate acquirability impact of quality assurance outcomes.
 *
 * @param {Object} params
 * @param {Object} params.qaData - Quality assurance data (from Stage 20)
 * @param {Object} [params.ventureAssets] - Existing venture asset inventory
 * @param {string} [params.ventureName] - Name of the venture
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability delta result with _soft_gate flag
 */
export async function analyzeStage20Acquirability({ qaData, ventureAssets, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage20-Acquirability] Starting analysis', { ventureName });

  const client = getLLMClient({ purpose: 'content-generation' });

  const qualityContext = qaData?.qualityDecision
    ? `QA Decision: ${qaData.qualityDecision.decision} — Pass rate: ${qaData.overall_pass_rate || 0}%, Coverage: ${qaData.coverage_pct || 0}%`
    : '';

  const suitesContext = qaData?.test_suites?.length > 0
    ? `Test Suites (${qaData.test_suites.length}): ${JSON.stringify(qaData.test_suites.map(ts => ({ name: ts.name, type: ts.type, total_tests: ts.total_tests, passing_tests: ts.passing_tests, coverage_pct: ts.coverage_pct })))}`
    : '';

  const defectsContext = qaData?.known_defects?.length > 0
    ? `Known Defects (${qaData.known_defects.length}): ${qaData.known_defects.map(d => `${d.severity}: ${d.description}`).join('; ')}`
    : '';

  const assetsContext = ventureAssets
    ? `Venture Assets: ${JSON.stringify(ventureAssets)}`
    : '';

  const userPrompt = `Evaluate how quality assurance outcomes affect acquirability for this venture.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed', 200)}
${qualityContext}
${suitesContext}
${defectsContext}
${assetsContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize acquirability_delta
  const acquirability_delta = clamp(parsed.acquirability_delta, -50, 50);

  // Normalize impact_assessment
  const impact_assessment = String(parsed.impact_assessment || 'Quality assurance acquirability impact not determined').substring(0, 1000);

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
    : ['Improve test coverage and resolve critical defects to strengthen acquirability'];

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage20-Acquirability] Analysis complete', { acquirability_delta, latencyMs });

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
