#!/usr/bin/env node
/**
 * Register the fleet alarm crons as host-local Windows Task Scheduler tasks.
 * SD-LEO-INFRA-LOOP-LIVENESS-DISCRIMINATOR-001 FR-5.
 *
 * WHY: Solomon's re-measure of QF-20260903-060 (25 scheduled runs per workflow) found every
 * short-schedule GitHub Actions cron converges on a 200-280 minute MEDIAN delivery gap
 * regardless of configured interval -- a correct alarm behind an Actions trigger that fires
 * ~4 hours late still masks a dead fleet for ~4 hours. scripts/setup-liveness-watcher-task.mjs
 * already proved the host itself holds cadence (the stale-session sweep, configured every 5
 * min, runs every 5 min on THIS host) -- this script gives the three alarm crons named in the
 * PRD (fleet-down-alert, fleet-worker-pulse, and periodic-liveness-watcher's remaining
 * timestamp-source classes, which setup-liveness-watcher-task.mjs deliberately left to Actions)
 * the same host-local venue. The GitHub Actions workflows are left in place, unmodified, as the
 * off-host fallback.
 *
 * TR-3 (QF-20260904-169): every /TR argument here points at a HIDDEN-WINDOW launcher
 * (wscript.exe //B run-hidden.vbs <task>.cmd), never at the .cmd directly. Six pre-existing
 * host tasks register the .cmd as the direct /TR action, which opens a visible console window
 * on the chairman's desktop -- an already-open chairman-facing defect this script must not add
 * three more instances of. Fixing those six pre-existing registrars is a separate, already-
 * tracked defect (QF-20260904-169) and is explicitly OUT OF SCOPE here.
 *
 * Follows scripts/setup-liveness-watcher-task.mjs's exact schtasks/.cmd-wrapper/verify/status/
 * remove/dry-run convention (the house pattern, repeated independently across 6 sibling
 * setup-*-task.mjs scripts with no shared library).
 *
 * Usage:
 *   node scripts/setup-alarm-cron-tasks.mjs             # register/refresh (idempotent)
 *   node scripts/setup-alarm-cron-tasks.mjs --verify     # read the definitions back from the OS
 *   node scripts/setup-alarm-cron-tasks.mjs --status     # human-readable query
 *   node scripts/setup-alarm-cron-tasks.mjs --remove     # delete the tasks
 *   node scripts/setup-alarm-cron-tasks.mjs --dry-run    # print, mutate nothing
 *
 * win32-only (schtasks).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';

export const HIDDEN_LAUNCHER_REL_PATH = path.join('scripts', 'cron', 'run-hidden.vbs');

/**
 * The three alarm crons this FR registers, host-local, alongside their existing GHA workflow
 * (left unmodified as the off-host fallback). Intervals/offsets mirror each cron's own workflow
 * file exactly, so the host and Actions triggers fire on the same nominal schedule.
 */
export const ALARM_TASKS = Object.freeze([
  {
    taskName: 'EHG LEO Alarm: Fleet-Down Alert',
    script: 'scripts/fleet-down-alert.mjs',
    wrapperRelPath: path.join('scripts', 'cron', 'fleet-down-alert-task.cmd'),
    intervalMinutes: 15,
    startTime: '00:11', // .github/workflows/fleet-down-alert-cron.yml: '11,26,41,56 * * * *'
  },
  {
    taskName: 'EHG LEO Alarm: Fleet-Worker Pulse',
    script: 'scripts/fleet-worker-pulse.mjs',
    wrapperRelPath: path.join('scripts', 'cron', 'fleet-worker-pulse-task.cmd'),
    intervalMinutes: 15,
    startTime: '00:07', // .github/workflows/fleet-worker-pulse-cron.yml: '7,22,37,52 * * * *'
  },
  {
    taskName: 'EHG LEO Alarm: Periodic Liveness Watcher (timestamp classes)',
    script: 'scripts/periodic-liveness-watcher.mjs',
    wrapperRelPath: path.join('scripts', 'cron', 'periodic-liveness-watcher-timestamp-task.cmd'),
    intervalMinutes: 15,
    startTime: '00:00', // .github/workflows/periodic-liveness-watcher-cron.yml: '*/15 * * * *'
    // The PID-anchored class (claude_sessions_heartbeat) already has a host-local venue via
    // setup-liveness-watcher-task.mjs, deliberately scoped there and excluded here -- this task
    // covers the OTHER classes (self_stamped/eva_scheduler_heartbeat/github_actions_api), which
    // that script's own TASK_ENV comment says are correctly left to Actions absent a host venue.
    env: { LIVENESS_CLASSES: 'self_stamped,eva_scheduler_heartbeat,github_actions_api' },
  },
]);

/** Wrapper .cmd content (PURE). schtasks mangles nested quotes, so env/cwd live in a batch file. */
export function buildWrapperScript({ repoRoot, script, env = {} } = {}) {
  if (!repoRoot) throw new Error('buildWrapperScript: repoRoot required');
  if (!script) throw new Error('buildWrapperScript: script required');
  const lines = ['@echo off'];
  for (const [k, v] of Object.entries(env)) lines.push(`set ${k}=${v}`);
  lines.push(`cd /d "${repoRoot}"`);
  lines.push(`call node ${script}`);
  return lines.join('\r\n') + '\r\n';
}

/**
 * TR-3 / QF-20260904-169: the /TR action for every task this script registers is the hidden-
 * window launcher, never the .cmd directly. `wrapperPath` and `hiddenLauncherPath` are both
 * passed UNQUOTED (matching the whole setup-*-task.mjs family's own convention) -- execFileSync
 * passes each argv element as its own token via CreateProcess, so embedding literal quote
 * characters would hand schtasks a path string CONTAINING quotes, not the real file.
 */
export function buildHiddenTrAction({ hiddenLauncherPath, wrapperPath } = {}) {
  if (!hiddenLauncherPath) throw new Error('buildHiddenTrAction: hiddenLauncherPath required');
  if (!wrapperPath) throw new Error('buildHiddenTrAction: wrapperPath required');
  return `wscript.exe //B ${hiddenLauncherPath} ${wrapperPath}`;
}

export function buildCreateArgs({ taskName, trAction, intervalMinutes, startTime } = {}) {
  if (!taskName) throw new Error('buildCreateArgs: taskName required');
  if (!trAction) throw new Error('buildCreateArgs: trAction required');
  const mo = parseInt(intervalMinutes, 10);
  if (!Number.isFinite(mo) || mo < 1 || mo > 1439) throw new Error(`buildCreateArgs: invalid intervalMinutes ${intervalMinutes}`);
  if (!/^\d{2}:\d{2}$/.test(startTime || '')) throw new Error(`buildCreateArgs: invalid startTime ${startTime} (expected HH:MM)`);
  return ['/Create', '/TN', taskName, '/TR', trAction, '/SC', 'MINUTE', '/MO', String(mo), '/ST', startTime, '/F'];
}

export function buildRemoveArgs(taskName) {
  return ['/Delete', '/TN', taskName, '/F'];
}
export function buildQueryArgs(taskName) {
  return ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'];
}
export function buildQueryXmlArgs(taskName) {
  return ['/Query', '/TN', taskName, '/XML'];
}

/**
 * Verification predicate (PURE) — run against the XML the OS hands back, never against
 * anything submitted. Confirms the /TR action is the hidden launcher (TR-3), not a bare .cmd.
 */
export function verifyHiddenLaunch(xml) {
  if (!xml || !xml.trim()) return { ok: false, problems: ['no task definition returned by the OS'] };
  const problems = [];
  const commandMatch = /<Command>([^<]*)<\/Command>/.exec(xml);
  const command = commandMatch ? commandMatch[1] : '';
  if (!/wscript\.exe/i.test(command)) {
    problems.push(`Task Scheduler /TR is not the hidden-window launcher (QF-20260904-169): "${command}"`);
  }
  if (!/run-hidden\.vbs/i.test(command)) {
    problems.push(`Task Scheduler /TR does not reference run-hidden.vbs: "${command}"`);
  }
  if (/<Enabled>false<\/Enabled>/.test(xml)) problems.push('task is explicitly disabled');
  if (!/<Repetition>/.test(xml) || !/<Interval>PT\d+M<\/Interval>/.test(xml)) {
    problems.push('no repeating interval — would fire once and never again');
  }
  return { ok: problems.length === 0, problems, command };
}

function runSchtasks(args) {
  try {
    return { ok: true, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, code: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

export function parseArgs(argv) {
  const args = { mode: 'register', dryRun: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove' || a === '--delete') args.mode = 'remove';
    else if (a === '--status' || a === '--query') args.mode = 'status';
    else if (a === '--verify') args.mode = 'verify';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-alarm-cron-tasks [--verify|--status|--remove|--dry-run]  (host-local venue for the fleet alarm crons, hidden-window launch)';

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const tag = '[setup-alarm-cron-tasks]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const hiddenLauncherPath = path.join(repoRoot, HIDDEN_LAUNCHER_REL_PATH);

  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). On POSIX these alarm crons stay on GitHub Actions only.`);
    return { exitCode: 2, action: 'not_win32' };
  }

  if (args.mode === 'status') {
    let ok = true;
    for (const t of ALARM_TASKS) {
      const res = runSchtasks(buildQueryArgs(t.taskName));
      logger.log(res.stdout || res.stderr);
      ok = ok && res.ok;
    }
    return { exitCode: ok ? 0 : 1, action: 'status' };
  }

  if (args.mode === 'verify') {
    let allOk = true;
    const results = [];
    for (const t of ALARM_TASKS) {
      const q = runSchtasks(buildQueryXmlArgs(t.taskName));
      if (!q.ok) {
        logger.error(`${tag} VERIFY FAILED — the OS has no task '${t.taskName}': ${q.stderr.trim()}`);
        allOk = false;
        results.push({ taskName: t.taskName, ok: false });
        continue;
      }
      const verdict = verifyHiddenLaunch(q.stdout);
      if (!verdict.ok) {
        for (const p of verdict.problems) logger.error(`${tag} VERIFY FAILED (${t.taskName}) — ${p}`);
        allOk = false;
      } else {
        logger.log(`${tag} '${t.taskName}' VERIFIED — hidden-window launch, repeating, enabled`);
      }
      results.push({ taskName: t.taskName, ok: verdict.ok });
    }
    return { exitCode: allOk ? 0 : 1, action: 'verified', results };
  }

  if (args.mode === 'remove') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would remove ${ALARM_TASKS.map((t) => t.taskName).join(', ')}`); return { exitCode: 0, action: 'dry_run_remove' }; }
    let anyOk = false;
    for (const t of ALARM_TASKS) {
      const r = runSchtasks(buildRemoveArgs(t.taskName));
      if (r.ok) { logger.log(`${tag} removed '${t.taskName}'`); anyOk = true; }
      else logger.warn(`${tag} could not remove '${t.taskName}': ${r.stderr?.trim?.() || r.stderr}`);
    }
    return { exitCode: anyOk ? 0 : 1, action: 'removed' };
  }

  const plan = ALARM_TASKS.map((t) => {
    const wrapperPath = path.join(repoRoot, t.wrapperRelPath);
    const wrapperContent = buildWrapperScript({ repoRoot, script: t.script, env: t.env });
    const trAction = buildHiddenTrAction({ hiddenLauncherPath, wrapperPath });
    const createArgs = buildCreateArgs({ taskName: t.taskName, trAction, intervalMinutes: t.intervalMinutes, startTime: t.startTime });
    return { ...t, wrapperPath, wrapperContent, createArgs };
  });

  if (args.dryRun) {
    for (const p of plan) {
      logger.log(`${tag} DRY RUN — wrapper ${p.wrapperPath}:`);
      logger.log(p.wrapperContent.replace(/\r\n/g, '\n'));
      logger.log(`${tag} would run: schtasks ${p.createArgs.join(' ')}`);
    }
    return { exitCode: 0, action: 'dry_run_register', plan: plan.map((p) => ({ taskName: p.taskName, wrapperPath: p.wrapperPath })) };
  }

  if (!fs.existsSync(hiddenLauncherPath)) {
    logger.error(`${tag} hidden-window launcher missing at ${hiddenLauncherPath} — refusing to register a task that would fall back to a visible console.`);
    return { exitCode: 1, action: 'launcher_missing' };
  }

  let allOk = true;
  for (const p of plan) {
    try {
      fs.mkdirSync(path.dirname(p.wrapperPath), { recursive: true });
      fs.writeFileSync(p.wrapperPath, p.wrapperContent, 'utf8');
    } catch (err) {
      logger.error(`${tag} could not write wrapper ${p.wrapperPath}: ${err.message}`);
      allOk = false;
      continue;
    }
    const res = runSchtasks(p.createArgs);
    if (res.ok) {
      logger.log(`${tag} registered '${p.taskName}' — every ${p.intervalMinutes} min from ${p.startTime} → ${p.wrapperRelPath} (hidden launch)`);
    } else {
      logger.error(`${tag} schtasks /Create failed for '${p.taskName}' (code ${res.code}): ${res.stderr?.trim?.() || res.stderr}`);
      allOk = false;
    }
  }
  logger.log(`${tag} run --verify to read the definitions back out of the OS.`);
  return { exitCode: allOk ? 0 : 1, action: 'registered' };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-alarm-cron-tasks fatal:', err.message); process.exitCode = 2; });
}
