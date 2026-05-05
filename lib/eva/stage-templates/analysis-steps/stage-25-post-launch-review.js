/**
 * Stage 25 Analysis Step — Post-Launch Review
 * SD: SD-LEO-FEAT-STAGE-POST-LAUNCH-001
 * Phase: LAUNCH & LEARN (Stages 23-26)
 *
 * Collects post-launch metrics, compares against S16 financial projections.
 * Emits reason-discriminated no-data marker when source artifacts are missing
 * — never fabricates zero-fill metrics.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-25-post-launch-review
 */

const POSTLAUNCH_ARTIFACT_KEYS = [
  'postlaunch_assumptions_vs_reality',
  'postlaunch_user_feedback_summary',
  'postlaunch_analytics_dashboard',
];

/**
 * Determine no-data reason given upstream stage availability.
 * - s24_no_real_launch: stage 24 (Live & Announce) was theatrical / no real platform integrations
 * - s24_parse_error: stage 24 ran but emitted unparseable data
 * - no_artifact: postlaunch_* artifacts absent for this venture
 * - no_baseline: S16 financial forecast missing (separate concern)
 */
function classifyNoDataReason({ stage24Data, postlaunchArtifacts, parseError }) {
  if (parseError) return 's24_parse_error';
  if (!stage24Data || stage24Data.real_launch === false) return 's24_no_real_launch';
  if (!postlaunchArtifacts || postlaunchArtifacts.length === 0) return 'no_artifact';
  return null;
}

/**
 * Generate Stage 25 post-launch review.
 *
 * @param {Object} params
 * @param {Object} [params.stage16Data] - S16 financial projections (baseline for comparison)
 * @param {Object} [params.stage24Data] - S24 launch data; check real_launch flag
 * @param {Array}  [params.postlaunchArtifacts] - venture_artifacts rows with postlaunch_* artifact_type
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Post-launch review with metrics or reason-discriminated no_data marker
 */
export async function analyzeStage25PostLaunchReview(params = {}) {
  const {
    stage16Data,
    stage24Data,
    postlaunchArtifacts,
    ventureName,
    logger = console,
  } = params;

  logger.info?.(`[S25-PostLaunch] Reviewing post-launch data for ${ventureName || 'unknown'}`);

  const noDataReason = classifyNoDataReason({
    stage24Data,
    postlaunchArtifacts,
    parseError: false,
  });

  if (noDataReason) {
    logger.info?.(`[S25-PostLaunch] No-data state for ${ventureName}: reason=${noDataReason}`);
    return {
      venture_name: ventureName,
      status: 'no_data',
      reason: noDataReason,
      data_collection_status: 'no_data',
      metrics: null,
      assumptions_validated: [],
      assumptions_invalidated: [],
      key_learnings: [],
      recommendations: [],
    };
  }

  const projections = stage16Data || {};
  const noBaseline = !stage16Data;

  return {
    venture_name: ventureName,
    status: 'ok',
    launch_date: stage24Data?.launched_at || null,
    metrics: {
      signups: { projected: projections.month1_signups || 'TBD', actual: 'pending_data_collection' },
      revenue: { projected: projections.month1_revenue || 'TBD', actual: 'pending_data_collection' },
      engagement: { projected: 'TBD', actual: 'pending_data_collection' },
      churn: { projected: projections.churn_rate || 'TBD', actual: 'pending_data_collection' },
      nps: { projected: 'TBD', actual: 'pending_data_collection' },
    },
    baseline_status: noBaseline ? 'no_baseline' : 'ok',
    assumptions_validated: [],
    assumptions_invalidated: [],
    key_learnings: [],
    recommendations: [],
    data_collection_status: 'awaiting_real_data',
    source_artifact_types: POSTLAUNCH_ARTIFACT_KEYS,
  };
}

export { POSTLAUNCH_ARTIFACT_KEYS, classifyNoDataReason };
