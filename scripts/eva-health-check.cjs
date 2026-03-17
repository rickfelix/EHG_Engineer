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

const supabase = createSupabaseServiceClient();

const jsonMode = process.argv.includes('--json');

async function main() {
  // 1. Query worker heartbeats from eva_worker_heartbeats
  const { data: heartbeats, error: hbError } = await supabase
    .from('eva_worker_heartbeats')
    .select('worker_id, status, last_heartbeat, metadata')
    .order('last_heartbeat', { ascending: false });

  // 2. Query recent alerts from workflow_executions (alert records)
  const { data: recentAlerts, error: alertError } = await supabase
    .from('workflow_executions')
    .select('id, venture_id, status, current_stage, current_stage_data, updated_at')
    .in('status', ['alert', 'stale_detected', 'repeated_failure'])
    .order('updated_at', { ascending: false })
    .limit(10);

  // 3. Query active workflow executions
  const { data: activeExecs, error: execError } = await supabase
    .from('workflow_executions')
    .select('id, venture_id, current_stage, status, started_at, updated_at')
    .eq('status', 'in_progress')
    .order('updated_at', { ascending: false });

  // 4. Query stage execution worker heartbeat
  const { data: sewHb } = await supabase
    .from('eva_worker_heartbeats')
    .select('*')
    .eq('worker_id', 'stage-execution-worker')
    .maybeSingle();

  const now = Date.now();
  const pollInterval = 30000; // DEFAULT_POLL_INTERVAL_MS
  const staleFactor = 5;

  // Build health report
  const report = {
    timestamp: new Date().toISOString(),
    workers: [],
    activeWorkflows: activeExecs?.length || 0,
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

main().catch(err => {
  console.error('Health check failed:', err.message);
  process.exit(1);
});
