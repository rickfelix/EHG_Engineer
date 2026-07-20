#!/usr/bin/env node
/**
 * EVA Health Check CLI — Exposes WorkerScheduler health data.
 *
 * Usage:
 *   node scripts/eva-health-check.cjs          # Human-readable output
 *   node scripts/eva-health-check.cjs --json   # JSON output
 *
 * SD-MAN-INFRA-VENTURE-ARTIFACT-PIPELINE-003
 */

const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9
let _renderCountModule = null;
async function renderCountAsync(count) {
  _renderCountModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _renderCountModule.renderCount(count);
}

/**
 * SD-REFILL-00FHK2ED: map an eva_scheduler_heartbeat row into the worker-shaped object the health
 * report builder expects (eva:health was repointed off the never-provisioned eva_worker_heartbeats).
 * Pure — no DB/clock. The report reads metadata.{consecutiveFailures,circuitBroken,totalRuns,totalErrors},
 * which live as TOP-LEVEL columns on eva_scheduler_heartbeat, so synthesize them here.
 * @param {{instance_id?:string,status?:string,last_poll_at?:string,circuit_breaker_state?:string,
 *          poll_count?:number,dispatch_count?:number,error_count?:number,metadata?:object}} r
 */
function mapSchedulerHeartbeat(r) {
  const row = r || {};
  return {
    worker_id: row.instance_id,
    status: row.status,
    last_heartbeat: row.last_poll_at,
    metadata: {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      // NOTE (RCA 8e4e76b2 F2): error_count is a LIFETIME cumulative counter, so it maps to
      // totalErrors but NOT to consecutiveFailures (a distinct concept the scheduler heartbeat
      // does not record) — reusing it there would falsely print "<lifetime> consecutive".
      circuitBroken: String(row.circuit_breaker_state || '').toUpperCase() === 'OPEN',
      totalRuns: row.poll_count || 0,
      totalErrors: row.error_count || 0,
    },
  };
}

// Export the pure mapper for unit tests (require() must not run the CLI or create a DB client).
module.exports = { mapSchedulerHeartbeat };

const jsonMode = process.argv.includes('--json');

async function main() {
  const supabase = createSupabaseServiceClient();
  // 1. Query scheduler heartbeats. SD-REFILL-00FHK2ED: repointed from the never-provisioned
  // eva_worker_heartbeats to eva_scheduler_heartbeat (the table the scheduler actually writes).
  // Normalize the scheduler-instance shape (instance_id / last_poll_at + top-level counters) into
  // the worker-shaped rows the report builder below already expects, so downstream logic is unchanged.
  const { data: schedRows, error: hbError } = await supabase
    .from('eva_scheduler_heartbeat')
    .select('instance_id, status, last_poll_at, circuit_breaker_state, poll_count, dispatch_count, error_count, metadata')
    .order('last_poll_at', { ascending: false });
  const heartbeats = (schedRows || []).map(mapSchedulerHeartbeat);

  // 2. Query recent alerts from workflow_executions (alert records)
  const { data: recentAlerts, error: alertError } = await supabase
    .from('workflow_executions')
    .select('id, venture_id, status, current_stage, current_stage_data, updated_at')
    .in('status', ['alert', 'stale_detected', 'repeated_failure'])
    .order('updated_at', { ascending: false })
    .limit(10);

  // 3. Query active workflow executions. GAUGE (only the count is used below) — exact
  // head-count avoids both the 1000-row cap misreading activeWorkflows and an unbounded
  // workflow_executions row fetch (SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9).
  const { count: activeExecCount } = await supabase
    .from('workflow_executions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'in_progress');

  // (SD-REFILL-00FHK2ED) Removed the per-worker 'stage-execution-worker' heartbeat query: it read
  // the never-provisioned eva_worker_heartbeats and its result (sewHb) was assigned but never used.

  const now = Date.now();
  const pollInterval = 30000; // DEFAULT_POLL_INTERVAL_MS
  const staleFactor = 5;

  // Build health report
  const report = {
    timestamp: new Date().toISOString(),
    workers: [],
    activeWorkflows: await renderCountAsync(activeExecCount),
    recentAlerts: recentAlerts?.length || 0,
    status: 'unknown'
  };

  // Worker heartbeats
  if (heartbeats && heartbeats.length > 0) {
    for (const hb of heartbeats) {
      const lastBeat = hb.last_heartbeat ? new Date(hb.last_heartbeat).getTime() : 0;
      const ageMs = now - lastBeat;
      const ageStr = formatAge(ageMs);
      const isStale = ageMs > pollInterval * staleFactor;
      const meta = hb.metadata || {};

      report.workers.push({
        name: hb.worker_id,
        status: isStale ? 'degraded' : (hb.status || 'unknown'),
        lastHeartbeat: hb.last_heartbeat,
        heartbeatAge: ageStr,
        stale: isStale,
        consecutiveFailures: meta.consecutiveFailures || 0,
        circuitBroken: meta.circuitBroken || false,
        totalRuns: meta.totalRuns || 0,
        totalErrors: meta.totalErrors || 0,
      });
    }
  }

  // Overall status
  const hasWorkers = report.workers.length > 0;
  const allHealthy = report.workers.every(w => !w.stale && !w.circuitBroken);
  const anyCircuitBroken = report.workers.some(w => w.circuitBroken);

  if (!hasWorkers) {
    report.status = 'no_workers';
  } else if (anyCircuitBroken) {
    report.status = 'critical';
  } else if (allHealthy) {
    report.status = 'healthy';
  } else {
    report.status = 'degraded';
  }

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output
  console.log('');
  console.log('  EVA Health Check');
  console.log('  ' + '='.repeat(60));
  console.log('  Status:     ' + statusIcon(report.status) + ' ' + report.status.toUpperCase());
  console.log('  Timestamp:  ' + report.timestamp);
  console.log('  Active Workflows: ' + report.activeWorkflows);
  console.log('  Recent Alerts:    ' + report.recentAlerts);
  console.log('');

  if (report.workers.length === 0) {
    console.log('  No worker heartbeats found.');
    console.log('  Workers may not be running or heartbeat table is empty.');
    console.log('');

    // Fallback: check if process is running via PID file
    const fs = require('fs');
    const pidFile = require('path').join(process.cwd(), 'stage-execution-worker.pid');
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      console.log('  PID file found: ' + pid);
      try {
        process.kill(parseInt(pid, 10), 0);
        console.log('  Process is running (PID ' + pid + ')');
      } catch {
        console.log('  Process NOT running (stale PID file)');
      }
    }
    console.log('');
  } else {
    console.log('  Workers (' + report.workers.length + ')');
    console.log('  ' + '-'.repeat(60));
    for (const w of report.workers) {
      const icon = w.circuitBroken ? 'X' : (w.stale ? '!' : 'OK');
      console.log('  [' + icon.padEnd(2) + '] ' + w.name);
      console.log('       Status:    ' + w.status);
      console.log('       Heartbeat: ' + w.heartbeatAge + (w.stale ? ' [STALE]' : ''));
      if (w.circuitBroken) console.log('       CIRCUIT BROKEN');
      if (w.consecutiveFailures > 0) console.log('       Failures:  ' + w.consecutiveFailures + ' consecutive');
      console.log('       Runs:      ' + w.totalRuns + ' total, ' + w.totalErrors + ' errors');
      console.log('');
    }
  }

  // Active workflows
  if (activeExecs && activeExecs.length > 0) {
    console.log('  Active Workflows');
    console.log('  ' + '-'.repeat(60));
    for (const exec of activeExecs.slice(0, 5)) {
      const age = formatAge(now - new Date(exec.updated_at).getTime());
      console.log('  ' + (exec.venture_id || 'unknown').substring(0, 12) + '  Stage ' + exec.current_stage + '  Updated ' + age + ' ago');
    }
    if (activeExecs.length > 5) {
      console.log('  ... and ' + (activeExecs.length - 5) + ' more');
    }
    console.log('');
  }

  // Recent alerts
  if (recentAlerts && recentAlerts.length > 0) {
    console.log('  Recent Alerts');
    console.log('  ' + '-'.repeat(60));
    for (const alert of recentAlerts.slice(0, 5)) {
      const alertData = alert.current_stage_data || {};
      console.log('  [' + alert.status + '] ' + (alertData.alert_type || 'unknown') +
        ' - Venture ' + (alert.venture_id || 'unknown').substring(0, 12) +
        ' (Stage ' + (alert.current_stage || '?') + ')');
    }
    console.log('');
  }

  console.log('  ' + '='.repeat(60));
  console.log('');
}

function formatAge(ms) {
  if (ms < 60000) return Math.round(ms / 1000) + 's';
  if (ms < 3600000) return Math.round(ms / 60000) + 'm';
  if (ms < 86400000) return Math.round(ms / 3600000) + 'h';
  return Math.round(ms / 86400000) + 'd';
}

function statusIcon(status) {
  switch (status) {
    case 'healthy': return '[OK]';
    case 'degraded': return '[!!]';
    case 'critical': return '[XX]';
    default: return '[??]';
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Health check failed:', err.message);
    process.exit(1);
  });
}
