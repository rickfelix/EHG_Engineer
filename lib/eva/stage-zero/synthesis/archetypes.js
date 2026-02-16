/**
 * Synthesis Component 7: Venture Archetype Recognition
 *
 * Classifies ventures into one of 6 EHG archetypes to guide
 * execution strategy and resource allocation:
 * - Democratizer: Makes expensive/exclusive capabilities accessible
 * - Automator: Replaces manual processes with AI pipelines
 * - Capability Productizer: Turns internal capability into external product
 * - First Principles Rebuilder: Rebuilds broken industry from scratch
 * - Vertical Specialist: Deep niche expertise play
 * - Portfolio Connector: Bridges gaps between existing EHG ventures
 *
 * Part of SD-LEO-ORCH-STAGE-INTELLIGENT-VENTURE-001-H
 */

import { getValidationClient } from '../../../llm/client-factory.js';
import { extractUsage } from '../../utils/parse-json.js';

const ARCHETYPES = [
  { key: 'democratizer', label: 'Democratizer', description: 'Makes expensive/exclusive capabilities accessible to underserved markets' },
  { key: 'automator', label: 'Automator', description: 'Replaces manual processes with AI-powered automation pipelines' },
  { key: 'capability_productizer', label: 'Capability Productizer', description: 'Turns internal EHG capability into an external product' },
  { key: 'first_principles_rebuilder', label: 'First Principles Rebuilder', description: 'Rebuilds a broken industry process from scratch' },
  { key: 'vertical_specialist', label: 'Vertical Specialist', description: 'Deep niche expertise creating switching costs' },
  { key: 'portfolio_connector', label: 'Portfolio Connector', description: 'Bridges gaps between existing EHG ventures' },
];

const VALID_ARCHETYPE_KEYS = ARCHETYPES.map(a => a.key);

/**
 * Classify a venture into an EHG archetype.
 *
 * @param {Object} pathOutput - PathOutput from entry path
 * @param {Object} deps - Injected dependencies
 * @param {Object} [deps.logger] - Logger
 * @param {Object} [deps.llmClient] - LLM client override (for testing)
 * @returns {Promise<Object>} Archetype classification
 */
export async function classifyArchetype(pathOutput, deps = {}) {
  const { logger = console, llmClient } = deps;
  const client = llmClient || getValidationClient();

  logger.log('   Classifying venture archetype...');

  const prompt = `You are an EHG venture classifier. Classify this venture into exactly one primary archetype and identify secondary archetypes.

VENTURE:
Name: ${pathOutput.suggested_name}
Problem: ${pathOutput.suggested_problem}
Solution: ${pathOutput.suggested_solution}
Market: ${pathOutput.target_market}
Origin: ${pathOutput.origin_type}

EHG ARCHETYPES:
1. **democratizer**: Makes expensive/exclusive capabilities accessible to underserved markets
2. **automator**: Replaces manual processes with AI-powered automation pipelines
3. **capability_productizer**: Turns internal EHG capability into an external product
4. **first_principles_rebuilder**: Rebuilds a broken industry process from scratch
5. **vertical_specialist**: Deep niche expertise creating switching costs
6. **portfolio_connector**: Bridges gaps between existing EHG ventures

For each archetype, assess fit (0-10) and explain why.

Return JSON:
{
  "primary_archetype": "string (one of the 6 keys)",
  "primary_confidence": 85,
  "primary_rationale": "string",
  "secondary_archetypes": [{"key": "string", "fit_score": 6, "rationale": "string"}],
  "archetype_scores": {
    "democratizer": 8,
    "automator": 7,
    "capability_productizer": 3,
    "first_principles_rebuilder": 2,
    "vertical_specialist": 6,
    "portfolio_connector": 4
  },
  "execution_implications": ["string (what this archetype means for how to build)"],
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
      const primary = VALID_ARCHETYPE_KEYS.includes(analysis.primary_archetype)
        ? analysis.primary_archetype
        : 'automator';

      return {
        component: 'archetypes',
        primary_archetype: primary,
        primary_confidence: analysis.primary_confidence || 50,
        primary_rationale: analysis.primary_rationale || '',
        secondary_archetypes: (analysis.secondary_archetypes || []).filter(
          a => VALID_ARCHETYPE_KEYS.includes(a.key) && a.key !== primary
        ),
        archetype_scores: analysis.archetype_scores || {},
        execution_implications: analysis.execution_implications || [],
        summary: analysis.summary || '',
        usage,
      };
    }
    return defaultArchetypeResult('Could not parse archetype analysis');
  } catch (err) {
    logger.warn(`   Warning: Archetype classification failed: ${err.message}`);
    return defaultArchetypeResult(`Analysis failed: ${err.message}`);
  }
}

function defaultArchetypeResult(summary) {
  return {
    component: 'archetypes',
    primary_archetype: 'automator',
    primary_confidence: 0,
    primary_rationale: '',
    secondary_archetypes: [],
    archetype_scores: {},
    execution_implications: [],
    summary,
  };
}

export { ARCHETYPES, VALID_ARCHETYPE_KEYS };
