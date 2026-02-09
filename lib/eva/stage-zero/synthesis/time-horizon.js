/**
 * Synthesis Component 6: Time-Horizon Positioning
 *
 * Temporal assessment classifying ventures as:
 * - build_now: First-mover advantage, market forming
 * - park_and_build_later: Capability overhang exists but adoption not there (nursery)
 * - window_closing: Competitors converging, fast-track or abandon
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-G
 */

import { getValidationClient } from '../../../llm/client-factory.js';

const VALID_POSITIONS = ['build_now', 'park_and_build_later', 'window_closing'];

/**
 * Assess the time-horizon positioning of a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Time-horizon assessment
 */
export async function assessTimeHorizon(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Assessing time-horizon positioning...');

  const prompt = `You are a market timing analyst for EHG ventures.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}
Origin: ${pathOutput.origin_type}

Classify this venture's temporal position:

1. **build_now**: Market is forming, first-mover advantage exists, timing is right
2. **park_and_build_later**: Capability exists but market adoption isn't there yet. Send to Venture Nursery with trigger conditions for re-evaluation.
3. **window_closing**: Competitors are converging on this space. Either fast-track or abandon.

Consider:
- Market readiness (is the problem recognized by the market?)
- Technology maturity (can this be built reliably today?)
- Competitive density (how many others are building similar?)
- Adoption curve position (early adopter? early majority? late?)

Return JSON:
{
  "position": "build_now|park_and_build_later|window_closing",
  "confidence": 80,
  "market_readiness": {"score": 8, "rationale": "string"},
  "technology_maturity": {"score": 9, "rationale": "string"},
  "competitive_density": {"score": 6, "rationale": "string"},
  "adoption_stage": "early_adopter|early_majority|late_majority",
  "trigger_conditions": ["string (only for park_and_build_later)"],
  "urgency_factors": ["string (only for window_closing)"],
  "summary": "string (2-3 sentences)"
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const position = VALID_POSITIONS.includes(analysis.position) ? analysis.position : 'build_now';
      return {
        component: 'time_horizon',
        position,
        confidence: analysis.confidence || 50,
        market_readiness: analysis.market_readiness || { score: 5, rationale: 'Unknown' },
        technology_maturity: analysis.technology_maturity || { score: 5, rationale: 'Unknown' },
        competitive_density: analysis.competitive_density || { score: 5, rationale: 'Unknown' },
        adoption_stage: analysis.adoption_stage || 'early_adopter',
        trigger_conditions: analysis.trigger_conditions || [],
        urgency_factors: analysis.urgency_factors || [],
        summary: analysis.summary || '',
      };
    }
    return defaultTimeHorizonResult('Could not parse time-horizon analysis');
  } catch (err) {
    logger.warn(`   Warning: Time-horizon assessment failed: ${err.message}`);
    return defaultTimeHorizonResult(`Analysis failed: ${err.message}`);
  }
}

function defaultTimeHorizonResult(summary) {
  return {
    component: 'time_horizon',
    position: 'build_now',
    confidence: 0,
    market_readiness: { score: 5, rationale: 'Unknown' },
    technology_maturity: { score: 5, rationale: 'Unknown' },
    competitive_density: { score: 5, rationale: 'Unknown' },
    adoption_stage: 'early_adopter',
    trigger_conditions: [],
    urgency_factors: [],
    summary,
  };
}

export { VALID_POSITIONS };
