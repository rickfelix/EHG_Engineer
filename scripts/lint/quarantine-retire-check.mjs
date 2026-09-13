#!/usr/bin/env node
/**
 * Quarantine manifest retire-check gauge.
 * SD-LEO-FIX-TESTS-QUARANTINE-MANIFEST-001 FR-2/FR-3/FR-4.
 *
 * Two independent checks, both fail-closed:
 *
 *   1. BASELINE -- tests/quarantine-manifest.json's quarantined[] must never exceed a committed
 *      literal ceiling (BASELINE_COUNT below). Deliberately NOT a git-merge-base diff (see
 *      scripts/lint/schema-lint-escape-budget.mjs for that alternate pattern) -- this ticket asks
 *      for an asserted baseline, following the precedent in
 *      lib/governance/wind-down-recurrence-guard.js's SHIP_TIME_BASELINE_COUNT_24H. Accepted
 *      limitation, same as that precedent: a hardcoded ceiling never decays if the live count
 *      later drops below it.
 *
 *   2. OVERDUE -- any entry whose review_by has passed must have a matching verdict in
 *      tests/quarantine-retriage-verdicts.json (joined by exact `file` string equality, mirroring
 *      lib/quarantine/retriage.js's byFile Map convention); otherwise it is OVERDUE. Printed
 *      grouped by reason_class.
 *
 * --diff --base <ref> (PR mode): the BASELINE check is unchanged (always against the fixed
 * literal). The OVERDUE check is scoped to only entries that are NEW or CHANGED relative to
 * <ref> (default origin/main) -- a PR should not be failed by a pre-existing overdue entry it
 * never touched; that is the weekly full-mode sweep's job.
 *
 * On overdue findings, emits ONE harness_backlog feedback row per distinct reason_class among the
 * overdue set (never one per file) via lib/governance/emit-feedback.js's emitFeedback() -- NOT
 * scripts/log-harness-bug.js, whose --file flag conflates dedup_key with metadata.source_location.
 *
 * KNOWN LIMITATION: the BASELINE ceiling is a hardcoded literal (BASELINE_COUNT) that never
 * decays -- if the live entry count later drops well below it, a slow partial regression back up
 * toward the ceiling stays invisible until someone re-tightens it by hand. Separately,
 * findOverdueEntries() treats a missing or unparseable review_by as never-overdue rather than
 * failing closed, so a malformed entry silently escapes the overdue check forever unless a
 * different control (tests/unit/quarantine-manifest.test.js) catches the malformed field first.
 */
import { readFileSync, existsSync } from 'node:fs';
import { makeHardenedGitRunner, validateBaseRef } from '../../lib/git/hardened-runner.cjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

export const MANIFEST_PATH = 'tests/quarantine-manifest.json';
export const VERDICTS_PATH = 'tests/quarantine-retriage-verdicts.json';

/** Committed literal ceiling -- see header. Measured live count at authoring time (2026-09-13). */
export const BASELINE_COUNT = 150;

// ---------------------------------------------------------------------------
// Pure logic (unit-tested against fixtures, no DB / git / filesystem access)
// ---------------------------------------------------------------------------

/** Baseline check: current entry count must never exceed BASELINE_COUNT. */
export function evaluateBaseline(entries, baseline = BASELINE_COUNT) {
  const count = (entries || []).length;
  return { ok: count <= baseline, count, baseline, delta: count - baseline };
}

/**
 * Entries whose review_by has passed AND have no matching verdict in `verdicts` (joined by exact
 * `file` string equality -- mirrors lib/quarantine/retriage.js's byFile Map convention). A verdict
 * file that no longer has a live manifest entry is simply unused; this never assumes 1:1 liveness.
 */
export function findOverdueEntries(entries, verdicts, { now = new Date() } = {}) {
  const byFile = new Map((verdicts || []).map((v) => [v.file, v]));
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  return (entries || []).filter((e) => {
    const reviewByMs = Date.parse(e.review_by);
    if (!Number.isFinite(reviewByMs) || reviewByMs > nowMs) return false;
    return !byFile.has(e.file);
  });
}

/** Group overdue entries by reason_class -> file list, for the printed report and FR-4's rows. */
export function groupOverdueByReasonClass(overdueEntries) {
  const groups = new Map();
  for (const e of overdueEntries || []) {
    const key = e.reason_class || 'unclassified';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e.file);
  }
  return groups;
}

/**
 * Entries touched by the current branch relative to a base entry set: NEW (file absent at base)
 * or CHANGED (file present at both, serialized content differs). Used to scope --diff mode's
 * overdue check so a PR is never failed by a pre-existing entry it never touched.
 */
export function diffTouchedEntries(currentEntries, baseEntries) {
  const baseByFile = new Map((baseEntries || []).map((e) => [e.file, e]));
  return (currentEntries || []).filter((e) => {
    const baseEntry = baseByFile.get(e.file);
    if (!baseEntry) return true; // new
    return JSON.stringify(baseEntry) !== JSON.stringify(e); // changed
  });
}

/** FR-4: one harness_backlog row per reason_class cohort, never one per file. Pure -- testable. */
export function buildHarnessBacklogRows(overdueGroupedByReasonClass, { asOfDate } = {}) {
  const rows = [];
  for (const [reasonClass, files] of overdueGroupedByReasonClass) {
    rows.push({
      reason_class: reasonClass,
      files,
      dedup_key: `quarantine-retire:${reasonClass}`,
      title: `Quarantine retire-check: ${files.length} overdue '${reasonClass}' entr${files.length === 1 ? 'y' : 'ies'}`,
      description:
        `${files.length} quarantined test file(s) in the '${reasonClass}' reason_class are past their `
        + `review_by with no cited verdict in ${VERDICTS_PATH}:\n${files.map((f) => `  - ${f}`).join('\n')}`,
      asOfDate: asOfDate || new Date().toISOString().slice(0, 10),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readManifestAtRef(git, ref) {
  let raw;
  try {
    // SEC: validateRefs makes the runner refuse an option-shaped/hostile ref (e.g. leading `-`)
    // BEFORE it ever reaches `git show <ref>:<path>`, closing the same ref-injection class
    // lib/git/hardened-runner.cjs's validateBaseRef exists for (mirrors the sibling call in
    // scripts/lint/schema-lint-escape-budget.mjs).
    raw = git(['show', `${ref}:${MANIFEST_PATH}`], { validateRefs: [ref] });
  } catch (e) {
    const stderr = String(e.stderr ?? e.message ?? '');
    if (/does not exist in|exists on disk, but not in/.test(stderr)) return { quarantined: [] };
    throw new Error(`git show ${ref}:${MANIFEST_PATH} failed: ${stderr.trim() || e.message}`);
  }
  return JSON.parse(raw);
}

function parseArgs(argv) {
  const out = { diff: false, base: 'origin/main', reportIncompleteOutcome: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--diff') out.diff = true;
    else if (argv[i] === '--base') out.base = argv[++i];
    else if (argv[i] === '--report-incomplete-outcome') out.reportIncompleteOutcome = true;
  }
  // Validated here (not just inside readManifestAtRef) so a hostile/malformed --base fails
  // loud and early at the CLI boundary, before any diff-mode work is attempted.
  if (out.diff) validateBaseRef(out.base);
  return out;
}

/**
 * QF-20260912-364's shape, mirrored here (see scripts/clock-skew-report-failures.mjs). The step
 * that runs this gauge can end 'success', 'failure', 'cancelled', or 'skipped' (GHA's own outcome
 * vocabulary). Only 'success'/'failure' are trustworthy results the gauge itself already reported
 * on; anything else means the run step never produced one, and staying silent would read
 * identically to "0 overdue, clean pass".
 */
export function isIncompleteOutcome(outcome) {
  return Boolean(outcome) && outcome !== 'success' && outcome !== 'failure';
}

/** One-row report for a run that never completed -- never a per-file report, since no check
 * result exists to attribute to any file. Non-blocking: always exits 0 (informational). */
async function reportIncompleteRun(outcome) {
  const outcomeVal = outcome || 'unknown';
  console.log(`Gauge run step outcome='${outcomeVal}' (not success/failure) -- did not complete; reporting rather than staying silent.`);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const [{ emitFeedback }, { createClient }] = await Promise.all([
      import('../../lib/governance/emit-feedback.js'),
      import('@supabase/supabase-js'),
    ]);
    // createClient() throws SYNCHRONOUSLY when SUPABASE_URL is unset (e.g. secrets withheld on a
    // fork-triggered pull_request run) -- moved inside this try so that condition degrades
    // gracefully too, matching this function's own "always exits 0 (informational)" contract.
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
    await emitFeedback({
      supabase,
      title: 'Quarantine retire-check did not complete',
      description: `The scheduled quarantine-retire-check gauge run ended with outcome='${outcomeVal}' (likely a timeout/cancellation) -- zero results, NOT a clean pass.`,
      category: 'harness_backlog',
      severity: 'high',
      source_type: 'manual_feedback',
      dedup_key: `quarantine-retire:incomplete-run:${today}`,
      metadata: { outcome: outcomeVal, as_of_date: today },
    });
  } catch (e) {
    console.error(`::warning::quarantine-retire-check: incomplete-run report failed: ${e.message}`);
  }
}

/** Emit FR-4's rows via emitFeedback() directly. Fail-soft: a backlog-write failure never masks
 * the gauge's own pass/fail verdict (the overdue finding itself is the loud signal; the backlog
 * row is a downstream convenience). */
async function emitOverdueBacklogRows(rows) {
  if (rows.length === 0) return;
  let emitFeedback;
  let supabase;
  try {
    ({ emitFeedback } = await import('../../lib/governance/emit-feedback.js'));
    const { createClient } = await import('@supabase/supabase-js');
    // createClient() throws SYNCHRONOUSLY when SUPABASE_URL is unset (e.g. secrets withheld on a
    // fork-triggered pull_request run) -- caught here so a credentials-absent condition degrades
    // to a per-row warning below, never an uncaught top-level crash that masks the gauge's own
    // baseline/overdue verdict (the actual loud signal this function's caller already emitted).
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  } catch (e) {
    console.error(`::warning::quarantine-retire-check: harness_backlog setup failed, skipping all ${rows.length} row(s): ${e.message}`);
    return;
  }
  for (const row of rows) {
    try {
      await emitFeedback({
        supabase,
        title: row.title,
        description: row.description,
        category: 'harness_backlog',
        severity: 'medium',
        source_type: 'manual_feedback',
        dedup_key: row.dedup_key,
        metadata: { reason_class: row.reason_class, files: row.files, as_of_date: row.asOfDate },
      });
    } catch (e) {
      console.error(`::warning::quarantine-retire-check: harness_backlog emit failed for reason_class=${row.reason_class}: ${e.message}`);
    }
  }
}

async function main() {
  const { diff, base, reportIncompleteOutcome } = parseArgs(process.argv.slice(2));

  if (reportIncompleteOutcome) {
    const outcome = process.env.RETIRE_CHECK_RUN_OUTCOME || null;
    if (isIncompleteOutcome(outcome)) await reportIncompleteRun(outcome);
    else console.log(`Gauge run step outcome='${outcome}' -- already a trustworthy result, nothing to report here.`);
    return;
  }

  if (!existsSync(MANIFEST_PATH)) {
    console.error(`::error::quarantine-retire-check: ${MANIFEST_PATH} not found`);
    process.exitCode = 1;
    return;
  }
  const manifest = readJson(MANIFEST_PATH);
  const entries = manifest.quarantined || [];
  const verdicts = existsSync(VERDICTS_PATH) ? (readJson(VERDICTS_PATH).verdicts || []) : [];

  const baseline = evaluateBaseline(entries);

  let scopeForOverdue = entries;
  if (diff) {
    const git = makeHardenedGitRunner(process.cwd(), { timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
    const baseManifest = readManifestAtRef(git, base);
    scopeForOverdue = diffTouchedEntries(entries, baseManifest.quarantined || []);
  }
  const overdue = findOverdueEntries(scopeForOverdue, verdicts);
  const grouped = groupOverdueByReasonClass(overdue);

  console.log(`Baseline: ${baseline.count}/${baseline.baseline} entries${baseline.ok ? '' : ` (OVER by ${baseline.delta})`}`);
  console.log(`Overdue (${diff ? `--diff vs ${base}` : 'full manifest'}): ${overdue.length}`);
  for (const [reasonClass, files] of grouped) {
    console.log(`  ${reasonClass}: ${files.length}`);
    for (const f of files) console.log(`    - ${f}`);
  }

  if (overdue.length > 0) {
    await emitOverdueBacklogRows(buildHarnessBacklogRows(grouped));
  }

  const ok = baseline.ok && overdue.length === 0;
  if (!ok) {
    if (!baseline.ok) console.error(`::error::quarantine-retire-check: manifest grew ${baseline.baseline} -> ${baseline.count}`);
    if (overdue.length > 0) console.error(`::error::quarantine-retire-check: ${overdue.length} overdue entr${overdue.length === 1 ? 'y' : 'ies'} with no cited verdict`);
  }
  process.exitCode = ok ? 0 : 1;
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => {
    console.error(`::error::quarantine-retire-check: ${e.message}`);
    process.exitCode = 1;
  });
}
