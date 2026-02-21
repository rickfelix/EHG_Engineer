/**
 * Synthesis Component 8: Build Cost and Effort Estimation
 *
 * Estimates the build cost calibrated to AI-assisted development speed:
 * - LOC estimate (considering AI code generation)
 * - SD count (number of strategic directives needed)
 * - Infrastructure requirements
 * - Token budget (LLM API costs)
 * - Timeline (weeks, calibrated to EHG's AI-first development)
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-H
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const COMPLEXITY_LEVELS = ['trivial', 'simple', 'moderate', 'complex', 'massive'];

/**
 * Estimate build cost and effort for a venture.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Build cost estimation
 */
export async function estimateBuildCost(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Estimating build cost...');

  const prompt = `You are a technical estimator for EHG ventures. EHG builds with AI-first development (Claude Code, LEO Protocol orchestration).

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}

EHG CONTEXT:
- Development uses AI-assisted coding (2-5x faster than traditional)
- LEO Protocol manages work via Strategic Directives (SDs)
- Each SD is ~50-400 lines of code
- Infrastructure is Supabase (Postgres + auth + storage) + Vercel/Node.js
- Token budget = LLM API costs for the venture's AI features

Estimate the build cost:

1. **Complexity**: trivial|simple|moderate|complex|massive
2. **LOC Estimate**: Total lines of code for MVP
3. **SD Count**: How many strategic directives to build this
4. **Infrastructure**: What infrastructure is needed
5. **Token Budget**: Monthly LLM API cost estimate for AI features
6. **Timeline**: Weeks to MVP with AI-assisted development

Return JSON:
{
  "complexity": "moderate",
  "loc_estimate": {"min": 2000, "max": 5000, "breakdown": {"backend": 2000, "frontend": 1500, "design": 500, "tests": 1000, "config": 500}},
  "sd_count": {"min": 8, "max": 15, "breakdown": {"infrastructure": 3, "core_features": 6, "testing": 3, "documentation": 2}},
  "infrastructure": {
    "required": ["supabase", "vercel"],
    "optional": ["redis", "s3"],
    "estimated_monthly_cost": 50
  },
  "token_budget": {
    "development_tokens_monthly": 500000,
    "production_tokens_monthly": 200000,
    "estimated_monthly_cost": 30
  },
  "timeline_weeks": {"optimistic": 4, "realistic": 8, "pessimistic": 14},
  "risk_factors": ["string"],
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
      const complexity = COMPLEXITY_LEVELS.includes(analysis.complexity)
        ? analysis.complexity
        : 'moderate';

      return {
        component: 'build_cost',
        complexity,
        loc_estimate: analysis.loc_estimate || { min: 0, max: 0, breakdown: {} },
        sd_count: analysis.sd_count || { min: 0, max: 0, breakdown: {} },
        infrastructure: analysis.infrastructure || { required: [], optional: [], estimated_monthly_cost: 0 },
        token_budget: analysis.token_budget || { development_tokens_monthly: 0, production_tokens_monthly: 0, estimated_monthly_cost: 0 },
        timeline_weeks: analysis.timeline_weeks || { optimistic: 0, realistic: 0, pessimistic: 0 },
        risk_factors: analysis.risk_factors || [],
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultBuildCostResult('Could not parse build cost analysis');
  } catch (err) {
    logger.warn(`   Warning: Build cost estimation failed: ${err.message}`);
    return defaultBuildCostResult(`Estimation failed: ${err.message}`);
  }
}

function defaultBuildCostResult(summary) {
  return {
    component: 'build_cost',
    complexity: 'moderate',
    loc_estimate: { min: 0, max: 0, breakdown: {} },
    sd_count: { min: 0, max: 0, breakdown: {} },
    infrastructure: { required: [], optional: [], estimated_monthly_cost: 0 },
    token_budget: { development_tokens_monthly: 0, production_tokens_monthly: 0, estimated_monthly_cost: 0 },
    timeline_weeks: { optimistic: 0, realistic: 0, pessimistic: 0 },
    risk_factors: [],
    summary,
  };
}

export { COMPLEXITY_LEVELS };
