/**
 * Synthesis Component 11: Narrative Risk Analysis
 *
 * Evaluates venture candidates for narrative-driven demand risk across 4 sub-dimensions:
 * - Decision Sensitivity (DS, 35%): How badly would this venture suffer if sentiment flipped?
 * - Demand Distortion (DD, 30%): Would customers still want this without the narrative?
 * - Hype-Persistence (HP, 20%): Does attention decay faster than problem relevance?
 * - Influence Exposure (IE, 15%): Presence of coordinated/amplified narratives
 *
 * Governance Bands:
 * - NR-Low (0-24): Structural, durable demand
 * - NR-Moderate (25-49): Watch assumptions
 * - NR-High (50-69): Timing & scope risk
 * - NR-Critical (70-100): Narrative-fragile
 *
 * Ships as ADVISORY signal only — not folded into weighted composite score.
 *
 * Part of SD-LEO-FIX-BRAINSTORM-NARRATIVE-RISK-001
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const NR_WEIGHTS = {
  decision_sensitivity: 0.35,
  demand_distortion: 0.30,
  hype_persistence: 0.20,
  influence_exposure: 0.15,
};

const GOVERNANCE_BANDS = [
  { min: 0, max: 24, band: 'NR-Low', interpretation: 'Structural, durable demand' },
  { min: 25, max: 49, band: 'NR-Moderate', interpretation: 'Watch assumptions' },
  { min: 50, max: 69, band: 'NR-High', interpretation: 'Timing & scope risk' },
  { min: 70, max: 100, band: 'NR-Critical', interpretation: 'Narrative-fragile' },
];

/**
 * Analyze narrative risk for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Narrative risk analysis result
 */
export async function analyzeNarrativeRisk(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Analyzing narrative risk...');

  const prompt = `You are an EHG narrative risk analyst. Evaluate whether the perceived demand driving this venture concept is organic or narrative-manufactured.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG Chairman Directives:
- Distinguish real demand from manufactured perception
- Vulnerability matters more than exposure (how badly does THIS venture break if narrative shifts?)
- Ventures built on hype cycles face inflated TAM, temporary demand spikes, and assumption fragility
- Different venture archetypes have structurally different narrative risk baselines

Evaluate across 4 sub-dimensions (each scored 0-100):

1. Decision Sensitivity (DS, weight: 35%): How badly would this venture suffer if market sentiment flipped?
   - 0-24: Venture solves a structural need regardless of narrative
   - 25-49: Some revenue impact but core value persists
   - 50-69: Significant revenue/adoption risk if narrative shifts
   - 70-100: Venture viability depends on current narrative continuing

2. Demand Distortion (DD, weight: 30%): Would customers still want this without the narrative?
   - 0-24: Demand is structurally driven (regulation, cost savings, pain)
   - 25-49: Some narrative amplification but real underlying need
   - 50-69: Narrative significantly inflates perceived urgency
   - 70-100: Without the narrative, demand would not exist

3. Hype-Persistence (HP, weight: 20%): Does attention decay faster than problem relevance?
   - 0-24: Problem will persist long after media attention fades
   - 25-49: Moderate staying power, some cyclical attention
   - 50-69: Attention is fading but problem partially remains
   - 70-100: Pure hype cycle — attention and problem decay together

4. Influence Exposure (IE, weight: 15%): Presence of coordinated or amplified narratives around this space?
   - 0-24: Minimal media/influencer amplification
   - 25-49: Some amplification but organic voices dominate
   - 50-69: Significant coordinated messaging from vendors/analysts
   - 70-100: Market narrative dominated by coordinated campaigns

Return JSON:
{
  "decision_sensitivity": 45,
  "demand_distortion": 30,
  "hype_persistence": 25,
  "influence_exposure": 35,
  "narrative_flags": ["string (specific narrative risks identified)"],
  "confidence": 0.7,
  "confidence_caveat": "string (acknowledge LLM training data may affect scoring)",
  "summary": "string (2-3 sentences assessing overall narrative risk)"
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });
    const usage = extractUsage(response);

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const components = {
        decision_sensitivity: clamp(analysis.decision_sensitivity ?? 50, 0, 100),
        demand_distortion: clamp(analysis.demand_distortion ?? 50, 0, 100),
        hype_persistence: clamp(analysis.hype_persistence ?? 50, 0, 100),
        influence_exposure: clamp(analysis.influence_exposure ?? 50, 0, 100),
      };
      const nrScore = calculateNarrativeRiskScore(components);
      const band = classifyGovernanceBand(nrScore);

      return {
        component: 'narrative_risk',
        nr_score: nrScore,
        nr_band: band.band,
        nr_interpretation: band.interpretation,
        component_scores: components,
        narrative_flags: Array.isArray(analysis.narrative_flags) ? analysis.narrative_flags : [],
        confidence: clamp(analysis.confidence ?? 0.5, 0, 1),
        confidence_caveat: analysis.confidence_caveat || 'LLM training data may affect scoring in well-represented domains (AI, crypto, sustainability).',
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultNarrativeRiskResult('Could not parse narrative risk analysis');
  } catch (err) {
    logger.warn(`   Warning: Narrative risk analysis failed: ${err.message}`);
    return defaultNarrativeRiskResult(`Analysis failed: ${err.message}`);
  }
}

/**
 * Calculate narrative risk composite score from sub-dimensions.
 *
 * Weights: DS=35%, DD=30%, HP=20%, IE=15%
 *
 * @param {Object} components - Sub-dimension scores (each 0-100)
 * @returns {number} Composite NR score 0-100
 */
export function calculateNarrativeRiskScore(components) {
  if (!components) return 0;

  return Math.round(
    clamp(components.decision_sensitivity ?? 0, 0, 100) * NR_WEIGHTS.decision_sensitivity +
    clamp(components.demand_distortion ?? 0, 0, 100) * NR_WEIGHTS.demand_distortion +
    clamp(components.hype_persistence ?? 0, 0, 100) * NR_WEIGHTS.hype_persistence +
    clamp(components.influence_exposure ?? 0, 0, 100) * NR_WEIGHTS.influence_exposure
  );
}

/**
 * Classify NR score into governance band.
 *
 * @param {number} nrScore - Composite NR score 0-100
 * @returns {Object} Band object with { band, interpretation }
 */
export function classifyGovernanceBand(nrScore) {
  const score = clamp(Math.round(nrScore), 0, 100);
  for (const band of GOVERNANCE_BANDS) {
    if (score >= band.min && score <= band.max) {
      return { band: band.band, interpretation: band.interpretation };
    }
  }
  return { band: 'NR-Critical', interpretation: 'Narrative-fragile' };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function defaultNarrativeRiskResult(summary) {
  return {
    component: 'narrative_risk',
    nr_score: 0,
    nr_band: 'NR-Unknown',
    nr_interpretation: 'Analysis unavailable',
    component_scores: {
      decision_sensitivity: 0,
      demand_distortion: 0,
      hype_persistence: 0,
      influence_exposure: 0,
    },
    narrative_flags: [],
    confidence: 0,
    confidence_caveat: 'LLM analysis unavailable — narrative risk could not be assessed.',
    summary,
  };
}

export { NR_WEIGHTS, GOVERNANCE_BANDS };
