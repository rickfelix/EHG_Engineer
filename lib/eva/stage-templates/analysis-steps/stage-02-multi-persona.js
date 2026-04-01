/**
 * Stage 02 Analysis Step - Multi-Persona Analysis (MoA)
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Runs a Mixture-of-Agents multi-persona analysis on the Stage 1
 * draft idea. Each persona evaluates the venture from a different
 * perspective and assigns a 0-100 integer score. The seven persona
 * scores align to Stage 3's kill-gate metrics.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-02-multi-persona
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { sanitizeForPrompt } from '../../utils/sanitize-for-prompt.js';

/**
 * Persona definitions aligned to Stage 3 kill-gate metrics.
 * Each persona maps 1:1 to a Stage 3 metric.
 */
const PERSONAS = [
  {
    id: 'market-strategist',
    name: 'Market Strategist',
    stage3Metric: 'marketFit',
    focus: 'market size, timing, product-market fit signals',
  },
  {
    id: 'customer-advocate',
    name: 'Customer Advocate',
    stage3Metric: 'customerNeed',
    focus: 'pain severity, willingness to pay, frequency of need',
  },
  {
    id: 'growth-hacker',
    name: 'Growth Hacker',
    stage3Metric: 'momentum',
    focus: 'virality potential, distribution channels, early traction signals',
  },
  {
    id: 'revenue-analyst',
    name: 'Revenue Analyst',
    stage3Metric: 'revenuePotential',
    focus: 'monetization model, pricing power, revenue ceiling',
  },
  {
    id: 'moat-architect',
    name: 'Moat Architect',
    stage3Metric: 'competitiveBarrier',
    focus: 'defensibility, network effects, switching costs, IP',
  },
  {
    id: 'ops-realist',
    name: 'Operations Realist',
    stage3Metric: 'executionFeasibility',
    focus: 'technical complexity, resource requirements, time to market',
  },
  {
    id: 'product-designer',
    name: 'Product Designer',
    stage3Metric: 'designQuality',
    focus: 'user experience clarity, interaction simplicity, design-driven differentiation, adoption friction, interface accessibility',
  },
];

const SYSTEM_PROMPT = `You are an AI venture analyst running a multi-persona evaluation. You will evaluate a venture idea from a specific perspective.

You MUST output valid JSON with exactly these fields:
- model (string): The persona identifier
- summary (string, min 20 chars): Your assessment summary
- strengths (string[]): At least 1 strength
- risks (string[]): At least 1 risk
- score (integer 0-100): Your honest score from this perspective

Rules:
- Be brutally honest - do not inflate scores
- Score 0-30: fundamentally flawed from this perspective
- Score 31-50: significant concerns that could be fatal
- Score 51-70: viable but with notable gaps
- Score 71-85: strong with minor concerns
- Score 86-100: exceptional (rare, requires strong evidence)
- Ground every claim in the provided data

Anti-Sycophancy (SD-LEO-ORCH-GSTACK-TASTE-GATE-001-B):
- NEVER say: "interesting approach", "many ways to think about this", "you might want to consider", "that could work"
- ALWAYS take a clear position — state whether this is strong or weak and WHY
- If the idea is weak, say so directly with specific evidence
- "Interest is not demand" — waitlists and excitement are NOT evidence of real demand
- "Status quo is your real competitor" — identify what users do today without this product
- Challenge vague claims: "large market" or "growing demand" must cite specifics`;

/**
 * Run multi-persona analysis on a Stage 1 draft idea.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 output (description, valueProp, targetMarket, problemStatement)
 * @param {string} [params.ventureName] - Venture name for context
 * @returns {Promise<{critiques: Array, compositeScore: number}>}
 */
export async function analyzeStage02({ stage1Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage02] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 02 requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const ventureContext = `Venture: ${ventureName || 'Unnamed'}
Description: ${sanitizeForPrompt(stage1Data.description)}
Value Proposition: ${sanitizeForPrompt(stage1Data.valueProp)}
Target Market: ${sanitizeForPrompt(stage1Data.targetMarket)}
Problem Statement: ${sanitizeForPrompt(stage1Data.problemStatement || 'Not specified')}`;

  // Run all personas (sequentially to avoid rate limits)
  const critiques = [];
  const usages = [];
  const allFourBuckets = [];
  let llmFallbackCount = 0;
  const LLM_EXPECTED_FIELDS = ['summary', 'score', 'strengths', 'risks'];

  for (const persona of PERSONAS) {
    const userPrompt = `Evaluate this venture as the "${persona.name}" persona.
Your focus area: ${persona.focus}

${ventureContext}

Output ONLY valid JSON.`;

    const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { max_tokens: 4000, timeout: 120000 });
    const personaUsage = extractUsage(response);
    if (personaUsage) usages.push(personaUsage);
    const parsed = parseJSON(response);

    // Accumulate epistemic classifications across all personas
    const personaBuckets = parseFourBuckets(parsed, { logger });
    if (personaBuckets?.classifications?.length > 0) {
      allFourBuckets.push(...personaBuckets.classifications);
    }

    // Detect LLM fallback: warn when persona output lacks expected fields
    const presentFields = LLM_EXPECTED_FIELDS.filter(f => parsed[f] !== undefined && parsed[f] !== null);
    if (presentFields.length < LLM_EXPECTED_FIELDS.length) {
      const missing = LLM_EXPECTED_FIELDS.filter(f => !presentFields.includes(f));
      logger.warn(`[Stage02] Persona "${persona.id}" LLM output missing fields: [${missing.join(', ')}] — using defaults`);
      llmFallbackCount++;
    }

    critiques.push({
      model: persona.id,
      summary: parsed.summary || `${persona.name} analysis`,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [parsed.strengths || 'N/A'],
      risks: Array.isArray(parsed.risks) ? parsed.risks : [parsed.risks || 'N/A'],
      score: clampScore(parsed.score, logger, `persona.${persona.id}.score`),
    });
  }

  // Aggregate fourBuckets from all personas
  const fourBuckets = {
    classifications: allFourBuckets,
    summary: allFourBuckets.reduce((acc, c) => {
      const bucket = (c.bucket || '').toLowerCase();
      if (bucket in acc) acc[bucket]++;
      return acc;
    }, { facts: 0, assumptions: 0, simulations: 0, unknowns: 0 }),
  };

  // Compute composite score (average, rounded)
  const sum = critiques.reduce((acc, c) => acc + c.score, 0);
  const compositeScore = Math.round(sum / critiques.length);

  // Aggregate token usage across all persona calls
  const usage = usages.length > 0 ? {
    inputTokens: usages.reduce((acc, u) => acc + (u.inputTokens || 0), 0),
    outputTokens: usages.reduce((acc, u) => acc + (u.outputTokens || 0), 0),
  } : null;

  logger.log('[Stage02] Analysis complete', { duration: Date.now() - startTime });

  // Transform persona critiques into template-expected output schema
  const metrics = {};
  const evidence = {};
  const EVIDENCE_MAP = {
    'market-strategist': 'market',
    'customer-advocate': 'customer',
    'growth-hacker': 'growth',
    'revenue-analyst': 'revenue',
    'moat-architect': 'competitive',
    'ops-realist': 'execution',
    'product-designer': 'design',
  };
  for (const c of critiques) {
    // Map persona to metric
    const persona = PERSONAS.find(p => p.id === c.model);
    if (persona) metrics[persona.stage3Metric] = c.score;
    // Map persona to evidence domain
    const evidenceKey = EVIDENCE_MAP[c.model];
    if (evidenceKey) {
      evidence[evidenceKey] = `${c.summary} Strengths: ${c.strengths.join('; ')}. Risks: ${c.risks.join('; ')}.`;
    }
  }

  // Build analysis perspectives from grouped critiques
  const strategicPersonas = critiques.filter(c => ['market-strategist', 'revenue-analyst'].includes(c.model));
  const technicalPersonas = critiques.filter(c => ['ops-realist', 'moat-architect'].includes(c.model));
  const tacticalPersonas = critiques.filter(c => ['growth-hacker', 'customer-advocate', 'product-designer'].includes(c.model));

  const buildPerspective = (group) => group.map(c => `${c.summary} (Score: ${c.score})`).join(' ') || 'No data available for this perspective.';

  return {
    analysis: {
      strategic: buildPerspective(strategicPersonas),
      technical: buildPerspective(technicalPersonas),
      tactical: buildPerspective(tacticalPersonas),
    },
    metrics,
    evidence,
    compositeScore,
    critiques, // preserve raw data for downstream
    fourBuckets,
    llmFallbackCount,
    usage,
  };
}

/**
 * Clamp a score to integer 0-100.
 * @param {*} score
 * @param {Object} [logger] - Logger instance; when provided, warns on fallback
 * @param {string} [fieldName] - Descriptive field name for log context
 * @returns {number}
 */
function clampScore(score, logger, fieldName) {
  const n = Number(score);
  if (!Number.isFinite(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: NaN score coerced to 50`, { original: score });
    return 50; // default to neutral if parsing fails
  }
  const clamped = Math.max(0, Math.min(100, Math.round(n)));
  if (clamped !== Math.round(n)) {
    if (logger) logger.warn(`[Fallback] ${fieldName}: score ${n} clamped to [0,100] → ${clamped}`, { original: score });
  }
  return clamped;
}


export { PERSONAS };
