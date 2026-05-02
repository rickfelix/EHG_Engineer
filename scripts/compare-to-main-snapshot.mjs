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
 *                  current failed_tests count and trend_direction relative to
 *                  the prior snapshot.
 *   pull_request → SELECT the most recent snapshot for the PR's base branch.
 *                  If current failed_tests > baseline by ≥1, write
 *                  test-failures-pr.json (for the upload-artifact step) and
 *                  exit 1 with three ::error:: annotations on stderr.
 *
 * Cold start (no prior snapshot for base branch): pass with trend_direction='new'.
 *
 * Env vars required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GITHUB_EVENT_NAME (push|pull_request), GITHUB_REF, GITHUB_BASE_REF (PR only),
 *   GITHUB_SHA, GITHUB_RUN_ID
 *
 * Exit codes:
 *   0 — comparison passed (or push snapshot written)
 *   1 — BASELINE_REGRESSION: PR introduces new failures vs base snapshot
 *   2 — invocation/parse error (missing env, missing test-results.json, DB error)
 *
 * See docs/reference/test-coverage-baseline-ratchet.md for triage.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import { createClient } from '@supabase/supabase-js';

const DIMENSION = 'ci_test_failure_count';
const TARGET_APP = 'EHG_Engineer';
const TABLE = 'codebase_health_snapshots';

function die(msg, code = 2) {
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
  if (!Number.isFinite(failed) || !Number.isFinite(total) || total === 0) {
    die(`unexpected vitest JSON shape: numFailedTests=${json.numFailedTests}, numTotalTests=${json.numTotalTests}`);
  }
  return { failed, total, raw: json };
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

async function fetchPriorSnapshot(supabase, branch) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('findings, scanned_at')
    .eq('dimension', DIMENSION)
    .eq('target_application', TARGET_APP)
    .order('scanned_at', { ascending: false })
    .limit(20);
  if (error) die(`SELECT prior snapshot failed: ${error.message}`);
  // Filter in JS for branch since findings is JSONB and Supabase JS doesn't expose findings->0->>'branch' chain directly
  for (const row of data || []) {
    const branchInRow = row.findings?.[0]?.branch;
    if (branchInRow === branch) {
      return { failed_count: Number(row.findings[0].failed_count), scanned_at: row.scanned_at };
    }
  }
  return null;
}

async function insertSnapshot(supabase, { failed, total, branch, sha, runId, priorFailed }) {
  const score = total === 0 ? 0 : Number(((total - failed) / total * 100).toFixed(2));
  const trend = trendFor(failed, priorFailed);
  const row = {
    dimension: DIMENSION,
    target_application: TARGET_APP,
    score,
    findings: [{ failed_count: failed, branch, commit_sha: sha }],
    trend_direction: trend,
    metadata: { workflow_run_id: runId },
  };
  const { error } = await supabase.from(TABLE).insert(row);
  if (error) die(`INSERT snapshot failed: ${error.message}`);
  stdout.write(`Snapshot written: branch=${branch} failed=${failed}/${total} score=${score} trend=${trend}\n`);
}

function writePrFailuresArtifact(path, raw, failed) {
  const failures = [];
  for (const file of (raw.testResults || [])) {
    for (const test of (file.assertionResults || [])) {
      if (test.status === 'failed') {
        failures.push({
          file: file.name || file.testFilePath,
          fullName: test.fullName,
          failureMessages: (test.failureMessages || []).map(m => m.slice(0, 500)),
        });
      }
    }
  }
  writeFileSync(path, JSON.stringify({ summary: { numFailed: failed }, failures }, null, 2));
}

function annotateRegression(newFailures) {
  stderr.write(`::error::BASELINE_REGRESSION: ${newFailures} new test failure(s) vs main snapshot.\n`);
  stderr.write(`Reproduce locally: node scripts/audit-test-failures.mjs --pr-only --format=json | jq .new_failures\n`);
  stderr.write(`See docs/reference/test-coverage-baseline-ratchet.md for triage steps.\n`);
}

async function main() {
  const args = parseArgs();
  const { failed, total, raw } = readTestResults(args.resultsPath);
  const ctx = detectContext();

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (ctx.mode === 'push') {
    const prior = await fetchPriorSnapshot(supabase, ctx.branch);
    await insertSnapshot(supabase, {
      failed, total, branch: ctx.branch, sha: ctx.sha, runId: ctx.runId,
      priorFailed: prior?.failed_count,
    });
    return 0;
  }

  // pull_request mode
  const prior = await fetchPriorSnapshot(supabase, ctx.baseBranch);
  if (!prior) {
    stdout.write(`No prior snapshot for base branch '${ctx.baseBranch}' — cold start, passing.\n`);
    return 0;
  }
  const newFailures = failed - prior.failed_count;
  if (newFailures >= 1) {
    writePrFailuresArtifact(args.prFailuresPath, raw, failed);
    annotateRegression(newFailures);
    return 1;
  }
  stdout.write(`Snapshot baseline=${prior.failed_count}, current=${failed}, delta=${newFailures} — passing.\n`);
  return 0;
}

main().then(code => exit(code)).catch(e => die(`unhandled error: ${e.stack || e.message}`));
