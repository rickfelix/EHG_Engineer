#!/usr/bin/env node
/**
 * Stage-line closure probe — asks whether a stage actually RAN. QF-20260725-697.
 *
 * The venture line produced nothing for eleven days behind green liveness dashboards (see
 * lib/eva/stage-line-closure.js for the full incident + why pending-venture count is not a
 * gate). This is the missing check. It is DB-only by design so it is correct from any host:
 * a GitHub runner cannot see the worker host's process table, so `line_silent` — not the PID
 * check — is the half that actually watches production from CI. The PID leg still runs and
 * reports when a pidfile is present locally.
 *
 * Exit codes: 0 healthy · 1 stalled (line silent and/or worker absent) · 2 misconfigured.
 * Usage: node scripts/cron/stage-line-closure-probe.mjs [--silent-hours N] [--json]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getRepoRoot } from '../../lib/repo-paths.js';
import { classifyStageLine, DEFAULT_SILENT_HOURS } from '../../lib/eva/stage-line-closure.js';

/** Read the worker pidfile; null when absent/unreadable (never throws — see isWorkerAbsent). */
export function readWorkerPid(repoRoot, readFile = fs.readFileSync) {
  try {
    return Number.parseInt(String(readFile(path.join(repoRoot, 'stage-execution-worker.pid'), 'utf8')).trim(), 10);
  } catch {
    return null;
  }
}

/** Is `pid` in the live process table? null = could not determine (stays quiet, never alarms). */
export function isPidAlive(pid, kill = process.kill.bind(process)) {
  if (!Number.isFinite(pid) || pid <= 0) return null;
  try {
    kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    return null; // EPERM: alive but not ours. Anything else: unknown.
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const hoursArg = argv.indexOf('--silent-hours');
  const silentHours = hoursArg >= 0 ? Number(argv[hoursArg + 1]) : DEFAULT_SILENT_HOURS;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[stage-line-probe] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    process.exitCode = 2;
    return;
  }

  const { data, error } = await createClient(url, key)
    .from('stage_executions')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[stage-line-probe] stage_executions read failed: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const repoRoot = getRepoRoot();
  const pid = readWorkerPid(repoRoot);
  const verdict = classifyStageLine({
    pid,
    pidAlive: isPidAlive(pid),
    lastExecutionAt: data && data[0] ? data[0].created_at : null,
    silentHours,
  });

  if (argv.includes('--json')) console.log(JSON.stringify({ ...verdict, pid, silentHours }, null, 2));
  else if (verdict.healthy) console.log(`[stage-line-probe] line healthy (silence budget ${silentHours}h)`);
  else console.error(`[stage-line-probe] STALLED — ${verdict.reasons.join('; ')}`);

  // exitCode, NOT process.exit(): the supabase client leaves handles open, and forcing exit
  // while they close aborts the process on Windows (libuv UV_HANDLE_CLOSING assertion, exit
  // 127) — which would make the alarm's exit code non-deterministic on the worker's own host.
  process.exitCode = verdict.healthy ? 0 : 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main();
}
