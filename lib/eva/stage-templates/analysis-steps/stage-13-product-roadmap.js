/**
 * Stage 13 Analysis Step - Product Roadmap Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stages 1-12 data and generates a structured product roadmap
 * with milestones prioritized as now/next/later.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-13-product-roadmap
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';

const MIN_MILESTONES = 3;
const VALID_PRIORITIES = ['now', 'next', 'later'];

const SYSTEM_PROMPT = `You are EVA's Product Roadmap Engine. Generate a structured product roadmap for a venture based on analysis from prior stages.

You MUST output valid JSON with exactly this structure:
{
  "vision_statement": "Clear product vision statement (min 20 chars)",
  "milestones": [
    {
      "name": "Milestone name",
      "date": "YYYY-MM-DD",
      "deliverables": ["Deliverable 1", "Deliverable 2"],
      "dependencies": ["Dependency if any"],
      "priority": "now|next|later"
    }
  ],
  "phases": [
    {
      "name": "Phase name",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD"
    }
  ]
}

Rules:
- Generate at least ${MIN_MILESTONES} milestones
- Each milestone MUST have priority: "now", "next", or "later"
- "now" = immediate (0-3 months), "next" = near-term (3-6 months), "later" = future (6+ months)
- Each milestone MUST have at least 1 deliverable
- Dates must span at least 3 months total
- Use upstream financial/market/competitive data to inform priority
- Milestones should be concrete and actionable, not vague
- At least 1 phase grouping the milestones`;

/**
 * Generate a product roadmap from upstream stage data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage5Data] - Stage 5 financial model
 * @param {Object} [params.stage8Data] - Stage 8 BMC
 * @param {Object} [params.stage9Data] - Stage 9 exit strategy
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Product roadmap
 */
export async function analyzeStage13({ stage1Data, stage5Data, stage8Data, stage9Data, ventureName }) {
  if (!stage1Data?.description) {
    throw new Error('Stage 13 product roadmap requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const financialContext = stage5Data
    ? `Financial Model:
  Initial Investment: $${stage5Data.initialInvestment || 'N/A'}
  Year 1 Revenue: $${stage5Data.year1?.revenue || 'N/A'}
  Break-even: Month ${stage5Data.breakEvenMonth || 'N/A'}`
    : 'No financial model available';

  const bmcContext = stage8Data
    ? `BMC: ${Object.keys(stage8Data).filter(k => stage8Data[k]?.items?.length > 0).length}/9 blocks populated`
    : '';

  const exitContext = stage9Data?.strategies
    ? `Exit Strategies: ${stage9Data.strategies.length} defined`
    : '';

  const userPrompt = `Generate a product roadmap for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}
Problem: ${stage1Data.problemStatement || 'N/A'}

${financialContext}
${bmcContext}
${exitContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  if (!Array.isArray(parsed.milestones) || parsed.milestones.length === 0) {
    throw new Error('Stage 13 product roadmap: LLM returned no milestones');
  }

  // Normalize milestones
  const milestones = parsed.milestones.map((m, i) => ({
    name: String(m.name || `Milestone ${i + 1}`).substring(0, 200),
    date: String(m.date || ''),
    deliverables: Array.isArray(m.deliverables) && m.deliverables.length > 0
      ? m.deliverables.map(d => String(d).substring(0, 300))
      : ['TBD'],
    dependencies: Array.isArray(m.dependencies) ? m.dependencies.map(d => String(d)) : [],
    priority: VALID_PRIORITIES.includes(m.priority) ? m.priority : 'later',
  }));

  // Normalize phases
  const phases = Array.isArray(parsed.phases) && parsed.phases.length > 0
    ? parsed.phases.map(p => ({
      name: String(p.name || 'Phase').substring(0, 200),
      start_date: String(p.start_date || ''),
      end_date: String(p.end_date || ''),
    }))
    : [{ name: 'Phase 1', start_date: milestones[0]?.date || '', end_date: milestones[milestones.length - 1]?.date || '' }];

  const vision_statement = String(parsed.vision_statement || '').length >= 20
    ? String(parsed.vision_statement).substring(0, 500)
    : `Product roadmap for ${ventureName || 'venture'}: ${stage1Data.description.substring(0, 200)}`;

  // Compute aggregate metrics
  const priorityCounts = { now: 0, next: 0, later: 0 };
  for (const m of milestones) {
    priorityCounts[m.priority] = (priorityCounts[m.priority] || 0) + 1;
  }

  return {
    vision_statement,
    milestones,
    phases,
    priorityCounts,
    totalMilestones: milestones.length,
    totalPhases: phases.length,
  };
}


export { MIN_MILESTONES, VALID_PRIORITIES };
