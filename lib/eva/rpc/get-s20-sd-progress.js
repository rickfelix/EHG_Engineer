/**
 * RPC: Get S20 SD Progress
 *
 * SD-LEO-INFRA-S20-VENTURE-LEO-001
 *
 * Returns orchestrator + child SD status for a venture in Stage 20.
 * Used by the chairman dashboard and the S20 pause controller.
 *
 * @module lib/eva/rpc/get-s20-sd-progress
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { isMainModule } from '../../utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get SD progress for a venture at Stage 20.
 *
 * @param {string} ventureId - UUID of the venture
 * @returns {Promise<object>} Progress data with orchestrators, children, and pause state
 */
export async function getS20SdProgress(ventureId) {
  if (!ventureId) throw new Error('ventureId is required');

  // Get pause state from venture_stage_work
  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('advisory_data, stage_status, health_score, started_at')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 20)
    .maybeSingle();

  const pauseState = stageWork?.advisory_data?.pause_state || null;

  // Get all SDs linked to this venture
  const { data: allSDs } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, current_phase, progress, parent_sd_id, created_at')
    .eq('venture_id', ventureId);

  if (!allSDs || allSDs.length === 0) {
    return {
      venture_id: ventureId,
      pause_state: pauseState,
      stage_status: stageWork?.stage_status || 'unknown',
      health_score: stageWork?.health_score || 'green',
      orchestrators: [],
      summary: { total_orchestrators: 0, completed: 0, in_progress: 0, total_sds: 0 },
    };
  }

  // Build parent→children map
  const ventureSDIds = new Set(allSDs.map(sd => sd.id));
  const childrenMap = new Map();
  const topLevel = [];

  for (const sd of allSDs) {
    if (!sd.parent_sd_id || !ventureSDIds.has(sd.parent_sd_id)) {
      topLevel.push(sd);
    } else {
      if (!childrenMap.has(sd.parent_sd_id)) childrenMap.set(sd.parent_sd_id, []);
      childrenMap.get(sd.parent_sd_id).push(sd);
    }
  }

  // Build orchestrator tree
  const orchestrators = topLevel.map(osd => {
    const children = (childrenMap.get(osd.id) || []).map(c => ({
      sd_key: c.sd_key,
      title: c.title,
      status: c.status,
      current_phase: c.current_phase,
      progress: c.progress || 0,
    }));

    // Compute orchestrator progress from children if any
    let effectiveProgress = osd.progress || 0;
    if (children.length > 0) {
      const completedChildren = children.filter(c => c.status === 'completed').length;
      effectiveProgress = Math.round((completedChildren / children.length) * 100);
    }

    return {
      sd_key: osd.sd_key,
      title: osd.title,
      status: osd.status,
      current_phase: osd.current_phase,
      progress: effectiveProgress,
      children,
      child_count: children.length,
      completed_children: children.filter(c => c.status === 'completed').length,
    };
  });

  // Compute summary
  const completedOrch = orchestrators.filter(o => o.status === 'completed').length;
  const inProgressOrch = orchestrators.filter(o =>
    o.status !== 'completed' && o.status !== 'cancelled'
  ).length;

  // Compute time in pause
  let timeInPause = null;
  if (pauseState?.paused_at) {
    const pausedMs = Date.now() - new Date(pauseState.paused_at).getTime();
    timeInPause = {
      ms: pausedMs,
      hours: Math.round(pausedMs / (1000 * 60 * 60) * 10) / 10,
      days: Math.round(pausedMs / (1000 * 60 * 60 * 24) * 10) / 10,
      display: formatDuration(pausedMs),
    };
  }

  return {
    venture_id: ventureId,
    pause_state: pauseState,
    stage_status: stageWork?.stage_status || 'unknown',
    health_score: stageWork?.health_score || 'green',
    time_in_pause: timeInPause,
    orchestrators,
    summary: {
      total_orchestrators: orchestrators.length,
      completed: completedOrch,
      in_progress: inProgressOrch,
      total_sds: allSDs.length,
    },
  };
}

/**
 * Force advance S20 for a venture.
 *
 * @param {string} ventureId
 * @param {string} advancedBy - Who triggered the force advance
 */
export async function forceAdvanceS20(ventureId, advancedBy = 'chairman') {
  if (!ventureId) throw new Error('ventureId is required');

  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('advisory_data')
    .eq('venture_id', ventureId)
    .eq('lifecycle_stage', 20)
    .maybeSingle();

  const advisoryData = stageWork?.advisory_data || {};
  advisoryData.pause_state = {
    ...(advisoryData.pause_state || {}),
    state: 'COMPLETE',
    force_advanced: true,
    force_advanced_by: advancedBy,
    force_advanced_at: new Date().toISOString(),
  };
  // Preserve legacy override flag for backward compatibility
  advisoryData.override = true;

  await supabase
    .from('venture_stage_work')
    .upsert({
      venture_id: ventureId,
      lifecycle_stage: 20,
      stage_status: 'completed',
      advisory_data: advisoryData,
    }, { onConflict: 'venture_id,lifecycle_stage' });

  return { success: true, venture_id: ventureId, advanced_by: advancedBy };
}

function formatDuration(ms) {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  return `${hours}h ${minutes}m`;
}

// CLI entry point
if (isMainModule(import.meta.url)) {
  const [,, command, ventureId, ...rest] = process.argv;

  if (command === 'progress' && ventureId) {
    getS20SdProgress(ventureId).then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  } else if (command === 'force-advance' && ventureId) {
    const advancedBy = rest[0] || 'chairman';
    forceAdvanceS20(ventureId, advancedBy).then(result => {
      console.log(JSON.stringify(result, null, 2));
    }).catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node get-s20-sd-progress.js progress <venture-id>');
    console.log('  node get-s20-sd-progress.js force-advance <venture-id> [advanced-by]');
  }
}
