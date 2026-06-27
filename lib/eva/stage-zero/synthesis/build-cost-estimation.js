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
// SD-LEO-INFRA-UPSTREAM-OPERATING-MODEL-PROPAGATION-001 (FR-1): inject the operating-model SSOT at the
// FIRST point cost is estimated (Stage-0) so burn is born zero-payroll / venture-hosting-standard /
// organic-GTM — the wrong assumptions never enter the pipeline. Mirrors the proven S5/S7/S16 grounding.
import { getOperatingModelPromptBlock, groundCostBreakdown } from '../../standards/operating-model.js';
// SD-LEO-INFRA-S0-S18-STACK-GROUNDING-001: ground the Stage-0 cost estimate on the canonical
// venture stack (was a stale non-canonical infra assumption that named forbidden-for-ventures tech).
import { getHouseStackSummary } from '../../config/house-tech-stack.js';

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
- Infrastructure is the canonical EHG venture-hosting standard: ${getHouseStackSummary()} (Replit is a prototyping opt-in). NEVER Supabase for ventures.
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
    "required": ["cloudflare-workers", "cloudflare-d1", "clerk"],
    "optional": ["cloudflare-r2", "neon"],
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
    // FR-1: the operating-model SSOT is the SYSTEM prompt (was empty) so the estimate is born grounded.
    const response = await client.complete(getOperatingModelPromptBlock(), prompt, { max_tokens: 8192, timeout: 120000 });
    const usage = extractUsage(response);
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysis = JSON.parse(jsonMatch[0]);
      const complexity = COMPLEXITY_LEVELS.includes(analysis.complexity)
        ? analysis.complexity
        : 'moderate';

      const infrastructure = analysis.infrastructure || { required: [], optional: [], estimated_monthly_cost: 0 };
      // FR-1: ground the monthly infra cost to the operating-model hosting band when the LLM omits/zeroes it
      // (a missing infra cost would otherwise read as $0 burn downstream). A provided value is preserved.
      let infra_cost_provenance = 'ESTIMATE';
      if (!(Number(infrastructure.estimated_monthly_cost) > 0)) {
        const { breakdown } = groundCostBreakdown({ month: 1, revenue: 0 });
        infrastructure.estimated_monthly_cost = breakdown.infrastructure;
        infra_cost_provenance = 'DERIVED-from-operating-model';
      }

      return {
        component: 'build_cost',
        complexity,
        loc_estimate: analysis.loc_estimate || { min: 0, max: 0, breakdown: {} },
        sd_count: analysis.sd_count || { min: 0, max: 0, breakdown: {} },
        infrastructure,
        token_budget: analysis.token_budget || { development_tokens_monthly: 0, production_tokens_monthly: 0, estimated_monthly_cost: 0 },
        timeline_weeks: analysis.timeline_weeks || { optimistic: 0, realistic: 0, pessimistic: 0 },
        risk_factors: analysis.risk_factors || [],
        summary: analysis.summary || '',
        // FR-1: operating-model grounding provenance.
        infra_cost_provenance,
        operating_model_grounded: infra_cost_provenance === 'DERIVED-from-operating-model',
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
