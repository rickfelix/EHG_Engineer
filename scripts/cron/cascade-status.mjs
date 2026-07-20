#!/usr/bin/env node
/**
 * Cascade pipeline observability CLI.
 *
 * SD: SD-LEO-INFRA-AUTOMATE-STAGE-CASCADE-001 / FR-C (AC-C3)
 *
 * Read-only. Reports on cascade-watcher health:
 *   - Last heartbeat age (vs 5-minute staleness threshold per RISK COND-6)
 *   - Unresolved refusal count by stage
 *   - Per-vision_id last error + remediation_command
 *   - Success count last 24h
 *
 * Exit codes:
 *   0  healthy (recent heartbeat AND zero unresolved errors)
 *   1  degraded (stale heartbeat OR unresolved errors present)
 *
 * Intended for terminal use AND scripted checks (CI / cron health probe).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const STALE_HEARTBEAT_THRESHOLD_SEC = 300;

export function ageHuman(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m`;
}

export async function gatherStatus(supabase, { now = new Date() } = {}) {
  const { data: hb } = await supabase
    .from('cascade_watcher_heartbeats')
    .select('run_id, started_at, finished_at, exit_code, refusal_count, success_count, hostname')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the unresolved-refusal count
  // and per-stage breakdown below are computed over every row this returns; an unranged read
  // would silently under-report exactly when an incident spikes unresolved errors past the
  // cap. Paginate to completion; empty-on-error mirrors the prior fail-open (destructured
  // data with no explicit error check).
  let errors;
  try {
    errors = await fetchAllPaginated(() => supabase
      .from('eva_cascade_errors')
      .select('id, vision_id, stage, error_code, error_message, remediation_command, created_at, updated_at')
      .is('resolved_at', null)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true }));
  } catch {
    errors = [];
  }

  const { count: success24h } = await supabase
    .from('cascade_watcher_heartbeats')
    .select('*', { count: 'exact', head: true })
    .gte('started_at', new Date(now.getTime() - 86400_000).toISOString())
    .not('finished_at', 'is', null)
    .eq('exit_code', 0);

  const heartbeatAgeMs = hb ? (now - new Date(hb.started_at)) : null;
  const heartbeatStale = heartbeatAgeMs == null
    ? true
    : heartbeatAgeMs > STALE_HEARTBEAT_THRESHOLD_SEC * 1000;
  const abandoned = hb && hb.finished_at == null && heartbeatAgeMs > STALE_HEARTBEAT_THRESHOLD_SEC * 1000;

  const byStage = {};
  for (const e of (errors || [])) {
    byStage[e.stage] = (byStage[e.stage] || 0) + 1;
  }

  return {
    heartbeat: hb,
    heartbeatAgeMs,
    heartbeatStale,
    abandoned,
    errors: errors || [],
    errorsByStage: byStage,
    success24h: success24h || 0,
  };
}

export function renderStatus(status) {
  const lines = [];
  lines.push('─'.repeat(72));
  lines.push('Cascade Pipeline Status');
  lines.push('─'.repeat(72));

  if (status.heartbeat) {
    const stateFlag = status.abandoned ? ' [ABANDONED]'
      : status.heartbeatStale ? ' [STALE]'
      : status.heartbeat.finished_at ? '' : ' [RUNNING]';
    lines.push(`Last heartbeat: ${ageHuman(status.heartbeatAgeMs)} ago${stateFlag}`);
    lines.push(`  run_id:        ${status.heartbeat.run_id}`);
    lines.push(`  hostname:      ${status.heartbeat.hostname || '(unset)'}`);
    lines.push(`  started_at:    ${status.heartbeat.started_at}`);
    lines.push(`  finished_at:   ${status.heartbeat.finished_at || '(still running OR abandoned)'}`);
    lines.push(`  exit_code:     ${status.heartbeat.exit_code ?? '(N/A)'}`);
    lines.push(`  success_count: ${status.heartbeat.success_count}`);
    lines.push(`  refusal_count: ${status.heartbeat.refusal_count}`);
  } else {
    lines.push('Last heartbeat: NONE');
    lines.push('  Watcher has never run (or table just initialized).');
  }

  lines.push('');
  lines.push(`Successful watcher runs last 24h: ${status.success24h}`);

  lines.push('');
  const errCount = status.errors.length;
  lines.push(`Unresolved refusals: ${errCount}`);
  if (errCount > 0) {
    for (const [stage, count] of Object.entries(status.errorsByStage)) {
      lines.push(`  ${stage}: ${count}`);
    }
    lines.push('');
    lines.push('Per-refusal details:');
    for (const e of status.errors.slice(0, 20)) {
      lines.push(`  • vision=${e.vision_id.slice(0, 8)} | stage=${e.stage} | code=${e.error_code}`);
      if (e.remediation_command) {
        lines.push(`      remediation: ${e.remediation_command}`);
      } else {
        lines.push(`      (no remediation_command — informational refusal)`);
      }
    }
    if (status.errors.length > 20) {
      lines.push(`  … +${status.errors.length - 20} more`);
    }
  }

  lines.push('─'.repeat(72));
  return lines.join('\n');
}

export function deriveExitCode(status) {
  if (status.heartbeatStale) return 1;
  if (status.errors.length > 0) return 1;
  return 0;
}

export async function main(_argv = process.argv, deps = {}) {
  const supabase = deps.supabase || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const status = await gatherStatus(supabase);
  const out = renderStatus(status);
  (deps.logger || console).log(out);
  const code = deriveExitCode(status);
  return { exitCode: code };
}

const isMain = (() => {
  try {
    const here = new URL(import.meta.url).pathname;
    const argv = process.argv[1] ? process.argv[1].replace(/\\/g, '/') : '';
    return here.endsWith(argv) || argv.endsWith(here);
  } catch { return false; }
})();

if (isMain) {
  main().then(({ exitCode }) => process.exit(exitCode))
        .catch((err) => { console.error('cascade-status failed:', err.message); process.exit(2); });
}
