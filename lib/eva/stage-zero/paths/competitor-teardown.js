/**
 * Path 1: Competitor Teardown
 *
 * Analyzes competitor URLs, deconstructs into work components,
 * applies first-principles thinking to rebuild with EHG's automation advantage.
 *
 * Flow:
 * 1. Fetch and analyze each competitor URL
 * 2. Extract business model, value proposition, target market
 * 3. Deconstruct into fundamental work components
 * 4. Apply first-principles: what are the root customer goals?
 * 5. Rebuild with EHG automation advantage
 * 6. Generate comparative gap analysis (multiple competitors)
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-C
 */

import { createPathOutput } from '../interfaces.js';
import { getValidationClient } from '../../../llm/client-factory.js';

/**
 * Execute the competitor teardown path.
 *
 * @param {Object} params
 * @param {string[]} params.urls - Competitor URLs to analyze
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Function} [deps.fetchUrl] - URL fetcher (for testing)
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} PathOutput
 */
export async function executeCompetitorTeardown({ urls }, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;

  if (!urls || urls.length === 0) {
    throw new Error('At least one competitor URL is required');
  }

  logger.log(`   Analyzing ${urls.length} competitor(s)...`);

  // Step 1: Analyze each competitor
  const analyses = [];
  for (const url of urls) {
    logger.log(`   Analyzing: ${url}`);
    const analysis = await analyzeCompetitor(url, { logger, llmClient });
    analyses.push(analysis);
    logger.log(`   Completed: ${analysis.company_name || url}`);
  }

  // Step 2: First-principles deconstruction
  logger.log('   Applying first-principles deconstruction...');
  const deconstruction = await deconstructToFirstPrinciples(analyses, { logger, llmClient });

  // Step 3: Gap analysis (if multiple competitors)
  let gapAnalysis = null;
  if (analyses.length > 1) {
    logger.log('   Running comparative gap analysis...');
    gapAnalysis = await runGapAnalysis(analyses, { logger, llmClient });
  }

  // Step 4: Build PathOutput
  return createPathOutput({
    origin_type: 'competitor_teardown',
    raw_material: {
      competitor_analyses: analyses,
      first_principles: deconstruction,
      gap_analysis: gapAnalysis,
      analyzed_at: new Date().toISOString(),
    },
    competitor_urls: urls,
    suggested_name: deconstruction.suggested_venture_name || '',
    suggested_problem: deconstruction.root_customer_problem || '',
    suggested_solution: deconstruction.automation_solution || '',
    target_market: deconstruction.target_market || '',
    metadata: {
      path: 'competitor_teardown',
      url_count: urls.length,
      companies_analyzed: analyses.map(a => a.company_name).filter(Boolean),
    },
  });
}

/**
 * Analyze a single competitor from their URL.
 *
 * @param {string} url - Competitor URL
 * @param {Object} deps - Dependencies
 * @returns {Promise<Object>} Competitor analysis
 */
async function analyzeCompetitor(url, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  const prompt = `Analyze this competitor business for venture creation purposes.

Competitor URL: ${url}

Based on what you know about this URL/company, provide a structured analysis:

1. **Company Name**: The company name
2. **Business Model**: How they make money (SaaS, marketplace, service, etc.)
3. **Value Proposition**: What they promise customers
4. **Target Market**: Who they serve (segment, size, geography)
5. **Pricing**: Pricing model and range if known
6. **Key Features**: Top 5 features/capabilities
7. **Work Components**: Break down their service into fundamental work tasks
8. **Automation Potential**: Which work components could be automated with AI
9. **Weaknesses**: Known limitations, complaints, or gaps
10. **Differentiation Opportunity**: Where EHG could do better through automation

Return a JSON object with these fields:
{
  "company_name": "string",
  "url": "string",
  "business_model": "string",
  "value_proposition": "string",
  "target_market": "string",
  "pricing_model": "string",
  "key_features": ["string"],
  "work_components": [{"component": "string", "automation_potential": "high|medium|low", "description": "string"}],
  "weaknesses": ["string"],
  "differentiation_opportunities": ["string"]
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[0]), url, analyzed_at: new Date().toISOString() };
    }
    return { url, company_name: url, error: 'Could not parse analysis', raw_response: text.substring(0, 500) };
  } catch (err) {
    logger.warn(`   Warning: Analysis failed for ${url}: ${err.message}`);
    return { url, company_name: url, error: err.message };
  }
}

/**
 * Apply first-principles thinking to deconstruct competitors.
 *
 * @param {Object[]} analyses - Competitor analyses
 * @param {Object} deps - Dependencies
 * @returns {Promise<Object>} First-principles deconstruction
 */
async function deconstructToFirstPrinciples(analyses, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  const competitorSummaries = analyses.map(a =>
    `${a.company_name}: ${a.business_model || 'unknown model'}, serves ${a.target_market || 'unknown market'}, offers ${(a.key_features || []).join(', ') || 'unknown features'}`
  ).join('\n');

  const prompt = `You are a first-principles venture strategist for EHG, a fully automated holding group.

EHG's core advantage: Everything is AI-operated. No human employees. This means:
- Lower operating costs
- Faster iteration
- 24/7 operation
- Scalable across geographies without headcount

Given these competitor analyses:
${competitorSummaries}

Apply first-principles deconstruction:

1. What are the ROOT customer goals these competitors serve? (Not the features, the fundamental needs)
2. What work components are they doing that an AI could do cheaper/faster/better?
3. How would you rebuild this offering with full automation?
4. What venture name captures the automated alternative?
5. What specific market segment should EHG target?

Return JSON:
{
  "root_customer_goals": ["string"],
  "automatable_components": [{"component": "string", "current_cost": "string", "automation_approach": "string"}],
  "automation_solution": "string (the rebuilt offering description)",
  "suggested_venture_name": "string",
  "root_customer_problem": "string (the core problem statement)",
  "target_market": "string",
  "cost_advantage_estimate": "string",
  "speed_advantage_estimate": "string"
}`;

  try {
    const response = await client.messages.create({
      model: client._model || 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { error: 'Could not parse deconstruction', raw_response: text.substring(0, 500) };
  } catch (err) {
    logger.warn(`   Warning: First-principles analysis failed: ${err.message}`);
    return { error: err.message };
  }
}

/**
 * Run comparative gap analysis across multiple competitors.
 *
 * @param {Object[]} analyses - Competitor analyses
 * @param {Object} deps - Dependencies
 * @returns {Promise<Object>} Gap analysis
 */
async function runGapAnalysis(analyses, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  const summaries = analyses.map(a => ({
    name: a.company_name,
    model: a.business_model,
    features: a.key_features,
    weaknesses: a.weaknesses,
  }));

  const prompt = `Compare these competitors and identify gaps in the market:

${JSON.stringify(summaries, null, 2)}

Identify:
1. Features that ALL competitors have (table stakes)
2. Features that SOME have (differentiators)
3. Features that NONE have (gaps/opportunities)
4. Common weaknesses across competitors
5. Market segments underserved by all

Return JSON:
{
  "table_stakes": ["string"],
  "differentiators": [{"feature": "string", "who_has_it": ["string"]}],
  "gaps": ["string"],
  "common_weaknesses": ["string"],
  "underserved_segments": ["string"]
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
      return JSON.parse(jsonMatch[0]);
    }
    return { error: 'Could not parse gap analysis' };
  } catch (err) {
    logger.warn(`   Warning: Gap analysis failed: ${err.message}`);
    return { error: err.message };
  }
}
