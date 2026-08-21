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
 * is a check that always passes for the wrong reason, worse than no check.
 *
 * WHY A WRAPPER SCRIPT, NOT A BARE `/TR "node" "<path>"` (TESTING evidence 534ab65e, finding F2).
 * schtasks runs a task with cwd defaulted to %SystemRoot%\System32, not the repo. assert-daemon-
 * census.mjs's first line is `import 'dotenv/config'`, which resolves .env relative to
 * process.cwd() — from System32 that resolves to nothing, SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * come back undefined, and createClient(undefined, undefined) fails every single interval,
 * invisibly, unless someone happens to check Task Scheduler's history. Mirrors
 * scripts/setup-liveness-watcher-task.mjs's buildWrapperScript: a .cmd that `cd /d`'s into the repo
 * root before invoking node, so dotenv resolves .env correctly regardless of the task's own cwd.
 *
 * Usage:
 *   node scripts/setup-daemon-census-task.mjs [--interval-minutes 60] [--cleanup] [--dry-run]
 *   node scripts/setup-daemon-census-task.mjs --status | --remove
 *
 * DO NOT run this for real (no --dry-run) from an ephemeral EXEC worktree (TESTING evidence
 * 534ab65e, findings F1/F3). REPO_ROOT below resolves relative to THIS file's own location --
 * from a worktree that is `.worktrees/<SD>/scripts/...`, and worktrees are deleted post-merge.
 * The wrapper .cmd would then embed a path that stops existing, reproducing the exact
 * "registers happily, fails silently every interval" failure class F2 exists to prevent -- just
 * caused by worktree lifecycle instead of schtasks' cwd default. Real registration is a
 * POST-MERGE step, run once from the stable main checkout.
 *
 * No /RU/RL (independently re-verified, not just asserted): assert-daemon-census.mjs's own
 * source touches only os.hostname() (a read) and Supabase via the service-role key in .env --
 * no Windows process-table access, unlike scripts/setup-console-reaper-task.mjs, which DOES pass
 * /RU/RL HIGHEST because its target reads live process handles.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TAG = '[daemon-census-task]';
export const TASK_NAME = 'LEO-DaemonCensus';
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'daemon-census-task.cmd');
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the wrapper .cmd content (PURE). `cd /d` into repoRoot before invoking node so dotenv
 * resolves .env correctly regardless of the task's own working directory (TESTING F2).
 */
export function buildWrapperScript({ repoRoot, cleanup = false }) {
  if (!repoRoot) throw new Error('buildWrapperScript: repoRoot required');
  const runner = path.join(repoRoot, 'scripts', 'assert-daemon-census.mjs');
  const cleanupFlag = cleanup ? ' --cleanup' : '';
  const lines = [
    '@echo off',
    `cd /d "${repoRoot}"`,
    `call node "${runner}"${cleanupFlag}`,
  ];
  return lines.join('\r\n') + '\r\n';
}

/**
 * Build the `schtasks /Create` argv. PURE — no embedded quoting; execFileSync quotes spaced args.
 * @param {{intervalMinutes?: number, wrapperPath?: string, requireRunner?: boolean, runnerPath?: string|null}} [opts]
 */
export function buildCensusSchtasksArgs({ intervalMinutes = 60, wrapperPath, requireRunner = true, runnerPath = null } = {}) {
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
  if (!wrapperPath) throw new Error(`${TAG} wrapperPath required`);
  return [
    '/Create', '/TN', TASK_NAME,
    // Unquoted (TESTING evidence 534ab65e, finding N3): execFileSync passes each argv element as
    // its own token via CreateProcess, with no shell to strip wrapping quote characters -- embedding
    // literal `"..."` here would hand schtasks a path string containing quote characters, which is
    // not the real file (matches the established convention in setup-liveness-watcher-task.mjs,
    // setup-reboot-respawn-task.mjs, setup-eva-watcher-task.mjs, setup-console-creation-watcher-task.mjs,
    // all of which pass wrapperPath bare for the same reason).
    '/TR', wrapperPath,
    '/SC', 'MINUTE', '/MO', String(minutes),
    '/F', // idempotent re-register
    // No /RU/RL: assert-daemon-census.mjs only reads/updates claude_sessions via the Supabase
    // service-role key already in .env — it touches no Windows process table and needs no
    // elevation, unlike console-reaper (which reads live process handles). Runs as the
    // registering user by schtasks' own default.
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
    const wrapperPath = path.join(REPO_ROOT, WRAPPER_REL_PATH);
    if (args.dryRun) {
      console.log(`${TAG} DRY RUN — would run: schtasks ${buildRemoveArgs().join(' ')}`);
      console.log(`${TAG} DRY RUN — would also remove wrapper ${wrapperPath} if present`);
      return;
    }
    execFileSync('schtasks', buildRemoveArgs(), { encoding: 'utf8' });
    // Also remove the generated wrapper (TESTING N5) -- --Create writes it, so --remove should be
    // its inverse rather than leaving a stale, unreferenced .cmd file behind.
    rmSync(wrapperPath, { force: true });
    console.log(`${TAG} removed ${TASK_NAME} and its wrapper`);
    return;
  }

  const wrapperPath = path.join(REPO_ROOT, WRAPPER_REL_PATH);
  const wrapperContent = buildWrapperScript({ repoRoot: REPO_ROOT, cleanup: args.cleanup });

  let schtasksArgs;
  try {
    schtasksArgs = buildCensusSchtasksArgs({
      intervalMinutes: Number(args.intervalMinutes),
      wrapperPath,
    });
  } catch (err) {
    console.error((err && err.message) || String(err));
    process.exit(3);
  }

  if (args.dryRun) {
    console.log(`${TAG} DRY RUN — wrapper ${wrapperPath}:`);
    console.log(wrapperContent.replace(/\r\n/g, '\n'));
    console.log(`${TAG} DRY RUN — would run: schtasks ${schtasksArgs.join(' ')}`);
    return;
  }

  // ADVERSARIAL REVIEW (PR #7369, INFO): the header above documents that registering for real from
  // an ephemeral EXEC worktree embeds a REPO_ROOT path that stops existing post-merge, but until
  // now that was advisory-only -- existsSync(runner) PASSES from a worktree because the runner
  // genuinely exists THERE, so nothing machine-checkable actually enforced the warning. Enforced
  // here instead of left as prose the next reader has to notice and honor manually.
  if (REPO_ROOT.includes('.worktrees')) {
    console.error(`${TAG} REFUSING real registration from an ephemeral worktree checkout: ${REPO_ROOT}`);
    console.error(`${TAG} This would embed a path that stops existing post-merge (see file header). Re-run from the main checkout.`);
    process.exit(4);
  }

  // ADVERSARIAL REVIEW (PR #7369, WARNING): scheduling with --cleanup converts assert-daemon-
  // census.mjs's normally human-reviewed release step (its own CLI prints the leaked list, THEN
  // asks the operator to re-run with --cleanup) into an unattended recurring release loop. Not
  // refused -- an operator may deliberately want this after building confidence in report-only mode
  // -- but the arming must be loud, since the .cmd it lives in is gitignored and otherwise invisible
  // after the fact.
  if (args.cleanup) {
    console.warn(`${TAG} WARNING: --cleanup is armed. Every ${args.intervalMinutes}m this task will call`);
    console.warn(`${TAG} 'status: released' on leaked sessions with NO operator review of that run's list.`);
  }

  mkdirSync(path.dirname(wrapperPath), { recursive: true });
  writeFileSync(wrapperPath, wrapperContent, 'utf8');
  execFileSync('schtasks', schtasksArgs, { encoding: 'utf8' });
  console.log(`${TAG} registered ${TASK_NAME} every ${args.intervalMinutes}m${args.cleanup ? ' (--cleanup armed)' : ' (report-only)'} -> ${wrapperPath}`);
}

if (process.argv[1]?.endsWith('setup-daemon-census-task.mjs')) {
  main().catch((err) => { console.error(`${TAG} ${(err && err.message) || err}`); process.exit(1); });
}
