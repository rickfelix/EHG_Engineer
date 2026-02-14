/**
 * Stage 16 Analysis Step - Financial Projections Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stages 1, 13-15 data and generates financial projections
 * with revenue/cost data, burn rate, and funding rounds.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-16-financial-projections
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';

const MIN_PROJECTION_MONTHS = 6;

const SYSTEM_PROMPT = `You are EVA's Financial Projections Engine. Generate structured financial projections for a venture.

You MUST output valid JSON with exactly this structure:
{
  "initial_capital": 50000,
  "monthly_burn_rate": 8000,
  "revenue_projections": [
    {
      "month": 1,
      "revenue": 0,
      "costs": 8000
    },
    {
      "month": 2,
      "revenue": 500,
      "costs": 8000
    }
  ],
  "funding_rounds": [
    {
      "round_name": "Pre-seed",
      "target_amount": 100000,
      "target_date": "2026-06-01"
    }
  ]
}

Rules:
- initial_capital must be > 0
- monthly_burn_rate must be > 0
- At least ${MIN_PROJECTION_MONTHS} months of revenue projections required
- Each projection must have month (sequential), revenue (>= 0), and costs (>= 0)
- Revenue should start low and grow based on the market/product
- Costs should reflect the team composition from resource planning
- Funding rounds are optional but recommended if runway < 12 months
- Be realistic about early-stage revenue (most ventures have $0 in month 1)
- Consider the venture's market size and pricing strategy`;

/**
 * Generate financial projections from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {Object} [params.stage14Data] - Stage 14 technical architecture
 * @param {Object} [params.stage15Data] - Stage 15 resource planning
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Financial projections
 */
export async function analyzeStage16({ stage1Data, stage13Data, stage14Data, stage15Data, ventureName }) {
  if (!stage1Data?.description) {
    throw new Error('Stage 16 financial projections requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap: ${stage13Data.milestones.length} milestones over ${stage13Data.phases?.length || 0} phases`
    : 'No roadmap available';

  const archContext = stage14Data?.layers
    ? `Architecture: ${stage14Data.totalComponents || 'N/A'} components across ${stage14Data.layerCount || 4} layers`
    : 'No architecture available';

  const resourceContext = stage15Data?.team_members
    ? `Team: ${stage15Data.totalHeadcount || stage15Data.team_members.length} members, Monthly cost: $${stage15Data.totalMonthlyCost || 'N/A'}`
    : 'No resource plan available';

  const userPrompt = `Generate financial projections for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}

${roadmapContext}
${archContext}
${resourceContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  // Validate initial_capital
  const initial_capital = Math.max(0, Number(parsed.initial_capital) || 0);
  if (initial_capital <= 0) {
    throw new Error('Stage 16 financial projections: LLM returned zero initial capital');
  }

  const monthly_burn_rate = Math.max(0, Number(parsed.monthly_burn_rate) || 0);

  // Normalize revenue projections
  if (!Array.isArray(parsed.revenue_projections) || parsed.revenue_projections.length === 0) {
    throw new Error('Stage 16 financial projections: LLM returned no revenue projections');
  }

  const revenue_projections = parsed.revenue_projections.map((rp, i) => ({
    month: Number(rp.month) || (i + 1),
    revenue: Math.max(0, Number(rp.revenue) || 0),
    costs: Math.max(0, Number(rp.costs) || 0),
  }));

  // Normalize funding rounds
  const funding_rounds = Array.isArray(parsed.funding_rounds)
    ? parsed.funding_rounds.map(fr => ({
      round_name: String(fr.round_name || 'Round').substring(0, 200),
      target_amount: Math.max(0, Number(fr.target_amount) || 0),
      target_date: String(fr.target_date || '').substring(0, 20),
    }))
    : [];

  return {
    initial_capital,
    monthly_burn_rate,
    revenue_projections,
    funding_rounds,
    totalProjectedRevenue: revenue_projections.reduce((sum, rp) => sum + rp.revenue, 0),
    totalProjectedCosts: revenue_projections.reduce((sum, rp) => sum + rp.costs, 0),
    projectionMonths: revenue_projections.length,
  };
}


export { MIN_PROJECTION_MONTHS };
