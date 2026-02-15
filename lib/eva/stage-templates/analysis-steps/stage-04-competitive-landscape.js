/**
 * Stage 04 Analysis Step - Competitive Landscape with Pricing
 * Part of SD-EVA-FEAT-TEMPLATES-TRUTH-001
 *
 * Discovers competitors, analyzes positioning, threat levels,
 * SWOT, and critically: pricing model per competitor.
 * Feeds Stage 5 with competitive pricing data for financial modeling.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-04-competitive-landscape
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { isSearchEnabled, searchBatch, formatResultsForPrompt } from '../../utils/web-search.js';

const MIN_COMPETITORS = 3;

const SYSTEM_PROMPT = `You are EVA's competitive intelligence engine. Analyze the competitive landscape for a venture idea.

You MUST output valid JSON with this structure:
{
  "competitors": [
    {
      "name": "Competitor Name",
      "position": "Brief market positioning (1-2 sentences)",
      "threat": "H" | "M" | "L",
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1", "weakness2"],
      "swot": {
        "strengths": ["..."],
        "weaknesses": ["..."],
        "opportunities": ["..."],
        "threats": ["..."]
      },
      "pricingModel": {
        "type": "subscription" | "freemium" | "one-time" | "usage-based" | "marketplace" | "advertising" | "enterprise" | "hybrid",
        "lowTier": "$X/mo or $X one-time",
        "highTier": "$X/mo or $X one-time",
        "freeOption": true | false,
        "notes": "Pricing details or caveats"
      }
    }
  ],
  "stage5Handoff": {
    "avgMarketPrice": "estimated average price point",
    "pricingModels": ["subscription", "freemium"],
    "priceRange": {"low": number, "high": number},
    "competitiveDensity": "low" | "medium" | "high"
  }
}

Rules:
- Identify at least ${MIN_COMPETITORS} competitors
- Be specific about pricing - ranges are OK but no "unknown"
- threat level: H = direct competitor with strong overlap, M = partial overlap, L = tangential
- The stage5Handoff object is critical - Stage 5 depends on it for financial modeling
- pricingModel.type must be one of the listed enum values
- priceRange values should be monthly equivalent numbers (no currency symbols)`;

/**
 * Analyze the competitive landscape for a venture.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 output
 * @param {Object} params.stage3Data - Stage 3 output (validation scores for context)
 * @param {string} [params.ventureName]
 * @returns {Promise<{competitors: Array, stage5Handoff: Object}>}
 */
export async function analyzeStage04({ stage1Data, stage3Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage04] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 04 requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  // Web-grounded search for competitor intelligence
  let webContext = '';
  if (isSearchEnabled()) {
    const queries = [
      `${stage1Data.targetMarket || ventureName} competitors market landscape 2024 2025`,
      `${stage1Data.description?.substring(0, 80)} alternative solutions pricing`,
      `${stage1Data.targetMarket || 'SaaS'} market size competitive analysis`,
    ];
    logger.log('[Stage04] Running web search', { queryCount: queries.length });
    const webResults = await searchBatch(queries, { logger });
    webContext = formatResultsForPrompt(webResults, 'Competitive Intelligence Research');
  }

  const userPrompt = `Analyze the competitive landscape for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Value Proposition: ${stage1Data.valueProp}
Target Market: ${stage1Data.targetMarket}
Problem: ${stage1Data.problemStatement || 'N/A'}
${stage3Data?.overallScore ? `Validation Score: ${stage3Data.overallScore}/100` : ''}
${stage3Data?.competitiveBarrier !== undefined ? `Competitive Barrier Score: ${stage3Data.competitiveBarrier}/100` : ''}
${webContext}
Find at least ${MIN_COMPETITORS} competitors. Include pricing details for each.
Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Validate minimum competitors
  if (!Array.isArray(parsed.competitors) || parsed.competitors.length < MIN_COMPETITORS) {
    throw new Error(`Stage 04 requires at least ${MIN_COMPETITORS} competitors (got ${parsed.competitors?.length || 0})`);
  }

  // Normalize competitors
  const competitors = parsed.competitors.map(c => ({
    name: c.name || 'Unknown',
    position: c.position || 'N/A',
    threat: ['H', 'M', 'L'].includes(c.threat) ? c.threat : 'M',
    strengths: ensureArray(c.strengths),
    weaknesses: ensureArray(c.weaknesses),
    swot: {
      strengths: ensureArray(c.swot?.strengths),
      weaknesses: ensureArray(c.swot?.weaknesses),
      opportunities: ensureArray(c.swot?.opportunities),
      threats: ensureArray(c.swot?.threats),
    },
    pricingModel: c.pricingModel || null,
  }));

  // Build stage5Handoff
  const stage5Handoff = parsed.stage5Handoff || buildStage5Handoff(competitors);

  return { competitors, stage5Handoff, fourBuckets };
}

/**
 * Build stage5Handoff from competitor data if LLM didn't provide it.
 */
function buildStage5Handoff(competitors) {
  const pricingTypes = new Set();
  const prices = [];

  for (const c of competitors) {
    if (c.pricingModel?.type) pricingTypes.add(c.pricingModel.type);
    if (c.pricingModel?.lowTier) {
      const num = parseFloat(c.pricingModel.lowTier.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num)) prices.push(num);
    }
    if (c.pricingModel?.highTier) {
      const num = parseFloat(c.pricingModel.highTier.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(num)) prices.push(num);
    }
  }

  const density = competitors.filter(c => c.threat === 'H').length >= 2 ? 'high'
    : competitors.filter(c => c.threat !== 'L').length >= 2 ? 'medium' : 'low';

  return {
    avgMarketPrice: prices.length > 0 ? `$${Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)}/mo` : 'N/A',
    pricingModels: [...pricingTypes],
    priceRange: prices.length > 0 ? { low: Math.min(...prices), high: Math.max(...prices) } : { low: 0, high: 0 },
    competitiveDensity: density,
  };
}

function ensureArray(val) {
  if (Array.isArray(val) && val.length > 0) return val;
  return ['N/A'];
}


export { MIN_COMPETITORS };
