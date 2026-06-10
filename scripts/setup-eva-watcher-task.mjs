#!/usr/bin/env node
/**
 * Register the EVA scheduler watcher as a Windows Task Scheduler task — the "host decision"
 * made real for SD-LEO-INFRA-REVIVE-EVA-HOST-AND-ARM-001 (FR-1).
 *
 * Why a scheduled task (not GitHub Actions, not a Linux VM): the EvaMasterScheduler is a
 * long-lived FOREGROUND daemon. GitHub Actions cron can RUN the one-shot watcher but cannot
 * HOST the detached daemon the watcher spawns (the runner job ends and kills the child). The
 * always-on Windows fleet host already exists, so a 5-minute Task Scheduler trigger that runs
 * `npm run eva:scheduler:watch:cron` is the smallest real execution home: every daemon death
 * is detected and revived within one stale window (5 min, <= EVA_SCHEDULER_STALE_MS).
 *
 * Why a wrapper .cmd: schtasks /TR mangles nested quotes, and the spawned daemon inherits the
 * watcher's env (watcher spawns with env:{...process.env}). So the SAFETY FLAGS must be set in
 * the process the task launches. A deterministic, version-controlled wrapper batch sets
 * EVA_SCHEDULER_OBSERVE_ONLY=true + OKR_REQUIRE_ACCEPTANCE=true, cd's to the repo, and calls
 * the npm script — far more robust than encoding `set ... && set ... && npm` into a /TR string.
 *
 * Observe-only is the DEFAULT bring-up state (per the SD's hard gate): the revived daemon
 * polls + emits but dispatches no venture stages and runs no destructive jobs. Flipping to
 * full-dispatch is a separate, chairman-authorized step — NOT this task.
 *
 * Usage:
 *   node scripts/setup-eva-watcher-task.mjs            # register/refresh the task (idempotent)
 *   node scripts/setup-eva-watcher-task.mjs --status   # query the task
 *   node scripts/setup-eva-watcher-task.mjs --remove   # delete the task
 *   node scripts/setup-eva-watcher-task.mjs --dry-run  # print what would run, mutate nothing
 *
 * win32-only: schtasks does not exist on POSIX. On a non-Windows host this exits 2 with a note
 * pointing at the POSIX alternative (cron line invoking the same npm script).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';

export const TASK_NAME = 'EHG EVA Scheduler Watcher';
export const NPM_COMMAND = 'eva:scheduler:watch:cron';
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'eva-watcher-task.cmd');
export const TASK_ENV = Object.freeze({
  EVA_SCHEDULER_OBSERVE_ONLY: 'true',
  OKR_REQUIRE_ACCEPTANCE: 'true',
});
const DEFAULT_INTERVAL_MINUTES = 5;

/**
 * Build the wrapper .cmd content (PURE). Sets the safety flags, cd's to the repo root, and
 * calls the npm script. `call` ensures the batch returns the npm exit code. Trailing CRLF and
 * @echo off keep Task Scheduler's history clean.
 */
export function buildWrapperScript({ repoRoot, npmCommand = NPM_COMMAND, env = TASK_ENV } = {}) {
  if (!repoRoot) throw new Error('buildWrapperScript: repoRoot required');
  const lines = ['@echo off'];
  for (const [k, v] of Object.entries(env)) lines.push(`set ${k}=${v}`);
  lines.push(`cd /d "${repoRoot}"`);
  lines.push(`call npm run ${npmCommand}`);
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build the `schtasks /Create` argv (PURE, no embedded quoting — execFileSync quotes args
 * containing spaces). Every-N-minutes trigger via /SC MINUTE /MO <n>; /F overwrites an existing
 * task so re-running is idempotent. The /TR target is the wrapper batch (which carries the env).
 */
export function buildSchtasksArgs({ taskName = TASK_NAME, wrapperPath, intervalMinutes = DEFAULT_INTERVAL_MINUTES, extraArgs = [] } = {}) {
  if (!wrapperPath) throw new Error('buildSchtasksArgs: wrapperPath required');
  const mo = parseInt(intervalMinutes, 10);
  if (!Number.isFinite(mo) || mo < 1) throw new Error(`buildSchtasksArgs: invalid intervalMinutes ${intervalMinutes}`);
  return ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', 'MINUTE', '/MO', String(mo), '/F', ...extraArgs];
}

export function buildRemoveArgs(taskName = TASK_NAME) {
  return ['/Delete', '/TN', taskName, '/F'];
}

export function buildQueryArgs(taskName = TASK_NAME) {
  return ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'];
}

function runSchtasks(args, { logger = console } = {}) {
  try {
    const out = execFileSync('schtasks', args, { encoding: 'utf8' });
    return { ok: true, stdout: out };
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
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-eva-watcher-task [--status|--remove|--dry-run]  (Windows Task Scheduler host for the EVA watcher)';

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const tag = '[setup-eva-watcher-task]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const wrapperPath = path.join(repoRoot, WRAPPER_REL_PATH);

  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). On POSIX, add a 5-minute cron line instead:`);
    logger.error(`${tag}   */5 * * * * cd ${repoRoot} && EVA_SCHEDULER_OBSERVE_ONLY=true OKR_REQUIRE_ACCEPTANCE=true npm run ${NPM_COMMAND}`);
    return { exitCode: 2, action: 'not_win32' };
  }

  if (args.mode === 'status') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would run: schtasks ${buildQueryArgs().join(' ')}`); return { exitCode: 0, action: 'dry_run_status' }; }
    const res = runSchtasks(buildQueryArgs(), { logger });
    logger.log(res.stdout || res.stderr);
    return { exitCode: res.ok ? 0 : 1, action: 'status', present: res.ok };
  }

  if (args.mode === 'remove') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would run: schtasks ${buildRemoveArgs().join(' ')}`); return { exitCode: 0, action: 'dry_run_remove' }; }
    const res = runSchtasks(buildRemoveArgs(), { logger });
    if (res.ok) { logger.log(`${tag} task '${TASK_NAME}' removed`); return { exitCode: 0, action: 'removed' }; }
    logger.error(`${tag} remove failed: ${res.stderr}`);
    return { exitCode: 1, action: 'remove_failed' };
  }

  // register (default): write the wrapper, then create/refresh the task.
  const wrapperContent = buildWrapperScript({ repoRoot });
  const schtasksArgs = buildSchtasksArgs({ wrapperPath });
  if (args.dryRun) {
    logger.log(`${tag} DRY RUN — would write wrapper ${wrapperPath}:`);
    logger.log(wrapperContent.replace(/\r\n/g, '\n'));
    logger.log(`${tag} would run: schtasks ${schtasksArgs.join(' ')}`);
    return { exitCode: 0, action: 'dry_run_register', wrapperPath };
  }

  try {
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  } catch (err) {
    logger.error(`${tag} could not write wrapper ${wrapperPath}: ${err.message}`);
    return { exitCode: 1, action: 'wrapper_write_failed' };
  }

  const res = runSchtasks(schtasksArgs, { logger });
  if (!res.ok) {
    logger.error(`${tag} schtasks /Create failed (code ${res.code}): ${res.stderr}`);
    return { exitCode: 1, action: 'create_failed' };
  }
  logger.log(`${tag} registered '${TASK_NAME}' — every ${DEFAULT_INTERVAL_MINUTES} min → ${WRAPPER_REL_PATH}`);
  logger.log(`${tag} env: EVA_SCHEDULER_OBSERVE_ONLY=true OKR_REQUIRE_ACCEPTANCE=true (observe-only bring-up; full-dispatch needs chairman GO)`);
  return { exitCode: 0, action: 'registered', wrapperPath };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-eva-watcher-task fatal:', err.message); process.exitCode = 2; });
}
