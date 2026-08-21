#!/usr/bin/env node
/**
 * SD-MAN-INFRA-CORRECTIVE-VISION-GAP-001 FR-4 — register scripts/assert-daemon-census.mjs as a
 * LOCAL Windows scheduled task.
 *
 * WHY LOCAL AND NOT GHA (same reasoning as scripts/setup-console-reaper-task.mjs, applied here to
 * a different observability gap it exists to close). assert-daemon-census.mjs scopes its query to
 * `hostname = os.hostname()` — it counts non-released claude_sessions rows belonging to the machine
 * it runs ON. A GitHub Actions runner has its own ephemeral, disconnected hostname that never
 * matches any real fleet-worker session, so a workflow-scheduled run would always see 0 rows and
 * report PASS — not because nothing leaked, but because it queried for a hostname nobody uses. That
 * is a check that always passes for the wrong reason, worse than no check: it would read as
 * ongoing regression protection while providing none. The script (and its 15-test unit suite,
 * daemon-census.test.js) has existed since SD-LEO-INFRA-SESSION-TICK-DAEMONS-001 but was wired into
 * neither CI nor a local scheduler — this registrar closes that gap the only way it can actually be
 * closed: on the host whose own sessions it is meant to census.
 *
 * Usage:
 *   node scripts/setup-daemon-census-task.mjs [--interval-minutes 60] [--cleanup] [--dry-run]
 *   node scripts/setup-daemon-census-task.mjs --status | --remove
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[daemon-census-task]';
export const TASK_NAME = 'LEO-DaemonCensus';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the `schtasks /Create` argv. PURE — no embedded quoting; execFileSync quotes spaced args.
 * @param {{intervalMinutes?: number, cleanup?: boolean, nodePath?: string, requireRunner?: boolean, runnerPath?: string|null}} [opts]
 */
export function buildCensusSchtasksArgs({ intervalMinutes = 60, cleanup = false, nodePath = 'node', requireRunner = true, runnerPath = null } = {}) {
  const minutes = Number(intervalMinutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1439) {
    throw new Error(`${TAG} --interval-minutes must be an integer 1..1439 (got ${intervalMinutes})`);
  }
  // runnerPath is injectable so the argv builder is testable without depending on the real
  // checkout layout.
  const runner = runnerPath || path.join(REPO_ROOT, 'scripts', 'assert-daemon-census.mjs');
  if (requireRunner && !existsSync(runner)) {
    throw new Error(
      `${TAG} runner not found at ${runner} — refusing to register a task that would fail ` +
      'silently every interval.'
    );
  }
  const cleanupFlag = cleanup ? ' --cleanup' : '';
  return [
    '/Create', '/TN', TASK_NAME,
    '/TR', `"${nodePath}" "${runner}"${cleanupFlag}`,
    '/SC', 'MINUTE', '/MO', String(minutes),
    '/F', // idempotent re-register
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
    cleanup: argv.includes('--cleanup'),
    intervalMinutes: get('--interval-minutes', '60'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (process.platform !== 'win32') {
    console.error(`${TAG} win32-only (schtasks). assert-daemon-census.mjs scopes to os.hostname(),`);
    console.error(`${TAG} so there is no meaningful GHA/cross-host equivalent — do not wire this into CI.`);
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
    schtasksArgs = buildCensusSchtasksArgs({
      intervalMinutes: Number(args.intervalMinutes),
      cleanup: args.cleanup,
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
  console.log(`${TAG} registered ${TASK_NAME} every ${args.intervalMinutes}m${args.cleanup ? ' (--cleanup armed)' : ' (report-only)'}`);
}

if (process.argv[1]?.endsWith('setup-daemon-census-task.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
