/**
 * Synthesis Component 2: Portfolio-Aware Evaluation
 *
 * Scores ventures against the existing portfolio on 5 dimensions:
 * 1. Data synergy - what data does this generate that other ventures consume?
 * 2. Capability building - shared infrastructure created
 * 3. Customer cross-sell - segments reached for cross-selling
 * 4. Portfolio gaps - fills a gap?
 * 5. Redundancy check - overlaps with existing?
 *
 * Chairman directive: ventures should appear separate but become an integrated
 * system where each feeds the other.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

/**
 * Evaluate a venture candidate against the existing portfolio.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Portfolio evaluation with 5 dimension scores
 */
export async function evaluatePortfolioFit(pathOutput, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  logger.log('   Evaluating portfolio fit...');

  // Load existing portfolio
  const portfolio = await loadPortfolio(supabase);
  logger.log(`   Portfolio has ${portfolio.length} active venture(s)`);

  if (portfolio.length === 0) {
    logger.log('   Empty portfolio - all dimensions score as opportunity');
    return {
      component: 'portfolio_evaluation',
      dimensions: {
        data_synergy: { score: 5, rationale: 'First venture - establishes data foundation' },
        capability_building: { score: 5, rationale: 'First venture - sets infrastructure baseline' },
        customer_cross_sell: { score: 5, rationale: 'First venture - defines initial customer base' },
        portfolio_gaps: { score: 10, rationale: 'Empty portfolio - any venture fills a gap' },
        redundancy_check: { score: 10, rationale: 'No existing ventures to overlap with' },
        agent_ecosystem: { score: 5, rationale: 'First venture - agent ecosystem potential to be determined' },
      },
      composite_score: 70,
      portfolio_size: 0,
      recommendation: 'proceed',
      summary: 'First venture in portfolio. No overlap risks. Establishes foundation.',
    };
  }

  // Use LLM to analyze portfolio fit
  const client = llmClient || getValidationClient();
  const analysis = await analyzePortfolioFit(client, pathOutput, portfolio, { logger });

  return {
    component: 'portfolio_evaluation',
    dimensions: analysis.dimensions || emptyDimensions(),
    composite_score: analysis.composite_score || 0,
    portfolio_size: portfolio.length,
    recommendation: analysis.recommendation || 'review',
    synergies: analysis.synergies || [],
    conflicts: analysis.conflicts || [],
    summary: analysis.summary || '',
  };
}

/**
 * Load active ventures from portfolio.
 */
async function loadPortfolio(supabase) {
  const { data, error } = await supabase
    .from('ventures')
    .select('id, name, problem_statement, solution, target_market, status, metadata')
    .in('status', ['active', 'launched'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return [];
  }

  return data || [];
}

function emptyDimensions() {
  return {
    data_synergy: { score: 0, rationale: 'Analysis unavailable' },
    capability_building: { score: 0, rationale: 'Analysis unavailable' },
    customer_cross_sell: { score: 0, rationale: 'Analysis unavailable' },
    portfolio_gaps: { score: 0, rationale: 'Analysis unavailable' },
    redundancy_check: { score: 0, rationale: 'Analysis unavailable' },
    agent_ecosystem: { score: 0, rationale: 'Analysis unavailable' },
  };
}

/**
 * Use LLM to analyze portfolio fit across 5 dimensions.
 */
async function analyzePortfolioFit(client, pathOutput, portfolio, { logger = console } = {}) {
  const ventureDesc = `Name: ${pathOutput.suggested_name}\nProblem: ${pathOutput.suggested_problem}\nSolution: ${pathOutput.suggested_solution}\nMarket: ${pathOutput.target_market}`;

  const portfolioDesc = portfolio.map(v =>
    `- ${v.name}: ${v.problem_statement} → ${v.solution} (Market: ${v.target_market}, Status: ${v.status})`
  ).join('\n');

  const prompt = `You are evaluating a new venture candidate for EHG's portfolio.

Chairman Directive: "Ventures should appear separate but become an integrated system where each feeds the other."

NEW VENTURE:
${ventureDesc}

EXISTING PORTFOLIO:
${portfolioDesc}

Score this venture on 5 portfolio dimensions (each 1-10):

1. **Data Synergy** (1-10): What data does this venture generate that other ventures consume? Or what data from existing ventures would feed this one?
2. **Capability Building** (1-10): Does this venture create shared infrastructure, tools, or capabilities other ventures can use?
3. **Customer Cross-Sell** (1-10): Does this venture reach customer segments that existing ventures could cross-sell to?
4. **Portfolio Gaps** (1-10): Does this venture fill a gap in the portfolio? (10 = fills major gap, 1 = no gap to fill)
5. **Redundancy Check** (1-10): How distinct is this from existing ventures? (10 = completely unique, 1 = near duplicate)
6. **Agent Ecosystem** (1-10): Can agents programmatically discover, evaluate, and transact with this venture? Does it expose APIs, structured data, or MCP-ready interfaces that enable agent-mediated cross-sell across the portfolio? (10 = fully agent-consumable)

Also identify:
- Specific synergies with existing ventures
- Potential conflicts or cannibalization risks

Return JSON:
{
  "dimensions": {
    "data_synergy": {"score": 7, "rationale": "string"},
    "capability_building": {"score": 6, "rationale": "string"},
    "customer_cross_sell": {"score": 5, "rationale": "string"},
    "portfolio_gaps": {"score": 8, "rationale": "string"},
    "redundancy_check": {"score": 9, "rationale": "string"},
    "agent_ecosystem": {"score": 6, "rationale": "string"}
  },
  "composite_score": 70,
  "recommendation": "proceed|review|reject",
  "synergies": [{"venture": "string", "synergy": "string"}],
  "conflicts": [{"venture": "string", "conflict": "string"}],
  "summary": "string (2-3 sentences)"
}`;

  try {
    const response = await client.complete('', prompt, { max_tokens: 1500, timeout: 120000 });
    const usage = extractUsage(response);
    const text = typeof response === 'string' ? response : (response?.content || '');
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[0]), usage };
    }
    return { dimensions: emptyDimensions(), composite_score: 0, summary: 'Could not parse portfolio analysis' };
  } catch (err) {
    logger.warn(`   Warning: Portfolio analysis failed: ${err.message}`);
    return { dimensions: emptyDimensions(), composite_score: 0, summary: `Analysis failed: ${err.message}` };
  }
}
