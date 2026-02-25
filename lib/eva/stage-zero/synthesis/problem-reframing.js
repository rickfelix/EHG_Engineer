/**
 * Synthesis Component 3: Active Problem Reframing
 *
 * Does not accept the problem statement as-is. Analyzes competitive landscape,
 * generates 3+ alternative problem framings ranked by market size and defensibility,
 * challenges assumptions in original framing, presents reframed options to chairman.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

/**
 * Actively reframe the problem statement.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Problem reframing with ranked alternatives
 */
export async function reframeProblem(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  const originalProblem = pathOutput.suggested_problem || '';
  const originalSolution = pathOutput.suggested_solution || '';
  const targetMarket = pathOutput.target_market || '';

  if (!originalProblem) {
    logger.log('   No problem statement to reframe');
    return {
      component: 'problem_reframing',
      original_problem: '',
      reframings: [],
      assumptions_challenged: [],
      recommended_framing: null,
      summary: 'No problem statement provided for reframing.',
    };
  }

  logger.log('   Actively reframing problem statement...');

  const prompt = `You are a venture strategist for EHG. Your job is to CHALLENGE the problem statement and find better framings.

DO NOT accept the problem statement as-is. Question everything.

ORIGINAL PROBLEM: ${originalProblem}
PROPOSED SOLUTION: ${originalSolution}
TARGET MARKET: ${targetMarket}
ORIGIN: ${pathOutput.origin_type}

Perform active problem reframing:

1. **Challenge Assumptions**: What assumptions does the original framing make? Which are questionable?
2. **Generate Alternative Framings**: Create 3+ alternative ways to frame this problem, each targeting:
   - Different market size
   - Different defensibility
   - Different automation potential
3. **Rank by Strategic Value**: Order by (market_size * defensibility * automation_potential)
4. **Recommend**: Which framing should the chairman adopt?

Return JSON:
{
  "assumptions_challenged": [{"assumption": "string", "challenge": "string", "validity": "weak|moderate|strong"}],
  "reframings": [
    {
      "framing": "string (the reframed problem statement)",
      "market_size": "small|medium|large|massive",
      "defensibility": "low|medium|high",
      "automation_potential": "low|medium|high",
      "strategic_score": 85,
      "rationale": "string"
    }
  ],
  "recommended_framing": {
    "framing": "string",
    "reason": "string"
  },
  "summary": "string (2-3 sentences comparing original vs recommended)"
}`;

  try {
    const response = await client.complete('', prompt, { max_tokens: 2000, timeout: 120000 });
    const usage = extractUsage(response);
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const reframings = (analysis.reframings || [])
        .sort((a, b) => (b.strategic_score || 0) - (a.strategic_score || 0));

      return {
        component: 'problem_reframing',
        original_problem: originalProblem,
        reframings,
        assumptions_challenged: analysis.assumptions_challenged || [],
        recommended_framing: analysis.recommended_framing || (reframings[0] ? { framing: reframings[0].framing, reason: reframings[0].rationale } : null),
        summary: analysis.summary || '',
        usage,
      };
    }
    return {
      component: 'problem_reframing',
      original_problem: originalProblem,
      reframings: [],
      assumptions_challenged: [],
      recommended_framing: null,
      summary: 'Could not parse reframing analysis.',
    };
  } catch (err) {
    logger.warn(`   Warning: Problem reframing failed: ${err.message}`);
    return {
      component: 'problem_reframing',
      original_problem: originalProblem,
      reframings: [],
      assumptions_challenged: [],
      recommended_framing: null,
      summary: `Reframing failed: ${err.message}`,
    };
  }
}
