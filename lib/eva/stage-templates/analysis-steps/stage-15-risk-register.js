/**
 * Stage 15 Analysis Step - Risk Register Generation
 * Part of SD-EVA-FIX-STAGE15-RISK-001
 *
 * Consumes Stage 1 idea, Stage 6 competitive analysis,
 * Stage 13 roadmap, and Stage 14 architecture to generate
 * a risk register with severity/priority classification.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-risk-register
 */

import { getLLMClient } from '../../../llm/index.js';

const MIN_RISKS = 1;
const SEVERITY_ENUM = ['critical', 'high', 'medium', 'low'];
const PRIORITY_ENUM = ['immediate', 'short_term', 'long_term'];

const SYSTEM_PROMPT = `You are EVA's Risk Identification Engine. Generate a structured risk register for a venture.

You MUST output valid JSON with exactly this structure:
{
  "risks": [
    {
      "title": "Short risk title",
      "description": "Detailed risk description",
      "owner": "Role responsible for managing this risk",
      "severity": "critical|high|medium|low",
      "priority": "immediate|short_term|long_term",
      "phaseRef": "Phase or milestone this risk relates to",
      "mitigationPlan": "How to reduce likelihood or impact",
      "contingencyPlan": "What to do if the risk materializes"
    }
  ]
}

Rules:
- At least ${MIN_RISKS} risk required, aim for 5-10 comprehensive risks
- severity must be one of: ${SEVERITY_ENUM.join(', ')}
- priority must be one of: ${PRIORITY_ENUM.join(', ')}
- phaseRef should reference a roadmap phase or milestone when available
- mitigationPlan is required for every risk
- contingencyPlan is optional but recommended
- Consider: technical, market, operational, financial, and team risks
- Base risks on the venture's architecture, roadmap, and competitive landscape`;

/**
 * Generate a risk register from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage6Data] - Stage 6 Competitive Analysis
 * @param {Object} [params.stage13Data] - Stage 13 Product Roadmap
 * @param {Object} [params.stage14Data] - Stage 14 Technical Architecture
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Risk register
 */
export async function analyzeStage15({ stage1Data, stage6Data, stage13Data, stage14Data, ventureName }) {
  if (!stage1Data?.description) {
    throw new Error('Stage 15 risk register requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const competitiveContext = stage6Data?.competitors
    ? `Competitive Landscape: ${stage6Data.competitors.length} competitors identified`
    : 'No competitive analysis available';

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap: ${stage13Data.milestones.length} milestones, ${stage13Data.phases?.length || 0} phases`
    : 'No roadmap available';

  const archContext = stage14Data?.layers
    ? `Architecture:
  Frontend: ${stage14Data.layers.frontend?.technology || 'N/A'}
  Backend: ${stage14Data.layers.backend?.technology || 'N/A'}
  Data: ${stage14Data.layers.data?.technology || 'N/A'}
  Infra: ${stage14Data.layers.infra?.technology || 'N/A'}
  Components: ${stage14Data.totalComponents || 'N/A'}`
    : 'No architecture available';

  const userPrompt = `Generate a risk register for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}

${competitiveContext}

${roadmapContext}

${archContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  if (!Array.isArray(parsed.risks) || parsed.risks.length === 0) {
    throw new Error('Stage 15 risk register: LLM returned no risks');
  }

  // Normalize risks
  const risks = parsed.risks.map(r => ({
    title: String(r.title || 'Untitled Risk').substring(0, 200),
    description: String(r.description || '').substring(0, 1000),
    owner: String(r.owner || 'Unassigned').substring(0, 200),
    severity: SEVERITY_ENUM.includes(r.severity) ? r.severity : 'medium',
    priority: PRIORITY_ENUM.includes(r.priority) ? r.priority : 'short_term',
    phaseRef: r.phaseRef ? String(r.phaseRef).substring(0, 200) : '',
    mitigationPlan: String(r.mitigationPlan || 'TBD').substring(0, 500),
    contingencyPlan: r.contingencyPlan ? String(r.contingencyPlan).substring(0, 500) : '',
  }));

  const severity_breakdown = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const risk of risks) {
    severity_breakdown[risk.severity]++;
  }

  return {
    risks,
    totalRisks: risks.length,
    severityBreakdown: severity_breakdown,
    budgetCoherence: {
      aligned: true,
      notes: `${risks.length} risk(s) identified with mitigation plans`,
    },
  };
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse risk register response: ${cleaned.substring(0, 200)}`);
  }
}

export { MIN_RISKS, SEVERITY_ENUM, PRIORITY_ENUM };
