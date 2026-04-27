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
 *
 * Exit codes:
 *   0 — bucketing succeeded
 *   1 — reserved for --pr-only baseline regression mode (PR3 wires this)
 *   2 — invocation/parse error
 */

import { readFileSync, existsSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';

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
 * Normalize a vitest JSON report (1.x testResults[] OR 3.x files[]) into a
 * flat list of { file, test, error } failure records.
 */
export function extractFailures(json) {
  const failures = [];

  // Vitest 1.x reporter shape: testResults[] with assertionResults[]
  for (const tr of json.testResults ?? []) {
    const filePath = tr.name ?? tr.testFilePath ?? 'unknown';
    for (const ar of tr.assertionResults ?? []) {
      if (ar.status === 'failed') {
        failures.push({
          file: filePath,
          test: ar.fullName ?? ar.title ?? 'unknown',
          error: (ar.failureMessages ?? []).join('\n'),
        });
      }
    }
  }

  // Vitest 3.x reporter shape: files[] with tasks[] (recursive describe)
  for (const f of json.files ?? []) {
    const filePath = f.filepath ?? f.name ?? 'unknown';
    const visit = (tasks) => {
      for (const t of tasks ?? []) {
        if (t.type === 'test' && t.result?.state === 'fail') {
          const errs = (t.result.errors ?? [])
            .map((e) => e.stack ?? e.message ?? '')
            .join('\n');
          failures.push({
            file: filePath,
            test: t.name ?? 'unknown',
            error: errs,
          });
        }
        if (t.tasks) visit(t.tasks);
      }
    };
    visit(f.tasks);
  }

  return failures;
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
  --pr-only                 Reserved: compare to baseline snapshot (wired in PR3)
  --branch=<name>           Reserved: DB-read source branch (default: main)
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
  0  Bucketing succeeded
  1  Reserved (PR3 baseline-regression mode)
  2  Invocation or parse error

EXAMPLES:
  node scripts/audit-test-failures.mjs --results=test-results.json
  node scripts/audit-test-failures.mjs --format=json | jq .by_category
  node scripts/audit-test-failures.mjs --summary > failures.csv
  node scripts/audit-test-failures.mjs --by-category=must-be-set --format=json

DATA SOURCE:
  PRIMARY (today): Parses vitest --reporter=json output from --results path.
  SECONDARY (future): SELECT from test_runs/test_results when CI populates
  trigger_context.branch (currently unpopulated; deferred per DATABASE sub-agent).

SEE ALSO:
  docs/reference/test-coverage-baseline-ratchet.md (ships in PR3)
  scripts/test-result-capture.js (CI step that should populate test_runs)
  SD-LEO-INFRA-COVERAGE-CI-TRIAGE-001
`;

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
