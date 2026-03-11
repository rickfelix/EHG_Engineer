/**
 * Stage 00 Analysis Step - Acquirability Potential (Soft Gate)
 * Part of SD-VENTURE-ACQUISITIONREADINESS-ARCHITECTURE-ORCH-001-C
 *
 * Evaluates acquirability potential at venture idea synthesis time so
 * exit-readiness signals are captured from day one. This is a soft gate:
 * it NEVER blocks stage progression, only produces advisory scores for
 * downstream stages (especially Stage 09 Exit Strategy).
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-00-acquirability
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';
import { getPrompt } from '../../prompt-loader.js';

const SYSTEM_PROMPT = `You are EVA's Acquirability Assessment Engine. Evaluate the acquirability potential of a venture idea at conception. Your goal is to surface exit-readiness signals early so the venture can be architected for acquirability from day one.

You MUST output valid JSON with exactly this structure:
{
  "acquirability_score": number (0-100, overall acquirability potential),
  "ip_potential": {
    "score": number (0-100),
    "assessment": "string describing IP defensibility, patents, proprietary tech, data moats"
  },
  "market_desirability": {
    "score": number (0-100),
    "assessment": "string describing how attractive this venture is to potential acquirers"
  },
  "separability_signals": {
    "score": number (0-100),
    "assessment": "string describing how easily this venture can be separated from its founders and integrated into an acquirer"
  },
  "key_strengths": ["strength1", "strength2", ...],
  "key_risks": ["risk1", "risk2", ...],
  "recommendations": ["recommendation1", "recommendation2", ...]
}

Rules:
- Evaluate IP potential: proprietary technology, data assets, patents, trade secrets, unique algorithms
- Evaluate market desirability: strategic fit for large acquirers, market consolidation trends, talent acquisition value
- Evaluate separability: founder dependency, operational independence, integration complexity, recurring revenue potential
- key_strengths: 2-5 specific strengths that make this venture acquirable
- key_risks: 2-5 specific risks that could reduce acquirability
- recommendations: 2-5 actionable recommendations to improve acquirability from day one
- Be specific to this venture — do not produce generic assessments
- This is an early-stage evaluation — acknowledge uncertainty but provide directional guidance`;

/**
 * Evaluate acquirability potential of a venture idea at Stage 0.
 *
 * This is a soft gate — it never blocks progression. Results are advisory
 * and feed downstream exit strategy analysis (Stage 09).
 *
 * @param {Object} params
 * @param {Object|string} params.ventureIdea - Raw venture idea text or object from Stage 0
 * @param {string} [params.ventureName] - Optional venture name
 * @param {Object} [params.logger] - Logger instance
 * @returns {Promise<Object>} Acquirability assessment with _soft_gate: true
 */
export async function analyzeStage00Acquirability({ ventureIdea, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage00-Acquirability] Starting analysis', { ventureName });

  if (!ventureIdea) {
    throw new Error('Stage 00 acquirability analysis requires a venture idea');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build venture context from idea (handle both string and object forms)
  const ideaText = typeof ventureIdea === 'string'
    ? ventureIdea
    : JSON.stringify(ventureIdea, null, 2);

  const userPrompt = `Evaluate the acquirability potential of this venture idea.

Venture: ${sanitizeForPrompt(ventureName || 'Unnamed')}
Venture Idea:
${sanitizeForPrompt(ideaText)}

This is a Stage 0 (inception) evaluation — the venture does not yet have financial models, competitive analysis, or detailed architecture. Focus on the inherent acquirability signals present in the idea itself.

Output ONLY valid JSON.`;

  const dbPrompt = await getPrompt('stage-00-acquirability');
  const systemPrompt = dbPrompt || SYSTEM_PROMPT;

  const response = await client.complete(systemPrompt + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Track LLM fallback fields
  let llmFallbackCount = 0;

  // Normalize acquirability_score
  if (parsed.acquirability_score == null) llmFallbackCount++;
  const acquirability_score = clamp(parsed.acquirability_score, 0, 100, logger, 'acquirability_score');

  // Normalize ip_potential
  const rawIp = parsed.ip_potential || {};
  if (!parsed.ip_potential) llmFallbackCount++;
  const ip_potential = {
    score: clamp(rawIp.score, 0, 100, logger, 'ip_potential.score'),
    assessment: String(rawIp.assessment || 'No IP assessment available'),
  };

  // Normalize market_desirability
  const rawMarket = parsed.market_desirability || {};
  if (!parsed.market_desirability) llmFallbackCount++;
  const market_desirability = {
    score: clamp(rawMarket.score, 0, 100, logger, 'market_desirability.score'),
    assessment: String(rawMarket.assessment || 'No market desirability assessment available'),
  };

  // Normalize separability_signals
  const rawSeparability = parsed.separability_signals || {};
  if (!parsed.separability_signals) llmFallbackCount++;
  const separability_signals = {
    score: clamp(rawSeparability.score, 0, 100, logger, 'separability_signals.score'),
    assessment: String(rawSeparability.assessment || 'No separability assessment available'),
  };

  // Normalize arrays
  if (!Array.isArray(parsed.key_strengths) || parsed.key_strengths.length === 0) llmFallbackCount++;
  const key_strengths = Array.isArray(parsed.key_strengths) && parsed.key_strengths.length > 0
    ? parsed.key_strengths.map(s => String(s).substring(0, 500))
    : ['Early-stage — strengths to be determined'];

  if (!Array.isArray(parsed.key_risks) || parsed.key_risks.length === 0) llmFallbackCount++;
  const key_risks = Array.isArray(parsed.key_risks) && parsed.key_risks.length > 0
    ? parsed.key_risks.map(r => String(r).substring(0, 500))
    : ['Early-stage — risks to be determined'];

  if (!Array.isArray(parsed.recommendations) || parsed.recommendations.length === 0) llmFallbackCount++;
  const recommendations = Array.isArray(parsed.recommendations) && parsed.recommendations.length > 0
    ? parsed.recommendations.map(r => String(r).substring(0, 500))
    : ['Develop IP strategy early to maximize acquirability'];

  if (llmFallbackCount > 0) {
    logger.warn('[Stage00-Acquirability] LLM fallback fields detected', { llmFallbackCount });
  }

  const _latencyMs = Date.now() - startTime;
  logger.log('[Stage00-Acquirability] Analysis complete', { duration: _latencyMs, acquirability_score, llmFallbackCount });

  return {
    acquirability_score,
    ip_potential,
    market_desirability,
    separability_signals,
    key_strengths,
    key_risks,
    recommendations,
    fourBuckets,
    llmFallbackCount,
    _usage: usage,
    _latencyMs,
    _soft_gate: true,
  };
}

function clamp(val, min, max, logger, fieldName) {
  const n = Number(val);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN coerced to ${min}`, { original: val });
    return min;
  }
  const clamped = Math.max(min, Math.min(max, Math.round(n)));
  if (clamped !== Math.round(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: ${n} clamped to [${min},${max}] → ${clamped}`, { original: val });
  }
  return clamped;
}
