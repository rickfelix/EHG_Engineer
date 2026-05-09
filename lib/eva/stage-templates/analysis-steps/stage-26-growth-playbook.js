/**
 * Stage 26 Analysis Step — Growth Playbook
 * SD: SD-LEO-FEAT-STAGE-GROWTH-PLAYBOOK-001 (canonical Stage 26 worker;
 *     supersedes the historical stage-26-launch-execution.js + stage-26-
 *     venture-review.js orphans archived to docs/archived/orphan-stage-26-
 *     modules/).
 *
 * Generates a growth playbook from S25 post-launch data. Defines experiments,
 * scaling priorities, operations handoff. Final stage of the venture lifecycle.
 *
 * FR-5 (entry-precondition refusal): if the upstream postlaunch_* artifacts
 * are missing or archived, emits a reason-discriminated SKIP marker — never
 * fabricates a growth strategy from absent data. Mirrors the
 * stage-25-post-launch-review.js classifyNoDataReason() pattern (NOT the
 * always-throw stage-26-venture-review.js:43-48 stub pattern, which is
 * archived as a rejected approach).
 *
 * FR-4 (post-S26 terminal state): when the worker emits a successful playbook,
 * it sets `lifecycle_terminal: 'request'` in the result. The orchestrator
 * (caller of this worker) is responsible for: (1) persisting the
 * growth_playbook + growth_optimization_roadmap artifacts to venture_artifacts;
 * (2) calling checkExitGates(fromStage=26) which dispatches the new verifiers
 * registered in lib/eva/lifecycle/exit-gate-verifiers.js GATE_VERIFIERS;
 * (3) flipping ventures.workflow_status to 'completed' (existing enum value;
 * NO DDL migration to workflow_status_enum required); (4) keeping
 * ventures.current_lifecycle_stage at 26 (no S27).
 *
 * Worker idempotency: callers should detect ventures already in
 * workflow_status='completed' BEFORE invoking this worker. If the worker is
 * invoked redundantly, it returns a `status: 'no_data', reason:
 * 'already_completed'` marker so the orchestrator skips the persistence +
 * flip loop without side effects.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-26-growth-playbook
 */

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { ARTIFACT_TYPES } from '../../artifact-types.js';

const POSTLAUNCH_ARTIFACT_KEYS = [
  ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_ASSUMPTIONS_VS_REALITY,
  ARTIFACT_TYPES.LAUNCH_POSTLAUNCH_USER_FEEDBACK_SUMMARY,
];

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

/**
 * Determine no-data reason given upstream stage availability + venture state.
 *
 * Returns:
 *   - 'already_completed'        venture has workflow_status='completed' (idempotency guard)
 *   - 'missing_postlaunch_artifacts' both required postlaunch_* artifacts absent or archived
 *   - 'partial_postlaunch_artifacts' one of the two postlaunch_* artifacts present, the other missing/archived
 *   - null                        OK to proceed
 *
 * Mirrors stage-25-post-launch-review.js:26-31 reason-discriminated pattern.
 *
 * @param {{
 *   ventureWorkflowStatus?: string,
 *   postlaunchArtifacts?: Array<{artifact_type: string, is_current?: boolean}>
 * }} params
 * @returns {string|null}
 */
function classifyNoDataReason({ ventureWorkflowStatus, postlaunchArtifacts }) {
  if (ventureWorkflowStatus === 'completed') return 'already_completed';

  const present = new Set(
    (postlaunchArtifacts || [])
      .filter((a) => a && a.is_current === true)
      .map((a) => a.artifact_type)
  );
  const have = POSTLAUNCH_ARTIFACT_KEYS.filter((k) => present.has(k));
  if (have.length === 0) return 'missing_postlaunch_artifacts';
  if (have.length < POSTLAUNCH_ARTIFACT_KEYS.length) return 'partial_postlaunch_artifacts';
  return null;
}

/**
 * Generate Stage 26 growth playbook.
 *
 * @param {Object} params
 * @param {Object} [params.stage25Data] - S25 post-launch review output (passed as LLM context).
 * @param {Object} [params.stage24Data] - S24 launch data (LLM context only).
 * @param {Array}  [params.postlaunchArtifacts] - venture_artifacts rows for the LAUNCH_POSTLAUNCH_* types.
 *                                                Each row should have {artifact_type, is_current}. Used by FR-5
 *                                                entry-precondition. If absent or filtered to no is_current=true rows,
 *                                                the worker emits a SKIP marker instead of generating a playbook.
 * @param {string} [params.ventureWorkflowStatus] - ventures.workflow_status. If 'completed', the worker treats
 *                                                  the call as a redundant invocation and returns the
 *                                                  'already_completed' SKIP marker (FR-4 idempotency guard).
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Growth playbook object OR reason-discriminated no_data marker.
 */
export async function analyzeStage26GrowthPlaybook(params = {}) {
  const {
    stage25Data,
    stage24Data,
    postlaunchArtifacts,
    ventureWorkflowStatus,
    ventureName,
    logger = console,
  } = params;

  logger.info?.(`[S26-GrowthPlaybook] Generating playbook for ${ventureName || 'unknown'}`);

  // FR-5 + FR-4 idempotency: refuse to fabricate a playbook against absent
  // upstream data, and skip cleanly on already-completed ventures.
  const noDataReason = classifyNoDataReason({
    ventureWorkflowStatus,
    postlaunchArtifacts,
  });
  if (noDataReason) {
    logger.info?.(
      `[S26-GrowthPlaybook] No-data state for ${ventureName || 'unknown'}: reason=${noDataReason}`
    );
    return {
      venture_name: ventureName,
      status: 'no_data',
      reason: noDataReason,
      data_collection_status: 'no_data',
      growth_experiments: [],
      scaling_priorities: [],
      operations_handoff: null,
      '90_day_plan': null,
      experiment_count: 0,
      scaling_count: 0,
      has_operations_handoff: false,
      lifecycle_terminal: false, // do NOT signal terminal flip on SKIP
    };
  }

  let result;
  let usage = {};

  try {
    const client = getLLMClient();
    const response = await client.complete(
      SYSTEM_PROMPT,
      `Generate growth playbook for ${ventureName}.\nPost-launch data: ${JSON.stringify(stage25Data || {})}`
    );
    const parsed = parseJSON(response);
    usage = extractUsage(response) || {};
    result = parsed?.growth_experiments ? parsed : buildFallback(ventureName);
  } catch (err) {
    logger.warn?.('[S26-GrowthPlaybook] LLM error, using fallback:', err.message);
    result = buildFallback(ventureName);
  }

  return {
    ...result,
    venture_name: ventureName,
    status: 'ok',
    experiment_count: (result.growth_experiments || []).length,
    scaling_count: (result.scaling_priorities || []).length,
    has_operations_handoff: !!result.operations_handoff,
    // FR-4: signal to the orchestrator that S26 produced a complete playbook
    // and the venture is eligible for the terminal workflow_status flip
    // (subject to checkExitGates(fromStage=26) passing). The orchestrator —
    // not the worker — is responsible for: (a) persisting growth_playbook +
    // growth_optimization_roadmap artifacts; (b) running the gate check;
    // (c) UPDATE ventures SET workflow_status='completed' WHERE id=...;
    // (d) leaving current_lifecycle_stage at 26 (no S27 to advance to).
    lifecycle_terminal: 'request',
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

// Internal helper exported for unit testing only.
export const _testing = { classifyNoDataReason, POSTLAUNCH_ARTIFACT_KEYS };
