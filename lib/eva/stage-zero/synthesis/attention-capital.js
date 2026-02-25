/**
 * Synthesis Component 13: Attention Capital Analysis
 *
 * Evaluates venture candidates for organic attention sustainability across 5 sub-dimensions:
 * - Organic Search Momentum (OSM, 25%): Unpaid search interest and growth trajectory
 * - Engagement Depth (ED, 25%): Quality and persistence of user engagement
 * - Earned Media Ratio (EMR, 20%): Organic vs paid media coverage balance
 * - Advocacy Signal (AS, 15%): User-generated endorsements and word-of-mouth
 * - Return Engagement (RE, 15%): Repeat visitor and retention patterns
 *
 * Governance Bands:
 * - AC-Low (0-24): Weak organic attention, relies on paid channels
 * - AC-Moderate (25-49): Some organic traction, not yet self-sustaining
 * - AC-High (50-74): Strong organic attention with durable signals
 * - AC-Strong (75-100): Self-sustaining attention with compounding effects
 *
 * Ships as ADVISORY signal only — not folded into weighted composite score.
 *
 * Part of SD-LEO-FEAT-ATTENTION-CAPITAL-SYNTHESIS-001
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const AC_WEIGHTS = {
  organic_search_momentum: 0.25,
  engagement_depth: 0.25,
  earned_media_ratio: 0.20,
  advocacy_signal: 0.15,
  return_engagement: 0.15,
};

const ATTENTION_BANDS = [
  { min: 0, max: 24, band: 'AC-Low', interpretation: 'Weak organic attention, relies on paid channels' },
  { min: 25, max: 49, band: 'AC-Moderate', interpretation: 'Some organic traction, not yet self-sustaining' },
  { min: 50, max: 74, band: 'AC-High', interpretation: 'Strong organic attention with durable signals' },
  { min: 75, max: 100, band: 'AC-Strong', interpretation: 'Self-sustaining attention with compounding effects' },
];

/**
 * Analyze attention capital for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Attention capital analysis result
 */
export async function analyzeAttentionCapital(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Analyzing attention capital...');

  const prompt = `You are an EHG attention capital analyst. Evaluate whether this venture can sustain organic attention without relying on paid acquisition or manufactured hype.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG Chairman Directives:
- Organic attention is the most durable competitive advantage
- Ventures that require constant paid acquisition are structurally fragile
- Look for signals of genuine user interest vs manufactured demand
- Attention capital compounds — early organic signals predict long-term sustainability

Evaluate across 5 sub-dimensions (each scored 0-100):

1. Organic Search Momentum (OSM, weight: 25%): Is there unpaid search interest growing around this problem space?
   - 0-24: No meaningful organic search demand
   - 25-49: Some search interest but not growing
   - 50-74: Growing organic search demand with clear intent
   - 75-100: Strong, accelerating organic search momentum

2. Engagement Depth (ED, weight: 25%): Would users engage deeply and persistently with this solution?
   - 0-24: Shallow, one-time engagement expected
   - 25-49: Some repeat usage but easily replaceable
   - 50-74: Deep engagement with habit-forming potential
   - 75-100: High-frequency, high-duration engagement patterns

3. Earned Media Ratio (EMR, weight: 20%): Can this venture earn media coverage organically?
   - 0-24: Would require almost entirely paid media
   - 25-49: Some earned media potential but mostly paid
   - 50-74: Strong earned media potential from novelty or impact
   - 75-100: Naturally newsworthy, media seeks the story

4. Advocacy Signal (AS, weight: 15%): Would users recommend this without incentives?
   - 0-24: Low likelihood of organic advocacy
   - 25-49: Some word-of-mouth but not viral
   - 50-74: Strong advocacy potential, users become champions
   - 75-100: Users actively evangelize without prompting

5. Return Engagement (RE, weight: 15%): Would users come back repeatedly on their own?
   - 0-24: One-time or infrequent use expected
   - 25-49: Occasional return visits
   - 50-74: Regular return engagement with clear triggers
   - 75-100: Daily/weekly habitual return patterns

Return JSON:
{
  "organic_search_momentum": 45,
  "engagement_depth": 60,
  "earned_media_ratio": 35,
  "advocacy_signal": 50,
  "return_engagement": 55,
  "confidence": 0.7,
  "confidence_caveat": "string (acknowledge LLM training data may affect scoring)",
  "summary": "string (2-3 sentences assessing overall attention capital)"
}`;

  try {
    const response = await client.complete('', prompt, { max_tokens: 1500, timeout: 120000 });
    const usage = extractUsage(response);
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const components = {
        organic_search_momentum: clamp(analysis.organic_search_momentum ?? 0, 0, 100),
        engagement_depth: clamp(analysis.engagement_depth ?? 0, 0, 100),
        earned_media_ratio: clamp(analysis.earned_media_ratio ?? 0, 0, 100),
        advocacy_signal: clamp(analysis.advocacy_signal ?? 0, 0, 100),
        return_engagement: clamp(analysis.return_engagement ?? 0, 0, 100),
      };
      const acScore = calculateAttentionCapitalScore(components);
      const band = classifyAttentionBand(acScore);

      return {
        component: 'attention_capital',
        ac_score: acScore,
        ac_band: band.band,
        ac_interpretation: band.interpretation,
        component_scores: components,
        confidence: clamp(analysis.confidence ?? 0.5, 0, 1),
        confidence_caveat: analysis.confidence_caveat || 'LLM training data may affect scoring — attention capital proxies are inferred, not measured.',
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultAttentionCapitalResult('Could not parse attention capital analysis');
  } catch (err) {
    logger.warn(`   Warning: Attention capital analysis failed: ${err.message}`);
    return defaultAttentionCapitalResult(`Analysis failed: ${err.message}`);
  }
}

/**
 * Calculate attention capital composite score from sub-dimensions.
 *
 * Weights: OSM=25%, ED=25%, EMR=20%, AS=15%, RE=15%
 *
 * @param {Object} components - Sub-dimension scores (each 0-100)
 * @returns {number} Composite AC score 0-100
 */
export function calculateAttentionCapitalScore(components) {
  if (!components) return 0;

  return Math.round(
    clamp(components.organic_search_momentum ?? 0, 0, 100) * AC_WEIGHTS.organic_search_momentum +
    clamp(components.engagement_depth ?? 0, 0, 100) * AC_WEIGHTS.engagement_depth +
    clamp(components.earned_media_ratio ?? 0, 0, 100) * AC_WEIGHTS.earned_media_ratio +
    clamp(components.advocacy_signal ?? 0, 0, 100) * AC_WEIGHTS.advocacy_signal +
    clamp(components.return_engagement ?? 0, 0, 100) * AC_WEIGHTS.return_engagement
  );
}

/**
 * Classify AC score into governance band.
 *
 * @param {number} acScore - Composite AC score 0-100
 * @returns {Object} Band object with { band, interpretation }
 */
export function classifyAttentionBand(acScore) {
  const score = clamp(Math.round(acScore), 0, 100);
  for (const band of ATTENTION_BANDS) {
    if (score >= band.min && score <= band.max) {
      return { band: band.band, interpretation: band.interpretation };
    }
  }
  return { band: 'AC-Strong', interpretation: 'Self-sustaining attention with compounding effects' };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultAttentionCapitalResult(summary) {
  return {
    component: 'attention_capital',
    ac_score: 0,
    ac_band: 'AC-Unknown',
    ac_interpretation: 'Analysis unavailable',
    component_scores: {
      organic_search_momentum: 0,
      engagement_depth: 0,
      earned_media_ratio: 0,
      advocacy_signal: 0,
      return_engagement: 0,
    },
    confidence: 0,
    confidence_caveat: 'LLM analysis unavailable — attention capital could not be assessed.',
    summary,
  };
}

export { AC_WEIGHTS, ATTENTION_BANDS };
