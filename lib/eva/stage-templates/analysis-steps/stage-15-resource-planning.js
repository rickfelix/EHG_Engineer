/**
 * Stage 15 Analysis Step - Resource Planning Generation
 * Part of SD-EVA-FEAT-TEMPLATES-BLUEPRINT-001
 *
 * Consumes Stage 1 idea, Stage 13 roadmap, and Stage 14 architecture
 * to generate team composition, skill gaps, and hiring plan.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-15-resource-planning
 */

import { getLLMClient } from '../../../llm/index.js';

const MIN_TEAM_MEMBERS = 2;
const MIN_ROLES = 2;

const SYSTEM_PROMPT = `You are EVA's Resource Planning Engine. Generate a structured resource plan for a venture.

You MUST output valid JSON with exactly this structure:
{
  "team_members": [
    {
      "role": "Role title",
      "skills": ["Skill 1", "Skill 2"],
      "allocation_pct": 50,
      "cost_monthly": 5000
    }
  ],
  "skill_gaps": [
    {
      "skill": "Missing skill",
      "severity": "critical|high|medium|low",
      "mitigation": "How to address this gap"
    }
  ],
  "hiring_plan": [
    {
      "role": "Role to hire",
      "timeline": "Q1 2026",
      "priority": "critical|high|medium|low"
    }
  ]
}

Rules:
- At least ${MIN_TEAM_MEMBERS} team members required
- At least ${MIN_ROLES} unique roles required
- allocation_pct must be 1-100
- cost_monthly should be realistic for the role and market
- skills array must have at least 1 skill per team member
- Skill gaps should be based on the architecture requirements
- Hiring plan should address gaps and roadmap timeline
- Consider the venture's stage and funding level for team size`;

/**
 * Generate a resource plan from upstream data.
 *
 * @param {Object} params
 * @param {Object} params.stage1Data - Stage 1 Draft Idea
 * @param {Object} [params.stage13Data] - Stage 13 product roadmap
 * @param {Object} [params.stage14Data] - Stage 14 technical architecture
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Resource plan
 */
export async function analyzeStage15({ stage1Data, stage13Data, stage14Data, ventureName }) {
  if (!stage1Data?.description) {
    throw new Error('Stage 15 resource planning requires Stage 1 data with description');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

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

  const userPrompt = `Generate a resource plan for this venture.

Venture: ${ventureName || 'Unnamed'}
Description: ${stage1Data.description}
Target Market: ${stage1Data.targetMarket || 'N/A'}

${roadmapContext}

${archContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  if (!Array.isArray(parsed.team_members) || parsed.team_members.length === 0) {
    throw new Error('Stage 15 resource planning: LLM returned no team members');
  }

  // Normalize team members
  const team_members = parsed.team_members.map(tm => ({
    role: String(tm.role || 'Team Member').substring(0, 200),
    skills: Array.isArray(tm.skills) && tm.skills.length > 0
      ? tm.skills.map(s => String(s).substring(0, 200))
      : ['General'],
    allocation_pct: clamp(tm.allocation_pct, 1, 100),
    cost_monthly: Math.max(0, Number(tm.cost_monthly) || 0),
  }));

  // Normalize skill gaps
  const skill_gaps = Array.isArray(parsed.skill_gaps)
    ? parsed.skill_gaps.map(sg => ({
      skill: String(sg.skill || 'Unknown').substring(0, 200),
      severity: ['critical', 'high', 'medium', 'low'].includes(sg.severity) ? sg.severity : 'medium',
      mitigation: String(sg.mitigation || 'TBD').substring(0, 500),
    }))
    : [];

  // Normalize hiring plan
  const hiring_plan = Array.isArray(parsed.hiring_plan)
    ? parsed.hiring_plan.map(hp => ({
      role: String(hp.role || 'TBD').substring(0, 200),
      timeline: String(hp.timeline || 'TBD').substring(0, 100),
      priority: ['critical', 'high', 'medium', 'low'].includes(hp.priority) ? hp.priority : 'medium',
    }))
    : [];

  return {
    team_members,
    skill_gaps,
    hiring_plan,
    totalHeadcount: team_members.length,
    totalMonthlyCost: team_members.reduce((sum, tm) => sum + tm.cost_monthly, 0),
    uniqueRoles: new Set(team_members.map(tm => tm.role)).size,
    avgAllocation: team_members.length > 0
      ? Math.round(team_members.reduce((sum, tm) => sum + tm.allocation_pct, 0) / team_members.length * 100) / 100
      : 0,
  };
}

function clamp(val, min, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseJSON(text) {
  const cleaned = text.replace(/```json\s*\n?/g, '').replace(/```\s*$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse resource plan response: ${cleaned.substring(0, 200)}`);
  }
}

export { MIN_TEAM_MEMBERS, MIN_ROLES };
