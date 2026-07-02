#!/usr/bin/env node
/**
 * audit-test-failures.mjs
 *
 * Bucket failed test results from a vitest --reporter=json file by error
 * signature. PR1 of SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001 — feeds PR2's
 * mechanical sweep (lazyServiceClient + sentinel skip) and PR3's manual
 * triage with a per-file recommendation.
 *
 * DATA SOURCE PRIORITY:
 *   PRIMARY (today): Parses vitest --reporter=json output at --results path.
 *   SECONDARY (future): SELECT from test_runs/test_results when CI populates
 *   trigger_context.branch. Today test_runs has zero rows for branch=main
 *   (verified during PLAN-phase DATABASE sub-agent).
 *
 * Usage:
 *   node scripts/audit-test-failures.mjs                           # CSV from test-results.json
 *   node scripts/audit-test-failures.mjs --format=json             # JSON for jq pipelines
 *   node scripts/audit-test-failures.mjs --summary > out.csv       # CSV stdout, summary stderr
 *   node scripts/audit-test-failures.mjs --by-category=must-be-set # filter
 *   node scripts/audit-test-failures.mjs --pr-only --format=json   # local repro of the CI gate
 *
 * --pr-only (SD-LEO-FIX-COVERAGE-BASELINE-REGRESSION-001): reproduces the
 * exact identity+reachability regression check scripts/compare-to-main-snapshot.mjs
 * runs in CI, via the shared scripts/lib/baseline-regression-check.mjs module.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (reads the same
 * codebase_health_snapshots baseline the CI gate reads).
 *
 * Exit codes:
 *   0 — bucketing succeeded (or --pr-only found no new regressions)
 *   1 — --pr-only found new regression(s) vs baseline
 *   2 — invocation/parse error
 */

import { readFileSync, existsSync } from 'node:fs';
import { argv, env, exit, stderr, stdout } from 'node:process';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { extractFailures } from './lib/vitest-report-parser.mjs';
import {
  testId,
  getChangedFiles,
  fetchBaselineSnapshot,
  classifyRegressions,
} from './lib/baseline-regression-check.mjs';

// Re-exported so existing imports of `extractFailures` from this file keep
// working unchanged (canonical source: ./lib/vitest-report-parser.mjs).
export { extractFailures };

const DEFAULT_RESULTS_PATH = 'test-results.json';
const EXCERPT_LIMIT = 200;

/**
 * Bucket categories with detection regex and recommended action.
 *
 * Order matters: first match wins. Place specific patterns before generic ones
 * so e.g. "expected... to be called" lands in mock-mismatch before being
 * matched by the broader real-assertion-failure pattern.
 */
const BUCKETS = [
  {
    name: 'cannot-find-module',
    pattern: /cannot find (?:module|package)|failed to resolve module|err_module_not_found/i,
    action: 'Manual triage: import path may reference removed/moved module; check git log for recent deletions.',
  },
  {
    // The `i` flag makes character classes case-insensitive both ways, so a
    // negation like `[^a-z]` would also exclude A-Z. Use `[^\n]` instead and
    // rely on non-greedy `?` to keep the match on a single line.
    name: 'must-be-set',
    pattern: /\bmust be set\b|environment variable[^\n]*?(?:not set|missing|required)|missing required env|are required\b/i,
    action: 'PR2 candidate: wrap module-load createSupabaseServiceClient() with lazyServiceClient() or add HAS_REAL_DB sentinel skip.',
  },
  {
    name: 'econnrefused',
    pattern: /econnrefused|enetunreach|etimedout|connection (?:refused|timeout)|connect (?:timeout|refused)/i,
    action: 'PR2 candidate: wrap describe/it with HAS_REAL_DB sentinel; live-network test should skip in synthetic-env mode.',
  },
  {
    name: 'mock-mismatch',
    pattern: /to\s*have\s*been\s*called|spy.+called with|expected\s+\d+\s+calls?|mock\.calls/i,
    action: 'Manual triage: verify mock expectations match current implementation; may indicate intentional refactor.',
  },
  {
    name: 'real-assertion-failure',
    pattern: /assertionerror|expected\s.+(?:to\s(?:equal|be|contain|match|throw|deep)|tobe|toequal|tomatch)/i,
    action: 'Manual triage: investigate assertion. May be real bug, stale test, or test for removed behavior — see git log for the file.',
  },
];

const FALLBACK = {
  bucket: 'other',
  action: 'Manual triage: error pattern unrecognized; consider adding a new bucket if recurring.',
};

/**
 * Categorize an error message into one of the buckets.
 * @param {string} errorMessage
 * @returns {{bucket: string, action: string}}
 */
export function bucketizeError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return { bucket: 'other', action: 'Manual triage: no error message captured.' };
  }
  for (const { name, pattern, action } of BUCKETS) {
    if (pattern.test(errorMessage)) return { bucket: name, action };
  }
  return { ...FALLBACK };
}

/**
 * Bucketize a list of failure records and tally counts by category.
 */
export function bucketize(failures) {
  const rows = failures.map((f) => {
    const { bucket, action } = bucketizeError(f.error);
    const firstLine = (f.error ?? '').split('\n')[0] ?? '';
    return {
      file: f.file,
      test: f.test,
      error_category: bucket,
      error_message_excerpt: firstLine.slice(0, EXCERPT_LIMIT),
      recommended_action: action,
    };
  });
  const byCategory = {};
  for (const r of rows) {
    byCategory[r.error_category] = (byCategory[r.error_category] ?? 0) + 1;
  }
  return { rows, byCategory };
}

/**
 * RFC 4180 CSV field escape: quote if field contains comma, double-quote, CR,
 * or LF; double internal double-quotes.
 */
export function csvEscape(field) {
  const s = String(field ?? '');
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatCsv(rows) {
  const header = 'file,error_category,error_message_excerpt,recommended_action';
  const lines = rows.map((r) =>
    [r.file, r.error_category, r.error_message_excerpt, r.recommended_action]
      .map(csvEscape)
      .join(',')
  );
  return [header, ...lines].join('\n');
}

export function formatJson(rows, byCategory) {
  return JSON.stringify(
    { total_failed: rows.length, by_category: byCategory, failures: rows },
    null,
    2
  );
}

/**
 * Parse `--key=value`, `--key value`, and bare flags. Returns options object
 * or `{ _error: <reason> }` on invalid input.
 */
export function parseArgs(args) {
  const opts = {
    format: 'csv',
    summary: false,
    byCategory: null,
    noDb: true, // file-fallback is the primary path today
    resultsPath: DEFAULT_RESULTS_PATH,
    prOnly: false,
    branch: 'main',
    help: false,
  };
  const take = (i, key) => {
    const val = args[i + 1];
    if (val === undefined || val.startsWith('--')) {
      return { _error: `--${key} requires a value` };
    }
    return val;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--no-db') opts.noDb = true;
    else if (a === '--pr-only') opts.prOnly = true;
    else if (a.startsWith('--format=')) opts.format = a.slice('--format='.length);
    else if (a === '--format') {
      const v = take(i, 'format'); if (v?._error) return { _error: v._error }; opts.format = v; i++;
    }
    else if (a.startsWith('--by-category=')) opts.byCategory = a.slice('--by-category='.length);
    else if (a === '--by-category') {
      const v = take(i, 'by-category'); if (v?._error) return { _error: v._error }; opts.byCategory = v; i++;
    }
    else if (a.startsWith('--results=')) opts.resultsPath = a.slice('--results='.length);
    else if (a === '--results') {
      const v = take(i, 'results'); if (v?._error) return { _error: v._error }; opts.resultsPath = v; i++;
    }
    else if (a.startsWith('--branch=')) opts.branch = a.slice('--branch='.length);
    else if (a === '--branch') {
      const v = take(i, 'branch'); if (v?._error) return { _error: v._error }; opts.branch = v; i++;
    }
    else return { _error: `unknown argument: ${a}` };
  }
  if (!['csv', 'json'].includes(opts.format)) {
    return { _error: `--format must be 'csv' or 'json' (got '${opts.format}')` };
  }
  return opts;
}

const HELP_TEXT = `audit-test-failures.mjs — bucket failed vitest results by error signature

USAGE:
  node scripts/audit-test-failures.mjs [options]

OPTIONS:
  --results=<path>          Path to vitest --reporter=json output (default: test-results.json)
  --format=csv|json         Output format (default: csv)
  --summary                 Emit category counts to stderr (CSV stays on stdout)
  --by-category=<name>      Filter rows to one bucket
  --pr-only                 Compare current failures to the branch's baseline snapshot;
                            emits { new_failures, new_failure_count, used_fallback } and
                            exits 1 if any genuine (identity+diff-reachable) regression
                            is found. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
  --branch=<name>           Baseline branch to compare against with --pr-only (default: main)
  --no-db                   Force file-fallback (alias for default behavior today)
  --help, -h                Show this message

OUTPUT BUCKETS (in detection-priority order):
  cannot-find-module       Module resolution failure
  must-be-set              Env var crash at module load (PR2 candidate)
  econnrefused             Network unreachable (PR2 candidate)
  mock-mismatch            Mock/spy expectation failure
  real-assertion-failure   Concrete assertion failure
  other                    Unrecognized pattern

EXIT CODES:
  0  Bucketing succeeded (or --pr-only found no new regressions)
  1  --pr-only found new regression(s) vs baseline
  2  Invocation or parse error

EXAMPLES:
  node scripts/audit-test-failures.mjs --results=test-results.json
  node scripts/audit-test-failures.mjs --format=json | jq .by_category
  node scripts/audit-test-failures.mjs --summary > failures.csv
  node scripts/audit-test-failures.mjs --by-category=must-be-set --format=json
  node scripts/audit-test-failures.mjs --pr-only --format=json | jq .new_failures

DATA SOURCE:
  PRIMARY (today): Parses vitest --reporter=json output from --results path.
  SECONDARY (future): SELECT from test_runs/test_results when CI populates
  trigger_context.branch (currently unpopulated; deferred per DATABASE sub-agent).

SEE ALSO:
  docs/reference/test-coverage-baseline-ratchet.md (ships in PR3)
  scripts/test-result-capture.js (CI step that should populate test_runs)
  SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001
`;

/**
 * --pr-only: reproduce the exact regression verdict
 * scripts/compare-to-main-snapshot.mjs computes in CI, using the shared
 * scripts/lib/baseline-regression-check.mjs module so the two never drift.
 */
export async function runPrOnly(json, opts) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    stderr.write('audit-test-failures --pr-only: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are required\n');
    return 2;
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let baseline;
  try {
    baseline = await fetchBaselineSnapshot(supabase, opts.branch);
  } catch (err) {
    stderr.write(`audit-test-failures --pr-only: ${err.message}\n`);
    return 2;
  }
  if (!baseline) {
    stdout.write(JSON.stringify({ new_failures: [], new_failure_count: 0, cold_start: true, baseline_branch: opts.branch }, null, 2) + '\n');
    return 0;
  }

  const allFailures = extractFailures(json);
  const currentIds = allFailures.map(testId);
  const { files: changedFiles, error: diffError } = getChangedFiles({});
  if (diffError) {
    stderr.write(`Warning: could not compute changed files (${diffError}) — falling back to identity-only comparison.\n`);
  }
  const result = classifyRegressions({
    currentFailed: allFailures.length,
    currentIds,
    baselineFailedCount: baseline.failed_count,
    baselineIds: baseline.failed_test_ids,
    changedFiles,
  });
  const newFailureRecords = result.usedFallback
    ? allFailures
    : allFailures.filter((f) => result.newRegressions.includes(testId(f)));
  const { rows } = bucketize(newFailureRecords);

  const output = {
    new_failures: rows,
    new_failure_count: result.newFailureCount,
    used_fallback: result.usedFallback,
    baseline_branch: opts.branch,
    baseline_scanned_at: baseline.scanned_at,
  };
  const out = opts.format === 'json' ? JSON.stringify(output, null, 2) : formatCsv(rows);
  stdout.write(out + '\n');
  return result.isRegression ? 1 : 0;
}

export async function main(args) {
  const opts = parseArgs(args);
  if (opts._error) {
    stderr.write(`audit-test-failures: ${opts._error}\n`);
    stderr.write(`Run with --help for usage.\n`);
    return 2;
  }
  if (opts.help) {
    stdout.write(HELP_TEXT);
    return 0;
  }
  if (!existsSync(opts.resultsPath)) {
    stderr.write(`audit-test-failures: results file not found: ${opts.resultsPath}\n`);
    return 2;
  }
  let json;
  try {
    json = JSON.parse(readFileSync(opts.resultsPath, 'utf-8'));
  } catch (err) {
    stderr.write(`audit-test-failures: failed to parse JSON at ${opts.resultsPath}: ${err.message}\n`);
    return 2;
  }

  if (opts.prOnly) {
    return runPrOnly(json, opts);
  }

  const failures = extractFailures(json);
  let { rows, byCategory } = bucketize(failures);
  if (opts.byCategory) {
    rows = rows.filter((r) => r.error_category === opts.byCategory);
  }
  const out = opts.format === 'json' ? formatJson(rows, byCategory) : formatCsv(rows);
  stdout.write(out + '\n');
  if (opts.summary) {
    stderr.write('\n=== SUMMARY (audit-test-failures) ===\n');
    stderr.write(`Total failures: ${failures.length}\n`);
    if (opts.byCategory) {
      stderr.write(`Filtered to category: ${opts.byCategory} (${rows.length} rows)\n`);
    }
    const sorted = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
    for (const [cat, count] of sorted) {
      stderr.write(`  ${cat.padEnd(24)} ${count}\n`);
    }
  }
  return 0;
}

// CLI entrypoint guard — do not run main() when imported by tests.
const invokedAsCli =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('audit-test-failures.mjs');

if (invokedAsCli) {
  main(argv.slice(2))
    .then((code) => exit(code))
    .catch((err) => {
      stderr.write(`audit-test-failures: unexpected error: ${err.stack ?? err.message}\n`);
      exit(2);
    });
}
