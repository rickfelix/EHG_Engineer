/**
 * Synthesis Component 4: Moat Architecture
 *
 * Active moat design step. Produces a specific moat strategy from 5 types:
 * - Data moat: proprietary data improving with usage
 * - Automation speed: AI-powered development compounding efficiency
 * - Vertical expertise: deep domain knowledge from customer engagement
 * - Network effects: value increases with user count
 * - Switching costs: integration depth, data lock-in
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-G
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const MOAT_TYPES = ['data_moat', 'automation_speed', 'vertical_expertise', 'network_effects', 'switching_costs', 'design_moat'];

/**
 * Design a moat strategy for a venture candidate.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Moat architecture analysis
 */
export async function designMoat(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Designing moat architecture...');

  const prompt = `You are an EHG moat architect. Design a defensible moat strategy for this venture.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG Chairman Directives:
- Establish own moat with strong differentiating factors
- Prepare proprietary data collection
- Narrow specialization over broad market
- Automation endurance advantage

MOAT TYPES (choose primary + secondary):
1. data_moat: Proprietary data that improves with usage
2. automation_speed: AI-powered ops compounding over time
3. vertical_expertise: Deep domain knowledge from customer engagement
4. network_effects: Value increases with user count
5. switching_costs: Integration depth, data lock-in
6. design_moat: Superior UX creating brand loyalty and switching costs

For each applicable moat type, explain:
- How it applies to this venture
- How it compounds over time (months 1, 6, 12, 24)
- How it connects to EHG's existing portfolio moats

Return JSON:
{
  "primary_moat": {"type": "string", "strategy": "string", "compounding": {"month_1": "string", "month_6": "string", "month_12": "string", "month_24": "string"}},
  "secondary_moats": [{"type": "string", "strategy": "string", "confidence": 80}],
  "moat_score": 75,
  "portfolio_moat_synergy": "string (how this connects to portfolio)",
  "vulnerabilities": ["string"],
  "summary": "string (2-3 sentences)"
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
      return {
        component: 'moat_architecture',
        primary_moat: analysis.primary_moat || null,
        secondary_moats: analysis.secondary_moats || [],
        moat_score: analysis.moat_score || 0,
        portfolio_moat_synergy: analysis.portfolio_moat_synergy || '',
        vulnerabilities: analysis.vulnerabilities || [],
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultMoatResult('Could not parse moat analysis');
  } catch (err) {
    logger.warn(`   Warning: Moat design failed: ${err.message}`);
    return defaultMoatResult(`Analysis failed: ${err.message}`);
  }
}

function defaultMoatResult(summary) {
  return {
    component: 'moat_architecture',
    primary_moat: null,
    secondary_moats: [],
    moat_score: 0,
    portfolio_moat_synergy: '',
    vulnerabilities: [],
    summary,
  };
}

export { MOAT_TYPES };
