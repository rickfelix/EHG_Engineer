#!/usr/bin/env node
/**
 * Register the reboot-respawn runner as a Windows Task Scheduler task that fires on HOST REBOOT —
 * SD-LEO-INFRA-LEO-COMPLETION-001-D (FR-6). This closes Solomon checkpoint-3 G2: a reboot that kills
 * every live fleet session now has a scheduled trigger that reads the frozen desired manifest and
 * relaunches each slot via `claude --resume <uuid>`.
 *
 * FORKED from scripts/setup-eva-watcher-task.mjs (NOT a mutation of it — that module is the live EVA-
 * watcher registrar). Reuses its shape (pure argv/wrapper builders + execFileSync runner + a wrapper
 * .cmd that carries env and cd's to the repo), but swaps the every-N-minutes trigger for:
 *   /SC ONSTART   (default; runs in session 0 with NO desktop — wt.exe may not open a visible tab)
 *   /SC ONLOGON   (--onlogon; runs with a logged-in desktop, which wt.exe needs)
 * plus /RU (default SYSTEM; --ru <user> to override) and /RL HIGHEST, and /F for idempotent re-register.
 *
 * The wrapper .cmd sets FLEET_SPAWN_CONTROL_LIVE per the operator gate (default 'false' = INERT; pass
 * --live to generate a wrapper that sets it 'true' after host-validating the wt.exe invocation),
 * cd's to the D worktree repo root, and calls the runner entrypoint (scripts/fleet/reboot-respawn.cjs).
 *
 * ⚠️ ONSTART/session-0 caveat: wt.exe (the supervisor's launch program) needs an interactive desktop.
 * Prefer --onlogon where a logged-in desktop is acceptable; the session-0 headless constraint + fallback
 * are documented in docs/protocol/fleet-reboot-respawn-drill.md. Validate live only under the operator
 * host-validation gate — this module NEVER spawns anything itself.
 *
 * Usage:
 *   node scripts/setup-reboot-respawn-task.mjs                 # register on ONSTART (idempotent)
 *   node scripts/setup-reboot-respawn-task.mjs --onlogon       # register on ONLOGON (desktop available)
 *   node scripts/setup-reboot-respawn-task.mjs --live          # wrapper sets FLEET_SPAWN_CONTROL_LIVE=true
 *   node scripts/setup-reboot-respawn-task.mjs --ru <user>     # run as <user> instead of SYSTEM
 *   node scripts/setup-reboot-respawn-task.mjs --status        # query the task
 *   node scripts/setup-reboot-respawn-task.mjs --remove        # delete the task
 *   node scripts/setup-reboot-respawn-task.mjs --dry-run       # print what would run, mutate nothing
 *
 * win32-only: schtasks does not exist on POSIX. On a non-Windows host this exits 2 with a POSIX note.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';

export const TASK_NAME = 'EHG Fleet Reboot-Respawn';
export const RUNNER_REL_PATH = path.join('scripts', 'fleet', 'reboot-respawn.cjs');
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'reboot-respawn-task.cmd');
export const DEFAULT_SCHEDULE = 'ONSTART';
export const DEFAULT_RUN_AS = 'SYSTEM';
/** Default wrapper env: INERT (FLEET_SPAWN_CONTROL_LIVE off) until the operator host-validates. */
export const TASK_ENV = Object.freeze({ FLEET_SPAWN_CONTROL_LIVE: 'false' });

/**
 * Build the wrapper .cmd content (PURE). Sets the operator gate env, cd's to the repo root, and calls
 * the reboot-respawn runner via `node`. `call` returns the runner's exit code; @echo off keeps the
 * Task Scheduler history clean.
 */
export function buildRebootWrapperScript({ repoRoot, runnerRelPath = RUNNER_REL_PATH, env = TASK_ENV } = {}) {
  if (!repoRoot) throw new Error('buildRebootWrapperScript: repoRoot required');
  const lines = ['@echo off'];
  for (const [k, v] of Object.entries(env)) lines.push(`set ${k}=${v}`);
  lines.push(`cd /d "${repoRoot}"`);
  lines.push(`call node ${runnerRelPath}`);
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build the `schtasks /Create` argv (PURE, no embedded quoting — execFileSync quotes spaced args).
 * Reboot trigger via /SC ONSTART (default) or /SC ONLOGON, run-level /RL HIGHEST, run-as /RU <user>
 * (default SYSTEM), and /F so re-running is idempotent. The /TR target is the wrapper batch.
 */
export function buildRebootSchtasksArgs({ taskName = TASK_NAME, wrapperPath, schedule = DEFAULT_SCHEDULE, runAs = DEFAULT_RUN_AS, extraArgs = [] } = {}) {
  if (!wrapperPath) throw new Error('buildRebootSchtasksArgs: wrapperPath required');
  const sc = String(schedule).toUpperCase();
  if (sc !== 'ONSTART' && sc !== 'ONLOGON') {
    throw new Error(`buildRebootSchtasksArgs: schedule must be ONSTART or ONLOGON, got ${schedule}`);
  }
  const args = ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', sc, '/RL', 'HIGHEST', '/F'];
  if (runAs) args.push('/RU', runAs);
  return [...args, ...extraArgs];
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
  const args = { mode: 'register', dryRun: false, help: false, schedule: DEFAULT_SCHEDULE, runAs: DEFAULT_RUN_AS, live: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove' || a === '--delete') args.mode = 'remove';
    else if (a === '--status' || a === '--query') args.mode = 'status';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--onlogon') args.schedule = 'ONLOGON';
    else if (a === '--onstart') args.schedule = 'ONSTART';
    else if (a === '--live') args.live = true;
    else if (a === '--ru') { args.runAs = argv[i + 1]; i++; }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-reboot-respawn-task [--onlogon|--onstart] [--live] [--ru <user>] [--status|--remove|--dry-run]  (Windows Task Scheduler ONSTART/ONLOGON host for the fleet reboot-respawn runner)';

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const tag = '[setup-reboot-respawn-task]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const wrapperPath = path.join(repoRoot, WRAPPER_REL_PATH);
  const wrapperEnv = { FLEET_SPAWN_CONTROL_LIVE: args.live ? 'true' : 'false' };

  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). On POSIX, register an @reboot cron line instead:`);
    logger.error(`${tag}   @reboot cd ${repoRoot} && FLEET_SPAWN_CONTROL_LIVE=${args.live ? 'true' : 'false'} node ${RUNNER_REL_PATH}`);
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
  const wrapperContent = buildRebootWrapperScript({ repoRoot, env: wrapperEnv });
  const schtasksArgs = buildRebootSchtasksArgs({ wrapperPath, schedule: args.schedule, runAs: args.runAs });
  if (args.dryRun) {
    logger.log(`${tag} DRY RUN — would write wrapper ${wrapperPath}:`);
    logger.log(wrapperContent.replace(/\r\n/g, '\n'));
    logger.log(`${tag} would run: schtasks ${schtasksArgs.join(' ')}`);
    return { exitCode: 0, action: 'dry_run_register', wrapperPath, schedule: args.schedule, live: args.live };
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
  logger.log(`${tag} registered '${TASK_NAME}' — /SC ${args.schedule} /RL HIGHEST /RU ${args.runAs} → ${WRAPPER_REL_PATH}`);
  logger.log(`${tag} wrapper gate: FLEET_SPAWN_CONTROL_LIVE=${args.live ? 'true' : 'false'} (${args.live ? 'LIVE — host-validate wt.exe first' : 'INERT default; re-run with --live after host-validation'})`);
  return { exitCode: 0, action: 'registered', wrapperPath, schedule: args.schedule, live: args.live };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-reboot-respawn-task fatal:', err.message); process.exitCode = 2; });
}
