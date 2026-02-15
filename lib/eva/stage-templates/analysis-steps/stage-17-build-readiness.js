/**
 * Stage 17 Analysis Step - Build Readiness Assessment
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stages 13-16 (blueprint) data and generates a build readiness
 * assessment with checklist synthesis, blocker analysis, and go/no-go decision.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-17-build-readiness
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON } from '../../utils/parse-json.js';

const READINESS_DECISIONS = ['go', 'conditional_go', 'no_go'];
const PRIORITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const SEVERITY_LEVELS = ['critical', 'high', 'medium', 'low'];
const MIN_READINESS_ITEMS = 3;
const MIN_CATEGORIES = 3;

const SYSTEM_PROMPT = `You are EVA's Build Readiness Analyst. Assess whether a venture is ready to begin its build sprint based on blueprint-phase outputs.

You MUST output valid JSON with exactly this structure:
{
  "readinessItems": [
    {
      "name": "Item name (e.g., Architecture Design Complete)",
      "description": "What this item covers",
      "status": "complete|in_progress|not_started|blocked",
      "priority": "critical|high|medium|low",
      "category": "architecture|team_readiness|tooling|environment|dependencies"
    }
  ],
  "blockers": [
    {
      "description": "What is blocking progress",
      "owner": "Who must resolve this",
      "severity": "critical|high|medium|low"
    }
  ],
  "buildReadiness": {
    "decision": "go|conditional_go|no_go",
    "rationale": "2-3 sentence explanation of the decision",
    "conditions": ["Condition that must be met (only if conditional_go)"]
  }
}

Rules:
- Generate at least ${MIN_READINESS_ITEMS} readiness items across at least ${MIN_CATEGORIES} categories
- Each item must have a clear status and priority
- Blockers should only include items with status "blocked"
- buildReadiness.decision: "go" if all critical/high items complete, "conditional_go" if non-critical items pending, "no_go" if critical blockers exist
- conditions array is required if decision is "conditional_go", empty otherwise
- Assess architecture, team readiness, tooling, environment, and dependencies
- Base assessment on the venture's roadmap, technical architecture, and resource plan`;

/**
 * Generate build readiness assessment from blueprint-phase data.
 *
 * @param {Object} params
 * @param {Object} params.stage13Data - Product roadmap
 * @param {Object} [params.stage14Data] - Technical architecture
 * @param {Object} [params.stage15Data] - Resource planning
 * @param {Object} [params.stage16Data] - Financial projections
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Build readiness assessment
 */
export async function analyzeStage17({ stage13Data, stage14Data, stage15Data, stage16Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage17] Starting analysis', { ventureName });
  if (!stage13Data) {
    throw new Error('Stage 17 build readiness requires Stage 13 (product roadmap) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const roadmapContext = stage13Data.milestones
    ? `Milestones: ${JSON.stringify(stage13Data.milestones.slice(0, 5))}`
    : `Roadmap: ${JSON.stringify(stage13Data).substring(0, 500)}`;

  const archContext = stage14Data
    ? `Architecture: ${stage14Data.systemType || 'N/A'}, Components: ${stage14Data.components?.length || 0}`
    : '';

  const resourceContext = stage15Data
    ? `Team: ${stage15Data.teamSize || 'N/A'} members, Budget: $${stage15Data.totalBudget || 'N/A'}`
    : '';

  const financialContext = stage16Data
    ? `Runway: ${stage16Data.runwayMonths || 'N/A'} months`
    : '';

  const userPrompt = `Assess build readiness for this venture.

Venture: ${ventureName || 'Unnamed'}
${roadmapContext}
${archContext}
${resourceContext}
${financialContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT, userPrompt);
  const parsed = parseJSON(response);

  // Normalize readiness items
  let readinessItems = Array.isArray(parsed.readinessItems)
    ? parsed.readinessItems.filter(item => item?.name)
    : [];

  if (readinessItems.length < MIN_READINESS_ITEMS) {
    readinessItems = [
      { name: 'Architecture Design', description: 'System architecture defined', status: 'complete', priority: 'critical', category: 'architecture' },
      { name: 'Development Environment', description: 'Dev environment configured', status: 'complete', priority: 'high', category: 'environment' },
      { name: 'Dependency Audit', description: 'Dependencies identified and vetted', status: 'in_progress', priority: 'medium', category: 'dependencies' },
    ];
  } else {
    readinessItems = readinessItems.map(item => ({
      name: String(item.name).substring(0, 200),
      description: String(item.description || '').substring(0, 500),
      status: ['complete', 'in_progress', 'not_started', 'blocked'].includes(item.status) ? item.status : 'not_started',
      priority: PRIORITY_LEVELS.includes(item.priority) ? item.priority : 'medium',
      category: ['architecture', 'team_readiness', 'tooling', 'environment', 'dependencies'].includes(item.category) ? item.category : 'architecture',
    }));
  }

  // Normalize blockers
  const blockers = Array.isArray(parsed.blockers)
    ? parsed.blockers.filter(b => b?.description).map(b => ({
        description: String(b.description).substring(0, 500),
        owner: String(b.owner || 'Unassigned').substring(0, 200),
        severity: SEVERITY_LEVELS.includes(b.severity) ? b.severity : 'medium',
      }))
    : [];

  // Normalize buildReadiness decision
  const br = parsed.buildReadiness || {};
  const decision = READINESS_DECISIONS.includes(br.decision) ? br.decision : (blockers.length > 0 ? 'no_go' : 'go');
  const conditions = decision === 'conditional_go' && Array.isArray(br.conditions)
    ? br.conditions.map(c => String(c).substring(0, 300))
    : [];

  const buildReadiness = {
    decision,
    rationale: String(br.rationale || `Build readiness: ${decision}`).substring(0, 500),
    conditions,
  };

  logger.log('[Stage17] Analysis complete', { duration: Date.now() - startTime });
  return {
    readinessItems,
    blockers,
    buildReadiness,
    totalItems: readinessItems.length,
    completedItems: readinessItems.filter(i => i.status === 'complete').length,
    blockerCount: blockers.length,
  };
}


export { READINESS_DECISIONS, PRIORITY_LEVELS, SEVERITY_LEVELS, MIN_READINESS_ITEMS };
