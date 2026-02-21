/**
 * Path 3: Discovery Mode (Find Me Opportunities)
 *
 * AI-driven research pipeline that generates ranked venture candidates.
 * Supports multiple discovery strategies: trend scanner, democratization finder,
 * capability overhang exploit, and nursery re-evaluation.
 *
 * Flow:
 * 1. Load strategy config from discovery_strategies table
 * 2. Run strategy-specific AI research pipeline
 * 3. Generate ranked venture candidates with scoring
 * 4. Select top candidate for synthesis
 * 5. Return PathOutput with discovery-derived venture brief
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-E
 */

import { createPathOutput } from '../interfaces.js';
import { getValidationClient } from '../../../llm/client-factory.js';

const VALID_STRATEGIES = ['trend_scanner', 'democratization_finder', 'capability_overhang', 'nursery_reeval'];

/**
 * Execute the discovery mode path.
 *
 * @param {Object} params
 * @param {string} params.strategy - Discovery strategy to use
 * @param {Object} [params.constraints] - Optional constraints (budget_range, industries, automation_level)
 * @param {number} [params.candidateCount] - Number of candidates to generate (default: 5)
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} PathOutput
 */
export async function executeDiscoveryMode({ strategy, constraints = {}, candidateCount = 5 }, deps = {}) {
  const { supabase, logger = console, llmClient, strategicContext } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  if (!VALID_STRATEGIES.includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}. Must be one of: ${VALID_STRATEGIES.join(', ')}`);
  }

  // Step 1: Load strategy config
  const strategyConfig = await loadStrategyConfig(supabase, strategy);
  logger.log(`   Running discovery strategy: ${strategyConfig.name}`);

  // Step 2: Run strategy-specific pipeline
  const runners = {
    trend_scanner: runTrendScanner,
    democratization_finder: runDemocratizationFinder,
    capability_overhang: runCapabilityOverhang,
    nursery_reeval: runNurseryReeval,
  };

  const runner = runners[strategy];
  const candidates = await runner({ constraints, candidateCount, strategyConfig }, { supabase, logger, llmClient, strategicContext });

  if (!candidates || candidates.length === 0) {
    logger.log('   No candidates found. Try different constraints or strategy.');
    return null;
  }

  // Step 3: Rank candidates
  const ranked = rankCandidates(candidates);
  logger.log(`   Generated ${ranked.length} candidate(s), top: ${ranked[0].name} (score: ${ranked[0].score})`);

  // Step 4: Select top candidate
  const top = ranked[0];

  return createPathOutput({
    origin_type: 'discovery',
    raw_material: {
      strategy: strategyConfig,
      constraints,
      candidates: ranked,
      top_candidate: top,
      analyzed_at: new Date().toISOString(),
    },
    discovery_strategy: strategy,
    suggested_name: top.name || '',
    suggested_problem: top.problem_statement || '',
    suggested_solution: top.solution || '',
    target_market: top.target_market || '',
    metadata: {
      path: 'discovery_mode',
      strategy_key: strategy,
      strategy_name: strategyConfig.name,
      candidates_generated: ranked.length,
      top_score: top.score,
      constraints_applied: Object.keys(constraints),
    },
  });
}

/**
 * Load strategy configuration from database.
 */
async function loadStrategyConfig(supabase, strategy) {
  const { data, error } = await supabase
    .from('discovery_strategies')
    .select('*')
    .eq('strategy_key', strategy)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    throw new Error(`Strategy not found or inactive: ${strategy}`);
  }

  return data;
}

/**
 * Trend Scanner: Finds trending products, emerging markets, undermarketed products
 * generating $1K+/month that are fully automatable.
 */
async function runTrendScanner({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Everything is AI-operated. No human employees. Lower costs, faster iteration, 24/7 operation.
${contextBlock}
STRATEGY: Trend Scanner
${strategyConfig.description || 'Scan for trending products, emerging markets, and undermarketed opportunities.'}
${constraintText}

Generate ${candidateCount} venture candidates that:
1. Target products/services trending upward in demand
2. Can generate $1K+/month revenue
3. Are fully automatable (no human labor required for operations)
4. Have clear paths to profitability

For each candidate, provide:
- name: Venture name
- problem_statement: The customer problem being solved
- solution: How EHG would solve it with automation
- target_market: Who the customers are
- revenue_model: How it makes money
- automation_approach: How it runs without humans
- monthly_revenue_potential: Estimated $/month
- competition_level: low/medium/high
- automation_feasibility: Score 1-10

Return a JSON array:
[{ "name": "string", "problem_statement": "string", "solution": "string", "target_market": "string", "revenue_model": "string", "automation_approach": "string", "monthly_revenue_potential": "string", "competition_level": "string", "automation_feasibility": 8 }]`;

  return callLLMForCandidates(client, prompt, { logger, strategyName: 'Trend Scanner' });
}

/**
 * Democratization Finder: Identifies premium services available to the wealthy
 * that can be made accessible through automation.
 */
async function runDemocratizationFinder({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Everything is AI-operated. Dramatically lower costs enable democratizing premium services.
${contextBlock}
STRATEGY: Democratization Finder
${strategyConfig.description || 'Find premium services only available to the wealthy that can be made accessible through automation.'}
${constraintText}

Generate ${candidateCount} venture candidates that:
1. Target services currently only affordable by wealthy individuals ($500+/session)
2. Can be automated to offer at 1/10th the cost
3. Maintain quality through AI sophistication
4. Address large underserved markets

Examples of democratization: personal financial advisor → robo-advisor, personal stylist → AI styling, executive coach → AI coaching

For each candidate, provide:
- name: Venture name
- problem_statement: What the average person cannot access
- solution: How EHG democratizes it with AI
- target_market: The underserved population
- revenue_model: Pricing and business model
- automation_approach: How AI replaces the human expert
- current_premium_cost: What the wealthy pay now
- democratized_cost: What EHG would charge
- automation_feasibility: Score 1-10

Return a JSON array:
[{ "name": "string", "problem_statement": "string", "solution": "string", "target_market": "string", "revenue_model": "string", "automation_approach": "string", "current_premium_cost": "string", "democratized_cost": "string", "automation_feasibility": 8 }]`;

  return callLLMForCandidates(client, prompt, { logger, strategyName: 'Democratization Finder' });
}

/**
 * Capability Overhang Exploit: Scans for existing AI capabilities
 * that have not been productized.
 */
async function runCapabilityOverhang({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Deep AI expertise and automated operations. Can productize AI capabilities faster than incumbents.
${contextBlock}
STRATEGY: Capability Overhang Exploit
${strategyConfig.description || 'Find gaps between what AI can do and what products currently offer.'}
${constraintText}

Generate ${candidateCount} venture candidates that exploit capability overhangs:
1. Identify AI/tech capabilities that exist but are NOT productized
2. Find gaps between what is technically possible and what is commercially available
3. Target opportunities where incumbents are slow to adopt AI
4. Focus on capabilities mature enough for production use

For each candidate, provide:
- name: Venture name
- problem_statement: The gap between capability and availability
- solution: The productized offering
- target_market: Who needs this capability
- revenue_model: How it makes money
- automation_approach: Technical approach to productization
- capability_source: What existing AI capability is being exploited
- incumbent_gap_reason: Why incumbents haven't done this yet
- automation_feasibility: Score 1-10

Return a JSON array:
[{ "name": "string", "problem_statement": "string", "solution": "string", "target_market": "string", "revenue_model": "string", "automation_approach": "string", "capability_source": "string", "incumbent_gap_reason": "string", "automation_feasibility": 8 }]`;

  return callLLMForCandidates(client, prompt, { logger, strategyName: 'Capability Overhang' });
}

/**
 * Nursery Re-evaluation: Re-scores parked ideas from the Venture Nursery
 * whose conditions may have changed.
 */
async function runNurseryReeval({ constraints, candidateCount }, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  // Load parked ventures from nursery
  const { data: nurseryItems, error } = await supabase
    .from('venture_nursery')
    .select('id, name, problem_statement, solution, target_market, parked_reason, original_score, parked_at, metadata')
    .eq('status', 'parked')
    .order('parked_at', { ascending: true })
    .limit(candidateCount * 2);

  if (error) {
    throw new Error(`Failed to load nursery items: ${error.message}`);
  }

  if (!nurseryItems || nurseryItems.length === 0) {
    logger.log('   No parked ventures in nursery to re-evaluate.');
    return [];
  }

  logger.log(`   Re-evaluating ${nurseryItems.length} parked venture(s)...`);

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const itemSummaries = nurseryItems.map(item =>
    `- ${item.name}: "${item.problem_statement}" (Parked: ${item.parked_reason || 'unknown reason'}, Original score: ${item.original_score || 'N/A'})`
  ).join('\n');

  const prompt = `You are an AI venture analyst for EHG re-evaluating parked venture ideas.

These ventures were previously parked in EHG's Venture Nursery. Conditions may have changed:
- New AI capabilities available
- Market shifts
- Portfolio gaps emerged
- Technology costs decreased

Parked ventures:
${itemSummaries}
${constraintText}

For each venture, re-evaluate whether conditions have changed enough to warrant revival.
Score each venture on:
1. Market readiness (has the market shifted favorably?)
2. Technology readiness (are new capabilities available?)
3. Portfolio fit (does EHG need this now?)
4. Automation feasibility (can it run fully automated?)

Return a JSON array (only include ventures worth reviving, up to ${candidateCount}):
[{
  "nursery_id": "string (original ID)",
  "name": "string",
  "problem_statement": "string (updated if market changed)",
  "solution": "string (updated with new capabilities)",
  "target_market": "string",
  "revival_reason": "string (what changed)",
  "new_score": 8,
  "automation_feasibility": 8
}]

If no ventures are worth reviving, return an empty array: []`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map(c => ({
        ...c,
        source: 'nursery_reeval',
        automation_feasibility: c.automation_feasibility || c.new_score || 5,
      }));
    }
    logger.warn('   Warning: Could not parse nursery re-evaluation response');
    return [];
  } catch (err) {
    logger.warn(`   Warning: Nursery re-evaluation failed: ${err.message}`);
    return [];
  }
}

/**
 * Common LLM call handler for candidate generation strategies.
 */
async function callLLMForCandidates(client, prompt, { logger = console, strategyName = 'unknown' } = {}) {
  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map(c => ({ ...c, source: strategyName }));
    }
    logger.warn(`   Warning: Could not parse ${strategyName} response`);
    return [];
  } catch (err) {
    logger.warn(`   Warning: ${strategyName} analysis failed: ${err.message}`);
    return [];
  }
}

/**
 * Rank candidates by composite score.
 * Score = automation_feasibility * 10 + bonus factors.
 *
 * @param {Object[]} candidates - Raw candidates from strategy
 * @returns {Object[]} Sorted candidates with scores
 */
export function rankCandidates(candidates) {
  return candidates
    .map(c => {
      const feasibility = Number(c.automation_feasibility) || 5;
      const competitionBonus = c.competition_level === 'low' ? 10 : c.competition_level === 'medium' ? 5 : 0;
      const score = feasibility * 10 + competitionBonus;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * List available discovery strategies.
 *
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @returns {Promise<Object[]>} Available strategies
 */
export async function listDiscoveryStrategies(deps = {}) {
  const { supabase } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  const { data, error } = await supabase
    .from('discovery_strategies')
    .select('strategy_key, name, description, is_active')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Failed to load strategies: ${error.message}`);
  }

  return data || [];
}
