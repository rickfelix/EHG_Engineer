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

import { getLLMClient } from '../../../llm/index.js';
import { parseJSON, extractUsage } from '../../utils/parse-json.js';
import { getFourBucketsPrompt } from '../../utils/four-buckets-prompt.js';
import { parseFourBuckets } from '../../utils/four-buckets-parser.js';
import { verifyLaunchAuthorization } from '../stage-26.js';

// Duplicated from stage-25.js to avoid circular dependency
const CHANNEL_STATUSES = ['inactive', 'activating', 'active', 'failed', 'paused'];
const ESCALATION_LEVELS = ['L1', 'L2', 'L3'];

const SYSTEM_PROMPT = `You are EVA's Launch Execution Analyst. Given a venture that has been approved for launch (Stage 24 chairman gate passed), generate the go-live execution plan with distribution channels and operations handoff.

You MUST output valid JSON with exactly this structure:
{
  "launch_summary": "3-5 sentence summary of the launch execution including key milestones and outcomes",
  "go_live_timestamp": "ISO 8601 timestamp for go-live (planned or actual)",
  "distribution_channels": [
    {
      "name": "Channel name (e.g., 'App Store', 'Web', 'Social Media')",
      "type": "app_store|web|social|email|partner|marketplace|direct",
      "status": "inactive|activating|active|failed|paused",
      "activation_date": "ISO date when channel was/will be activated",
      "metrics_endpoint": "URL or identifier for channel metrics"
    }
  ],
  "operations_handoff": {
    "monitoring": {
      "dashboards": [
        { "name": "Dashboard name", "url": "Dashboard URL", "owner": "Team/person responsible" }
      ],
      "alerts": [
        { "name": "Alert name", "condition": "When this triggers", "severity": "critical|warning|info", "notify": "Channel/team to notify" }
      ],
      "health_check_url": "URL for health check endpoint"
    },
    "escalation": {
      "contacts": [
        { "level": "L1|L2|L3", "team": "Team name", "channel": "Contact method", "response_time": "Expected response time" }
      ],
      "runbook_url": "URL to operations runbook",
      "sla_targets": {
        "uptime": "99.9%",
        "response_time_p95": "200ms",
        "incident_resolution": "4 hours"
      }
    },
    "maintenance": {
      "schedule": "Maintenance window schedule (e.g., 'Sundays 2-4 AM UTC')",
      "backup_strategy": "Backup approach and frequency",
      "update_policy": "How updates/patches are deployed"
    }
  }
}

Rules:
- At least 1 distribution channel required
- operations_handoff.monitoring must have at least 1 dashboard and 1 alert
- operations_handoff.escalation must have at least 1 contact at L1
- launch_summary must be at least 10 characters
- All channels should have realistic activation dates
- SLA targets should be reasonable for the venture type`;

/**
 * Generate launch execution plan from Stage 24 approval data.
 *
 * @param {Object} params
 * @param {Object} params.stage24Data - Launch readiness (chairman gate, readiness checklist)
 * @param {Object} [params.stage22Data] - Release readiness data
 * @param {Object} [params.stage23Data] - Marketing preparation data
 * @param {Object} [params.stage01Data] - Venture hydration data
 * @param {string} [params.ventureName]
 * @param {Object} [params.logger]
 * @returns {Promise<Object>} Launch execution with distribution channels and operations handoff
 */
export async function analyzeStage25({ stage24Data, stage22Data, stage23Data, ventureName, ventureId, supabase, logger = console }) {
  const startTime = Date.now();
  logger.log('[Stage25] Starting launch execution analysis', { ventureName });

  // Verify Stage 24 chairman approval
  const auth = verifyLaunchAuthorization({ stage24Data });
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

  const client = getLLMClient({ purpose: 'content-generation' });

  // Build context from upstream stages
  const readinessContext = stage24Data.readiness_score != null
    ? `Readiness score: ${stage24Data.readiness_score}/100. Decision: ${stage24Data.go_no_go_decision}`
    : '';

  const checklistContext = stage24Data.readiness_checklist
    ? `Checklist: ${Object.entries(stage24Data.readiness_checklist).map(([k, v]) => `${k}=${v.status}`).join(', ')}`
    : '';

  const irpContext = stage24Data.incident_response_plan
    ? `Incident response: ${stage24Data.incident_response_plan.substring(0, 200)}`
    : '';

  const monitorContext = stage24Data.monitoring_setup
    ? `Monitoring: ${stage24Data.monitoring_setup.substring(0, 200)}`
    : '';

  const rollbackContext = stage24Data.rollback_plan
    ? `Rollback: ${stage24Data.rollback_plan.substring(0, 200)}`
    : '';

  const releaseContext = stage22Data?.releaseDecision
    ? `Release: ${stage22Data.releaseDecision.decision}. Items: ${(stage22Data.release_items || []).length}`
    : '';

  const marketingContext = stage23Data
    ? `Marketing: ${stage23Data.total_marketing_items || 0} items prepared`
    : '';

  const userPrompt = `Generate launch execution plan for this venture that has been approved for launch.

Venture: ${ventureName || 'Unnamed'}
${readinessContext}
${checklistContext}
${irpContext}
${monitorContext}
${rollbackContext}
${releaseContext}
${marketingContext}

Output ONLY valid JSON.`;

  const response = await client.complete(SYSTEM_PROMPT + getFourBucketsPrompt(), userPrompt, { timeout: 120000 });
  const usage = extractUsage(response);
  const parsed = parseJSON(response);
  const fourBuckets = parseFourBuckets(parsed, { logger });

  // Normalize launch summary
  const launch_summary = String(parsed.launch_summary || 'Launch execution in progress.').substring(0, 2000);

  // Normalize go-live timestamp
  const go_live_timestamp = parsed.go_live_timestamp || new Date().toISOString();

  // Normalize distribution channels
  let distribution_channels = Array.isArray(parsed.distribution_channels)
    ? parsed.distribution_channels.filter(ch => ch?.name && ch?.type)
    : [];

  if (distribution_channels.length === 0) {
    distribution_channels = [{
      name: 'Web Application',
      type: 'web',
      status: 'activating',
      activation_date: new Date().toISOString(),
      metrics_endpoint: null,
    }];
  } else {
    distribution_channels = distribution_channels.map(ch => ({
      name: String(ch.name).substring(0, 200),
      type: String(ch.type).substring(0, 50),
      status: CHANNEL_STATUSES.includes(ch.status) ? ch.status : 'inactive',
      activation_date: ch.activation_date || null,
      metrics_endpoint: ch.metrics_endpoint ? String(ch.metrics_endpoint).substring(0, 500) : null,
    }));
  }

  // Normalize operations handoff
  const ops = parsed.operations_handoff || {};
  const operations_handoff = {
    monitoring: {
      dashboards: Array.isArray(ops.monitoring?.dashboards) ? ops.monitoring.dashboards.slice(0, 10).map(d => ({
        name: String(d?.name || 'Dashboard').substring(0, 100),
        url: String(d?.url || '').substring(0, 500),
        owner: String(d?.owner || 'Operations').substring(0, 100),
      })) : [{ name: 'Operations Dashboard', url: '', owner: 'Operations' }],
      alerts: Array.isArray(ops.monitoring?.alerts) ? ops.monitoring.alerts.slice(0, 20).map(a => ({
        name: String(a?.name || 'Alert').substring(0, 100),
        condition: String(a?.condition || '').substring(0, 300),
        severity: ['critical', 'warning', 'info'].includes(a?.severity) ? a.severity : 'warning',
        notify: String(a?.notify || 'ops-team').substring(0, 100),
      })) : [{ name: 'Health Check Alert', condition: 'Service unavailable', severity: 'critical', notify: 'ops-team' }],
      health_check_url: String(ops.monitoring?.health_check_url || '').substring(0, 500) || null,
    },
    escalation: {
      contacts: Array.isArray(ops.escalation?.contacts) ? ops.escalation.contacts.slice(0, 10).map(c => ({
        level: ESCALATION_LEVELS.includes(c?.level) ? c.level : 'L1',
        team: String(c?.team || 'Support').substring(0, 100),
        channel: String(c?.channel || 'email').substring(0, 100),
        response_time: String(c?.response_time || '1 hour').substring(0, 100),
      })) : [{ level: 'L1', team: 'Support', channel: 'email', response_time: '1 hour' }],
      runbook_url: String(ops.escalation?.runbook_url || '').substring(0, 500) || null,
      sla_targets: ops.escalation?.sla_targets && typeof ops.escalation.sla_targets === 'object'
        ? Object.fromEntries(Object.entries(ops.escalation.sla_targets).slice(0, 10).map(([k, v]) => [k, String(v).substring(0, 100)]))
        : { uptime: '99.9%', response_time_p95: '500ms' },
    },
    maintenance: {
      schedule: String(ops.maintenance?.schedule || 'To be determined').substring(0, 300),
      backup_strategy: String(ops.maintenance?.backup_strategy || 'Daily automated backups').substring(0, 300),
      update_policy: String(ops.maintenance?.update_policy || 'Rolling updates with zero downtime').substring(0, 300),
    },
  };

  // Compute derived fields
  const channels_active_count = distribution_channels.filter(ch => ch.status === 'active').length;
  const channels_total_count = distribution_channels.length;
  const pipeline_terminus = true;
  const pipeline_mode = 'operations';

  const latencyMs = Date.now() - startTime;
  logger.log('[Stage25] Launch execution analysis complete', {
    channels: channels_total_count,
    active: channels_active_count,
    pipeline_terminus,
    latencyMs,
  });

  return {
    launch_summary,
    go_live_timestamp,
    distribution_channels,
    operations_handoff,
    pipeline_terminus,
    pipeline_mode,
    channels_active_count,
    channels_total_count,
    ...(fourBuckets || {}),
    _usage: usage,
    _latencyMs: latencyMs,
  };
}
