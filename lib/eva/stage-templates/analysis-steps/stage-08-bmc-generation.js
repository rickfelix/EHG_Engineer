/**
 * Stage 08 Analysis Step - Business Model Canvas Generation
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Generates all 9 BMC blocks from Stages 1-7 data with structured
 * items containing text, priority (1-3), and evidence citing source stage.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-08-bmc-generation
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const BMC_BLOCKS = [
  'customerSegments',
  'valuePropositions',
  'channels',
  'customerRelationships',
  'revenueStreams',
  'keyResources',
  'keyActivities',
  'keyPartnerships',
  'costStructure',
];

const SYSTEM_PROMPT = `You are EVA's Business Model Canvas Engine. Generate a complete 9-block BMC from venture analysis data.

You MUST output valid JSON with exactly this structure:
{
  "customerSegments": { "items": [{ "text": "...", "priority": 1-3, "evidence": "Source: Stage X - specific finding" }] },
  "valuePropositions": { "items": [...] },
  "channels": { "items": [...] },
  "customerRelationships": { "items": [...] },
  "revenueStreams": { "items": [...] },
  "keyResources": { "items": [...] },
  "keyActivities": { "items": [...] },
  "keyPartnerships": { "items": [...] },
  "costStructure": { "items": [...] }
}

Rules:
- ALL 9 blocks MUST be populated
- keyPartnerships: minimum 1 item; all other blocks: minimum 2 items
- priority: 1=critical, 2=important, 3=nice-to-have
- evidence MUST cite the source stage (e.g., "Source: Stage 4 - competitor X charges $49/mo")
- revenueStreams should reference Stage 7 pricing tiers
- costStructure should reference Stage 6 risk mitigations
- customerSegments should reference Stage 1 target market
- valuePropositions should reference Stage 1 value prop and Stage 3 validation
- Do NOT generate generic BMC items - ground everything in the provided data`;

/**
 * Generate a complete 9-block BMC from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage4Data] - Stage 4 competitive landscape
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage6Data] - Stage 6 risk matrix
 * @param {Object} [params.stage7Data] - Stage 7 pricing strategy
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Complete BMC with 9 blocks
 */
export async function analyzeStage08({ stage1Data, stage4Data, stage5Data, stage6Data, stage7Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage08] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 08 BMC generation requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const pricingContext = stage7Data
    ? `Pricing Strategy:
  Model: ${stage7Data.pricingModel || 'N/A'}
  Tiers: ${stage7Data.tiers?.map(t => `${t.name} ($${t.price}/${t.billing_period})`).join(', ') || 'N/A'}
  ARPA: $${stage7Data.unitEconomics?.arpa || 'N/A'}`
    : 'No pricing data available';

  const riskContext = stage6Data?.risks
    ? `Key Risks (top 3 by score):
${stage6Data.risks
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3)
    .map(r => `  - ${r.category}: ${r.description} (mitigation: ${r.mitigation})`)
    .join('\n')}`
    : 'No risk data available';

  const competitiveContext = stage4Data?.competitors
    ? `Competitors: ${stage4Data.competitors.slice(0, 3).map(c => c.name || 'unnamed').join(', ')}`
    : '';

  const financialContext = stage5Data
    ? `Financial: Year 1 Revenue $${stage5Data.year1?.revenue || 'N/A'}, CAC $${stage5Data.unitEconomics?.cac || 'N/A'}`
    : '';

  const userPrompt = `Generate a complete 9-block Business Model Canvas.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Value Proposition: ${stage1Data.valueProp || 'N/A'}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}
Archetype: ${stage1Data.archetype || 'N/A'}

${pricingContext}

${riskContext}

${competitiveContext}
${financialContext}

Output ONLY valid JSON with all 9 BMC blocks.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize all 9 blocks
  const result = {};
  for (const block of BMC_BLOCKS) {
    const minItems = block === 'keyPartnerships' ? 1 : 2;
    const blockData = parsed[block];
    const items = Array.isArray(blockData?.items) ? blockData.items : [];

    result[block] = {
      items: items.map(item => ({
        text: String(item.text || '').substring(0, 500),
        priority: clamp(item.priority, 1, 3),
        evidence: String(item.evidence || 'No evidence cited'),
      })),
    };

    // Ensure minimum items
    while (result[block].items.length < minItems) {
      result[block].items.push({
        text: `[Placeholder] ${block} item needs elaboration`,
        priority: 3,
        evidence: 'Auto-generated - requires manual review',
      });
    }
  }

  logger.log('[Stage08] Analysis complete', { duration: Date.now() - startTime });
  result.fourBuckets = fourBuckets;
  return result;
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}


export { BMC_BLOCKS };
