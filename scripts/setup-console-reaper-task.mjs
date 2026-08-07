#!/usr/bin/env node
/**
 * SD-LEO-FEAT-FLEET-SESSION-LIFECYCLE-001 / FR-5 — register the console reaper as a LOCAL
 * Windows scheduled task, under a SESSION-0 principal.
 *
 * WHY LOCAL AND NOT GHA. Every check the reaper makes reads the Windows PROCESS TABLE —
 * "does this console have descendants", "is this pid a live claude.exe". sweep-cron.yml:23 is
 * ubuntu-latest, so on the scheduled path those checks would evaluate against a Linux runner
 * that shares NO process table with this machine. Scheduled reconciliation exists today, but it
 * is DB-to-DB-only BY DEPLOYMENT TARGET. A reaper wired there would return confident, wrong
 * answers rather than no answers.
 *
 * WHY SESSION-0, ENFORCED RATHER THAN DOCUMENTED. The console leak this task exists to clean up
 * is CAUSED BY a local scheduled task with an INTERACTIVE principal — such a task materialises a
 * console every single run. Registering the reaper the same way would leak one console per run:
 * a reaper feeding the thing it reaps. schtasks expresses that mistake as /IT ("interactive
 * token"), so /IT is refused outright and the run-as defaults to SYSTEM.
 *
 * Usage:
 *   node scripts/setup-console-reaper-task.mjs [--interval-minutes 30] [--ru SYSTEM] [--dry-run]
 *   node scripts/setup-console-reaper-task.mjs --status | --remove
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateScheduledTaskPrincipal } from '../lib/fleet/console-parentage.mjs';

const TAG = '[console-reaper-task]';
export const TASK_NAME = 'LEO-ConsoleReaper';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Session-0 run-as accounts. A named interactive user is NOT one of these. */
const SESSION0_ACCOUNTS = new Set(['system', 'nt authority\\system', 'localservice', 'networkservice']);

/**
 * Map a requested run-as to the principal spec validateScheduledTaskPrincipal understands.
 * Kept separate from the argv builder so the SAFETY decision is not entangled with quoting.
 */
export function principalSpecFor(runAs, { interactive = false } = {}) {
  if (interactive) return { logonType: 'Interactive', userId: runAs || '' };
  const isSession0 = SESSION0_ACCOUNTS.has(String(runAs || '').toLowerCase());
  return { logonType: isSession0 ? 'ServiceAccount' : 'Password', userId: runAs || '' };
}

/**
 * Build the `schtasks /Create` argv. PURE — no embedded quoting; execFileSync quotes spaced args.
 * THROWS on an unsafe principal rather than emitting argv a caller might run anyway: the guard
 * has to sit where the command is CONSTRUCTED, not merely where it is documented.
 */
export function buildReaperSchtasksArgs({ runAs = 'SYSTEM', intervalMinutes = 30, interactive = false, nodePath = 'node', requireRunner = true, runnerPath = null } = {}) {
  const verdict = validateScheduledTaskPrincipal(principalSpecFor(runAs, { interactive }));
  if (!verdict.ok) {
    throw new Error(`${TAG} refusing to register: ${verdict.reason}`);
  }
  const minutes = Number(intervalMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1439) {
    throw new Error(`${TAG} --interval-minutes must be an integer 1..1439 (got ${intervalMinutes})`);
  }
  // runnerPath is injectable ONLY so the guard is testable in BOTH directions without
  // depending on whether a sibling file happens to exist in the checkout — a test whose meaning
  // flips when an unrelated file lands is not a test.
  const runner = runnerPath || path.join(REPO_ROOT, 'scripts', 'run-console-reaper.mjs');
  // A task pointing at a MISSING runner registers happily and then fails silently every
  // interval — the same accepted-but-unread shape this SD has hit four times already
  // (FLEET_WORKER_ROLE with no readers; enumerateWindows returning []; spawn() dropping
  // resumeUuid; metadata.resume_uuid). Refuse to build the command at all until the runner
  // exists, so the gap is loud now rather than silent forever.
  if (requireRunner && !existsSync(runner)) {
    throw new Error(
      `${TAG} runner not found at ${runner} — refusing to register a task that would fail ` +
      'silently every interval. Land the reaper runner first (it wires console-reaper.mjs ' +
      'reapEmptyConsoles + console-parentage.mjs capture to real Win32 process enumeration).'
    );
  }
  return [
    '/Create', '/TN', TASK_NAME,
    '/TR', `"${nodePath}" "${runner}"`,
    '/SC', 'MINUTE', '/MO', String(minutes),
    '/RU', runAs,
    '/RL', 'HIGHEST',
    '/F', // idempotent re-register
    // NOTE: /IT is deliberately NEVER emitted. See the header — it is the leak mechanism.
  ];
}

export function buildQueryArgs() { return ['/Query', '/TN', TASK_NAME, '/V', '/FO', 'LIST']; }
export function buildRemoveArgs() { return ['/Delete', '/TN', TASK_NAME, '/F']; }

function parseArgs(argv) {
  const get = (flag, dflt) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  return {
    dryRun: argv.includes('--dry-run'),
    status: argv.includes('--status'),
    remove: argv.includes('--remove'),
    interactive: argv.includes('--interactive'), // accepted ONLY so it can be refused loudly
    runAs: get('--ru', 'SYSTEM'),
    intervalMinutes: get('--interval-minutes', '30'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only (schtasks). The reaper reads the WINDOWS process table, so`);
    console.error(`${TAG} there is no meaningful POSIX equivalent — do NOT wire it into a Linux cron.`);
    process.exit(2);
  }

  if (args.status) {
    if (args.dryRun) { console.log(`${TAG} DRY RUN — would run: schtasks ${buildQueryArgs().join(' ')}`); return; }
    try { console.log(execFileSync('schtasks', buildQueryArgs(), { encoding: 'utf8' })); }
    catch (e) { console.error(`${TAG} not registered (${(e && e.message) || e})`); process.exit(1); }
    return;
  }

  if (args.remove) {
    if (args.dryRun) { console.log(`${TAG} DRY RUN — would run: schtasks ${buildRemoveArgs().join(' ')}`); return; }
    execFileSync('schtasks', buildRemoveArgs(), { encoding: 'utf8' });
    console.log(`${TAG} removed ${TASK_NAME}`);
    return;
  }

  let schtasksArgs;
  try {
    schtasksArgs = buildReaperSchtasksArgs({
      runAs: args.runAs,
      intervalMinutes: Number(args.intervalMinutes),
      interactive: args.interactive,
    });
  } catch (err) {
    console.error((err && err.message) || String(err));
    process.exit(3);
  }

  if (args.dryRun) {
    console.log(`${TAG} DRY RUN — would run: schtasks ${schtasksArgs.join(' ')}`);
    return;
  }

  execFileSync('schtasks', schtasksArgs, { encoding: 'utf8' });
  console.log(`${TAG} registered ${TASK_NAME} every ${args.intervalMinutes}m as ${args.runAs} (session-0, no interactive token)`);
}

if (process.argv[1]?.endsWith('setup-console-reaper-task.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
