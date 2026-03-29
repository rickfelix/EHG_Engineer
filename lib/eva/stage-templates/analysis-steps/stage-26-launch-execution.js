/**
 * Stage 25 Analysis Step - Launch Execution (Pipeline Terminus)
 * Phase: LAUNCH & LEARN (Stages 23-25)
 * Part of SD-LEO-ORCH-EVA-STAGE-PIPELINE-001-B
 *
 * Verifies Stage 24 chairman approval, activates distribution channels,
 * generates operations handoff, and marks pipeline terminus.
 *
 * @module lib/eva/stage-templates/analysis-steps/stage-25-launch-execution
 */

import { verifyLaunchAuthorization } from '../stage-26.js';

/**
 * Generate launch execution plan from Stage 24 approval data.
 *
 * @param {Object} params
 * @param {Object} params.stage25Data - Launch readiness (lifecycle 25: chairman gate, readiness checklist)
 * @param {Object} [params.stage23Data] - Release readiness data (lifecycle 23)
 * @param {Object} [params.stage24Data] - Marketing preparation data (lifecycle 24)
 * @param {Object} [params.stage01Data] - Venture hydration data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Launch execution with distribution channels and operations handoff
 */
export async function analyzeStage25({ stage25Data, stage23Data, stage24Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage25] Starting launch execution analysis', { ventureName });

  // Verify Stage 25 chairman approval
  const auth = verifyLaunchAuthorization({ stage25Data });
  if (!auth.authorized) {
    // L2+ autonomy: auto-proceed despite launch not authorized
    let autonomyOverride = false;
    if (ventureId && supabase) {
      try {
        const { checkAutonomy } = await import('../../autonomy-model.js');
        const autonomy = await checkAutonomy(ventureId, 'stage_gate', { supabase });
        if (autonomy.action === 'auto_approve') {
          logger.log(`[Stage25] Launch not authorized but autonomy=${autonomy.level} — auto-proceeding`);
          autonomyOverride = true;
        }
      } catch { /* fall through to throw */ }
    }
    if (!autonomyOverride) {
      const errorMsg = `Launch not authorized: ${auth.reasons.join('; ')}`;
      logger.warn(`[Stage25] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  // Use real data path if upstream stage used real data
  if (stage25Data?.dataSource === 'venture_stage_work') {
    try {
      const realData = buildRealLaunchExecutionData(stage25Data, stage23Data, stage24Data, ventureName, logger);
      if (realData) {
        logger.log('[Stage26] Using real data from upstream stages');
        return realData;
      }
    } catch (err) {
      logger.warn('[Stage26] Real data derivation failed', { error: err.message });
    }
  }

  throw new Error(
    `[Stage26] REFUSED: No real build data found for venture ${ventureName || 'unknown'}. ` +
    'LLM synthesis is disabled — this stage requires real data from upstream SD completion. ' +
    'Check that the venture-to-LEO bridge created SDs and BUILD_PENDING blocked until they completed.'
  );
}

/**
 * Build launch execution data from real upstream stage data (no LLM).
 * Derives distribution channels and operations handoff from upstream context.
 *
 * @param {Object} stage25Data - Launch readiness (lifecycle 25)
 * @param {Object} [stage23Data] - Release readiness (lifecycle 23)
 * @param {Object} [stage24Data] - Marketing preparation (lifecycle 24)
 * @param {string} [ventureName]
 * @param {Object} logger
 * @returns {Object|null} Stage 26 output or null if data insufficient
 */
function buildRealLaunchExecutionData(stage25Data, stage23Data, stage24Data, ventureName, logger) {
  const name = ventureName || 'Venture';
  const nameSlug = name.toLowerCase().replace(/\s+/g, '-');

  const releaseItems = stage23Data?.release_items || [];
  const marketingItems = stage24Data?.marketing_items || [];
  const goDecision = stage25Data.go_no_go_decision || 'unknown';
  const approvedCount = releaseItems.filter(ri => ri.status === 'approved').length;

  const goLiveDate = new Date(Date.now() + 7 * 86400000).toISOString();

  const distribution_channels = [
    {
      name: `${name} Web Application`,
      type: 'web',
      status: 'activating',
      activation_date: goLiveDate,
      metrics_endpoint: `/api/metrics/${nameSlug}`,
    },
  ];

  const operations_handoff = {
    monitoring: {
      dashboards: [`${name} Application Health`, `${name} User Activity`],
      alerts: ['Error rate > 5%', 'Response time > 2s', 'Uptime < 99.5%'],
      health_check_url: '/api/health',
    },
    escalation: {
      contacts: ['engineering-lead', 'product-owner'],
      runbook_url: `/docs/runbooks/${nameSlug}`,
      sla_targets: { uptime: '99.5%', response_time_p95: '2s', error_rate: '<5%' },
    },
    maintenance: {
      schedule: 'Weekly maintenance window: Sunday 02:00-04:00 UTC',
      backup_strategy: 'Daily automated backups with 30-day retention',
      update_policy: 'Continuous deployment with feature flags for gradual rollout',
    },
  };

  const launch_summary = `${name} launch: ${approvedCount} release items approved, ${marketingItems.length} marketing deliverables prepared, go/no-go decision: ${goDecision}. Pipeline complete — transitioning to operations mode.`;

  logger.log('[Stage26] Built real launch execution data', { channels: distribution_channels.length, pipeline_terminus: true });

  return {
    distribution_channels,
    operations_handoff,
    launch_summary,
    go_live_timestamp: goLiveDate,
    pipeline_terminus: true,
    pipeline_mode: 'launch',
    channels_active_count: 0,
    channels_total_count: distribution_channels.length,
    dataSource: 'venture_stage_work',
  };
}
