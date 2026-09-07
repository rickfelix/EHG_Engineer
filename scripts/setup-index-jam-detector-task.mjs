#!/usr/bin/env node
/**
 * Register index-jam-detector.mjs on Windows Task Scheduler (hidden-window, host-local),
 * retiring the harness CronCreate loop the coordinator unarmed at 02:19Z (CronDelete 01b978b1).
 * QF-20260906-831: the detector is STRICTLY OBSERVATIONAL (needs_model=false, see
 * config/armed-loops-registry.json) — a scheduled task runs node directly with no model turn,
 * unlike the CronCreate loop it replaces, which spent a full model turn every run on a file stat.
 *
 * Reuses setup-alarm-cron-tasks.mjs's already-tested schtasks/.cmd-wrapper/hidden-launch
 * helpers (FR-5 shape, ratification 439c07d1) rather than re-deriving the convention.
 *
 * Usage: node scripts/setup-index-jam-detector-task.mjs [--verify|--remove|--dry-run]
 * win32-only (schtasks).
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';
import { getRepoRoot } from '../lib/repo-paths.js';
import {
  HIDDEN_LAUNCHER_REL_PATH, buildWrapperScript, buildHiddenTrAction, buildCreateArgs,
  buildRemoveArgs, buildQueryXmlArgs, verifyHiddenLaunch,
} from './setup-alarm-cron-tasks.mjs';

export const TASK_NAME = 'EHG LEO Loop - Index Jam Detector';
export const WRAPPER_REL_PATH = path.join('scripts', 'cron', 'index-jam-detector-task.cmd');
export const INTERVAL_MINUTES = 2; // matches the retired CronCreate loop's measured cadence
export const START_TIME = '00:00';

function runSchtasks(args) {
  try {
    return { ok: true, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { ok: false, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

export async function main(argv = process.argv, deps = {}) {
  const logger = deps.logger || console;
  const platform = deps.platform || process.platform;
  const repoRoot = deps.repoRoot || getRepoRoot();
  const tag = '[setup-index-jam-detector-task]';
  if (platform !== 'win32') {
    logger.error(`${tag} win32-only (schtasks). On POSIX this stays unarmed by design.`);
    return { exitCode: 2 };
  }

  if (argv.includes('--remove')) {
    const r = runSchtasks(buildRemoveArgs(TASK_NAME));
    logger.log(r.ok ? `${tag} removed '${TASK_NAME}'` : `${tag} remove failed: ${r.stderr?.trim?.() || r.stderr}`);
    return { exitCode: r.ok ? 0 : 1 };
  }

  if (argv.includes('--verify')) {
    const q = runSchtasks(buildQueryXmlArgs(TASK_NAME));
    if (!q.ok) {
      logger.error(`${tag} VERIFY FAILED — the OS has no task '${TASK_NAME}': ${q.stderr?.trim?.() || q.stderr}`);
      return { exitCode: 1 };
    }
    const v = verifyHiddenLaunch(q.stdout);
    for (const p of v.problems) logger.error(`${tag} ${p}`);
    if (v.ok) logger.log(`${tag} '${TASK_NAME}' VERIFIED — hidden-window launch, repeating, enabled`);
    return { exitCode: v.ok ? 0 : 1 };
  }

  const hiddenLauncherPath = path.join(repoRoot, HIDDEN_LAUNCHER_REL_PATH);
  const wrapperPath = path.join(repoRoot, WRAPPER_REL_PATH);
  const wrapperContent = buildWrapperScript({ repoRoot, script: `scripts/cron/index-jam-detector.mjs --repo "${repoRoot}"` });
  const trAction = buildHiddenTrAction({ hiddenLauncherPath, wrapperPath });
  const createArgs = buildCreateArgs({ taskName: TASK_NAME, trAction, intervalMinutes: INTERVAL_MINUTES, startTime: START_TIME });

  if (argv.includes('--dry-run')) {
    logger.log(`${tag} DRY RUN — wrapper ${wrapperPath}:\n${wrapperContent}`);
    logger.log(`${tag} would run: schtasks ${createArgs.join(' ')}`);
    return { exitCode: 0 };
  }
  if (!fs.existsSync(hiddenLauncherPath)) {
    logger.error(`${tag} hidden-window launcher missing at ${hiddenLauncherPath} — refusing to register a task that would fall back to a visible console.`);
    return { exitCode: 1 };
  }

  fs.mkdirSync(path.dirname(wrapperPath), { recursive: true });
  fs.writeFileSync(wrapperPath, wrapperContent, 'utf8');
  const res = runSchtasks(createArgs);
  if (res.ok) logger.log(`${tag} registered '${TASK_NAME}' — every ${INTERVAL_MINUTES} min from ${START_TIME} (hidden launch)`);
  else logger.error(`${tag} schtasks /Create failed: ${res.stderr?.trim?.() || res.stderr}`);
  return { exitCode: res.ok ? 0 : 1 };
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .then(({ exitCode }) => { process.exitCode = exitCode; })
    .catch((err) => { console.error('setup-index-jam-detector-task fatal:', err.message); process.exitCode = 2; });
}
