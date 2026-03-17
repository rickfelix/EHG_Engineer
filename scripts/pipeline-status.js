#!/usr/bin/env node

/**
 * Pipeline Status - Self-Improvement Observability
 * SD-LEO-SELF-IMPROVE-001M (Phase 7b: Control-Plane + Observability)
 *
 * Displays real-time health metrics for the self-improvement pipeline:
 * - MTTI (Mean Time To Intervention)
 * - MTTR (Mean Time To Remediate)
 * - Pipeline activity and queue depths
 */

import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createSupabaseServiceClient();

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

/**
 * Get health indicator based on value and thresholds
 */
function getHealthIndicator(value, warningThreshold, criticalThreshold) {
  if (value <= warningThreshold) {
    return { icon: '🟢', status: 'Healthy', color: colors.green };
  } else if (value <= criticalThreshold) {
    return { icon: '🟡', status: 'Warning', color: colors.yellow };
  } else {
    return { icon: '🔴', status: 'Critical', color: colors.red };
  }
}

/**
 * Format hours to human-readable string
 */
function formatHours(hours) {
  if (hours === 0 || hours === null) return 'N/A';
  if (hours < 1) return `${(hours * 60).toFixed(0)} min`;
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Fetch pipeline health data
 */
async function fetchPipelineHealth() {
  // Try the view first
  const { data: viewData, error: viewError } = await supabase
    .from('v_pipeline_health')
    .select('*')
    .single();

  if (!viewError && viewData) {
    return viewData;
  }

  // Fallback: query metrics directly
  const now = new Date().toISOString();

  // Get MTTI averages
  const { data: mttiData } = await supabase
    .from('pipeline_metrics')
    .select('metric_value, recorded_at')
    .eq('metric_name', 'mtti_hours')
    .gte('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Get MTTR averages
  const { data: mttrData } = await supabase
    .from('pipeline_metrics')
    .select('metric_value, recorded_at')
    .eq('metric_name', 'mttr_hours')
    .gte('recorded_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  // Get pipeline activity
  const { count: proposals24h } = await supabase
    .from('leo_proposals')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: sdsCompleted24h } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('completion_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { count: feedback24h } = await supabase
    .from('feedback')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  // Get queue depths
  const { count: pendingProposals } = await supabase
    .from('leo_proposals')
    .select('*', { count: 'exact', head: true })
    .in('status', ['draft', 'submitted', 'pending_vetting']);

  const { count: activeSds } = await supabase
    .from('strategic_directives_v2')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'in_progress');

  // Calculate averages
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const mtti7d = mttiData?.filter(d => new Date(d.recorded_at).getTime() > sevenDaysAgo) || [];
  const mttr7d = mttrData?.filter(d => new Date(d.recorded_at).getTime() > sevenDaysAgo) || [];

  const avgMtti7d = mtti7d.length > 0
    ? mtti7d.reduce((sum, d) => sum + parseFloat(d.metric_value), 0) / mtti7d.length
    : 0;
  const avgMtti30d = mttiData?.length > 0
    ? mttiData.reduce((sum, d) => sum + parseFloat(d.metric_value), 0) / mttiData.length
    : 0;
  const avgMttr7d = mttr7d.length > 0
    ? mttr7d.reduce((sum, d) => sum + parseFloat(d.metric_value), 0) / mttr7d.length
    : 0;
  const avgMttr30d = mttrData?.length > 0
    ? mttrData.reduce((sum, d) => sum + parseFloat(d.metric_value), 0) / mttrData.length
    : 0;

  return {
    avg_mtti_hours_7d: avgMtti7d,
    avg_mtti_hours_30d: avgMtti30d,
    avg_mttr_hours_7d: avgMttr7d,
    avg_mttr_hours_30d: avgMttr30d,
    proposals_24h: proposals24h || 0,
    sds_completed_24h: sdsCompleted24h || 0,
    feedback_24h: feedback24h || 0,
    pending_proposals: pendingProposals || 0,
    active_sds: activeSds || 0,
    snapshot_at: now,
  };
}

/**
 * Display the pipeline status
 */
async function displayStatus() {
  console.log('\n');

  try {
    const health = await fetchPipelineHealth();

    // MTTI health (target: <24 hours)
    const mttiHealth = getHealthIndicator(health.avg_mtti_hours_7d, 24, 48);

    // MTTR health (target: <72 hours)
    const mttrHealth = getHealthIndicator(health.avg_mttr_hours_7d, 72, 168);

    // Overall health
    const overallHealth = mttiHealth.icon === '🟢' && mttrHealth.icon === '🟢'
      ? '🟢 Healthy'
      : (mttiHealth.icon === '🔴' || mttrHealth.icon === '🔴')
      ? '🔴 Needs Attention'
      : '🟡 Warning';

    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         SELF-IMPROVEMENT PIPELINE STATUS                      ║');
    console.log('║                                               ' + overallHealth.padEnd(16) + '  ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║                                                               ║');
    console.log('║  ⏱️  MTTI (Mean Time To Intervention)  ' + mttiHealth.icon + '                     ║');
    console.log('║  ├─ 7-day average:  ' + formatHours(health.avg_mtti_hours_7d).padEnd(15) + ' (target: <24h)     ║');
    console.log('║  └─ 30-day average: ' + formatHours(health.avg_mtti_hours_30d).padEnd(15) + '                    ║');
    console.log('║                                                               ║');
    console.log('║  🔧 MTTR (Mean Time To Remediate)  ' + mttrHealth.icon + '                         ║');
    console.log('║  ├─ 7-day average:  ' + formatHours(health.avg_mttr_hours_7d).padEnd(15) + ' (target: <72h)     ║');
    console.log('║  └─ 30-day average: ' + formatHours(health.avg_mttr_hours_30d).padEnd(15) + '                    ║');
    console.log('║                                                               ║');
    console.log('║  📊 LAST 24 HOURS                                             ║');
    console.log('║  ├─ Proposals created:   ' + String(health.proposals_24h).padStart(4) + '                          ║');
    console.log('║  ├─ SDs completed:       ' + String(health.sds_completed_24h).padStart(4) + '                          ║');
    console.log('║  └─ Feedback received:   ' + String(health.feedback_24h).padStart(4) + '                          ║');
    console.log('║                                                               ║');
    console.log('║  📋 QUEUE STATUS                                              ║');
    console.log('║  ├─ Pending proposals:   ' + String(health.pending_proposals).padStart(4) + '                          ║');
    console.log('║  └─ Active SDs:          ' + String(health.active_sds).padStart(4) + '                          ║');
    console.log('║                                                               ║');
    console.log('║  ⏰ Snapshot: ' + new Date(health.snapshot_at).toISOString().slice(0, 19).replace('T', ' ') + '                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    // Return exit code based on health
    if (overallHealth.includes('Needs Attention')) {
      process.exit(2);
    } else if (overallHealth.includes('Warning')) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('Error fetching pipeline status:', error.message);

    // Show fallback view when table doesn't exist yet
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         SELF-IMPROVEMENT PIPELINE STATUS                      ║');
    console.log('║                                               ⚪ Initializing  ║');
    console.log('╠═══════════════════════════════════════════════════════════════╣');
    console.log('║                                                               ║');
    console.log('║  ℹ️  Pipeline metrics not yet initialized                     ║');
    console.log('║                                                               ║');
    console.log('║  Run the migration to enable metrics tracking:                ║');
    console.log('║  database/migrations/20260201_pipeline_metrics.sql            ║');
    console.log('║                                                               ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('\n');
    process.exit(0);
  }
}

// Run if called directly
displayStatus();
