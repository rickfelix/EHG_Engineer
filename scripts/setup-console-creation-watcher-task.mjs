#!/usr/bin/env node
/**
 * SD-LEO-INFRA-CONSOLE-REAPER-CREATION-001 / FR-3 — register the WMI console-creation watcher
 * (scripts/run-console-creation-watcher.mjs) as a self-healing Windows Scheduled Task.
 *
 * PRINCIPAL CHOICE, DELIBERATE: mirrors scripts/setup-eva-watcher-task.mjs's non-SYSTEM /RU
 * <current-user> /NP (S4U, non-interactive, session 0) pattern, NOT scripts/setup-console-reaper-task.mjs's
 * /RU SYSTEM. QF-20260726-677 measured that an under-specified principal on a similar watcher
 * leaked a visible OpenConsole.exe window on every fire — a fact this SD's own subject matter
 * (leaked consoles) makes doubly important never to repeat. lib/fleet/console-parentage.mjs's
 * validateScheduledTaskPrincipal is reused unmodified to refuse an Interactive/InteractiveToken
 * registration, same guard the existing reaper task already relies on.
 *
 * DUAL TRIGGER: a repeating /SC MINUTE cadence task (self-heal within one interval if the Node
 * process dies) PLUS an /SC ONLOGON startup companion (mirrors scripts/setup-liveness-watcher-task.mjs
 * — a prompt post-reboot start rather than waiting up to one interval). The cadence task is the
 * durability property; the startup companion is a bonus, per that precedent's own documented
 * finding that /SC ONLOGON/ONSTART can return "Access is denied" unelevated on some hosts, so its
 * failure must never block the cadence registration.
 *
 * Usage:
 *   node scripts/setup-console-creation-watcher-task.mjs            # register/refresh (idempotent)
 *   node scripts/setup-console-creation-watcher-task.mjs --status   # query the cadence task
 *   node scripts/setup-console-creation-watcher-task.mjs --remove   # delete both tasks
 *   node scripts/setup-console-creation-watcher-task.mjs --dry-run  # print what would run, mutate nothing
 *
 * win32-only: schtasks does not exist on POSIX.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { getRepoRoot } from '../lib/repo-paths.js';
import { validateScheduledTaskPrincipal } from '../lib/fleet/console-parentage.mjs';

export const TASK_NAME = 'LEO-ConsoleCreationWatcher';
export const STARTUP_TASK_NAME = 'LEO-ConsoleCreationWatcher-Startup';
export const NPM_COMMAND = 'console-creation-watcher';
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'console-creation-watcher-task.cmd');
const DEFAULT_INTERVAL_MINUTES = 5;

/** Same S4U-current-user default as setup-eva-watcher-task.mjs, for the same QF-20260726-677 reason. */
function resolveDefaultRunAs() {
  try {
    return process.env.USERNAME || process.env.USER || os.userInfo().username || null;
  } catch {
    return null;
  }
}
export const DEFAULT_RUN_AS = resolveDefaultRunAs();

const WELL_KNOWN_SERVICE_ACCOUNTS = new Set([
  'SYSTEM', 'NT AUTHORITY\\SYSTEM',
  'LOCALSERVICE', 'LOCAL SERVICE', 'NT AUTHORITY\\LOCAL SERVICE',
  'NETWORKSERVICE', 'NETWORK SERVICE', 'NT AUTHORITY\\NETWORK SERVICE',
]);
function isWellKnownServiceAccount(runAs) {
  return typeof runAs === 'string' && WELL_KNOWN_SERVICE_ACCOUNTS.has(runAs.toUpperCase());
}

/** Guard the chosen principal BEFORE building any schtasks args — the whole point of FR-3. */
export function assertSafePrincipal(runAs) {
  const verdict = validateScheduledTaskPrincipal({
    logonType: runAs ? (isWellKnownServiceAccount(runAs) ? 'ServiceAccount' : 'S4U') : '',
    userId: runAs || '',
  });
  if (!verdict.ok) throw new Error(`unsafe scheduled-task principal: ${verdict.reason}`);
  return verdict;
}

export function buildWrapperScript({ repoRoot, npmCommand = NPM_COMMAND } = {}) {
  if (!repoRoot) throw new Error('buildWrapperScript: repoRoot required');
  return ['@echo off', `cd /d "${repoRoot}"`, `call npm run ${npmCommand}`].join('\r\n') + '\r\n';
}

export function buildCreateArgs({ taskName = TASK_NAME, wrapperPath, intervalMinutes = DEFAULT_INTERVAL_MINUTES, runAs = DEFAULT_RUN_AS } = {}) {
  if (!wrapperPath) throw new Error('buildCreateArgs: wrapperPath required');
  const mo = parseInt(intervalMinutes, 10);
  if (!Number.isFinite(mo) || mo < 1) throw new Error(`buildCreateArgs: invalid intervalMinutes ${intervalMinutes}`);
  const args = ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', 'MINUTE', '/MO', String(mo), '/F'];
  if (runAs) {
    args.push('/RU', runAs);
    if (!isWellKnownServiceAccount(runAs)) args.push('/NP');
  }
  return args;
}

/** The startup companion: /SC ONLOGON, same principal, same wrapper. */
export function buildStartupCreateArgs({ taskName = STARTUP_TASK_NAME, wrapperPath, runAs = DEFAULT_RUN_AS } = {}) {
  if (!wrapperPath) throw new Error('buildStartupCreateArgs: wrapperPath required');
  const args = ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', 'ONLOGON', '/F'];
  if (runAs) {
    args.push('/RU', runAs);
    if (!isWellKnownServiceAccount(runAs)) args.push('/NP');
  }
  return args;
}

export function buildRemoveArgs(taskName) { return ['/Delete', '/TN', taskName, '/F']; }
export function buildQueryArgs(taskName = TASK_NAME) { return ['/Query', '/TN', taskName, '/V', '/FO', 'LIST']; }
export function buildQueryXmlArgs(taskName = TASK_NAME) { return ['/Query', '/TN', taskName, '/XML']; }

/**
 * Read the definition back from the OS (mirrors setup-liveness-watcher-task.mjs's
 * verifyPersistedDefinition — never compare the submitted args to themselves).
 */
export function verifyPersistedDefinition(cadenceXml) {
  const problems = [];
  if (!cadenceXml || !cadenceXml.trim()) return { ok: false, problems: ['no cadence task definition returned by the OS'] };
  if (!/<Repetition>/.test(cadenceXml) || !/<Interval>PT\d+M<\/Interval>/.test(cadenceXml)) {
    problems.push('cadence task has no repeating interval — it would fire once and never again');
  }
  // Absence of <Enabled> means enabled (Task Scheduler's default); only an explicit false is a problem.
  if (/<Enabled>false<\/Enabled>/.test(cadenceXml)) problems.push('cadence task is explicitly disabled');
  return { ok: problems.length === 0, problems };
}

function runSchtasks(args, { logger = console } = {}) {
  try {
    return { ok: true, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, code: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

export function parseArgs(argv) {
  const args = { mode: 'register', dryRun: false, help: false, runAs: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove' || a === '--delete') args.mode = 'remove';
    else if (a === '--status' || a === '--query') args.mode = 'status';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--ru') { args.runAs = argv[i + 1]; i++; }
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-console-creation-watcher-task [--status|--remove|--dry-run] [--ru <user>] — Windows Task Scheduler host for the WMI console-creation watcher; /RU defaults to the current user via S4U (see QF-20260726-677).';

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const tag = '[setup-console-creation-watcher-task]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const wrapperPath = path.join(repoRoot, WRAPPER_REL_PATH);

  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks).`);
    return { exitCode: 2, action: 'not_win32' };
  }

  if (args.mode === 'status') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would run: schtasks ${buildQueryArgs().join(' ')}`); return { exitCode: 0, action: 'dry_run_status' }; }
    const res = runSchtasks(buildQueryArgs(), { logger });
    logger.log(res.stdout || res.stderr);
    return { exitCode: res.ok ? 0 : 1, action: 'status', present: res.ok };
  }

  if (args.mode === 'remove') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would remove ${TASK_NAME} and ${STARTUP_TASK_NAME}`); return { exitCode: 0, action: 'dry_run_remove' }; }
    const cadence = runSchtasks(buildRemoveArgs(TASK_NAME), { logger });
    const startup = runSchtasks(buildRemoveArgs(STARTUP_TASK_NAME), { logger });
    if (cadence.ok) logger.log(`${tag} removed '${TASK_NAME}'`); else logger.error(`${tag} remove ${TASK_NAME} failed: ${cadence.stderr}`);
    if (startup.ok) logger.log(`${tag} removed '${STARTUP_TASK_NAME}'`); else logger.log(`${tag} note: ${STARTUP_TASK_NAME} remove non-fatal: ${startup.stderr}`);
    return { exitCode: cadence.ok ? 0 : 1, action: 'removed' };
  }

  // register (default)
  const effectiveRunAs = args.runAs || DEFAULT_RUN_AS;
  assertSafePrincipal(effectiveRunAs);
  const wrapperContent = buildWrapperScript({ repoRoot });
  const createArgs = buildCreateArgs({ wrapperPath, runAs: effectiveRunAs });
  const startupArgs = buildStartupCreateArgs({ wrapperPath, runAs: effectiveRunAs });

  if (args.dryRun) {
    logger.log(`${tag} DRY RUN — would write wrapper ${wrapperPath}:`);
    logger.log(wrapperContent.replace(/\r\n/g, '\n'));
    logger.log(`${tag} would run: schtasks ${createArgs.join(' ')}`);
    logger.log(`${tag} would run: schtasks ${startupArgs.join(' ')}`);
    return { exitCode: 0, action: 'dry_run_register', wrapperPath };
  }

  try {
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  } catch (err) {
    logger.error(`${tag} could not write wrapper ${wrapperPath}: ${err.message}`);
    return { exitCode: 1, action: 'wrapper_write_failed' };
  }

  const cadenceRes = runSchtasks(createArgs, { logger });
  if (!cadenceRes.ok) {
    logger.error(`${tag} schtasks /Create (cadence) failed (code ${cadenceRes.code}): ${cadenceRes.stderr}`);
    return { exitCode: 1, action: 'create_failed' };
  }
  // The startup companion is a bonus, not the durability property (see module header) — its
  // failure (e.g. unelevated "Access is denied") must never fail the whole registration.
  const startupRes = runSchtasks(startupArgs, { logger });
  if (!startupRes.ok) logger.log(`${tag} note: startup companion registration non-fatal: ${startupRes.stderr}`);

  logger.log(`${tag} registered '${TASK_NAME}' every ${DEFAULT_INTERVAL_MINUTES} min + startup companion, /RU ${effectiveRunAs} → ${WRAPPER_REL_PATH}`);
  return { exitCode: 0, action: 'registered', wrapperPath, runAs: effectiveRunAs, startupRegistered: startupRes.ok };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-console-creation-watcher-task fatal:', err.message); process.exitCode = 2; });
}
