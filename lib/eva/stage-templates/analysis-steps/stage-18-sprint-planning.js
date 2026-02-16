/**
 * Stage 18 Analysis Step - Sprint Planning
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-EVA-FEAT-TEMPLATES-BUILDLOOP-001
 *
 * Consumes Stage 17 readiness + Stages 13-14 roadmap/architecture to generate
 * sprint items with SD bridge payloads, architecture layer mapping, and milestone refs.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-18-sprint-planning
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';

const PRIORITY_VALUES = ['critical', 'high', 'medium', 'low'];
const SD_TYPES = ['feature', 'bugfix', 'enhancement', 'refactor', 'infra'];
const ARCHITECTURE_LAYERS = ['frontend', 'backend', 'database', 'infrastructure', 'integration', 'security'];
const MIN_SPRINT_ITEMS = 1;

const SYSTEM_PROMPT = `You are EVA's Sprint Planning Engine. Generate a sprint plan with actionable items that bridge to the LEO Protocol SD system.

You MUST output valid JSON with exactly this structure:
{
  "sprintGoal": "One-sentence goal for this sprint",
  "sprintItems": [
    {
      "title": "Sprint item title",
      "description": "What needs to be built (2-3 sentences)",
      "type": "feature|bugfix|enhancement|refactor|infra",
      "priority": "critical|high|medium|low",
      "estimatedLoc": 150,
      "acceptanceCriteria": "How to verify this item is done",
      "architectureLayer": "frontend|backend|database|infrastructure|integration|security",
      "milestoneRef": "Which roadmap milestone this supports"
    }
  ]
}

Rules:
- Generate at least ${MIN_SPRINT_ITEMS} sprint item(s)
- Each item must have all required fields
- estimatedLoc should be realistic (50-500 for typical items)
- architectureLayer must reference the technical architecture from Stage 14
- milestoneRef should reference a Stage 13 roadmap milestone (use "now" tier milestone if available)
- Sprint goal should be specific and measurable
- Items should be ordered by priority (critical first)
- Each item should be independently deliverable`;

/**
 * Generate sprint plan from readiness + blueprint data.
 *
 * @param {Object} params
 * @param {Object} params.stage17Data - Build readiness assessment
 * @param {Object} [params.stage13Data] - Product roadmap
 * @param {Object} [params.stage14Data] - Technical architecture
 * @param {string} [params.ventureName]
 * @returns {Promise<Object>} Sprint plan with SD bridge items
 */
export async function analyzeStage18({ stage17Data, stage13Data, stage14Data, ventureName, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage18] Starting analysis', { ventureName });
  if (!stage17Data) {
    throw new Error('Stage 18 sprint planning requires Stage 17 (build readiness) data');
  }

  const client = getLLMClient({ purpose: 'content-generation' });

  const readinessContext = stage17Data.buildReadiness
    ? `Readiness: ${stage17Data.buildReadiness.decision} — ${stage17Data.buildReadiness.rationale || ''}`
    : '';

  const roadmapContext = stage13Data?.milestones
    ? `Roadmap milestones: ${JSON.stringify(stage13Data.milestones.slice(0, 3).map(m => m.name || m.title || m))}`
    : '';

  const archContext = stage14Data
    ? `Architecture layers: ${stage14Data.components?.map(c => c.name || c).join(', ') || 'N/A'}`
    : '';

  const userPrompt = `Generate a sprint plan for this venture.

Venture: ${ventureName || 'Unnamed'}
${readinessContext}
${roadmapContext}
${archContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt);
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize sprint goal
  const sprintGoal = String(parsed.sprintGoal || 'Complete initial build sprint').substring(0, 300);

  // Normalize sprint items
  let sprintItems = Array.isArray(parsed.sprintItems)
    ? parsed.sprintItems.filter(item => item?.title)
    : [];

  if (sprintItems.length < MIN_SPRINT_ITEMS) {
    sprintItems = [{
      title: 'Initial Build Task',
      description: 'First implementation task from roadmap',
      type: 'feature',
      priority: 'high',
      estimatedLoc: 200,
      acceptanceCriteria: 'Feature implemented and tested',
      architectureLayer: 'backend',
      milestoneRef: 'MVP',
    }];
  } else {
    sprintItems = sprintItems.map(item => ({
      title: String(item.title).substring(0, 200),
      description: String(item.description || '').substring(0, 500),
      type: SD_TYPES.includes(item.type) ? item.type : 'feature',
      priority: PRIORITY_VALUES.includes(item.priority) ? item.priority : 'medium',
      estimatedLoc: typeof item.estimatedLoc === 'number' && item.estimatedLoc > 0
        ? Math.min(2000, Math.round(item.estimatedLoc))
        : 200,
      acceptanceCriteria: String(item.acceptanceCriteria || 'Item completed').substring(0, 500),
      architectureLayer: ARCHITECTURE_LAYERS.includes(item.architectureLayer)
        ? item.architectureLayer
        : 'backend',
      milestoneRef: String(item.milestoneRef || 'MVP').substring(0, 200),
    }));
  }

  logger.log('[Stage18] Analysis complete', { duration: Date.now() - startTime });
  return {
    sprintGoal,
    sprintItems,
    totalItems: sprintItems.length,
    totalEstimatedLoc: sprintItems.reduce((sum, i) => sum + i.estimatedLoc, 0),
    fourBuckets,
  };
}


export { PRIORITY_VALUES, SD_TYPES, ARCHITECTURE_LAYERS, MIN_SPRINT_ITEMS };
