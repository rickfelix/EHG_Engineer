/**
 * Stage 01 Analysis Step - Hydration from Stage 0 Synthesis
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Consumes Stage 0 synthesis output and hydrates into a structured
 * Draft Idea with description, value proposition, target market,
 * and a required problemStatement field.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-01-hydration
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const ARCHETYPES = [
  'saas', 'marketplace', 'deeptech', 'hardware', 'services', 'media', 'fintech',
];

const SYSTEM_PROMPT = `You are EVA's Stage 1 Hydration Engine. Your job is to transform a raw venture synthesis from Stage 0 into a structured draft idea.

You MUST output valid JSON with exactly these fields:
- description (string, min 50 chars): A clear description of the venture idea
- valueProp (string, min 20 chars): The core value proposition
- targetMarket (string, min 10 chars): Who this is for
- problemStatement (string, min 30 chars): The specific problem being solved
- archetype (string): One of: saas, marketplace, deeptech, hardware, services, media, fintech
- keyAssumptions (array of strings): 2-5 key assumptions the venture relies on
- moatStrategy (string): Competitive advantage or defensibility strategy
- successCriteria (array of strings): 2-4 measurable success criteria

Rules:
- Use the synthesis data to ground every field
- problemStatement is REQUIRED and must be specific, not generic
- If the synthesis includes a reframed problem, prefer that over the raw intent
- Keep language crisp and actionable
- Do NOT invent claims not supported by the synthesis
- If template context is provided from a similar successful venture, use it as calibration guidance (not as a replacement for the synthesis data)`;

/**
 * Hydrate Stage 0 synthesis into a structured Draft Idea.
 *
 * @param {Object} params
 * @param {Object} params.synthesis - Stage 0 synthesis output
 * @param {string} [params.ventureName] - Optional venture name
 * @param {Object} [params.templateContext] - Optional template context from onBeforeAnalysis
 * @returns {Promise<Object>} Draft idea matching stage-01 template schema
 */
export async function analyzeStage01({ synthesis, ventureName, templateContext, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage01] Starting analysis', { ventureName });
  if (!synthesis) {
    throw new Error('Stage 1 hydration requires Stage 0 synthesis data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const templateHint = templateContext
    ? `\n\nTemplate Context (from similar successful venture - use as calibration):\n${JSON.stringify(templateContext, null, 2)}`
    : '';

  const userPrompt = `Transform this Stage 0 synthesis into a structured draft idea.

Venture: ${ventureName || 'Unnamed'}
Synthesis Data:
${JSON.stringify(synthesis, null, 2)}
${templateHint}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize description (min 50 chars)
  const description = String(parsed.description || synthesis.description || '').substring(0, 2000);

  // Normalize problemStatement (min 20 chars per schema)
  const problemStatement = String(
    parsed.problemStatement || synthesis.reframedProblem || synthesis.problemStatement || ''
  ).substring(0, 2000);

  // Normalize valueProp (min 20 chars)
  const valueProp = String(parsed.valueProp || synthesis.valueProp || '').substring(0, 2000);

  // Normalize targetMarket (min 10 chars)
  const targetMarket = String(parsed.targetMarket || synthesis.targetMarket || '').substring(0, 500);

  // Normalize archetype (must be valid enum)
  const archetype = ARCHETYPES.includes(parsed.archetype)
    ? parsed.archetype
    : ARCHETYPES.includes(synthesis.archetype)
      ? synthesis.archetype
      : 'saas';

  // Normalize keyAssumptions (optional array)
  const keyAssumptions = Array.isArray(parsed.keyAssumptions) && parsed.keyAssumptions.length > 0
    ? parsed.keyAssumptions.map(a => String(a).substring(0, 500))
    : [];

  // Normalize moatStrategy (optional string)
  const moatStrategy = String(parsed.moatStrategy || '').substring(0, 1000);

  // Normalize successCriteria (optional array)
  const successCriteria = Array.isArray(parsed.successCriteria) && parsed.successCriteria.length > 0
    ? parsed.successCriteria.map(c => String(c).substring(0, 500))
    : [];

  // Build source provenance: track which fields came from Stage 0 vs LLM
  const sourceProvenance = {};
  for (const field of ['description', 'problemStatement', 'valueProp', 'targetMarket', 'archetype', 'moatStrategy']) {
    const val = { description, problemStatement, valueProp, targetMarket, archetype, moatStrategy }[field];
    if (!val) continue;
    sourceProvenance[field] = synthesis[field] ? 'stage0' : 'llm';
  }

  logger.log('[Stage01] Analysis complete', { duration: Date.now() - startTime });
  return {
    description,
    problemStatement,
    valueProp,
    targetMarket,
    archetype,
    keyAssumptions,
    moatStrategy,
    successCriteria,
    sourceProvenance,
    fourBuckets,
    usage,
  };
}

export { ARCHETYPES as STAGE1_ARCHETYPES };
