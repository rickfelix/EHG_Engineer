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
import { getCapabilityContextBlock } from '../../../capabilities/scanner-context.js';
import { getMentalModelContextBlock } from '../../mental-models/index.js';
import { loadActiveStrategies, FALLBACK_STRATEGIES } from '../strategy-loader.js';
import { TREND_SCANNER_PROMPT_VERSION } from './discovery-mode-versions.js';
import { parseRevenuePotential } from '../utils/parse-revenue.js';
import { computeStrategicFit } from '../utils/strategic-fit.js';

// ── Typed errors for silent-failure hardening (FR-7) ─────────────────────────
// Surfaced by callLLMForCandidates / runTrendScanner; mapped to error_details.error_type
// in scripts/stage-zero-queue-processor.js catch block.

export class LLMEmptyResponseError extends Error {
  constructor({ strategyName, promptVersion, responseLength }) {
    super(`${strategyName}_empty_response: got ${responseLength} chars from LLM`);
    this.name = 'LLMEmptyResponseError';
    this.strategyName = strategyName;
    this.promptVersion = promptVersion;
    this.responseLength = responseLength;
    this.errorType = 'empty_response';
  }
}

export class LLMParseError extends Error {
  constructor({ strategyName, promptVersion, responseLength, reason = 'no JSON array found' }) {
    super(`${strategyName}_parse_failed: ${reason}`);
    this.name = 'LLMParseError';
    this.strategyName = strategyName;
    this.promptVersion = promptVersion;
    this.responseLength = responseLength;
    this.errorType = 'parse_failure';
  }
}

export class LLMUndercountError extends Error {
  constructor({ strategyName, promptVersion, expected, actual }) {
    super(`${strategyName}_undercount: got ${actual} of ${expected} expected`);
    this.name = 'LLMUndercountError';
    this.strategyName = strategyName;
    this.promptVersion = promptVersion;
    this.expected = expected;
    this.actual = actual;
    this.errorType = 'undercount';
  }
}

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

  const activeStrategies = await loadActiveStrategies(supabase);
  if (!activeStrategies.includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}. Must be one of: ${activeStrategies.join(', ')}`);
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
    simple_venture: runSimpleVentureFinder,
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
  const { supabase, logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  // SD-LEO-FEAT-AUTOMATED-RANKING-DATA-001 (US-004): Inject real ranking data
  let rankingBlock = '';
  if (supabase) {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: rankings } = await supabase
        .from('app_rankings')
        .select('app_name, source, chart_position, category, rating')
        .gte('scraped_at', sevenDaysAgo)
        .order('chart_position', { ascending: true })
        .limit(150);

      if (rankings && rankings.length > 0) {
        // Limit to 50 per source
        const bySource = {};
        const limited = rankings.filter(r => {
          bySource[r.source] = (bySource[r.source] || 0) + 1;
          return bySource[r.source] <= 50;
        });

        const lines = limited.map(r =>
          `- ${r.app_name} (${r.source}, #${r.chart_position}, ${r.category || 'N/A'}, rating: ${r.rating || 'N/A'})`
        );
        rankingBlock = `\n## Real Market Data (from app_rankings)\nThe following apps are currently trending based on real app store and product rankings:\n${lines.join('\n')}\n`;
      }
    } catch {
      // Silently skip if ranking query fails - backward compatible
    }
  }

  // SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B: Inject capability context
  const capabilityBlock = await getCapabilityContextBlock(supabase, 'trend_scanner');

  // Mental model context injection (Layer 1)
  const mentalModelBlock = await getMentalModelContextBlock(
    { stage: 0, path: 'discovery_mode', strategy: 'trend_scanner' }, { supabase }
  ).catch(() => '');

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Everything is AI-operated. No human employees. Lower costs, faster iteration, 24/7 operation.
${contextBlock}${rankingBlock}${capabilityBlock ? `\n${capabilityBlock}\n` : ''}${mentalModelBlock ? `\n${mentalModelBlock}\n` : ''}
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

  const candidates = await callLLMForCandidates(client, prompt, {
    logger,
    strategyName: 'trend_scanner',
    promptVersion: TREND_SCANNER_PROMPT_VERSION,
    strictMode: true,
  });

  // FR-7 post-condition: surface impoverished-signal runs (1 of 5 etc.) as failed,
  // not as ranked-but-thin output that masquerades as success.
  const minExpected = Math.ceil((candidateCount || 5) / 2);
  if (candidates.length < minExpected) {
    throw new LLMUndercountError({
      strategyName: 'trend_scanner',
      promptVersion: TREND_SCANNER_PROMPT_VERSION,
      expected: candidateCount || 5,
      actual: candidates.length,
    });
  }

  return candidates.map(c => ({ ...c, prompt_version: TREND_SCANNER_PROMPT_VERSION }));
}

/**
 * Democratization Finder: Identifies premium services available to the wealthy
 * that can be made accessible through automation.
 */
async function runDemocratizationFinder({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { supabase, logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  // SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B: Inject capability context
  const capabilityBlock = await getCapabilityContextBlock(supabase, 'democratization_finder');

  // Mental model context injection (Layer 1)
  const mentalModelBlock = await getMentalModelContextBlock(
    { stage: 0, path: 'discovery_mode', strategy: 'democratization_finder' }, { supabase }
  ).catch(() => '');

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Everything is AI-operated. Dramatically lower costs enable democratizing premium services.
${contextBlock}${capabilityBlock ? `\n${capabilityBlock}\n` : ''}${mentalModelBlock ? `\n${mentalModelBlock}\n` : ''}
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
  const { supabase, logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  // SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B: Inject real capability data
  const capabilityBlock = await getCapabilityContextBlock(supabase, 'capability_overhang');

  // Mental model context injection (Layer 1)
  const mentalModelBlock = await getMentalModelContextBlock(
    { stage: 0, path: 'discovery_mode', strategy: 'capability_overhang' }, { supabase }
  ).catch(() => '');

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Deep AI expertise and automated operations. Can productize AI capabilities faster than incumbents.
${contextBlock}${capabilityBlock ? `\n${capabilityBlock}\n` : ''}${mentalModelBlock ? `\n${mentalModelBlock}\n` : ''}
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
 * Simple Venture Finder: Finds low-complexity, quick-to-launch ventures
 * ideal for testing the EHG build pipeline end-to-end.
 */
async function runSimpleVentureFinder({ constraints, candidateCount, strategyConfig }, deps = {}) {
  const { supabase, logger = console, llmClient, strategicContext } = deps;
  const client = llmClient || getValidationClient();

  const constraintText = Object.keys(constraints).length > 0
    ? `\nConstraints: ${JSON.stringify(constraints)}`
    : '';

  const contextBlock = strategicContext?.formattedPromptBlock
    ? `\n${strategicContext.formattedPromptBlock}\n`
    : '';

  const capabilityBlock = await getCapabilityContextBlock(supabase, 'simple_venture');

  const mentalModelBlock = await getMentalModelContextBlock(
    { stage: 0, path: 'discovery_mode', strategy: 'simple_venture' }, { supabase }
  ).catch(() => '');

  const prompt = `You are an AI venture scout for EHG, a fully automated holding group.

EHG's advantage: Everything is AI-operated. No human employees. Lower costs, faster iteration, 24/7 operation.
${contextBlock}${capabilityBlock ? `\n${capabilityBlock}\n` : ''}${mentalModelBlock ? `\n${mentalModelBlock}\n` : ''}
STRATEGY: Simple Venture Finder
${strategyConfig.description || 'Find low-complexity ventures that are quick to build and launch, ideal for testing the automated venture pipeline.'}
${constraintText}

Generate ${candidateCount} SIMPLE venture candidates that:
1. Can be built with a single web app or API — no complex integrations, no hardware, no regulatory hurdles
2. Have a narrow, well-defined scope (one core feature, not a platform)
3. Can reach first revenue within 2-4 weeks of launch
4. Require minimal external data sources or third-party dependencies
5. Target a clear niche with existing demand (not speculative markets)
6. Are fully automatable — no human-in-the-loop operations

Think: simple SaaS tools, content generators, niche calculators, data formatters,
automated report builders, single-purpose API services, micro-utilities.

IMPORTANT: Bias heavily toward simplicity. If a venture needs more than one database table
and one API endpoint to deliver its core value, it is too complex for this strategy.

For each candidate, provide:
- name: Venture name
- problem_statement: The specific pain point being solved
- solution: How EHG would solve it (keep it simple)
- target_market: Who the customers are (specific niche)
- revenue_model: How it makes money (simple pricing)
- automation_approach: How it runs without humans
- build_complexity: low/medium (never high — that disqualifies it)
- estimated_build_weeks: 1-4 (number)
- monthly_revenue_potential: Estimated $/month
- automation_feasibility: Score 1-10 (should be 7+ for all candidates)

Return a JSON array:
[{ "name": "string", "problem_statement": "string", "solution": "string", "target_market": "string", "revenue_model": "string", "automation_approach": "string", "build_complexity": "low", "estimated_build_weeks": 2, "monthly_revenue_potential": "string", "automation_feasibility": 9 }]`;

  return callLLMForCandidates(client, prompt, { logger, strategyName: 'Simple Venture Finder' });
}

/**
 * Nursery Re-evaluation: Re-scores parked ideas from the Venture Nursery
 * whose conditions may have changed.
 */
async function runNurseryReeval({ constraints, candidateCount }, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  // SD-CAPABILITYAWARE-SCANNERS-AND-ANTHROPIC-ORCH-001-B: Inject capability context
  const capabilityBlock = await getCapabilityContextBlock(supabase, 'nursery_reeval');

  // Mental model context injection (Layer 1)
  const mentalModelBlock = await getMentalModelContextBlock(
    { stage: 0, path: 'discovery_mode', strategy: 'nursery_reeval' }, { supabase }
  ).catch(() => '');

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
${capabilityBlock ? `\n${capabilityBlock}\n` : ''}${mentalModelBlock ? `\n${mentalModelBlock}\n` : ''}
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
    // 8192 minimum: Gemini 2.5 Pro uses ~3000 thinking tokens from the output budget
    const text = await client.complete('', prompt, { max_tokens: 8192, timeout: 120000 });
    const content = typeof text === 'string' ? text : (text?.content || text?.choices?.[0]?.message?.content || '');
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map(c => ({
        ...c,
        source: 'nursery_reeval',
        automation_feasibility: c.automation_feasibility || c.new_score || 5,
      }));
    }
    logger.warn(`   Warning: Could not parse nursery re-evaluation response (${content.length} chars)`);
    // FR-7 conservative gate: only fire when there was input to re-evaluate AND nothing came back.
    // 0-input → graceful empty (TS-11); ≥1-input + 0-output → undercount (real failure).
    if (nurseryItems.length >= 1) {
      throw new LLMUndercountError({
        strategyName: 'nursery_reeval',
        promptVersion: null,
        expected: nurseryItems.length,
        actual: 0,
      });
    }
    return [];
  } catch (err) {
    if (err instanceof LLMUndercountError) throw err;
    logger.warn(`   Warning: Nursery re-evaluation failed: ${err.message}`);
    return [];
  }
}

/**
 * Common LLM call handler for candidate generation strategies.
 *
 * Throws typed errors on failure modes that previously silently returned []:
 *   - LLMEmptyResponseError  : LLM returned <10 chars
 *   - LLMParseError          : no JSON array found OR JSON.parse failed
 * Other thrown errors (network, timeout) propagate unchanged with message preserved.
 *
 * Trend Scanner is the only strategy currently strict-mode (FR-7); other strategies
 * pass `strictMode:false` to preserve historical [] return on parse-fail until
 * sibling SDs widen the contract.
 */
async function callLLMForCandidates(client, prompt, { logger = console, strategyName = 'unknown', promptVersion = null, strictMode = false } = {}) {
  // 8192 minimum: Gemini 2.5 Pro uses ~3000 thinking tokens from the output budget
  const raw = await client.complete('', prompt, { max_tokens: 8192, timeout: 120000 });
  const text = typeof raw === 'string' ? raw : (raw?.content || raw?.choices?.[0]?.message?.content || '');
  const responseLength = text ? text.length : 0;

  if (!text || responseLength < 10) {
    const usage = raw?.usage || {};
    if (strictMode) {
      throw new LLMEmptyResponseError({ strategyName, promptVersion, responseLength });
    }
    logger.warn(`   Warning: ${strategyName} returned empty/truncated response (${responseLength} chars). Usage: ${JSON.stringify(usage)}`);
    return [];
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    if (strictMode) {
      throw new LLMParseError({ strategyName, promptVersion, responseLength, reason: 'no JSON array found' });
    }
    logger.warn(`   Warning: Could not parse ${strategyName} response (${responseLength} chars, no JSON array found)`);
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    if (strictMode) {
      throw new LLMParseError({ strategyName, promptVersion, responseLength, reason: `JSON.parse failed: ${parseErr.message}` });
    }
    logger.warn(`   Warning: ${strategyName} JSON.parse failed: ${parseErr.message}`);
    return [];
  }

  if (!Array.isArray(parsed)) {
    if (strictMode) {
      throw new LLMParseError({ strategyName, promptVersion, responseLength, reason: 'parsed value is not an array' });
    }
    return [];
  }

  return parsed.map(c => ({ ...c, source: strategyName }));
}

// FR-1: Default weights for the 5-field weighted composite. MUST sum to 1.0.
// Asserted at module load — drift here corrupts longitudinal composite_score history.
export const DEFAULT_RANK_WEIGHTS = Object.freeze({
  automation_feasibility: 0.30,
  monthly_revenue_potential: 0.25,
  target_market_specificity: 0.20,
  strategic_fit: 0.15,
  competition_level: 0.10,
});
{
  const sum = Object.values(DEFAULT_RANK_WEIGHTS).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`DEFAULT_RANK_WEIGHTS must sum to 1.0; got ${sum}`);
  }
}

/**
 * Rank candidates by composite score.
 *
 * v2 (default): deterministic 5-field weighted composite over LLM-emitted fields,
 * plus a score_attribution array listing which inputs contributed.
 *
 * v1 (legacy branch): for candidates with `prompt_version` IS NULL (historical
 * rows pre-versioning), uses the original 2-field formula. Prevents silent
 * re-scoring of legacy candidates under v2 weights they were not generated for.
 *
 * Tie-break order: composite_score DESC → parsed_revenue_high DESC → automation_feasibility DESC → name (stable).
 *
 * @param {Object[]} candidates
 * @param {Object} [opts]
 * @param {Object} [opts.weights]                  Override DEFAULT_RANK_WEIGHTS (must sum to 1.0).
 * @param {Object|null} [opts.strategicContext]    Passed to computeStrategicFit.
 * @returns {Object[]} sorted candidates carrying composite_score + score_attribution + score (compat alias).
 */
export function rankCandidates(candidates, opts = {}) {
  const { weights, strategicContext = null } = opts;
  const w = weights ? validateWeights(weights) : DEFAULT_RANK_WEIGHTS;

  const enriched = candidates.map(c => {
    const isLegacy = c.prompt_version == null;
    if (isLegacy) {
      const feasibility = Number(c.automation_feasibility) || 5;
      const competitionBonus = c.competition_level === 'low' ? 10 : c.competition_level === 'medium' ? 5 : 0;
      const score = feasibility * 10 + competitionBonus;
      return {
        ...c,
        composite_score: score,
        score, // compat alias preserves callers reading top.score
        parsed_revenue_high: 0,
        score_attribution: ['legacy_v1_formula', 'automation_feasibility', 'competition_level'],
      };
    }

    const automationFeasibility01 = clamp01(Number(c.automation_feasibility) / 10 || 0);
    const revenue = parseRevenuePotential(c.monthly_revenue_potential);
    const revenueHighRaw = revenue ? revenue.high : 0;
    const revenue01 = revenueHighRaw > 0 ? clamp01(Math.log10(revenueHighRaw + 1) / 6) : 0; // log10($1M) ≈ 6
    const targetSpec01 = clamp01(scoreTargetMarketSpecificity(c.target_market) / 100);
    const strategicFit01 = clamp01(computeStrategicFit(c, strategicContext) / 100);
    const competition01 = c.competition_level === 'low' ? 1 : c.competition_level === 'medium' ? 0.5 : c.competition_level === 'high' ? 0 : 0.5;

    const composite =
      w.automation_feasibility * automationFeasibility01 +
      w.monthly_revenue_potential * revenue01 +
      w.target_market_specificity * targetSpec01 +
      w.strategic_fit * strategicFit01 +
      w.competition_level * competition01;

    const composite_score = Math.round(composite * 100); // 0-100 scale

    const attribution = [];
    if (Number.isFinite(Number(c.automation_feasibility))) attribution.push('automation_feasibility');
    if (revenue != null) attribution.push('monthly_revenue_potential');
    if (c.target_market) attribution.push('target_market_specificity');
    if (strategicContext != null) attribution.push('strategic_fit');
    if (c.competition_level) attribution.push('competition_level');

    return {
      ...c,
      composite_score,
      score: composite_score, // compat alias
      parsed_revenue_high: revenueHighRaw,
      score_attribution: attribution,
    };
  });

  return enriched.sort((a, b) => {
    if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
    if (b.parsed_revenue_high !== a.parsed_revenue_high) return b.parsed_revenue_high - a.parsed_revenue_high;
    const aFeas = Number(a.automation_feasibility) || 0;
    const bFeas = Number(b.automation_feasibility) || 0;
    if (bFeas !== aFeas) return bFeas - aFeas;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function validateWeights(w) {
  const sum = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
  if (Math.abs(sum - 1.0) > 1e-9) {
    throw new Error(`rankCandidates weights must sum to 1.0; got ${sum}`);
  }
  return w;
}

// Heuristic: a target_market string with proper-noun anchors and a quantifier (e.g., "B2B SaaS startups
// with 50-200 employees") is more specific than "everyone" or "consumers". Returns 0-100.
function scoreTargetMarketSpecificity(text) {
  if (!text || typeof text !== 'string') return 0;
  const s = text.trim();
  if (!s) return 0;
  let score = 30; // baseline non-empty
  if (/\b\d/.test(s)) score += 25;                                           // numeric qualifier (size, age band)
  if (/\b(B2B|B2C|SaaS|enterprise|SMB|startup|professional|industry|niche)\b/i.test(s)) score += 20;
  if (s.split(/\s+/).length >= 6) score += 15;                               // sentence-shaped, not one word
  if (/[A-Z][a-z]+/.test(s)) score += 10;                                    // proper-noun-ish anchor
  return Math.min(100, score);
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
