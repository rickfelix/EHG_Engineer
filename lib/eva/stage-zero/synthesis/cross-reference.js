/**
 * Synthesis Component 1: Cross-Reference Intellectual Capital + Outcome History
 *
 * Checks every venture against two pools:
 * - Intellectual capital (prior brainstorms, nursery items, strategic observations, research links)
 * - Outcome history (kill gate results, drift analyses, retrospective learnings, success patterns)
 *
 * Reports not just what was thought about before, but what was learned from doing.
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-F
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';


/**
 * Cross-reference a venture candidate against intellectual capital and outcome history.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} deps.supabase - Supabase client
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Cross-reference enrichment
 */
export async function crossReferenceIntellectualCapital(pathOutput, deps = {}) {
  const { supabase, logger = console, llmClient } = deps;

  if (!supabase) {
    throw new Error('supabase client is required');
  }

  logger.log('   Cross-referencing intellectual capital...');

  // Load intellectual capital
  const intellectualCapital = await loadIntellectualCapital(supabase);
  logger.log(`   Found ${intellectualCapital.length} prior knowledge item(s)`);

  // Load outcome history
  const outcomeHistory = await loadOutcomeHistory(supabase);
  logger.log(`   Found ${outcomeHistory.length} outcome record(s)`);

  // Load domain knowledge patterns
  const domainPatterns = await loadDomainKnowledge(supabase, pathOutput, logger);

  if (intellectualCapital.length === 0 && outcomeHistory.length === 0 && domainPatterns.length === 0) {
    logger.log('   No prior knowledge, outcomes, or domain intelligence to cross-reference');
    return {
      component: 'cross_reference',
      matches: [],
      lessons: [],
      relevance_score: 0,
      summary: 'No prior knowledge or outcomes found for cross-referencing.',
    };
  }

  // Use LLM to find relevant connections
  const client = llmClient || getValidationClient();
  const analysis = await analyzeCrossReferences(client, pathOutput, intellectualCapital, outcomeHistory, { logger, domainPatterns });

  return {
    component: 'cross_reference',
    matches: analysis.matches || [],
    lessons: analysis.lessons || [],
    relevance_score: analysis.relevance_score || 0,
    related_items_count: intellectualCapital.length + outcomeHistory.length + domainPatterns.length,
    domain_knowledge_count: domainPatterns.length,
    summary: analysis.summary || '',
  };
}

/**
 * Load intellectual capital from database.
 * Sources: brainstorm sessions, nursery items, strategic observations.
 */
async function loadIntellectualCapital(supabase) {
  const items = [];

  // Load nursery items (parked ventures = prior thinking)
  const { data: nurseryItems } = await supabase
    .from('venture_nursery')
    .select('id, name, problem_statement, solution, parked_reason')
    .eq('status', 'parked')
    .limit(20);

  if (nurseryItems) {
    items.push(...nurseryItems.map(n => ({
      type: 'nursery_item',
      id: n.id,
      name: n.name,
      content: `${n.problem_statement} - ${n.solution}`,
      context: n.parked_reason,
    })));
  }

  // Load brainstorm sessions
  const { data: brainstorms } = await supabase
    .from('brainstorm_sessions')
    .select('id, topic, conclusion, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (brainstorms) {
    items.push(...brainstorms.map(b => ({
      type: 'brainstorm',
      id: b.id,
      name: b.topic,
      content: b.conclusion || b.topic,
      context: `Brainstorm on ${b.created_at}`,
    })));
  }

  return items;
}

/**
 * Load outcome history from database.
 * Sources: retrospectives, issue patterns.
 */
async function loadOutcomeHistory(supabase) {
  const items = [];

  // Load retrospective learnings
  const { data: retros } = await supabase
    .from('retrospectives')
    .select('id, sd_id, improvements, what_went_well, what_went_wrong')
    .order('created_at', { ascending: false })
    .limit(20);

  if (retros) {
    items.push(...retros.map(r => ({
      type: 'retrospective',
      id: r.id,
      sd_id: r.sd_id,
      lessons: [
        ...(r.improvements || []),
        ...(r.what_went_well || []),
      ].slice(0, 5),
      warnings: (r.what_went_wrong || []).slice(0, 3),
    })));
  }

  // Load issue patterns
  const { data: patterns } = await supabase
    .from('issue_patterns')
    .select('id, pattern_name, root_cause, resolution, frequency')
    .order('frequency', { ascending: false })
    .limit(10);

  if (patterns) {
    items.push(...patterns.map(p => ({
      type: 'issue_pattern',
      id: p.id,
      name: p.pattern_name,
      lesson: `Root cause: ${p.root_cause}. Resolution: ${p.resolution}`,
      frequency: p.frequency,
    })));
  }

  return items;
}

/**
 * Load domain knowledge relevant to this venture candidate.
 * Uses tags and problem areas for cross-venture pattern matching.
 */
async function loadDomainKnowledge(supabase, pathOutput, logger = console) {
  try {
    const { createDomainKnowledgeService } = await import('../../../domain-intelligence/domain-knowledge-service.js');
    const service = createDomainKnowledgeService(supabase, { logger });
    const tags = [];
    const problemAreas = [];

    // Extract tags from venture candidate
    if (pathOutput.target_market) tags.push(pathOutput.target_market.toLowerCase());
    if (pathOutput.suggested_problem) {
      const words = pathOutput.suggested_problem.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      problemAreas.push(...words.slice(0, 3));
    }

    if (tags.length === 0 && problemAreas.length === 0) return [];

    const patterns = await service.findCrossVenturePatterns(tags, problemAreas, 10);
    logger.log(`   Found ${patterns.length} domain knowledge pattern(s)`);
    return patterns;
  } catch (err) {
    logger.log(`   Domain knowledge lookup skipped: ${err.message}`);
    return [];
  }
}

/**
 * Use LLM to analyze cross-references between venture and prior knowledge.
 */
async function analyzeCrossReferences(client, pathOutput, intellectualCapital, outcomeHistory, { logger = console, domainPatterns = [] } = {}) {
  const ventureDesc = `Name: ${pathOutput.suggested_name}\nProblem: ${pathOutput.suggested_problem}\nSolution: ${pathOutput.suggested_solution}\nMarket: ${pathOutput.target_market}`;

  const icSummary = intellectualCapital.slice(0, 10).map(i =>
    `[${i.type}] ${i.name}: ${i.content}`
  ).join('\n');

  const ohSummary = outcomeHistory.slice(0, 10).map(o => {
    if (o.type === 'retrospective') return `[retro] Lessons: ${(o.lessons || []).join('; ')}`;
    return `[pattern] ${o.name}: ${o.lesson}`;
  }).join('\n');

  const dkSummary = domainPatterns.slice(0, 5).map(d =>
    `[${d.knowledge_type}] ${d.title} (confidence: ${Math.round((d.effective_confidence || d.confidence) * 100)}%): ${d.content}`
  ).join('\n');

  const prompt = `You are analyzing a venture candidate against EHG's prior knowledge and outcomes.

VENTURE CANDIDATE:
${ventureDesc}

INTELLECTUAL CAPITAL (prior thinking):
${icSummary || 'None available'}

OUTCOME HISTORY (lessons learned):
${ohSummary || 'None available'}

DOMAIN INTELLIGENCE (accumulated market knowledge):
${dkSummary || 'None available'}

Find connections between this venture and prior knowledge:
1. Which prior ideas or brainstorms relate to this venture?
2. What lessons from outcomes apply here?
3. What should the chairman know from EHG's institutional memory?

Return JSON:
{
  "matches": [{"source_type": "string", "source_name": "string", "relevance": "high|medium|low", "connection": "string"}],
  "lessons": [{"lesson": "string", "source": "string", "applicability": "string"}],
  "relevance_score": 75,
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
      return { ...JSON.parse(jsonMatch[0]), usage };
    }
    return { matches: [], lessons: [], relevance_score: 0, summary: 'Could not parse cross-reference analysis' };
  } catch (err) {
    logger.warn(`   Warning: Cross-reference analysis failed: ${err.message}`);
    return { matches: [], lessons: [], relevance_score: 0, summary: `Analysis failed: ${err.message}` };
  }
}
