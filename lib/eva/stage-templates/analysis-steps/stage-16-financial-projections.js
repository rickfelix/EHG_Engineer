/**
 * Stage 16 Analysis Step - Financial Projections Generation
 * Part of SD-EVA-R2-FIX-TEMPLATE-VALIDATE-P4-001
 *
 * Consumes Stages 1, 13-15 data and generates financial projections
 * with revenue/cost data, structured cost breakdowns, burn rate,
 * and funding rounds.
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
      "costs": 8000,
      "cost_breakdown": {
        "personnel": 5000,
        "infrastructure": 1500,
        "marketing": 1000,
        "other": 500
      }
    },
    {
      "month": 2,
      "revenue": 500,
      "costs": 8500,
      "cost_breakdown": {
        "personnel": 5000,
        "infrastructure": 1500,
        "marketing": 1500,
        "other": 500
      }
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
- Each projection MUST include cost_breakdown with: personnel, infrastructure, marketing, other
- cost_breakdown values must be >= 0 and should sum to approximately the total costs
- Revenue should start low and grow based on the market/product
- Costs should reflect the team composition from resource planning
- Personnel costs should be the largest category for most early-stage ventures
- Infrastructure costs should reflect the technical architecture complexity
- Marketing costs should ramp up as the product approaches market readiness
- Funding rounds are optional but recommended if runway < 12 months
- Each funding round must have round_name, target_amount (> 0), and target_date (ISO format)
- Be realistic about early-stage revenue (most ventures have $0 in month 1)
- Consider the venture's market size and pricing strategy`;

/**
 * Generate financial projections from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {Object} [params.stage14Data] - Stage 14 technical architecture
 * @param {Object} [params.stage15Data] - Stage 15 risk register
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
    ? `Architecture: ${stage14Data.totalComponents || stage14Data.total_components || 'N/A'} components across ${stage14Data.layerCount || stage14Data.layer_count || 5} layers (${Object.keys(stage14Data.layers).join(', ')})`
    : 'No architecture available';

  const riskContext = stage15Data?.risks
    ? `Risks: ${stage15Data.total_risks || stage15Data.risks.length} identified (${stage15Data.severity_breakdown?.critical || 0} critical, ${stage15Data.severity_breakdown?.high || 0} high)`
    : 'No risk register available';

  const userPrompt = `Generate financial projections for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}

${roadmapContext}
${archContext}
${riskContext}

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

  const revenue_projections = parsed.revenue_projections.map((rp, i) => {
    const costs = Math.max(0, Number(rp.costs) || 0);
    const projection = {
      month: Number(rp.month) || (i + 1),
      revenue: Math.max(0, Number(rp.revenue) || 0),
      costs,
    };

    // Normalize cost_breakdown
    if (rp.cost_breakdown && typeof rp.cost_breakdown === 'object') {
      projection.cost_breakdown = {
        personnel: Math.max(0, Number(rp.cost_breakdown.personnel) || 0),
        infrastructure: Math.max(0, Number(rp.cost_breakdown.infrastructure) || 0),
        marketing: Math.max(0, Number(rp.cost_breakdown.marketing) || 0),
        other: Math.max(0, Number(rp.cost_breakdown.other) || 0),
      };
    } else if (costs > 0) {
      // Generate a reasonable breakdown if LLM omitted it
      projection.cost_breakdown = {
        personnel: Math.round(costs * 0.6),
        infrastructure: Math.round(costs * 0.2),
        marketing: Math.round(costs * 0.1),
        other: Math.round(costs * 0.1),
      };
    }

    return projection;
  });

  // Normalize funding rounds
  const funding_rounds = Array.isArray(parsed.funding_rounds)
    ? parsed.funding_rounds
      .filter(fr => fr && typeof fr === 'object')
      .map(fr => ({
        round_name: String(fr.round_name || 'Round').substring(0, 200),
        target_amount: Math.max(0, Number(fr.target_amount) || 0),
        target_date: String(fr.target_date || '').substring(0, 20),
      }))
      .filter(fr => fr.round_name && fr.target_amount > 0 && fr.target_date)
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
