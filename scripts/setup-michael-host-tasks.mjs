#!/usr/bin/env node
/**
 * Register the three credentialed Michael feeders as host-local Windows Task Scheduler tasks.
 * SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-D (FR-8, TR-8). Spec docs/michael/02-SPEC.md §5 host venue;
 * ratification 0daf3bd8 (GitHub Actions holds no Google credential) and ff4ef5b4 (credential venue).
 *
 * WHY host-local: calendar-read, gmail-triage and tasks-classifier decrypt the chairman's Google grant,
 * which exists only on this host (MICHAEL_ENCRYPTION_KEY in the host .env). Each task fires every 15
 * minutes all day; the feeder's own ET window gate (lib/michael/feeder.mjs) makes every out-of-window
 * fire inert, and single-flight plus already_ok make the in-window retries idempotent.
 *
 * REUSES the pure builders of scripts/setup-alarm-cron-tasks.mjs by name (DESIGN F13): wrapper .cmd,
 * hidden-window /TR action (wscript.exe //B run-hidden.vbs <wrapper>), /Create args, remove/query
 * args and the XML verify predicate. Never its parseArgs or main.
 *
 * REGISTRATION FORM (VALIDATION condition 6, measured from PowerShell, unelevated, on the chairman's
 * host 2026-09-06 by RISK e1639df4 and again by this seat before this file was written):
 *   schtasks /Create /TN "<name>" /TR "..." /SC MINUTE /MO 15 /ST 00:00 /F   -> SUCCESS, exit 0,
 *   <LogonType>InteractiveToken</LogonType>, <Interval>PT15M</Interval>
 *   the same plus /RU <user> /NP                                            -> prompts, then
 *   ERROR: Access is denied, exit 1
 * so NO /RU and NO /NP are passed: every one of the ten existing EHG host tasks is LogonType
 * Interactive and relies on run-hidden.vbs (QF-20260902-191) for console suppression, and so does this.
 *
 * HOST PRECONDITIONS, stated plainly: the laptop must be AWAKE (no host task has wake-from-sleep
 * configured) and ON MAINS POWER (the sibling tasks carry DisallowStartIfOnBatteries; Task Scheduler's
 * default does too). A missed window shows as a missing/failed run row, one line in Adam's 6 AM text
 * and a degraded brief — never a silent gap.
 *
 * SHADOW PHASE (SECURITY F-3 / RISK S2): gmail-triage is registered with --apply (rows and intents
 * recorded) and WITHOUT --modify. Promotion to executing intents is an explicit chairman action:
 *   node scripts/setup-michael-host-tasks.mjs --remove
 *   node scripts/setup-michael-host-tasks.mjs --with-modify
 * after one full dry-run morning has been read.
 *
 * Task names carry no Task-Scheduler-illegal character (QF-20260906-961) and are validated inside the
 * build path (DESIGN F14). Wrappers under scripts/cron/michael-<feeder>-task.cmd are generated at
 * register time and gitignored (scripts/cron/*-task.cmd); they embed the host-absolute repo root.
 *
 * Usage:
 *   node scripts/setup-michael-host-tasks.mjs                 # register/refresh (idempotent)
 *   node scripts/setup-michael-host-tasks.mjs --with-modify   # register gmail-triage with --apply --modify
 *   node scripts/setup-michael-host-tasks.mjs --verify        # read the definitions back from the OS
 *   node scripts/setup-michael-host-tasks.mjs --status        # human-readable query
 *   node scripts/setup-michael-host-tasks.mjs --remove        # delete the tasks
 *   node scripts/setup-michael-host-tasks.mjs --dry-run       # print, mutate nothing
 *
 * win32-only (schtasks).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';
import {
  buildWrapperScript, buildHiddenTrAction, buildCreateArgs, buildRemoveArgs, buildQueryArgs, buildQueryXmlArgs,
  verifyHiddenLaunch, TASK_NAME_ILLEGAL_CHARS, HIDDEN_LAUNCHER_REL_PATH,
} from './setup-alarm-cron-tasks.mjs';

export const INTERVAL_MINUTES = 15;
export const START_TIME = '00:00';

/** The three host feeders (spec §5 windows are enforced inside each script, not by the scheduler). */
export const MICHAEL_TASKS = Object.freeze([
  { feeder: 'tasks-classifier', taskName: 'EHG Michael tasks-classifier', script: 'scripts/michael/tasks-classifier.mjs --apply', wrapperRelPath: path.join('scripts', 'cron', 'michael-tasks-classifier-task.cmd'), windowEt: '03:45-04:30' },
  { feeder: 'calendar-read', taskName: 'EHG Michael calendar-read', script: 'scripts/michael/calendar-read.mjs --apply', wrapperRelPath: path.join('scripts', 'cron', 'michael-calendar-read-task.cmd'), windowEt: '04:00-05:00' },
  // Shadow phase: --apply records intents; --modify is added only by an explicit --with-modify register.
  { feeder: 'gmail-triage', taskName: 'EHG Michael gmail-triage', script: 'scripts/michael/gmail-triage.mjs --apply', wrapperRelPath: path.join('scripts', 'cron', 'michael-gmail-triage-task.cmd'), windowEt: '04:30-05:30', promotable: true },
]);

/** Pure: a task name is refused before any schtasks call when it carries an illegal filename character (QF-20260906-961). */
export function assertTaskName(taskName) {
  for (const ch of TASK_NAME_ILLEGAL_CHARS) {
    if (String(taskName).includes(ch)) throw new Error(`setup-michael-host-tasks: task name ${JSON.stringify(taskName)} contains Task-Scheduler-illegal ${JSON.stringify(ch)}`);
  }
  return taskName;
}

/** Pure: the registered command for a task; only the promotable gmail-triage task gains --modify, and only under --with-modify. */
export function commandFor(task, { withModify = false } = {}) {
  return task.promotable && withModify ? `${task.script} --modify` : task.script;
}

/** Pure: the full registration plan (wrapper content and schtasks args) for a repo root. Never touches the OS. */
export function buildPlan({ repoRoot, withModify = false } = {}) {
  if (!repoRoot) throw new Error('buildPlan: repoRoot required');
  const hiddenLauncherPath = path.join(repoRoot, HIDDEN_LAUNCHER_REL_PATH);
  return MICHAEL_TASKS.map((t) => {
    assertTaskName(t.taskName);
    const wrapperPath = path.join(repoRoot, t.wrapperRelPath);
    const script = commandFor(t, { withModify });
    const wrapperContent = buildWrapperScript({ repoRoot, script });
    const trAction = buildHiddenTrAction({ hiddenLauncherPath, wrapperPath });
    const createArgs = buildCreateArgs({ taskName: t.taskName, trAction, intervalMinutes: INTERVAL_MINUTES, startTime: START_TIME });
    return { ...t, script, wrapperPath, wrapperContent, trAction, createArgs, hiddenLauncherPath };
  });
}

function defaultRunSchtasks(args) {
  try {
    return { ok: true, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, code: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

export function parseArgs(argv) {
  const args = { mode: 'register', dryRun: false, withModify: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove' || a === '--delete') args.mode = 'remove';
    else if (a === '--status' || a === '--query') args.mode = 'status';
    else if (a === '--verify') args.mode = 'verify';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--with-modify') args.withModify = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-michael-host-tasks [--with-modify|--verify|--status|--remove|--dry-run]  (host-local venue for the credentialed Michael feeders, hidden-window launch, no /RU /NP)';

/** The setup-* family entry point (exported for its tests, like every sibling): main(argv, deps) -> { exitCode, action }. */
export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const fsx = deps.fs || fs;
  const runSchtasks = deps.runSchtasks || defaultRunSchtasks;
  const tag = '[setup-michael-host-tasks]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). The credentialed feeders have no venue but the chairman's host (ratification 0daf3bd8).`);
    return { exitCode: 2, action: 'not_win32' };
  }
  const repoRoot = deps.repoRoot || getRepoRoot();

  if (args.mode === 'status') {
    let ok = true;
    for (const t of MICHAEL_TASKS) {
      const res = runSchtasks(buildQueryArgs(t.taskName));
      logger.log(res.stdout || res.stderr);
      ok = ok && res.ok;
    }
    return { exitCode: ok ? 0 : 1, action: 'status' };
  }

  if (args.mode === 'verify') {
    let allOk = true;
    const results = [];
    for (const t of MICHAEL_TASKS) {
      const q = runSchtasks(buildQueryXmlArgs(t.taskName));
      if (!q.ok) {
        logger.error(`${tag} VERIFY FAILED — the OS has no task '${t.taskName}': ${(q.stderr || '').trim()}`);
        allOk = false; results.push({ taskName: t.taskName, ok: false }); continue;
      }
      const verdict = verifyHiddenLaunch(q.stdout);
      const modify = /--modify/.test(q.stdout);
      if (!verdict.ok) { for (const p of verdict.problems) logger.error(`${tag} VERIFY FAILED (${t.taskName}) — ${p}`); allOk = false; }
      else logger.log(`${tag} '${t.taskName}' VERIFIED — hidden-window launch, repeating, enabled${t.promotable ? (modify ? ', --modify PROMOTED' : ', shadow phase (no --modify)') : ''}`);
      results.push({ taskName: t.taskName, ok: verdict.ok, modify });
    }
    return { exitCode: allOk ? 0 : 1, action: 'verified', results };
  }

  if (args.mode === 'remove') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would remove ${MICHAEL_TASKS.map((t) => t.taskName).join(', ')}`); return { exitCode: 0, action: 'dry_run_remove' }; }
    let anyOk = false;
    for (const t of MICHAEL_TASKS) {
      const r = runSchtasks(buildRemoveArgs(t.taskName));
      if (r.ok) { logger.log(`${tag} removed '${t.taskName}'`); anyOk = true; }
      else logger.warn(`${tag} could not remove '${t.taskName}': ${(r.stderr || '').trim()}`);
    }
    return { exitCode: anyOk ? 0 : 1, action: 'removed' };
  }

  let plan;
  try { plan = buildPlan({ repoRoot, withModify: args.withModify }); } catch (err) { logger.error(`${tag} ${err.message}`); return { exitCode: 2, action: 'invalid_plan' }; }

  if (args.dryRun) {
    logger.log(`${tag} DRY RUN — preconditions: host awake (no wake-from-sleep is configured) and on mains power (DisallowStartIfOnBatteries); no /RU /NP (denied unelevated on this host).`);
    for (const p of plan) {
      logger.log(`${tag} DRY RUN — wrapper ${p.wrapperPath}:`);
      logger.log(p.wrapperContent.replace(/\r\n/g, '\n'));
      logger.log(`${tag} would run: schtasks ${p.createArgs.join(' ')}`);
    }
    return { exitCode: 0, action: 'dry_run_register', plan: plan.map((p) => ({ taskName: p.taskName, wrapperPath: p.wrapperPath, script: p.script })) };
  }

  if (!fsx.existsSync(plan[0].hiddenLauncherPath)) {
    logger.error(`${tag} hidden-window launcher missing at ${plan[0].hiddenLauncherPath} — refusing to register a task that would fall back to a visible console.`);
    return { exitCode: 1, action: 'launcher_missing' };
  }

  let allOk = true;
  for (const p of plan) {
    try {
      fsx.mkdirSync(path.dirname(p.wrapperPath), { recursive: true });
      fsx.writeFileSync(p.wrapperPath, p.wrapperContent, 'utf8');
    } catch (err) {
      logger.error(`${tag} could not write wrapper ${p.wrapperPath}: ${err.message}`);
      allOk = false; continue;
    }
    const res = runSchtasks(p.createArgs);
    if (res.ok) logger.log(`${tag} registered '${p.taskName}' — every ${INTERVAL_MINUTES} min (window ${p.windowEt} ET enforced in-script) → ${p.wrapperRelPath} (hidden launch)${p.promotable ? (args.withModify ? ' [--modify PROMOTED]' : ' [shadow phase: no --modify]') : ''}`);
    else { logger.error(`${tag} schtasks /Create failed for '${p.taskName}' (code ${res.code}): ${(res.stderr || '').trim()}`); allOk = false; }
  }
  logger.log(`${tag} run --verify to read the definitions back out of the OS.`);
  return { exitCode: allOk ? 0 : 1, action: 'registered', withModify: args.withModify };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-michael-host-tasks fatal:', err.message); process.exitCode = 2; });
}
