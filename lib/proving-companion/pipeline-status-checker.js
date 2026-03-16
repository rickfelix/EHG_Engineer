/**
 * Pipeline Status Checker — queries venture_stage_work, workflow_executions,
 * and worker_heartbeats to determine WHY outputs are present or missing.
 * Answers: did the worker run? Did it succeed? Did it error? Is it still queued?
 * Deterministic, zero LLM cost.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { getStageRange } from './stage-config.js';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Check pipeline processing status for a range of stages
 * @param {string} ventureId
 * @param {number} fromStage
 * @param {number} toStage
 * @returns {object} map of stage number to check results
 */
export async function checkPipelineStatus(ventureId, fromStage, toStage) {
  const stageConfigs = getStageRange(fromStage, toStage);
  const results = {};

  // 1. Get venture orchestrator state
  const { data: venture, error: vErr } = await supabase
    .from('ventures')
    .select('orchestrator_state, orchestrator_lock_id, orchestrator_lock_acquired_at, current_lifecycle_stage')
    .eq('id', ventureId)
    .single();

  if (vErr) {
    for (const [stageNum, config] of Object.entries(stageConfigs)) {
      results[stageNum] = {
        stage_number: parseInt(stageNum),
        stage_name: config.name,
        checks: [{ name: 'venture_query', pass: false, detail: `Cannot query venture: ${vErr.message}` }],
        pass_count: 0, fail_count: 1
      };
    }
    return results;
  }

  // 2. Get per-stage work status
  const { data: stageWork } = await supabase
    .from('venture_stage_work')
    .select('lifecycle_stage, stage_status, work_type, started_at, completed_at, advisory_data')
    .eq('venture_id', ventureId)
    .order('lifecycle_stage', { ascending: true });

  const stageWorkMap = {};
  for (const sw of (stageWork || [])) {
    stageWorkMap[sw.lifecycle_stage] = sw;
  }

  // 3. Get recent execution history
  const { data: executions } = await supabase
    .from('workflow_executions')
    .select('current_stage, status, started_at, current_stage_data')
    .eq('venture_id', ventureId)
    .order('started_at', { ascending: false })
    .limit(50);

  const execMap = {};
  for (const ex of (executions || [])) {
    if (!execMap[ex.current_stage]) {
      execMap[ex.current_stage] = ex;
    }
  }

  // 4. Check worker health
  const { data: workers } = await supabase
    .from('worker_heartbeats')
    .select('worker_id, status, last_heartbeat_at')
    .eq('worker_type', 'stage-execution-worker')
    .order('last_heartbeat_at', { ascending: false })
    .limit(1);

  const worker = workers?.[0];
  const workerOnline = worker?.status === 'online' &&
    worker?.last_heartbeat_at &&
    (Date.now() - new Date(worker.last_heartbeat_at).getTime()) < 5 * 60 * 1000;

  // Build per-stage results
  for (const [stageNum, config] of Object.entries(stageConfigs)) {
    const num = parseInt(stageNum);
    const checks = [];
    const sw = stageWorkMap[num];
    const ex = execMap[num];

    // Worker health (same for every stage but important context)
    checks.push({
      name: 'worker_online',
      pass: workerOnline,
      detail: workerOnline
        ? `Worker ${worker.worker_id} online (last heartbeat ${worker.last_heartbeat_at})`
        : worker ? `Worker ${worker.worker_id} is ${worker.status} (last heartbeat ${worker.last_heartbeat_at})` : 'No stage execution worker found'
    });

    // Orchestrator state
    const orchState = venture.orchestrator_state || 'unknown';
    const isLocked = venture.orchestrator_lock_id != null;
    checks.push({
      name: 'orchestrator_state',
      pass: true,
      detail: isLocked
        ? `Orchestrator: ${orchState} (locked since ${venture.orchestrator_lock_acquired_at})`
        : `Orchestrator: ${orchState}`
    });

    // Per-stage work status
    if (sw) {
      const stageStatus = sw.stage_status || 'unknown';
      const isProblem = stageStatus === 'failed' || stageStatus === 'blocked';
      checks.push({
        name: 'stage_work_status',
        pass: !isProblem,
        detail: `Stage work: ${stageStatus}` +
          (sw.started_at ? ` (started ${sw.started_at})` : '') +
          (sw.completed_at ? ` (completed ${sw.completed_at})` : '')
      });

      if (stageStatus === 'failed' && sw.advisory_data?.errors) {
        const errors = Array.isArray(sw.advisory_data.errors) ? sw.advisory_data.errors : [sw.advisory_data.errors];
        checks.push({
          name: 'stage_error',
          pass: false,
          detail: `Error: ${errors.map(e => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join('; ').slice(0, 200)}`
        });
      }
    } else {
      // No stage work record — has the worker reached this stage yet?
      const ventureStage = venture.current_lifecycle_stage || 0;
      if (num > ventureStage) {
        checks.push({
          name: 'stage_work_status',
          pass: true,
          detail: `Stage not yet reached (venture at Stage ${ventureStage})`
        });
      } else {
        checks.push({
          name: 'stage_work_status',
          pass: false,
          detail: `No processing record for Stage ${num} (venture is at Stage ${ventureStage})`
        });
      }
    }

    // Execution history
    if (ex) {
      const duration = ex.current_stage_data?.duration_ms;
      const workerId = ex.current_stage_data?.worker_id;
      checks.push({
        name: 'execution_history',
        pass: ex.status === 'completed',
        detail: `Execution: ${ex.status}` +
          (duration ? ` (${duration}ms)` : '') +
          (workerId ? ` by ${workerId}` : '') +
          (ex.current_stage_data?.errors ? ` — errors: ${JSON.stringify(ex.current_stage_data.errors).slice(0, 150)}` : '')
      });
    } else {
      checks.push({
        name: 'execution_history',
        pass: false,
        detail: 'No execution record — worker has not attempted this stage'
      });
    }

    results[stageNum] = {
      stage_number: num,
      stage_name: config.name,
      checks,
      pass_count: checks.filter(c => c.pass).length,
      fail_count: checks.filter(c => !c.pass).length
    };
  }

  return results;
}
