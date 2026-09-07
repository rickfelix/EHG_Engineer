#!/usr/bin/env node
// scripts/michael/retire-cowork.mjs — retirement tooling for the Dropbox _Cowork folder,
// docs/michael/02-SPEC.md §8 (v0.2 predecessor line 157). SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-I.
//
// The fourteen-morning success window (vision doc 01-VISION.md §8) has NOT started as of this
// child's build: only children A-H have landed, and no go-live/parallel-read marker exists
// anywhere in code or DB. This script therefore performs NO live host action by default and is
// dry-run unless --apply is passed; step 4 (the irreversible folder deletion) additionally
// requires a separate --apply-deletion flag and only proceeds once a real, DB-verified >=14-day
// streak is computed by lib/michael/retirement-window.mjs.
//
// Step 1 (disable remaining Cowork scheduled tasks): reuses scripts/setup-alarm-cron-tasks.mjs's
// buildDisableArgs, invoked via execFileSync (never a shell string). execFileSync THROWS on a
// non-zero exit; classifySchtasksResult() below reads the caught {status, stdout, stderr}. A
// task-not-found result is treated as already-satisfied (vision doc 01-VISION.md:12 records the
// desktop scheduler already died in late June); 'Access is denied' is a real failure, never
// tolerated as success.
//
// Step 2 (delete morning-brief-rebuild artifact, uninstall cowork-bootstrap skill): both are
// confirmed host-side-only, unreachable from this repo. This step is a printed checklist,
// confirmed only via an explicit --confirm-step2 flag.
//
// Step 3 (archive the folder, upload to Drive): the zip is created locally via PowerShell
// Compress-Archive (-Force -LiteralPath, through execFileSync). The upload itself is a MANUAL
// chairman/host action -- neither available Google Drive credential can script it (the GHA-only
// service account behind CHAIRMAN_FOLDER_ID cannot reach the host's local folder; the host-side
// chairman OAuth grant, lib/michael/google-clients.mjs, is drive.readonly). --verify-step3 instead
// confirms the upload landed via the existing read-only listDriveFiles.
//
// Step 4 (delete the folder once the window has elapsed): see lib/michael/retirement-window.mjs.
// michael_feedback_ledger is NEVER written, updated, or deleted by this script (matches
// scripts/michael/retention.mjs's existing NEVER_TOUCHED allow-list).
//
// Step 5 (the retirement grep is clean): see lib/michael/cowork-retirement-grep.mjs and its own
// test — a static, repo-wide check, not something this script needs to run at deletion time.
//
// --cowork-root is a REQUIRED flag with NO default anywhere in this script (mirrors
// import-cowork-memory.mjs's own --root), so this file never trips no-literal-home-path-lint and
// step 5's retirement grep never has a real path string to (correctly) flag.
//
// Usage:
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>"                                  # dry-run report, zero side effects
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>" --apply                           # steps 1-3
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>" --apply --confirm-step2           # + record the step-2 host checklist confirmation
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>" --apply --archive-date 2026-11-10 # + create the local archive zip
//   node scripts/michael/retire-cowork.mjs --verify-step3 --archive-date 2026-11-10                 # verify the manual Drive upload landed (read-only)
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>" --apply --apply-deletion --window-start <et_date>  # attempt step 4 (refuses unless the window is real)
//   node scripts/michael/retire-cowork.mjs --cowork-root "<path>" --json
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { createMichaelClient, parseArgs, readRows, refusal, emit, todayEt } from '../../lib/michael/db.mjs';
import { buildDisableArgs, TASK_NAME_ILLEGAL_CHARS } from '../setup-alarm-cron-tasks.mjs';
import { computeRetirementWindow } from '../../lib/michael/retirement-window.mjs';
import { listDriveFiles } from '../../lib/michael/google-clients.mjs';

export const DEFAULT_STATE_PATH = path.join('.artifacts', 'michael-cowork-retirement-state.json');
export const CHAIRMAN_FOLDER_ID = '1_Ui4ckZLtIUi3Sm9W_y41eEDHEnNIwDP';
export const DEFAULT_CANDIDATE_TASK_NAMES = Object.freeze(['Wake Cowork PC']);
// No default folder path — --cowork-root is a REQUIRED flag with NO default anywhere in this
// script, mirroring scripts/michael/import-cowork-memory.mjs's own --root precedent: the literal
// personal path never appears hardcoded (no-literal-home-path-lint), and step 5's own retirement
// grep must never find a real path string to flag.

/** Pure: classify a schtasks result. execFileSync THROWS on a non-zero exit — callers pass the
 * caught error's {status, stdout, stderr} shape, never a "returned failure" object. */
export function classifySchtasksResult({ status, stdout = '', stderr = '' } = {}) {
  if (status === undefined || status === 0) return 'ok';
  const text = `${stdout}\n${stderr}`;
  if (/cannot find the (file|path)|does not exist|ERROR: The system cannot find/i.test(text)) return 'not_found';
  if (/access is denied/i.test(text)) return 'denied';
  return 'failed';
}

function defaultRunSchtasks(args) {
  try {
    return { status: 0, stdout: execFileSync('schtasks', args, { encoding: 'utf8' }) };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

function defaultRunPowershell(args) {
  try {
    return { status: 0, stdout: execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ...args], { encoding: 'utf8' }) };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout?.toString?.() || '', stderr: err.stderr?.toString?.() || err.message };
  }
}

function loadState(statePath, fsImpl) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? { ok: true, state: parsed } : { ok: false, state: null };
  } catch {
    return { ok: false, state: null };
  }
}

function saveState(statePath, state, fsImpl) {
  fsImpl.mkdirSync(path.dirname(statePath), { recursive: true });
  fsImpl.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

/** Pure: refuse before any schtasks call when a task name carries a Task-Scheduler-illegal character (mirrors scripts/setup-michael-host-tasks.mjs's assertTaskName). */
export function assertTaskName(taskName) {
  for (const ch of TASK_NAME_ILLEGAL_CHARS) {
    if (String(taskName).includes(ch)) throw new Error(`retire-cowork: task name ${JSON.stringify(taskName)} contains Task-Scheduler-illegal ${JSON.stringify(ch)}`);
  }
  return taskName;
}

/** Step 1: disable candidate Cowork scheduled tasks. Task-not-found is success (already satisfied); 'denied' is a real failure. */
export function runStep1({ taskNames = DEFAULT_CANDIDATE_TASK_NAMES, runSchtasks = defaultRunSchtasks, apply = false } = {}) {
  const results = taskNames.map((taskName) => {
    assertTaskName(taskName);
    if (!apply) return { taskName, outcome: 'would_disable' };
    const res = runSchtasks(buildDisableArgs(taskName));
    const cls = classifySchtasksResult(res);
    if (cls === 'ok') return { taskName, outcome: 'disabled' };
    if (cls === 'not_found') return { taskName, outcome: 'already_satisfied' };
    if (cls === 'denied') return { taskName, outcome: 'failed', reason: 'ACCESS_DENIED', detail: (res.stderr || res.stdout || '').trim() };
    return { taskName, outcome: 'failed', reason: 'SCHTASKS_ERROR', detail: (res.stderr || res.stdout || '').trim() };
  });
  const failed = results.filter((r) => r.outcome === 'failed');
  const outcome = !apply ? 'would_disable' : failed.length === 0 ? 'ok' : 'partial_failure';
  return { ok: failed.length === 0, step: 1, outcome, results, failed };
}

/** Step 2: host-only checklist — neither the morning-brief-rebuild artifact nor the cowork-bootstrap skill is reachable from this repo. */
export function runStep2({ confirmStep2 = false, now = new Date() } = {}) {
  if (!confirmStep2) {
    return {
      ok: false, step: 2, outcome: 'pending',
      checklist: [
        'Delete the morning-brief-rebuild artifact on the host (outside this repo).',
        "Uninstall the cowork-bootstrap skill from the chairman's claude.ai account.",
      ],
    };
  }
  return { ok: true, step: 2, outcome: 'confirmed', confirmedAt: now.toISOString() };
}

/** Step 3a: create the local archive zip via PowerShell Compress-Archive. -Force makes a re-run idempotent; -LiteralPath (never -Path) avoids wildcard interpretation. */
export function runStep3Archive({ coworkRoot, archiveDate, runPowershell = defaultRunPowershell, apply = false } = {}) {
  if (!coworkRoot) return { ok: false, step: 3, outcome: 'failed', reason: 'COWORK_ROOT_REQUIRED' };
  if (!archiveDate) return { ok: false, step: 3, outcome: 'failed', reason: 'ARCHIVE_DATE_REQUIRED' };
  const zipName = `_Cowork-archive-${archiveDate}.zip`;
  const zipPath = path.join(path.dirname(coworkRoot), zipName);
  const psCommand = `Compress-Archive -LiteralPath '${coworkRoot}' -DestinationPath '${zipPath}' -Force`;
  if (!apply) return { ok: true, step: 3, outcome: 'would_archive', zipPath, psCommand };
  const res = runPowershell([psCommand]);
  if (res.status !== 0) return { ok: false, step: 3, outcome: 'failed', reason: 'COMPRESS_ARCHIVE_FAILED', detail: (res.stderr || res.stdout || '').trim() };
  return { ok: true, step: 3, outcome: 'archived', zipPath };
}

/** Step 3b: VERIFY (never write) the archive landed in CHAIRMAN_FOLDER_ID via the existing read-only Drive scope. A Drive-list failure is UNVERIFIABLE, distinct from "not uploaded". */
export async function runStep3Verify({ archiveDate, listDrive = listDriveFiles, folderId = CHAIRMAN_FOLDER_ID } = {}) {
  if (!archiveDate) return { ok: false, step: 3, outcome: 'failed', reason: 'ARCHIVE_DATE_REQUIRED' };
  const zipName = `_Cowork-archive-${archiveDate}.zip`;
  const res = await listDrive({ folderId, name: zipName });
  if (!res.ok) return { ok: false, step: 3, outcome: 'unverifiable', reason: 'DRIVE_LIST_FAILED', detail: res.error, zipName };
  const found = Array.isArray(res.files) && res.files.length > 0;
  return { ok: found, step: 3, outcome: found ? 'upload_verified' : 'upload_pending', zipName };
}

/** Step 4: gated, irreversible deletion. Refuses unless steps 1-3 are recorded ok AND a real >=14-day
 * streak is computed from live DB rows. NEVER touches michael_feedback_ledger — deletes the local
 * folder only, and only when applyDeletion is explicitly true. */
export async function runStep4({
  sb, windowStartEtDate, today = todayEt(), applyDeletion = false, coworkRoot,
  fsImpl = fs, state,
} = {}) {
  if (!state || state.step1 !== 'ok' || state.step2 !== 'ok' || state.step3 !== 'ok') {
    return { ok: false, step: 4, outcome: 'refused', reason: 'PRIOR_STEPS_INCOMPLETE' };
  }
  if (!windowStartEtDate) return { ok: false, step: 4, outcome: 'refused', reason: 'WINDOW_START_REQUIRED' };
  if (!coworkRoot) return { ok: false, step: 4, outcome: 'refused', reason: 'COWORK_ROOT_REQUIRED' };

  const briefRunsRead = await readRows(sb, 'michael_brief_runs', (q) => q.gte('et_date', windowStartEtDate).lte('et_date', today), { select: 'et_date,verified' });
  const ledgerRead = await readRows(sb, 'michael_feedback_ledger', (q) => q.gte('et_date', windowStartEtDate).lte('et_date', today), { select: 'et_date' });
  if (briefRunsRead.tables_absent || ledgerRead.tables_absent) {
    return { ok: false, step: 4, outcome: 'refused', reason: 'TABLES_ABSENT' };
  }
  const briefRunsByDate = Object.fromEntries(briefRunsRead.rows.map((r) => [r.et_date, r]));
  const ledgerByDate = Object.fromEntries(ledgerRead.rows.map((r) => [r.et_date, r]));

  const window = computeRetirementWindow({ windowStartEtDate, today, briefRunsByDate, ledgerByDate });
  if (!window.ready) return { ok: false, step: 4, outcome: 'refused', reason: 'WINDOW_NOT_ELAPSED', window };
  if (!applyDeletion) return { ok: true, step: 4, outcome: 'would_delete', window };

  try {
    fsImpl.rmSync(coworkRoot, { recursive: true, force: false });
  } catch (err) {
    return { ok: false, step: 4, outcome: 'failed', reason: 'DELETE_FAILED', detail: err.message };
  }
  return { ok: true, step: 4, outcome: 'deleted', window };
}

/** Pure: parses this script's own flags (never a bare --required-days — the 14-day floor is not a CLI-settable value). */
export function parseCliArgs(argv) {
  const a = parseArgs(argv);
  return {
    apply: a.apply === true,
    applyDeletion: a['apply-deletion'] === true,
    confirmStep2: a['confirm-step2'] === true,
    verifyStep3: a['verify-step3'] === true,
    archiveDate: typeof a['archive-date'] === 'string' ? a['archive-date'] : null,
    windowStart: typeof a['window-start'] === 'string' ? a['window-start'] : null,
    coworkRoot: typeof a['cowork-root'] === 'string' ? a['cowork-root'] : null,
    taskNames: typeof a['task-names'] === 'string' ? a['task-names'].split(',').map((s) => s.trim()).filter(Boolean) : [...DEFAULT_CANDIDATE_TASK_NAMES],
    json: a.json === true,
  };
}

/** deps: { sb, argv, now, fsImpl, runSchtasks, runPowershell, listDrive, statePath, coworkRoot }.
 * coworkRoot, if supplied by a caller, always wins over --cowork-root (tests inject it directly);
 * otherwise it comes from the CLI flag. Never throws. */
export async function runRetireCowork({
  sb, argv = [], now = new Date(), fsImpl = fs, runSchtasks = defaultRunSchtasks, runPowershell = defaultRunPowershell,
  listDrive = listDriveFiles, statePath = DEFAULT_STATE_PATH, coworkRoot,
} = {}) {
  const args = parseCliArgs(argv);
  const apply = args.apply;
  const root = coworkRoot || args.coworkRoot;

  if (args.applyDeletion && !apply) {
    return refusal('APPLY_REQUIRED_BEFORE_DELETION', '--apply-deletion requires --apply (steps 1-3 must be attempted/recorded first)');
  }

  if (args.verifyStep3) {
    const v = await runStep3Verify({ archiveDate: args.archiveDate, listDrive });
    return { ok: v.ok, action: 'verify_step3', result: v };
  }

  if (!root) return refusal('COWORK_ROOT_REQUIRED', '--cowork-root is required (no default — the literal path never appears hardcoded in this repo)');

  const step1 = runStep1({ taskNames: args.taskNames, runSchtasks, apply });
  const step2 = runStep2({ confirmStep2: args.confirmStep2, now });
  const step3 = args.archiveDate
    ? runStep3Archive({ coworkRoot: root, archiveDate: args.archiveDate, runPowershell, apply })
    : { ok: !apply, step: 3, outcome: apply ? 'refused' : 'would_archive', reason: apply ? 'ARCHIVE_DATE_REQUIRED' : undefined };

  if (apply) {
    const loadedBefore = loadState(statePath, fsImpl);
    const priorState = loadedBefore.ok ? loadedBefore.state : {};
    saveState(statePath, {
      ...priorState,
      step1: step1.ok ? 'ok' : 'failed',
      step2: step2.ok ? 'ok' : 'pending',
      step3: step3.ok ? 'ok' : 'failed',
      updatedAt: now.toISOString(),
    }, fsImpl);
  }

  let step4 = { ok: false, step: 4, outcome: 'not_attempted' };
  if (apply && args.windowStart) {
    const loadedAfter = loadState(statePath, fsImpl);
    step4 = await runStep4({
      sb, windowStartEtDate: args.windowStart, today: todayEt(now), applyDeletion: args.applyDeletion,
      coworkRoot: root, fsImpl, state: loadedAfter.ok ? loadedAfter.state : null,
    });
  } else if (args.applyDeletion) {
    step4 = { ok: false, step: 4, outcome: 'refused', reason: 'WINDOW_START_REQUIRED' };
  }

  // An 'informational' step-4 refusal (e.g. WINDOW_START_REQUIRED on a plain --apply run that never
  // asked for deletion) does not fail the overall run. But once the caller explicitly asked for
  // --apply-deletion, step 4 not reaching 'deleted'/'would_delete' IS the run failing at the one
  // thing it was asked to do — a refused/failed step 4 must not be silently absorbed in that case.
  const REFUSAL_OUTCOMES = new Set(['not_attempted', 'pending', 'would_archive', 'would_delete', 'would_disable', 'refused']);
  const step4Failed = args.applyDeletion ? !['deleted', 'would_delete'].includes(step4.outcome) : (step4.ok === false && !REFUSAL_OUTCOMES.has(step4.outcome));
  const anyFailed = [step1, step3].some((s) => s.ok === false && !REFUSAL_OUTCOMES.has(s.outcome)) || step4Failed;
  return { ok: !anyFailed, action: apply ? 'apply' : 'dry_run', steps: { step1, step2, step3, step4 } };
}

async function main() {
  const argv = process.argv.slice(2);
  const r = await runRetireCowork({ sb: createMichaelClient(), argv });
  emit(r, { json: argv.includes('--json') });
  process.exitCode = r && r.ok === false ? 2 : 0;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(`[michael:retire-cowork] fatal ${e && e.code ? e.code : ''} ${e.message || ''}`); process.exitCode = 2; });
}
