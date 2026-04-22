/**
 * Stage 26 Analysis Step — Growth Playbook
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-F
 *
 * Generates growth strategy from post-launch data. Defines experiments,
 * scaling priorities, and operations handoff.
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';

const SYSTEM_PROMPT = `You are EVA's Growth Strategist. Generate a growth playbook based on post-launch performance data.

Output valid JSON:
{
  "growth_experiments": [
    { "name": "Experiment name", "hypothesis": "If we X, then Y", "metric": "What to measure", "priority": "high|medium|low" }
  ],
  "scaling_priorities": [
    { "area": "Area to scale", "current_state": "Where we are", "target_state": "Where we need to be", "timeline": "When" }
  ],
  "operations_handoff": {
    "monitoring_dashboards": ["Dashboard 1"],
    "alert_thresholds": ["Alert 1"],
    "runbooks": ["Runbook 1"],
    "escalation_path": "Who to contact"
  },
  "90_day_plan": {
    "month_1": "Focus area",
    "month_2": "Focus area",
    "month_3": "Focus area"
  }
}`;

export async function analyzeStage26GrowthPlaybook(params) {
  const { stage25Data, stage24Data, ventureName, logger = console } = params;

  logger.info?.(`[S26-GrowthPlaybook] Generating playbook for ${ventureName || 'unknown'}`);

  let result;
  let usage = {};

  try {
    const client = getLLMClient();
    const response = await client.complete(SYSTEM_PROMPT, `Generate growth playbook for ${ventureName}.\nPost-launch data: ${JSON.stringify(stage25Data || {})}`);
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.growth_experiments ? parsed : buildFallback(ventureName);
  } catch (err) {
    logger.warn('[S26-GrowthPlaybook] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  return {
    ...result,
    venture_name: ventureName,
    experiment_count: (result.growth_experiments || []).length,
    scaling_count: (result.scaling_priorities || []).length,
    has_operations_handoff: !!result.operations_handoff,
    usage,
  };
}

function buildFallback(ventureName) {
  return {
    growth_experiments: [
      { name: 'Referral program', hypothesis: 'Adding referrals increases signups 20%', metric: 'referral_signups', priority: 'high' },
      { name: 'Content marketing', hypothesis: 'Blog posts drive organic traffic', metric: 'organic_visits', priority: 'medium' },
    ],
    scaling_priorities: [
      { area: 'Infrastructure', current_state: 'Single region', target_state: 'Multi-region', timeline: '90 days' },
    ],
    operations_handoff: {
      monitoring_dashboards: ['Performance dashboard', 'Error tracking'],
      alert_thresholds: ['Error rate > 1%', 'Response time > 2s'],
      runbooks: ['Incident response', 'Scaling procedure'],
      escalation_path: 'Chairman via EHG dashboard',
    },
    '90_day_plan': { month_1: 'Stabilize + collect data', month_2: 'Optimize conversion', month_3: 'Scale acquisition' },
  };
}
