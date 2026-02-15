/**
 * Stage 06 Analysis Step - Risk Matrix Generation
 * Part of SD-EVA-FEAT-TEMPLATES-ENGINE-001
 *
 * Consumes Stages 1-5 data and generates a structured risk register
 * with 2-factor scoring (probability x consequence) and source attribution.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-06-risk-matrix
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const MIN_RISKS = 8;
const MIN_CATEGORIES = 3;

const RISK_CATEGORIES = [
  'Market', 'Product', 'Technical', 'Legal/Compliance', 'Financial', 'Operational',
];

const SYSTEM_PROMPT = `You are EVA's Risk Assessment Engine. Generate a structured risk register for a venture based on analysis from Stages 1-5.

You MUST output valid JSON with exactly this structure:
{
  "risks": [
    {
      "id": "RISK-001",
      "category": "Market|Product|Technical|Legal/Compliance|Financial|Operational",
      "description": "Clear risk description (min 10 chars)",
      "probability": 1-5,
      "consequence": 1-5,
      "mitigation": "Specific mitigation strategy (min 10 chars)",
      "source_stage": 1-5,
      "owner": "Role responsible"
    }
  ]
}

Rules:
- Generate at least ${MIN_RISKS} risks
- Cover at least ${MIN_CATEGORIES} distinct categories
- probability and consequence use 1-5 scale (1=very low, 5=very high)
- source_stage indicates which upstream stage (1-5) surfaced this risk
- Each risk MUST have a specific mitigation strategy, not generic advice
- Use financial projections from Stage 5 to inform Financial risks
- Use competitive data from Stage 4 to inform Market risks
- Use validation scores from Stage 3 to inform Product risks
- Do NOT invent risks not grounded in the provided data`;

/**
 * Generate a risk matrix from Stages 1-5 data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage3Data] - Stage 3 validation scores
 * @param {Object} [params.stage4Data] - Stage 4 competitive landscape
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Risk register with aggregate metrics
 */
export async function analyzeStage06({ stage1Data, stage3Data, stage4Data, stage5Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage06] Starting analysis', { ventureName });
  if (!stage1Data?.description) {
    throw new Error('Stage 06 risk matrix requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const financialContext = stage5Data
    ? `Financial Model:
  Initial Investment: $${stage5Data.initialInvestment || 'N/A'}
  Year 1 Revenue: $${stage5Data.year1?.revenue || 'N/A'}
  ROI (3yr): ${stage5Data.roi3y ? (stage5Data.roi3y * 100).toFixed(1) + '%' : 'N/A'}
  Break-even: Month ${stage5Data.breakEvenMonth || 'N/A'}
  Unit Economics: CAC=$${stage5Data.unitEconomics?.cac || 'N/A'}, LTV=$${stage5Data.unitEconomics?.ltv || 'N/A'}`
    : 'No financial model available';

  const competitiveContext = stage4Data?.competitors
    ? `Competitive Landscape:
  Competitors: ${stage4Data.competitors.length}
  Average threat level: ${stage4Data.competitors.reduce((s, c) => s + (c.threatLevel || 3), 0) / stage4Data.competitors.length}
  Pricing models: ${stage4Data.stage5Handoff?.pricingModels?.join(', ') || 'N/A'}`
    : 'No competitive data available';

  const validationContext = stage3Data?.overallScore
    ? `Validation Score: ${stage3Data.overallScore}/100`
    : '';

  const userPrompt = `Generate a risk register for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}
Archetype: ${stage1Data.archetype || 'N/A'}
${validationContext}

${financialContext}

${competitiveContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) {
    throw new Error('Stage 06 risk matrix: LLM returned no risks');
  }

  // Normalize and validate each risk
  const risks = parsed.risks.map((r, i) => ({
    id: r.id || `RISK-${String(i + 1).padStart(3, '0')}`,
    category: RISK_CATEGORIES.includes(r.category) ? r.category : 'Operational',
    description: String(r.description || '').substring(0, 500),
    probability: clamp(r.probability, 1, 5),
    consequence: clamp(r.consequence, 1, 5),
    score: clamp(r.probability, 1, 5) * clamp(r.consequence, 1, 5),
    mitigation: String(r.mitigation || '').substring(0, 500),
    source_stage: clamp(r.source_stage, 1, 5),
    owner: r.owner || 'Founder',
    status: 'open',
    review_date: new Date().toISOString().split('T')[0],
  }));

  // Compute aggregate metrics
  const risksByCategory = {};
  for (const r of risks) {
    risksByCategory[r.category] = (risksByCategory[r.category] || 0) + 1;
  }

  const scores = risks.map(r => r.score);
  const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const highRiskCount = risks.filter(r => r.score >= 15).length;

  logger.log('[Stage06] Analysis complete', { duration: Date.now() - startTime });
  return {
    risks,
    risksByCategory,
    averageScore: Math.round(averageScore * 100) / 100,
    highRiskCount,
    totalRisks: risks.length,
    categoryCoverage: Object.keys(risksByCategory).length,
    fourBuckets,
  };
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}


export { MIN_RISKS, MIN_CATEGORIES, RISK_CATEGORIES };
