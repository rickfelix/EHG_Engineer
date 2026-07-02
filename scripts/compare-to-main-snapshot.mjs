#!/usr/bin/env node
/**
 * compare-to-main-snapshot.mjs
 *
 * FR-4 of SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 — Test Coverage Enforcement
 * baseline ratchet step. Run by .github/workflows/test-coverage.yml after the
 * `Run tests with coverage` step parses test-results.json.
 *
 * Modes:
 *   push to main → INSERT a snapshot row into codebase_health_snapshots with
 *                  current failed_tests + skipped_tests counts and trend_direction
 *                  relative to the prior snapshot.
 *   pull_request → SELECT the most recent snapshot for the PR's base branch.
 *                  If current failed_tests > baseline by ≥1, write
 *                  test-failures-pr.json (for the upload-artifact step) and
 *                  exit 1 with ::error:: annotations on stderr. Otherwise, if the
 *                  skipped-test count has drifted outside the baseline's ±10% band
 *                  (FR-5 vacuous-green guard), exit 1 with a SKIP_DRIFT annotation.
 *
 * Cold start (no prior snapshot for base branch, or a snapshot predating the
 * skipped_count field): pass — the next push to that branch records the baseline.
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GITHUB_EVENT_NAME (push|pull_request), GITHUB_REF, GITHUB_BASE_REF (PR only),
 *   GITHUB_SHA, GITHUB_RUN_ID
 *
 * Exit codes:
 *   0 — comparison passed (or push snapshot written)
 *   1 — BASELINE_REGRESSION (new failures vs base) or SKIP_DRIFT (skipped count
 *       outside the baseline's ±10% band — a likely vacuous-green run)
 *   2 — invocation/parse error (missing env, missing test-results.json, DB error)
 *
 * See docs/reference/test-coverage-baseline-ratchet.md for triage.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';
import { extractFailures } from './lib/vitest-report-parser.mjs';
import {
  DIMENSION,
  TARGET_APP,
  TABLE,
  testId,
  extractFailingIds,
  getChangedFiles,
  fetchBaselineSnapshot,
  classifyRegressions,
} from './lib/baseline-regression-check.mjs';

// FR-5 (SD-FDBK-INFRA-VITEST-PROJECT-SPLIT-001): shared skip-drift band detector,
// authored as CommonJS so the local session hook (compare-test-baseline.cjs) and
// this ESM ratchet share one implementation. ESM imports it via createRequire.
const require = createRequire(import.meta.url);
const { skipDriftStatus } = require('./lib/skip-drift.cjs');

export function die(msg, code = 2) {
  stderr.write(`compare-to-main-snapshot.mjs: ${msg}\n`);
  exit(code);
}

function parseArgs() {
  const args = { resultsPath: 'test-results.json', prFailuresPath: 'test-failures-pr.json' };
  for (const a of argv.slice(2)) {
    if (a.startsWith('--results=')) args.resultsPath = a.slice('--results='.length);
    else if (a.startsWith('--pr-failures=')) args.prFailuresPath = a.slice('--pr-failures='.length);
    else if (a === '--help' || a === '-h') {
      stdout.write(
        'compare-to-main-snapshot.mjs — FR-4 baseline ratchet for test-coverage workflow.\n' +
        '\nUSAGE: node scripts/compare-to-main-snapshot.mjs [options]\n' +
        '\nOPTIONS:\n' +
        '  --results=<path>       Path to vitest --reporter=json output (default: test-results.json)\n' +
        '  --pr-failures=<path>   Path to write PR-mode failure list (default: test-failures-pr.json)\n' +
        '  --help, -h             Show this message\n' +
        '\nSee docs/reference/test-coverage-baseline-ratchet.md for full behavior.\n'
      );
      exit(0);
    }
  }
  return args;
}

function readTestResults(path) {
  if (!existsSync(path)) die(`test results file not found: ${path}`);
  const raw = readFileSync(path, 'utf8');
  let json;
  try { json = JSON.parse(raw); } catch (e) { die(`failed to parse ${path}: ${e.message}`); }
  const failed = Number(json.numFailedTests ?? 0);
  const total = Number(json.numTotalTests ?? 0);
  // FR-5: skipped = pending (describeDb/.skip self-skips) + todo. Mirrors the
  // capture-baseline hook's definition so both delta gates agree.
  const skipped = Number(json.numPendingTests ?? 0) + Number(json.numTodoTests ?? 0);
  if (!Number.isFinite(failed) || !Number.isFinite(total) || total === 0) {
    die(`unexpected vitest JSON shape: numFailedTests=${json.numFailedTests}, numTotalTests=${json.numTotalTests}`);
  }
  return { failed, total, skipped: Number.isFinite(skipped) ? skipped : 0, raw: json };
}

function detectContext() {
  const eventName = env.GITHUB_EVENT_NAME || 'push';
  const sha = env.GITHUB_SHA || 'unknown';
  const runId = env.GITHUB_RUN_ID || 'unknown';
  if (eventName === 'pull_request') {
    const base = env.GITHUB_BASE_REF || 'main';
    return { mode: 'pull_request', baseBranch: base, sha, runId };
  }
  // push
  const ref = env.GITHUB_REF || 'refs/heads/main';
  const branch = ref.replace(/^refs\/heads\//, '');
  return { mode: 'push', branch, sha, runId };
}

function trendFor(currentFailed, priorFailed) {
  if (priorFailed == null) return 'new';
  if (currentFailed < priorFailed) return 'improving';
  if (currentFailed > priorFailed) return 'declining';
  return 'stable';
}

async function insertSnapshot(supabase, { failed, total, skipped, failedTestIds, branch, sha, runId, priorFailed }) {
  const score = total === 0 ? 0 : Number(((total - failed) / total * 100).toFixed(2));
  const trend = trendFor(failed, priorFailed);
  const row = {
    dimension: DIMENSION,
    target_application: TARGET_APP,
    score,
    // FR-5: skipped_count is recorded alongside failed_count so the next PR's
    // skip-drift band has a baseline (the ratchet rewrites it on every push).
    // failed_test_ids (SD-LEO-FIX-COVERAGE-BASELINE-REGRESSION-001): the
    // failing-test IDENTITY set, so the next PR's regression check can tell
    // "still-failing" apart from "newly-failing" instead of comparing counts.
    findings: [{ failed_count: failed, skipped_count: skipped, failed_test_ids: failedTestIds, branch, commit_sha: sha }],
    trend_direction: trend,
    metadata: { workflow_run_id: runId },
  };
  const { error } = await supabase.from(TABLE).insert(row);
  if (error) die(`INSERT snapshot failed: ${error.message}`);
  stdout.write(`Snapshot written: branch=${branch} failed=${failed}/${total} skipped=${skipped} score=${score} trend=${trend}\n`);
}

/**
 * Write the PR-mode diagnostic artifact. When the comparator ran in
 * identity+reachability mode (`result.usedFallback === false`), the artifact
 * lists ONLY the genuine new regressions — not every currently-failing test —
 * so the artifact stays actionable instead of drowning real regressions in
 * pre-existing/unrelated noise (the same false-positive class this SD fixes).
 * Legacy fallback mode dumps the full current failure list, matching the
 * pre-fix behavior, since there isn't enough baseline data to be precise.
 */
export function writePrFailuresArtifact(path, raw, failed, result) {
  const all = extractFailures(raw).map((f) => ({
    file: f.file,
    fullName: f.test,
    failureMessages: [f.error.slice(0, 500)],
  }));
  const failures = result.usedFallback
    ? all
    : all.filter((f) => result.newRegressions.includes(testId({ file: f.file, test: f.fullName })));
  writeFileSync(path, JSON.stringify({ summary: { numFailed: failed }, new_failures: failures }, null, 2));
}

export function annotateRegression(result) {
  stderr.write(`::error::BASELINE_REGRESSION: ${result.newFailureCount} new test failure(s) vs main snapshot.\n`);
  if (!result.usedFallback && result.newRegressions.length > 0) {
    for (const id of result.newRegressions.slice(0, 10)) {
      stderr.write(`  - ${id}\n`);
    }
    if (result.newRegressions.length > 10) {
      stderr.write(`  ... and ${result.newRegressions.length - 10} more\n`);
    }
  }
  stderr.write(`Reproduce locally: node scripts/audit-test-failures.mjs --pr-only --format=json | jq .new_failures\n`);
  stderr.write(`See docs/reference/test-coverage-baseline-ratchet.md for triage steps.\n`);
}

function annotateSkipDrift(skip) {
  stderr.write(
    `::error::SKIP_DRIFT: ${skip.currentSkipped} skipped this run vs baseline ${skip.baselineSkipped} ` +
    `(allowed band ${skip.lowerBound}–${skip.upperBound}, drift ${skip.drift >= 0 ? '+' : ''}${skip.drift}).\n`
  );
  stderr.write(`A large jump usually means DB-guarded suites all self-skipped (e.g. SUPABASE_URL/SERVICE_ROLE_KEY failed to inject) — a "vacuous green". A large drop means a skip guard was removed.\n`);
  stderr.write(`Verify the DB secrets are present in CI and that describeDb suites still skip as intended. See docs/reference/test-coverage-baseline-ratchet.md.\n`);
}

export async function main() {
  const args = parseArgs();
  const { failed, total, skipped, raw } = readTestResults(args.resultsPath);
  const ctx = detectContext();

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (ctx.mode === 'push') {
    let prior;
    try {
      prior = await fetchBaselineSnapshot(supabase, ctx.branch);
    } catch (err) {
      die(err.message);
    }
    const failedTestIds = extractFailingIds(raw);
    await insertSnapshot(supabase, {
      failed, total, skipped, failedTestIds, branch: ctx.branch, sha: ctx.sha, runId: ctx.runId,
      priorFailed: prior?.failed_count,
    });
    return 0;
  }

  // pull_request mode
  let prior;
  try {
    prior = await fetchBaselineSnapshot(supabase, ctx.baseBranch);
  } catch (err) {
    die(err.message);
  }
  if (!prior) {
    stdout.write(`No prior snapshot for base branch '${ctx.baseBranch}' — cold start, passing.\n`);
    return 0;
  }
  const currentIds = extractFailingIds(raw);
  const { files: changedFiles, error: diffError } = getChangedFiles({ cwd: process.cwd() });
  if (diffError) {
    stdout.write(`Warning: could not compute changed files vs base (${diffError}) — regression check falls back to identity-only (no reachability filter).\n`);
  }
  const result = classifyRegressions({
    currentFailed: failed,
    currentIds,
    baselineFailedCount: prior.failed_count,
    baselineIds: prior.failed_test_ids,
    changedFiles,
  });
  if (result.isRegression) {
    writePrFailuresArtifact(args.prFailuresPath, raw, failed, result);
    annotateRegression(result);
    return 1;
  }
  // FR-5: failure count is stable — now guard against a vacuous green where the
  // DB-guarded suites silently all skipped (failed stays flat, skipped spikes).
  const skip = skipDriftStatus({ baselineSkipped: prior.skipped_count, currentSkipped: skipped });
  if (skip.status === 'SKIP_DRIFT') {
    annotateSkipDrift(skip);
    return 1;
  }
  const skipNote = skip.status === 'NEW'
    ? 'skip baseline not yet recorded (cold start)'
    : `skipped=${skipped} within band ${skip.lowerBound}–${skip.upperBound}`;
  stdout.write(`Snapshot baseline=${prior.failed_count}, current=${failed}, delta=${result.newFailureCount} (${result.usedFallback ? 'count-based fallback' : 'identity-based'}); ${skipNote} — passing.\n`);
  return 0;
}

// CLI entrypoint guard — do not run main() when imported by tests.
const invokedAsCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('compare-to-main-snapshot.mjs');

if (invokedAsCli) {
  main().then(code => exit(code)).catch(e => die(`unhandled error: ${e.stack || e.message}`));
}
