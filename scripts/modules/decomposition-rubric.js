/**
 * Decomposition Quality Rubric — Scores SD hierarchy decompositions
 *
 * SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001-E (C5)
 *
 * Evaluates auto-decomposed SD hierarchies on 4 dimensions (1-5 each):
 * - Boundary cleanliness: No overlapping scope between siblings
 * - Scope balance: LOC distribution within 2x of mean
 * - Dependency clarity: Explicit depends_on links between children
 * - Completeness: All architecture plan phases are covered
 *
 * @module scripts/modules/decomposition-rubric
 */

import { getLLMClient } from '../../lib/llm/index.js';
import { parseJSON, extractUsage } from '../../lib/eva/utils/parse-json.js';

const DIMENSIONS = ['boundary', 'balance', 'dependency', 'completeness'];
const THRESHOLD = 3.5;

const RUBRIC_SYSTEM_PROMPT = `You are a decomposition quality evaluator for software engineering work breakdown structures.

Score the following SD hierarchy decomposition on 4 dimensions (1-5 each):

1. **boundary** (1-5): Scope overlap between sibling SDs.
   5 = No overlap, clear boundaries. 1 = Significant scope duplication.

2. **balance** (1-5): LOC/effort distribution across children.
   5 = Even distribution (within 2x of mean). 1 = One child has >60% of total scope.

3. **dependency** (1-5): Clarity of inter-child dependencies.
   5 = All dependencies explicit with clear ordering. 1 = Circular or missing dependencies.

4. **completeness** (1-5): Coverage of architecture plan phases.
   5 = Every phase mapped to a child. 1 = Multiple phases unaccounted for.

Output ONLY valid JSON:
{
  "boundary": { "score": N, "reasoning": "..." },
  "balance": { "score": N, "reasoning": "..." },
  "dependency": { "score": N, "reasoning": "..." },
  "completeness": { "score": N, "reasoning": "..." },
  "aggregate": N,
  "recommendations": ["..."]
}`;

/**
 * Score a decomposed hierarchy using LLM-based rubric evaluation.
 *
 * @param {Object[]} children - Child SD records with title, description, scope, dependencies
 * @param {Object} archPlan - Architecture plan with phases
 * @param {Object} [options]
 * @param {Object} [options.logger]
 * @returns {Promise<Object>} Rubric scores with aggregate and recommendations
 */
export async function scoreDecomposition(children, archPlan, options = {}) {
  const { logger = console } = options;

  if (!children || children.length === 0) {
    return { aggregate: 0, scores: {}, recommendations: ['No children to score'], passed: false };
  }

  // Build context for LLM
  const childSummaries = children.map((c, i) => ({
    index: i + 1,
    title: c.title,
    scope: c.scope || c.description?.substring(0, 200),
    dependencies: c.dependencies || [],
  }));

  const phases = archPlan?.sections?.implementation_phases
    || extractPhasesFromContent(archPlan?.content || '');

  const userPrompt = `## Architecture Plan Phases
${phases.map((p, i) => `${i + 1}. ${p.title || p}: ${p.description || ''}`).join('\n')}

## Decomposed Children (${children.length})
${childSummaries.map(c => `${c.index}. ${c.title}\n   Scope: ${c.scope}\n   Dependencies: ${JSON.stringify(c.dependencies)}`).join('\n\n')}

Score this decomposition.`;

  try {
    const client = getLLMClient({ purpose: 'content-generation' });
    const response = await client.complete(RUBRIC_SYSTEM_PROMPT, userPrompt, { timeout: 60000 });
    const result = parseJSON(response);

    const scores = {};
    let total = 0;
    for (const dim of DIMENSIONS) {
      const score = result[dim]?.score ?? 3;
      scores[dim] = { score, reasoning: result[dim]?.reasoning || '' };
      total += score;
    }

    const aggregate = total / DIMENSIONS.length;
    const passed = aggregate >= THRESHOLD;

    logger.log(`[DecompositionRubric] Scored: ${aggregate.toFixed(1)}/5 (${passed ? 'PASS' : 'NEEDS_ITERATION'})`);

    return {
      aggregate,
      scores,
      recommendations: result.recommendations || [],
      passed,
      threshold: THRESHOLD,
    };
  } catch (err) {
    logger.warn(`[DecompositionRubric] LLM scoring failed, using heuristic: ${err.message}`);
    return scoreHeuristic(children, phases);
  }
}

/**
 * Heuristic fallback when LLM is unavailable.
 */
function scoreHeuristic(children, phases) {
  const scores = {};

  // Boundary: check title/scope overlap via word intersection
  const scopes = children.map(c => new Set((c.scope || c.title || '').toLowerCase().split(/\s+/)));
  let maxOverlap = 0;
  for (let i = 0; i < scopes.length; i++) {
    for (let j = i + 1; j < scopes.length; j++) {
      const intersection = [...scopes[i]].filter(w => scopes[j].has(w) && w.length > 3);
      const overlap = intersection.length / Math.min(scopes[i].size, scopes[j].size);
      maxOverlap = Math.max(maxOverlap, overlap);
    }
  }
  scores.boundary = { score: maxOverlap > 0.5 ? 2 : maxOverlap > 0.3 ? 3 : 4, reasoning: `Max word overlap: ${(maxOverlap * 100).toFixed(0)}%` };

  // Balance: check child count distribution
  scores.balance = { score: children.length >= 2 && children.length <= 6 ? 4 : 3, reasoning: `${children.length} children` };

  // Dependency: check if any dependencies defined
  const hasDeps = children.some(c => c.dependencies?.length > 0);
  scores.dependency = { score: hasDeps ? 4 : 2, reasoning: hasDeps ? 'Dependencies defined' : 'No dependencies' };

  // Completeness: phases covered
  const phaseCoverage = phases.length > 0 ? Math.min(children.length / phases.length, 1) : 0.5;
  scores.completeness = { score: phaseCoverage >= 1 ? 5 : phaseCoverage >= 0.8 ? 4 : 3, reasoning: `${children.length} children / ${phases.length} phases` };

  const aggregate = DIMENSIONS.reduce((s, d) => s + scores[d].score, 0) / DIMENSIONS.length;

  return { aggregate, scores, recommendations: [], passed: aggregate >= THRESHOLD, threshold: THRESHOLD };
}

/**
 * Extract phase titles from markdown content.
 */
function extractPhasesFromContent(content) {
  const phases = [];
  const regex = /^#{1,3}\s*(?:Phase|Implementation Phase|Step)\s+(\d+)[:\s]*(.*)$/gim;
  let match;
  while ((match = regex.exec(content)) !== null) {
    phases.push({ number: parseInt(match[1]), title: match[2].trim() });
  }
  return phases;
}

export { DIMENSIONS, THRESHOLD };
