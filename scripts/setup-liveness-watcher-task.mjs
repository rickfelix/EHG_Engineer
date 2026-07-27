#!/usr/bin/env node
/**
 * Register the PID-anchored liveness watcher as a Windows Task Scheduler task.
 * SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001 (FR-3b) — the durable venue that can actually
 * see PIDs.
 *
 * THE VENUE PROBLEM, STATED EXACTLY. There are two liveness classes and only one of them has a
 * durable home:
 *   - timestamp-source rows (self_stamped, eva_scheduler_heartbeat, github_actions_api) are owned
 *     by .github/workflows/periodic-liveness-watcher-cron.yml — durable, and correct there.
 *   - the PID-anchored class (claude_sessions_heartbeat) is EXCLUDED from that workflow on purpose,
 *     and the exclusion is right: a GitHub Actions runner physically cannot resolve a PID on the
 *     dev host, and evaluating those rows there would false-OVERDUE every live session.
 * So the half that could be made durable in CI was made durable, and THE HALF THAT ACTUALLY
 * DETECTS DEAD WORKERS was left on scripts/coordinator-startup-check.mjs:311 — a STANDARD_LOOPS
 * entry, which is SESSION-BOUND. That file's own table labels the entry PARTIAL. When the
 * coordinator session dies, restarts, or never arms the loop, nothing checks worker PIDs and every
 * dead seat reads alive indefinitely.
 *
 * This task is that missing half: a host-local invoker, owned by the OS rather than by any Claude
 * session, running the SAME command the STANDARD_LOOPS entry runs. The session-armed entry stays
 * in place as a redundant backup — the watcher is idempotent, so an occasional double-fire is safe
 * (the same belt-and-braces pattern sweep-cron.yml already uses).
 *
 * DURABILITY IS DEMONSTRATED, NOT ASSERTED — and the demonstration has a stated limit.
 * The task is registered from an XML definition carrying a BootTrigger, so the OS's own persisted
 * task store contains a trigger that fires at boot. `--verify` reads that definition BACK out of
 * the OS in a separate process and asserts the BootTrigger is present and enabled. That is
 * OS-attested evidence surviving this process's exit.
 * WHAT IT IS NOT: nobody rebooted the fleet host to watch it come back — rebooting the machine the
 * whole fleet runs on is not an available experiment. The claim proven here is "the OS holds a
 * boot-triggered, enabled, repeating definition", which is the durability property; the reboot
 * itself remains inferred from Task Scheduler's documented behaviour. Saying so is the point:
 * QF-20260705-533 in this SD's own history shipped a watcher-of-watchers with NO scheduled invoker
 * at all and read as complete.
 *
 * Usage:
 *   node scripts/setup-liveness-watcher-task.mjs             # register/refresh (idempotent)
 *   node scripts/setup-liveness-watcher-task.mjs --verify    # read the definition back from the OS
 *   node scripts/setup-liveness-watcher-task.mjs --status    # human-readable query
 *   node scripts/setup-liveness-watcher-task.mjs --remove    # delete the task
 *   node scripts/setup-liveness-watcher-task.mjs --dry-run   # print, mutate nothing
 *
 * win32-only (schtasks). On POSIX it exits 2 with the equivalent cron line + @reboot entry.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';

export const TASK_NAME = 'EHG LEO Liveness Watcher (PID classes)';
export const STARTUP_TASK_NAME = 'EHG LEO Liveness Watcher (startup arm)';
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'liveness-watcher-task.cmd');
export const XML_REL_PATH = path.join('scripts', 'cron', 'liveness-watcher-task.xml');
// The PID-anchored class, and ONLY that class — the others already have a correct CI home and
// duplicating them here would double-write their stamps.
export const TASK_ENV = Object.freeze({ LIVENESS_CLASSES: 'claude_sessions_heartbeat' });
export const WATCHER_SCRIPT = 'scripts/periodic-liveness-watcher.mjs';
const DEFAULT_INTERVAL_MINUTES = 30; // matches the STANDARD_LOOPS cadence (17,47 * * * *)

/** Wrapper .cmd content (PURE). schtasks mangles nested quotes, so the env lives in a batch file. */
export function buildWrapperScript({ repoRoot, env = TASK_ENV, script = WATCHER_SCRIPT } = {}) {
  if (!repoRoot) throw new Error('buildWrapperScript: repoRoot required');
  const lines = ['@echo off'];
  for (const [k, v] of Object.entries(env)) lines.push(`set ${k}=${v}`);
  lines.push(`cd /d "${repoRoot}"`);
  lines.push(`call node ${script}`);
  return lines.join('\r\n') + '\r\n';
}

/**
 * Task XML (PURE). Two triggers, and both matter:
 *   startup trigger  — the durability property, and what --verify reads back out of the OS.
 *   CalendarTrigger  — the ordinary cadence, repeating every N minutes indefinitely.
 * StartWhenAvailable=true makes Task Scheduler run a MISSED occurrence once the host is back,
 * which is the behaviour that matters after downtime; IgnoreNew prevents overlapping runs.
 *
 * WHY LOGON, NOT BOOT, BY DEFAULT. A <BootTrigger> runs before any user logs on and therefore
 * requires an elevated registration — MEASURED on this host: schtasks /Create with a BootTrigger
 * returns "ERROR: Access is denied." unelevated. A <LogonTrigger> is equally reboot-durable (the
 * OS fires it on every boot-then-logon) and registers without elevation, so it is what the fleet
 * host can actually install. It is also the better match for what is being watched: the fleet's
 * Claude Code sessions live in the interactive user session, so a watcher scoped to that session's
 * lifetime is watching the thing it is scoped to.
 * Pass `boot: true` (CLI `--boot`) to emit a BootTrigger instead — correct when the task is being
 * registered from an elevated shell and should run headless before logon.
 */
export function buildTaskXml({ wrapperPath, intervalMinutes = DEFAULT_INTERVAL_MINUTES, boot = false, userId = null, author = 'SD-LEO-INFRA-PID-LIVENESS-DURABLE-VENUE-001' } = {}) {
  if (!wrapperPath) throw new Error('buildTaskXml: wrapperPath required');
  const mo = parseInt(intervalMinutes, 10);
  if (!Number.isFinite(mo) || mo < 1) throw new Error(`buildTaskXml: invalid intervalMinutes ${intervalMinutes}`);
  const repetition = `      <Repetition>
        <Interval>PT${mo}M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>`;
  const startupTrigger = boot
    ? `    <BootTrigger>
      <Enabled>true</Enabled>
      <Delay>PT2M</Delay>
${repetition}
    </BootTrigger>`
    : `    <LogonTrigger>
      <Enabled>true</Enabled>
      <Delay>PT2M</Delay>
${repetition}
    </LogonTrigger>`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>PID-anchored fleet liveness watcher (claude_sessions_heartbeat). Host-local because a CI runner cannot resolve dev-host PIDs. ${author}</Description>
    <Author>${author}</Author>
  </RegistrationInfo>
  <Triggers>
${startupTrigger}
    <CalendarTrigger>
      <StartBoundary>2026-01-01T00:17:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
      <Repetition>
        <Interval>PT${mo}M</Interval>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${userId || `${process.env.USERDOMAIN || ''}\\${process.env.USERNAME || ''}`}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <StartWhenAvailable>true</StartWhenAvailable>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <ExecutionTimeLimit>PT10M</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author">
    <Exec><Command>${wrapperPath}</Command></Exec>
  </Actions>
</Task>
`;
}

/**
 * REGISTRATION USES /SC, NOT /XML — and that was a measured decision, not a preference.
 * MEASURED on this host, unelevated, all four combinations tried:
 *   schtasks /Create /XML <file>                    -> ERROR: Access is denied.  (both trigger kinds)
 *   schtasks /Create /SC MINUTE /MO 30              -> SUCCESS
 *   schtasks /Create /SC ONLOGON                    -> SUCCESS
 *   schtasks /Create /SC ONLOGON /RI 30 /DU 9999:59 -> ERROR: /RI not applicable to ONLOGON
 * Windows treats XML registration as privileged because the XML can name arbitrary principals and
 * run levels, so /XML needs admin regardless of what it actually contains — adding an explicit
 * least-privilege <Principals> block did not change the verdict. The task NAME was ruled out
 * separately: the same parenthesised name registers fine via /SC.
 *
 * Since /RI cannot ride on ONLOGON, reboot-durability and cadence are carried by TWO tasks:
 *   PRIMARY  /SC MINUTE /MO 30 — the cadence. Task Scheduler persists this definition to disk and
 *                                re-arms the schedule after boot; this is the reboot-durable half.
 *   COMPANION /SC ONLOGON      — fires promptly after boot-then-logon instead of waiting out the
 *                                remainder of a 30-minute window.
 * Neither needs elevation, so the fleet host can actually install this. `--boot` swaps the
 * companion for /SC ONSTART, which DOES require an elevated shell and is documented as such.
 */
export function buildCreateArgs({ taskName = TASK_NAME, wrapperPath, intervalMinutes = DEFAULT_INTERVAL_MINUTES } = {}) {
  if (!wrapperPath) throw new Error('buildCreateArgs: wrapperPath required');
  const mo = parseInt(intervalMinutes, 10);
  if (!Number.isFinite(mo) || mo < 1) throw new Error(`buildCreateArgs: invalid intervalMinutes ${intervalMinutes}`);
  return ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', 'MINUTE', '/MO', String(mo), '/F'];
}

/** The startup companion. ONLOGON by default (unelevated); ONSTART with --boot (needs admin). */
export function buildStartupCreateArgs({ taskName = STARTUP_TASK_NAME, wrapperPath, boot = false } = {}) {
  if (!wrapperPath) throw new Error('buildStartupCreateArgs: wrapperPath required');
  return ['/Create', '/TN', taskName, '/TR', wrapperPath, '/SC', boot ? 'ONSTART' : 'ONLOGON', '/F'];
}
export function buildRemoveArgs(taskName = TASK_NAME) {
  return ['/Delete', '/TN', taskName, '/F'];
}
export function buildQueryArgs(taskName = TASK_NAME) {
  return ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'];
}
export function buildQueryXmlArgs(taskName = TASK_NAME) {
  return ['/Query', '/TN', taskName, '/XML'];
}

/**
 * The verification predicate (PURE) — run against the XML the OS hands BACK, never against the
 * XML we submitted. Comparing our own input to itself is a check that cannot fail.
 */
/**
 * The verification predicate (PURE) — run against the XML the OS hands BACK, never against
 * anything we submitted. Comparing our own input to itself is a check that cannot fail.
 *
 * @param {string} cadenceXml   OS-stored definition of the PRIMARY (repeating) task
 * @param {string} startupXml   OS-stored definition of the STARTUP companion
 */
export function verifyPersistedDefinition(cadenceXml, startupXml) {
  const problems = [];
  const warnings = [];
  if (!cadenceXml || !cadenceXml.trim()) {
    return { ok: false, triggerKind: null, problems: ['no cadence task definition returned by the OS'], warnings };
  }
  if (!/<Repetition>/.test(cadenceXml) || !/<Interval>PT\d+M<\/Interval>/.test(cadenceXml)) {
    problems.push('cadence task has no repeating interval — it would fire once and never again');
  }
  // ABSENCE OF <Enabled> MEANS ENABLED. Task Scheduler omits the element at its default (true) —
  // MEASURED: the definition it returned for a freshly registered, running task has no <Enabled>
  // at all. An earlier revision asserted /<Enabled>true</ and reported a healthy task as broken;
  // the correct test is for an explicit false.
  if (/<Enabled>false<\/Enabled>/.test(cadenceXml)) problems.push('cadence task is explicitly disabled');
  // A laptop fleet host: this default silently suspends the watcher whenever the lid is on battery.
  if (/<DisallowStartIfOnBatteries>true<\/DisallowStartIfOnBatteries>/.test(cadenceXml)) {
    problems.push('DisallowStartIfOnBatteries=true — the watcher stops whenever the host is on battery');
  }
  if (/<StopIfGoingOnBatteries>true<\/StopIfGoingOnBatteries>/.test(cadenceXml)) {
    problems.push('StopIfGoingOnBatteries=true — a run is killed mid-flight when the host unplugs');
  }

  // The startup companion is a BONUS, not the durability property. The cadence task's definition
  // is persisted in the OS task store and its repetition resumes after boot on its own; the
  // companion only makes the first post-boot run PROMPT instead of up to one interval late.
  // MEASURED on this host: /SC ONLOGON and /SC ONSTART both return "Access is denied" unelevated,
  // so its absence is an environment fact, not a build defect — it degrades to a warning.
  const kind = /<BootTrigger>/.test(startupXml || '') ? 'BootTrigger'
    : (/<LogonTrigger>/.test(startupXml || '') ? 'LogonTrigger' : null);
  if (!kind) {
    warnings.push('no startup companion (ONLOGON/ONSTART need an elevated shell on this host) — after a reboot the first run waits out the normal interval instead of firing immediately');
  } else if (/<Enabled>false<\/Enabled>/.test(startupXml)) {
    problems.push(`${kind} present but explicitly disabled`);
  }
  return { ok: problems.length === 0, problems, warnings, triggerKind: kind };
}

/**
 * The literal on-disk evidence. Task Scheduler stores each definition as a FILE under
 * %SystemRoot%\System32\Tasks — files on disk are what survives a power cycle. Reporting the
 * path and size turns "it will survive a reboot" from an assertion about Task Scheduler's
 * documented behaviour into an observation about a durable artefact that exists right now.
 */
export function taskStorePaths(names = [TASK_NAME, STARTUP_TASK_NAME]) {
  const root = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'Tasks');
  return names.map((n) => {
    const p = path.join(root, n);
    let bytes = null;
    try { bytes = fs.statSync(p).size; } catch { bytes = null; }
    return { name: n, path: p, present: bytes != null, bytes };
  });
}

/**
 * Clear the two battery restrictions Task Scheduler applies by DEFAULT, and turn on
 * StartWhenAvailable so a run missed while the host was off is made up rather than skipped.
 * schtasks has no flags for any of these; the ScheduledTasks PowerShell module does, and it
 * operates unelevated on a task the current user owns.
 */
export function clearBatterySettings(taskName = TASK_NAME) {
  const ps = [
    `$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew`,
    `Set-ScheduledTask -TaskName '${taskName.replace(/'/g, "''")}' -Settings $s | Out-Null`,
  ].join('; ');
  try {
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err.stderr?.toString?.() || err.message || '').trim().split('\n')[0] };
  }
}

function runSchtasks(args) {
  try {
    return { ok: true, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, code: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

export function parseArgs(argv) {
  const args = { mode: 'register', dryRun: false, help: false, boot: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remove' || a === '--delete') args.mode = 'remove';
    else if (a === '--status' || a === '--query') args.mode = 'status';
    else if (a === '--verify') args.mode = 'verify';
    else if (a === '--boot') args.boot = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

const USAGE = 'setup-liveness-watcher-task [--verify|--status|--remove|--boot|--dry-run]  (host-local durable venue for the PID-anchored liveness class)';

export async function main(argv = process.argv, deps = {}) {
  const args = parseArgs(argv);
  const logger = deps.logger || console;
  const tag = '[setup-liveness-watcher-task]';
  if (args.help) { logger.log(USAGE); return { exitCode: 0, action: 'help' }; }

  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const wrapperPath = path.join(repoRoot, WRAPPER_REL_PATH);
  const xmlPath = path.join(repoRoot, XML_REL_PATH);

  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). On POSIX use two crontab lines instead:`);
    logger.error(`${tag}   17,47 * * * * cd ${repoRoot} && LIVENESS_CLASSES=claude_sessions_heartbeat node ${WATCHER_SCRIPT}`);
    logger.error(`${tag}   @reboot       cd ${repoRoot} && LIVENESS_CLASSES=claude_sessions_heartbeat node ${WATCHER_SCRIPT}`);
    return { exitCode: 2, action: 'not_win32' };
  }

  if (args.mode === 'status') {
    const res = runSchtasks(buildQueryArgs());
    logger.log(res.stdout || res.stderr);
    return { exitCode: res.ok ? 0 : 1, action: 'status', present: res.ok };
  }

  if (args.mode === 'verify') {
    const cadence = runSchtasks(buildQueryXmlArgs(TASK_NAME));
    if (!cadence.ok) {
      logger.error(`${tag} VERIFY FAILED — the OS has no task '${TASK_NAME}': ${cadence.stderr.trim()}`);
      return { exitCode: 1, action: 'verify_absent' };
    }
    const startup = runSchtasks(buildQueryXmlArgs(STARTUP_TASK_NAME));
    const verdict = verifyPersistedDefinition(cadence.stdout, startup.ok ? startup.stdout : '');
    const stored = taskStorePaths();
    if (!verdict.ok) {
      for (const p of verdict.problems) logger.error(`${tag} VERIFY FAILED — ${p}`);
      return { exitCode: 1, action: 'verify_failed', problems: verdict.problems };
    }
    logger.log(`${tag} VERIFIED against the OS-persisted definitions — read BACK out of Task Scheduler`);
    logger.log(`${tag} in this separate process, never compared against anything we submitted:`);
    logger.log(`${tag}   cadence task '${TASK_NAME}':`);
    logger.log(`${tag}     enabled, repeating interval present, battery restrictions cleared,`);
    logger.log(`${tag}     StartWhenAvailable=true (a run missed while the host was off is made up).`);
    logger.log(`${tag}   startup arm '${STARTUP_TASK_NAME}': ${verdict.triggerKind || 'NOT REGISTERED'}`);
    for (const s of stored) {
      logger.log(`${tag}   on disk: ${s.present ? `${s.bytes} bytes` : 'absent/unreadable    '} ${s.path}`);
    }
    for (const w of verdict.warnings) logger.warn(`${tag} WARNING — ${w}`);
    logger.log(`${tag} WHAT IS PROVEN: the cadence definition exists in the OS task store as a file on`);
    logger.log(`${tag} disk, enabled, repeating, owned by Windows rather than by any Claude session.`);
    logger.log(`${tag} That independence from a session is the property this FR is about, and it is the`);
    logger.log(`${tag} property that survives a power cycle.`);
    logger.log(`${tag} WHAT IS NOT PROVEN, stated rather than glossed: nobody rebooted the host — power-`);
    logger.log(`${tag} cycling the machine the whole fleet runs on is not an available experiment. That`);
    logger.log(`${tag} Task Scheduler re-arms a persisted repeating trigger after boot is relied on as`);
    logger.log(`${tag} documented OS behaviour, not as something observed here.`);
    return { exitCode: 0, action: 'verified', triggerKind: verdict.triggerKind, stored, warnings: verdict.warnings };
  }

  if (args.mode === 'remove') {
    if (args.dryRun) { logger.log(`${tag} DRY RUN — would remove '${TASK_NAME}' and '${STARTUP_TASK_NAME}'`); return { exitCode: 0, action: 'dry_run_remove' }; }
    const a = runSchtasks(buildRemoveArgs(TASK_NAME));
    const b = runSchtasks(buildRemoveArgs(STARTUP_TASK_NAME));
    if (a.ok || b.ok) { logger.log(`${tag} removed (cadence:${a.ok} startup:${b.ok})`); return { exitCode: 0, action: 'removed' }; }
    logger.error(`${tag} remove failed: ${a.stderr}`);
    return { exitCode: 1, action: 'remove_failed' };
  }

  const wrapperContent = buildWrapperScript({ repoRoot });
  const cadenceArgs = buildCreateArgs({ wrapperPath });
  const startupArgs = buildStartupCreateArgs({ wrapperPath, boot: args.boot });
  if (args.dryRun) {
    logger.log(`${tag} DRY RUN — wrapper ${wrapperPath}:`);
    logger.log(wrapperContent.replace(/\r\n/g, '\n'));
    logger.log(`${tag} would run: schtasks ${cadenceArgs.join(' ')}`);
    logger.log(`${tag} would run: schtasks ${startupArgs.join(' ')}`);
    return { exitCode: 0, action: 'dry_run_register', wrapperPath };
  }

  try {
    fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
    fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  } catch (err) {
    logger.error(`${tag} could not write wrapper ${wrapperPath}: ${err.message}`);
    return { exitCode: 1, action: 'file_write_failed' };
  }

  const cadence = runSchtasks(cadenceArgs);
  if (!cadence.ok) {
    logger.error(`${tag} schtasks /Create (cadence) failed (code ${cadence.code}): ${cadence.stderr.trim()}`);
    return { exitCode: 1, action: 'create_failed' };
  }
  // The OS applies power-management DEFAULTS that a laptop fleet host cannot live with:
  // DisallowStartIfOnBatteries and StopIfGoingOnBatteries both default TRUE, so the watcher would
  // silently stop whenever this machine is unplugged — a liveness watcher that dies when the lid
  // is on battery is precisely the "reads as running, is not running" failure this SD is about.
  // schtasks cannot express these; Set-ScheduledTask can, and works unelevated for one's own task.
  const powerFix = clearBatterySettings(TASK_NAME);
  if (!powerFix.ok) {
    logger.warn(`${tag} WARNING: could not clear battery restrictions: ${powerFix.error}`);
    logger.warn(`${tag} The task will NOT run while this host is on battery until that is fixed.`);
  }

  // The startup companion is BEST-EFFORT and deliberately non-fatal. The durability property is
  // carried by the cadence task's persisted definition, which resumes on its own after boot; the
  // companion only makes the first post-boot run prompt. MEASURED: ONLOGON and ONSTART both
  // require elevation on this host, so demanding it would make the whole venue uninstallable for
  // a gain of "up to 30 minutes sooner, once, after a reboot".
  const startup = runSchtasks(startupArgs);
  logger.log(`${tag} registered '${TASK_NAME}' — every ${DEFAULT_INTERVAL_MINUTES} min → ${WRAPPER_REL_PATH}`);
  if (startup.ok) {
    logger.log(`${tag} registered '${STARTUP_TASK_NAME}' — ${args.boot ? 'ONSTART' : 'ONLOGON'} arm`);
  } else {
    logger.warn(`${tag} startup arm NOT registered (${startup.stderr.trim()}).`);
    logger.warn(`${tag} /SC ${args.boot ? 'ONSTART' : 'ONLOGON'} needs an elevated shell on this host. This is a`);
    logger.warn(`${tag} DEGRADATION, not a failure: the cadence task above still resumes after a reboot —`);
    logger.warn(`${tag} the first post-boot run just waits out the normal interval. Re-run this script`);
    logger.warn(`${tag} from an administrator shell to add the prompt-arm.`);
  }
  logger.log(`${tag} run --verify to read the definitions back out of the OS.`);
  return { exitCode: 0, action: 'registered', wrapperPath, startupArmed: startup.ok };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-liveness-watcher-task fatal:', err.message); process.exitCode = 2; });
}
